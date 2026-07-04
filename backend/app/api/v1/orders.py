"""Pedidos: checkout del cliente, captura por personal y panel interno.

Autoservicio del cliente por PROPIEDAD del registro (sin permisos): crea sus
pedidos y consulta sólo los suyos con etiquetas públicas (§58.2). El panel
interno usa ``orders:*``; aprobar y cancelar exigen permisos ADICIONALES al de
transición. El ajuste de envío sólo existe antes de aprobar y siempre deja
bitácora (§17.3).
"""

import uuid
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Query, status
from sqlmodel import select

from backend.app.api.resource_actions import api_error, commit_or_conflict, get_or_404
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.models.addresses import UserAddress
from backend.app.models.orders import (
    Order,
    OrderAdjustment,
    OrderDelivery,
    OrderShipping,
    OrderShippingHistory,
)
from backend.app.models.shipping import ShippingRateRule
from backend.app.schemas.address import GeoPoint
from backend.app.schemas.order import (
    CancelledWithPaymentItem,
    CaptureRequest,
    CheckoutRequest,
    DeliveryInput,
    MyOrderRead,
    OrderAdjustmentCreate,
    OrderAdjustmentRead,
    OrderDeliveryRead,
    OrderLineInput,
    OrderLineModifierRead,
    OrderLineRead,
    OrderListItem,
    OrderRead,
    OrderShippingFinalizeRequest,
    OrderShippingRead,
    OrderTransitionRequest,
)
from backend.app.security.groups.orders import OrderPermissions
from backend.app.security.groups.payments import PaymentPermissions
from backend.app.services.business_service import (
    get_business_profile,
    get_business_settings,
)
from backend.app.services.order_service import (
    OrderIdentity,
    OrderRuleError,
    create_order,
    public_status,
    transition_order,
)
from backend.app.services.pricing_service import (
    CartLineInput,
    CartModifierInput,
    PricingError,
    price_cart,
)
from backend.app.services.shipping_service import quote_shipping
from backend.app.utils.geo import point_to_ewkt, wkb_point_to_lonlat
from backend.app.utils.utc_now import utc_now

router = APIRouter(prefix="/orders", tags=["orders"])

_NOT_FOUND = "Pedido no encontrado"
# Estados donde el pedido aún es editable (antes de aprobar, §16).
_PRE_APPROVAL_STATUSES = (
    "draft",
    "submitted",
    "pending_shipping_review",
    "pending_payment_verification",
    "pending_approval",
)


# ---------------------------------------------------------------------------
# Helpers de composición y serialización
# ---------------------------------------------------------------------------

def _to_cart(lines: list[OrderLineInput]) -> list[CartLineInput]:
    return [
        CartLineInput(
            product_id=line.product_id,
            quantity=line.quantity,
            purchase_mode=line.purchase_mode,
            modifiers=tuple(
                CartModifierInput(
                    modifier_option_id=item.modifier_option_id, quantity=item.quantity
                )
                for item in line.modifiers
            ),
            customer_note=line.customer_note,
        )
        for line in lines
    ]


def _compose_delivery_and_shipping(
    session: SessionDep,
    order: Order,
    payload: Optional[DeliveryInput],
    *,
    from_staff: bool,
) -> None:
    """Crea el snapshot de entrega (§17.1) y la decisión de envío (§17.2)."""
    data = payload or DeliveryInput()
    lonlat: Optional[tuple[float, float]] = None
    location_source = "not_provided"
    fields = {
        "street": data.street,
        "external_number": data.external_number,
        "internal_number": data.internal_number,
        "neighborhood": data.neighborhood,
        "city": data.city,
        "postal_code": data.postal_code,
        "references": data.references,
    }

    if data.user_address_id is not None:
        if order.customer_user_id is None:
            api_error(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "direccion_sin_cliente",
                "No se puede usar una dirección guardada en un pedido sin cliente.",
            )
        address = session.get(UserAddress, data.user_address_id)
        if (
            address is None
            or address.user_id != order.customer_user_id
            or not address.is_active
        ):
            api_error(status.HTTP_404_NOT_FOUND, "direccion_no_encontrada", "Dirección no encontrada")
        for field in fields:
            if fields[field] is None:
                fields[field] = getattr(address, field)
        lonlat = wkb_point_to_lonlat(address.location)
        location_source = "saved_address"

    if data.location is not None:
        lonlat = data.location.coordinates
        location_source = "employee_selected" if from_staff else "customer_selected"

    if not fields["street"]:
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "direccion_requerida",
            "La entrega a domicilio requiere al menos calle y número.",
        )

    # Regla de canal: aunque el pedido no tenga cliente (captura manual), la
    # ENTREGA exige contacto real en el snapshot (recipient_name/phone).
    recipient_name = data.recipient_name or order.customer_name_snapshot
    recipient_phone = data.recipient_phone or order.customer_phone_snapshot
    if not recipient_name or not recipient_phone:
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "datos_contacto_requeridos",
            "La entrega a domicilio requiere nombre y teléfono de quien recibe.",
        )

    delivery = OrderDelivery(
        order_id=order.id,
        user_address_id=data.user_address_id,
        recipient_name=recipient_name,
        recipient_phone=recipient_phone,
        location_source=location_source,
        delivery_note=data.delivery_note,
        **fields,
    )
    if lonlat is not None:
        delivery.location = point_to_ewkt(*lonlat)  # type: ignore[assignment]
    session.add(delivery)

    quote = quote_shipping(
        session,
        subtotal=order.items_subtotal_amount,
        longitude=lonlat[0] if lonlat else None,
        latitude=lonlat[1] if lonlat else None,
    )
    if quote.status == "calculated":
        session.add(
            OrderShipping(
                order_id=order.id,
                delivery_zone_id=quote.zone_id,
                delivery_zone_name_snapshot=quote.zone_name,
                shipping_rate_rule_id=quote.rate_id,
                shipping_rate_name_snapshot=quote.rate_name,
                calculation_status="calculated",
                calculation_source=(
                    "free_shipping_rule" if quote.is_free_shipping else "polygon_auto"
                ),
                estimated_amount=quote.amount,
                # Caso feliz: el cálculo automático ES la decisión; el empleado
                # puede ajustarla después con bitácora (§17.3).
                final_amount=quote.amount,
                is_free_shipping=quote.is_free_shipping,
            )
        )
    else:
        session.add(
            OrderShipping(
                order_id=order.id,
                delivery_zone_id=quote.zone_id,
                delivery_zone_name_snapshot=quote.zone_name,
                calculation_status="pending_review",
                calculation_source="polygon_auto",
            )
        )
    session.flush()


def _line_read(line) -> OrderLineRead:
    return OrderLineRead(
        id=line.id,
        product_id=line.product_id,
        product_name_snapshot=line.product_name_snapshot,
        quantity=line.quantity,
        purchase_mode=line.purchase_mode,
        money_unit_price_snapshot=line.money_unit_price_snapshot,
        modifier_money_total_per_unit=line.modifier_money_total_per_unit,
        money_line_total_amount=line.money_line_total_amount,
        credits_earned_total_snapshot=line.credits_earned_total_snapshot,
        credits_redeemed_total=line.credits_redeemed_total,
        customer_note=line.customer_note,
        modifiers=[
            OrderLineModifierRead.model_validate(mod, from_attributes=True)
            for mod in line.modifiers
        ],
    )


def _delivery_read(delivery: Optional[OrderDelivery]) -> Optional[OrderDeliveryRead]:
    if delivery is None:
        return None
    lonlat = wkb_point_to_lonlat(delivery.location)
    data = OrderDeliveryRead.model_validate(delivery, from_attributes=True)
    return data.model_copy(
        update={"location": GeoPoint(coordinates=lonlat) if lonlat else None}
    )


def _order_read(order: Order) -> OrderRead:
    data = {
        field: getattr(order, field)
        for field in OrderRead.model_fields
        if field not in {"lines", "adjustments", "shipping", "delivery"}
    }
    return OrderRead(
        **data,
        lines=[_line_read(line) for line in sorted(order.lines, key=lambda l: l.sort_order)],
        adjustments=[
            OrderAdjustmentRead.model_validate(adj, from_attributes=True)
            for adj in order.adjustments
        ],
        shipping=(
            OrderShippingRead.model_validate(order.shipping, from_attributes=True)
            if order.shipping
            else None
        ),
        delivery=_delivery_read(order.delivery),
    )


def _my_order_read(session: SessionDep, order: Order) -> MyOrderRead:
    # Repartidor visible SOLO en camino (§19.2); import tardío para evitar ciclo.
    from backend.app.schemas.delivery import PublicCourierInfo
    from backend.app.services.delivery_service import public_courier_info

    courier_data = public_courier_info(session, order)
    courier = PublicCourierInfo.model_validate(courier_data) if courier_data else None
    shipping = order.shipping
    shipping_amount = order.shipping_total_amount
    pending_review = False
    if shipping is not None:
        if shipping_amount is None:
            shipping_amount = shipping.final_amount or shipping.estimated_amount
        pending_review = shipping.final_amount is None
    return MyOrderRead(
        id=order.id,
        public_code=order.public_code,
        status=order.status,
        status_label=public_status(order.status),
        fulfillment_type=order.fulfillment_type,
        purchase_mode=order.purchase_mode,
        items_subtotal_amount=order.items_subtotal_amount,
        shipping_amount=shipping_amount,
        shipping_pending_review=pending_review,
        total_money_amount=order.total_money_amount,
        credits_earned_total_snapshot=order.credits_earned_total_snapshot,
        credits_redeemed_total=order.credits_redeemed_total,
        customer_note=order.customer_note,
        created_at=order.created_at,
        lines=[_line_read(line) for line in sorted(order.lines, key=lambda l: l.sort_order)],
        delivery=_delivery_read(order.delivery),
        courier=courier,
    )


def _priced_or_422(session: SessionDep, lines: list[OrderLineInput]):
    try:
        return price_cart(session, _to_cart(lines))
    except PricingError as exc:
        api_error(status.HTTP_422_UNPROCESSABLE_ENTITY, exc.code, exc.message)


def _require_uniform_mode(purchase_mode: str, lines: list[OrderLineInput]) -> None:
    """Pedido íntegro (§1.3): toda línea debe coincidir con el modo declarado."""
    if any(line.purchase_mode != purchase_mode for line in lines):
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "modo_compra_mixto",
            "Todas las líneas deben usar el modo de compra del pedido "
            f"({purchase_mode}); no se puede mezclar dinero y créditos.",
        )


def _rule_error(exc: OrderRuleError):
    api_error(status.HTTP_422_UNPROCESSABLE_ENTITY, exc.code, exc.message)


def _reserve_credits_or_422(session: SessionDep, order) -> None:
    """Reserva los canjes del pedido (§22.3); saldo insuficiente → 422 estable."""
    from backend.app.services.credit_service import CreditRuleError, reserve_order_redemptions

    try:
        reserve_order_redemptions(session, order)
    except CreditRuleError as exc:
        api_error(status.HTTP_422_UNPROCESSABLE_ENTITY, exc.code, exc.message)


# ---------------------------------------------------------------------------
# Cliente: checkout y sus pedidos
# ---------------------------------------------------------------------------

@router.post("", response_model=MyOrderRead, status_code=status.HTTP_201_CREATED)
def checkout(
    payload: CheckoutRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> MyOrderRead:
    profile = get_business_profile(session)
    settings_row = get_business_settings(session)
    if not profile.is_accepting_orders:
        api_error(status.HTTP_409_CONFLICT, "no_aceptamos_pedidos", "Por ahora no aceptamos pedidos.")
    if not settings_row.allow_online_orders:
        api_error(status.HTTP_409_CONFLICT, "pedidos_web_deshabilitados", "Los pedidos web están deshabilitados.")
    if payload.fulfillment_type == "delivery" and not settings_row.allow_delivery:
        api_error(status.HTTP_409_CONFLICT, "entrega_deshabilitada", "La entrega a domicilio está deshabilitada.")
    if payload.fulfillment_type == "pickup" and not settings_row.allow_pickup:
        api_error(status.HTTP_409_CONFLICT, "recoleccion_deshabilitada", "Recoger en tienda está deshabilitado.")

    _require_uniform_mode(payload.purchase_mode, payload.lines)
    if payload.purchase_mode == "credits" and payload.fulfillment_type == "delivery":
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "canje_sin_envio",
            "Un pedido pagado con créditos no permite envío a domicilio; "
            "elige recoger en tienda.",
        )

    priced = _priced_or_422(session, payload.lines)
    if (
        payload.fulfillment_type == "delivery"
        and settings_row.minimum_delivery_order_amount is not None
        and priced.items_subtotal_amount < settings_row.minimum_delivery_order_amount
    ):
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "compra_minima_no_alcanzada",
            f"La compra mínima a domicilio es ${settings_row.minimum_delivery_order_amount}.",
        )

    try:
        order = create_order(
            session,
            priced,
            OrderIdentity(
                source="online",
                fulfillment_type=payload.fulfillment_type,
                customer_user_id=current_user.id,
                customer_name=payload.customer_name,
                customer_phone=payload.customer_phone,
                customer_email=current_user.email,
            ),
            customer_note=payload.customer_note,
        )
    except OrderRuleError as exc:
        _rule_error(exc)

    _reserve_credits_or_422(session, order)
    if payload.fulfillment_type == "delivery":
        _compose_delivery_and_shipping(session, order, payload.delivery, from_staff=False)

    commit_or_conflict(session, "No fue posible registrar el pedido.")
    session.refresh(order)
    return _my_order_read(session, order)


@router.get("/mine", response_model=list[MyOrderRead])
def list_my_orders(
    session: SessionDep,
    current_user: CurrentUser,
    limit: int = Query(default=20, ge=1, le=50),
) -> list[MyOrderRead]:
    orders = session.exec(
        select(Order)
        .where(Order.customer_user_id == current_user.id)
        .order_by(Order.created_at.desc())  # pyright: ignore[reportAttributeAccessIssue]
        .limit(limit)
    ).all()
    return [_my_order_read(session, order) for order in orders]


@router.get("/mine/{order_id}", response_model=MyOrderRead)
def get_my_order(
    order_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> MyOrderRead:
    order = session.get(Order, order_id)
    if order is None or order.customer_user_id != current_user.id:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)
    return _my_order_read(session, order)


# ---------------------------------------------------------------------------
# Personal: captura y panel
# ---------------------------------------------------------------------------

@router.post("/capture", response_model=OrderRead, status_code=status.HTTP_201_CREATED)
def capture_order(
    payload: CaptureRequest,
    session: SessionDep,
    current_user: CurrentUser,
    _: OrderPermissions.CAPTURE.requiere,
) -> OrderRead:
    settings_row = get_business_settings(session)
    if payload.source == "counter" and not settings_row.allow_counter_sales:
        api_error(status.HTTP_409_CONFLICT, "mostrador_deshabilitado", "La venta a mostrador está deshabilitada.")

    _require_uniform_mode(payload.purchase_mode, payload.lines)
    priced = _priced_or_422(session, payload.lines)
    try:
        order = create_order(
            session,
            priced,
            OrderIdentity(
                source=payload.source,
                fulfillment_type=payload.fulfillment_type,
                customer_user_id=payload.customer_user_id,
                created_by=current_user.id,
                customer_name=payload.customer_name,
                customer_phone=payload.customer_phone,
                customer_email=payload.customer_email,
            ),
            customer_note=payload.customer_note,
        )
    except OrderRuleError as exc:
        _rule_error(exc)

    if payload.internal_note:
        order.internal_note = payload.internal_note
        session.add(order)
    _reserve_credits_or_422(session, order)
    if payload.fulfillment_type == "delivery":
        _compose_delivery_and_shipping(session, order, payload.delivery, from_staff=True)

    commit_or_conflict(session, "No fue posible registrar el pedido.")
    session.refresh(order)
    return _order_read(order)


@router.get("", response_model=list[OrderListItem])
def list_orders(
    session: SessionDep,
    _: OrderPermissions.READ.requiere,
    status_filter: Optional[str] = Query(default=None, alias="status"),
    source: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[OrderListItem]:
    stmt = select(Order)
    if status_filter:
        stmt = stmt.where(Order.status == status_filter)
    if source:
        stmt = stmt.where(Order.source == source)
    stmt = (
        stmt.order_by(Order.created_at.desc())  # pyright: ignore[reportAttributeAccessIssue]
        .offset(offset)
        .limit(limit)
    )
    return [
        OrderListItem.model_validate(order, from_attributes=True)
        for order in session.exec(stmt).all()
    ]


@router.get(
    "/cancellations/pending-refunds",
    response_model=list[CancelledWithPaymentItem],
)
def list_cancelled_pending_refunds(
    session: SessionDep,
    _: PaymentPermissions.READ.requiere,
    limit: int = Query(default=50, ge=1, le=100),
) -> list[CancelledWithPaymentItem]:
    """Cola de conciliación H5: cancelados con cobro cuya devolución sigue abierta.

    Incluye resoluciones refund_now/refund_pending mientras el dinero devuelto
    no cubra lo cobrado; «retain» queda fuera (decisión auditada aparte).
    """
    from backend.app.models.payments import Payment, PaymentRefund

    orders = session.exec(
        select(Order)
        .where(Order.status == "cancelled")
        .where(
            Order.cancellation_money_resolution.in_(("refund_now", "refund_pending"))  # pyright: ignore[reportAttributeAccessIssue]
        )
        .order_by(Order.cancelled_at.desc())  # pyright: ignore[reportAttributeAccessIssue]
        .limit(limit)
    ).all()

    items: list[CancelledWithPaymentItem] = []
    for order in orders:
        payments = session.exec(
            select(Payment).where(
                Payment.order_id == order.id,
                Payment.status.in_(("paid", "partially_refunded", "refunded")),  # pyright: ignore[reportAttributeAccessIssue]
            )
        ).all()
        paid_total = sum((p.received_amount for p in payments), Decimal("0"))
        payment_ids = [p.id for p in payments]
        refunded_total = Decimal("0")
        if payment_ids:
            refunds = session.exec(
                select(PaymentRefund).where(
                    PaymentRefund.payment_id.in_(payment_ids),  # pyright: ignore[reportAttributeAccessIssue]
                    PaymentRefund.status != "voided",
                )
            ).all()
            refunded_total = sum((r.amount for r in refunds), Decimal("0"))
        outstanding = paid_total - refunded_total
        if outstanding <= 0:
            continue
        items.append(
            CancelledWithPaymentItem(
                order_id=order.id,
                public_code=order.public_code,
                cancelled_at=order.cancelled_at,
                cancellation_money_resolution=order.cancellation_money_resolution,
                cancellation_resolution_note=order.cancellation_resolution_note,
                paid_total=paid_total,
                refunded_total=refunded_total,
                outstanding_amount=outstanding,
            )
        )
    return items


@router.get("/{order_id}", response_model=OrderRead)
def get_order(
    order_id: uuid.UUID,
    session: SessionDep,
    _: OrderPermissions.READ.requiere,
) -> OrderRead:
    return _order_read(get_or_404(session, Order, order_id, _NOT_FOUND))


@router.post("/{order_id}/transition", response_model=OrderRead)
def transition(
    order_id: uuid.UUID,
    payload: OrderTransitionRequest,
    session: SessionDep,
    current_user: CurrentUser,
    _: OrderPermissions.TRANSITION.requiere,
) -> OrderRead:
    order = get_or_404(session, Order, order_id, _NOT_FOUND)

    # Aprobar congela dinero y cancelar revierte venta: permisos ADICIONALES.
    if payload.new_status == "approved" and not current_user.access_control(
        OrderPermissions.APPROVE.permission
    ):
        api_error(status.HTTP_403_FORBIDDEN, "forbidden", "Se requiere permiso para aprobar pedidos.")
    if payload.new_status == "cancelled" and not current_user.access_control(
        OrderPermissions.CANCEL.permission
    ):
        api_error(status.HTTP_403_FORBIDDEN, "forbidden", "Se requiere permiso para cancelar pedidos.")

    try:
        transition_order(
            session,
            order,
            payload.new_status,
            actor_id=current_user.id,
            reason_code=payload.reason_code,
            internal_note=payload.internal_note,
            customer_visible_note=payload.customer_visible_note,
            payment_resolution=payload.payment_resolution,
            resolution_reason=payload.resolution_reason,
        )
    except OrderRuleError as exc:
        api_error(status.HTTP_409_CONFLICT, exc.code, exc.message)

    commit_or_conflict(session, "No fue posible cambiar el estado.")
    session.refresh(order)
    return _order_read(order)


@router.put("/{order_id}/shipping", response_model=OrderRead)
def finalize_shipping(
    order_id: uuid.UUID,
    payload: OrderShippingFinalizeRequest,
    session: SessionDep,
    current_user: CurrentUser,
    _: OrderPermissions.ADJUST_SHIPPING.requiere,
) -> OrderRead:
    order = get_or_404(session, Order, order_id, _NOT_FOUND)
    if order.fulfillment_type != "delivery" or order.shipping is None:
        api_error(status.HTTP_409_CONFLICT, "sin_envio", "El pedido no tiene envío que ajustar.")
    if order.status not in _PRE_APPROVAL_STATUSES:
        api_error(
            status.HTTP_409_CONFLICT,
            "pedido_aprobado",
            "Después de aprobar, el envío sólo se corrige con ajuste registrado o cancelación (§16).",
        )

    shipping = order.shipping
    previous = {
        "amount": shipping.final_amount,
        "zone": shipping.delivery_zone_name_snapshot,
        "rate": shipping.shipping_rate_name_snapshot,
    }

    if payload.shipping_rate_rule_id is not None:
        rate = session.get(ShippingRateRule, payload.shipping_rate_rule_id)
        if rate is None or not rate.is_active:
            api_error(status.HTTP_404_NOT_FOUND, "tarifa_no_encontrada", "Tarifa no encontrada")
        shipping.shipping_rate_rule_id = rate.id
        shipping.shipping_rate_name_snapshot = rate.name
        shipping.delivery_zone_id = rate.delivery_zone_id
        shipping.delivery_zone_name_snapshot = rate.zone.name
        shipping.final_amount = rate.base_fee
        shipping.is_free_shipping = False
        shipping.calculation_source = "employee_selected_rate"
    elif payload.final_amount is not None:
        if not (payload.reason or "").strip():
            api_error(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "motivo_requerido",
                "El monto manual de envío requiere motivo (§17.2).",
            )
        shipping.final_amount = payload.final_amount
        shipping.is_free_shipping = payload.final_amount == Decimal("0")
        shipping.calculation_source = "employee_manual_override"
        shipping.manual_override_reason = payload.reason
    else:
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "envio_sin_datos",
            "Indica una tarifa existente o un monto manual con motivo.",
        )

    shipping.calculation_status = "finalized"
    shipping.finalized_by = current_user.id
    shipping.finalized_at = utc_now()
    shipping.updated_at = utc_now()
    session.add(shipping)
    session.add(
        OrderShippingHistory(
            order_shipping_id=shipping.id,
            previous_amount=previous["amount"],
            new_amount=shipping.final_amount,
            previous_zone_name_snapshot=previous["zone"],
            new_zone_name_snapshot=shipping.delivery_zone_name_snapshot,
            previous_rate_name_snapshot=previous["rate"],
            new_rate_name_snapshot=shipping.shipping_rate_name_snapshot,
            reason=payload.reason,
            changed_by=current_user.id,
        )
    )
    commit_or_conflict(session, "No fue posible ajustar el envío.")
    session.refresh(order)
    return _order_read(order)


@router.post(
    "/{order_id}/adjustments",
    response_model=OrderRead,
    status_code=status.HTTP_201_CREATED,
)
def add_adjustment(
    order_id: uuid.UUID,
    payload: OrderAdjustmentCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: OrderPermissions.ADJUST.requiere,
) -> OrderRead:
    order = get_or_404(session, Order, order_id, _NOT_FOUND)
    if order.status not in _PRE_APPROVAL_STATUSES:
        api_error(
            status.HTTP_409_CONFLICT,
            "pedido_aprobado",
            "Después de aprobar no se agregan ajustes libres; usa reembolso o cancelación (§16).",
        )
    session.add(
        OrderAdjustment(
            order_id=order.id,
            adjustment_type=payload.adjustment_type,
            direction=payload.direction,
            amount=payload.amount,
            reason=payload.reason,
            authorized_by=current_user.id,
        )
    )
    commit_or_conflict(session, "No fue posible registrar el ajuste.")
    session.refresh(order)
    return _order_read(order)
