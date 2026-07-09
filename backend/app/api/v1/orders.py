"""Pedidos: checkout del cliente, captura por personal y panel interno.

Autoservicio del cliente por PROPIEDAD del registro (sin permisos): crea sus
pedidos y consulta sólo los suyos con etiquetas públicas (§58.2). El panel
interno usa ``orders:*``; aprobar y cancelar exigen permisos ADICIONALES al de
transición. El ajuste de envío sólo existe antes de aprobar y siempre deja
bitácora (§17.3).
"""

import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Query, Request, status
from sqlalchemy import func as sa_func
from sqlalchemy import or_ as sa_or

from backend.app.security.rate_limit import limit_checkout
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
from backend.app.models.payments import Payment
from backend.app.models.shipping import ShippingRateRule
from backend.app.models.user import User
from backend.app.schemas.address import GeoPoint
from backend.app.schemas.order import (
    CancelledWithPaymentItem,
    CaptureRequest,
    CheckoutRequest,
    DeliveryInput,
    MyActiveOrdersRead,
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
    OrderStatusHistoryRead,
    OrderTransitionRequest,
    OrderVisibleNoteRead,
)
from backend.app.schemas.pagination import OffsetPage, OffsetPagination
from backend.app.security.groups.orders import OrderPermissions
from backend.app.security.groups.payments import PaymentPermissions
from backend.app.services.business_service import (
    get_business_profile,
    get_business_settings,
    is_open_now,
)
from backend.app.services.order_service import (
    OrderIdentity,
    OrderRuleError,
    count_active_orders_for_customer,
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
                # Tiempo estimado congelado de la tarifa (§10.2); NULL si no lo define.
                estimated_minutes=quote.estimated_minutes,
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
    # ``location`` se traduce aparte: la columna es un WKBElement de PostGIS y
    # pydantic no puede validarlo como GeoPoint (reventaba en cuanto un pedido
    # traía coordenadas reales).
    lonlat = wkb_point_to_lonlat(delivery.location)
    data = {
        field: getattr(delivery, field)
        for field in OrderDeliveryRead.model_fields
        if field != "location"
    }
    return OrderDeliveryRead(
        **data, location=GeoPoint(coordinates=lonlat) if lonlat else None
    )


def _visible_notes(order: Order) -> list[OrderVisibleNoteRead]:
    """Aclaraciones de la bitácora visibles fuera del equipo, en orden
    cronológico. La nota interna de cada transición jamás se proyecta."""
    return [
        OrderVisibleNoteRead(
            new_status=entry.new_status,
            note=entry.customer_visible_note,
            changed_at=entry.changed_at,
        )
        for entry in sorted(order.status_history, key=lambda h: h.changed_at)
        if (entry.customer_visible_note or "").strip()
    ]


def _resolve_user_names(
    session: SessionDep, user_ids
) -> dict[uuid.UUID, str]:
    """Resuelve «Nombre Apellido» por id en UNA consulta (evita N+1 en la lista
    y la bitácora). Ignora ids nulos y no encontrados."""
    ids = {uid for uid in user_ids if uid is not None}
    if not ids:
        return {}
    rows = session.exec(
        select(User.id, User.name, User.last_name).where(User.id.in_(ids))  # pyright: ignore[reportAttributeAccessIssue]
    ).all()
    return {row[0]: f"{row[1]} {row[2]}".strip() for row in rows}  # pyright: ignore[reportReturnType]


def _status_history(session: SessionDep, order: Order) -> list[OrderStatusHistoryRead]:
    """Bitácora INTERNA completa en orden cronológico, con el nombre de quien
    hizo cada transición resuelto (§15.4)."""
    entries = sorted(order.status_history, key=lambda h: h.changed_at)
    names = _resolve_user_names(session, [entry.changed_by for entry in entries])
    return [
        OrderStatusHistoryRead(
            previous_status=entry.previous_status,
            new_status=entry.new_status,
            reason_code=entry.reason_code,
            internal_note=entry.internal_note,
            customer_visible_note=entry.customer_visible_note,
            changed_by_name=names.get(entry.changed_by),
            changed_at=entry.changed_at,
        )
        for entry in entries
    ]


def _order_read(session: SessionDep, order: Order) -> OrderRead:
    from backend.app.services.payment_service import collection_instruction

    names = _resolve_user_names(session, [order.approved_by])
    computed = {"approved_by_name", "status_history", "lines", "adjustments",
                "shipping", "delivery", "visible_notes", "collection_label"}
    data = {
        field: getattr(order, field)
        for field in OrderRead.model_fields
        if field not in computed
    }
    return OrderRead(
        **data,
        collection_label=collection_instruction(session, order).label,
        approved_by_name=names.get(order.approved_by),
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
        visible_notes=_visible_notes(order),
        status_history=_status_history(session, order),
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
    estimated_minutes: Optional[int] = None
    if shipping is not None:
        if shipping_amount is None:
            shipping_amount = shipping.final_amount or shipping.estimated_amount
        pending_review = shipping.final_amount is None
        estimated_minutes = shipping.estimated_minutes
    # Hora estimada de entrega: sólo con el reloj ya corriendo (aprobado) y en
    # un estado activo de entrega; el cliente deriva el «tiempo restante».
    estimated_delivery_at: Optional[datetime] = None
    if (
        estimated_minutes is not None
        and order.approved_at is not None
        and order.status not in ("completed", "cancelled")
    ):
        estimated_delivery_at = order.approved_at + timedelta(minutes=estimated_minutes)
    return MyOrderRead(
        id=order.id,
        public_code=order.public_code,
        status=order.status,
        status_label=public_status(order.status),
        fulfillment_type=order.fulfillment_type,
        purchase_mode=order.purchase_mode,
        items_subtotal_amount=order.items_subtotal_amount,
        discount_total_amount=order.discount_total_amount,
        discount_code_label=next(
            (
                adj.reason
                for adj in order.adjustments
                if adj.adjustment_type == "discount_code"
            ),
            None,
        ),
        shipping_amount=shipping_amount,
        shipping_pending_review=pending_review,
        shipping_estimated_minutes=estimated_minutes,
        estimated_delivery_at=estimated_delivery_at,
        total_money_amount=order.total_money_amount,
        credits_earned_total_snapshot=order.credits_earned_total_snapshot,
        credits_redeemed_total=order.credits_redeemed_total,
        customer_note=order.customer_note,
        created_at=order.created_at,
        lines=[_line_read(line) for line in sorted(order.lines, key=lambda l: l.sort_order)],
        delivery=_delivery_read(order.delivery),
        courier=courier,
        visible_notes=_visible_notes(order),
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


def _apply_discount_code_or_422(session: SessionDep, order, code: str) -> None:
    """Cotiza y reserva el código en la MISMA transacción del checkout (Etapa 5 RC)."""
    from backend.app.services.discount_service import (
        DiscountRuleError,
        quote_discount,
        reserve_redemption,
    )

    try:
        outcome = quote_discount(
            session,
            code=code,
            customer_user_id=order.customer_user_id,
            purchase_mode=order.purchase_mode,
            source=order.source,
            eligible_subtotal=order.items_subtotal_amount,
        )
        reserve_redemption(session, code_row=outcome.code_row, order=order)
    except DiscountRuleError as exc:
        api_error(status.HTTP_422_UNPROCESSABLE_ENTITY, exc.code, exc.message)


# ---------------------------------------------------------------------------
# Cliente: checkout y sus pedidos
# ---------------------------------------------------------------------------

@router.post("", response_model=MyOrderRead, status_code=status.HTTP_201_CREATED)
def checkout(
    request: Request,
    payload: CheckoutRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> MyOrderRead:
    # §1.14: límite moderado por IP + usuario; el menú público NO se limita.
    limit_checkout(request, str(current_user.id))
    profile = get_business_profile(session)
    settings_row = get_business_settings(session)
    if not profile.is_accepting_orders:
        api_error(status.HTTP_409_CONFLICT, "no_aceptamos_pedidos", "Por ahora no aceptamos pedidos.")
    if not settings_row.allow_online_orders:
        api_error(status.HTTP_409_CONFLICT, "pedidos_web_deshabilitados", "Los pedidos web están deshabilitados.")
    # Switch opt-in: con horario obligatorio, el checkout web sólo procede con
    # el negocio ABIERTO (horario semanal + fechas especiales, tz del negocio).
    # Staff/POS quedan exentos (capturan por otros endpoints).
    if settings_row.online_orders_require_open_hours and not is_open_now(session):
        api_error(
            status.HTTP_409_CONFLICT,
            "negocio_cerrado",
            "Estamos cerrados en este momento. Consulta nuestro horario e "
            "inténtalo dentro del horario de atención.",
        )
    if payload.fulfillment_type == "delivery" and not settings_row.allow_delivery:
        api_error(status.HTTP_409_CONFLICT, "entrega_deshabilitada", "La entrega a domicilio está deshabilitada.")
    if payload.fulfillment_type == "pickup" and not settings_row.allow_pickup:
        api_error(status.HTTP_409_CONFLICT, "recoleccion_deshabilitada", "Recoger en tienda está deshabilitado.")

    # Tope anti-abuso de pedidos ACTIVOS simultáneos por cliente (NULL = sin
    # límite). Se bloquea el nuevo checkout AL ALCANZAR el tope; el POS/panel no
    # cuentan como canal de abuso pero sí suman a los pedidos en curso del cliente.
    if settings_row.max_active_orders_per_user is not None:
        active_orders = count_active_orders_for_customer(session, current_user.id)
        if active_orders >= settings_row.max_active_orders_per_user:
            api_error(
                status.HTTP_409_CONFLICT,
                "limite_pedidos_activos",
                f"Tienes {active_orders} pedidos en curso, el máximo permitido es "
                f"{settings_row.max_active_orders_per_user}. Espera a que se completen "
                "o cancela alguno para hacer un pedido nuevo.",
            )

    _require_uniform_mode(payload.purchase_mode, payload.lines)
    # Etapa 5 RC: un código de descuento JAMÁS aplica a un pedido de créditos.
    if payload.discount_code and payload.purchase_mode == "credits":
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "codigo_no_aplicable",
            "Los códigos de descuento sólo aplican en pedidos web pagados con dinero.",
        )
    if payload.purchase_mode == "credits" and payload.fulfillment_type == "delivery":
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "canje_sin_envio",
            "Un pedido pagado con créditos no permite envío a domicilio; "
            "elige recoger en tienda.",
        )
    # Interruptor del negocio: con el programa de créditos apagado, el canje
    # queda bloqueado en el único punto de entrada web (los saldos se conservan).
    if payload.purchase_mode == "credits" and not settings_row.credits_enabled:
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "creditos_deshabilitados",
            "El pago con créditos no está disponible en este momento.",
        )

    priced = _priced_or_422(session, payload.lines)
    # Tope anti-abuso de UNIDADES por pedido (NULL = sin límite): suma de las
    # cantidades de todas las líneas. El sitio ya avisa al alcanzarlo; esta es la
    # defensa autoritativa (evita bromas/pedidos gigantes por API).
    if settings_row.max_products_per_order is not None:
        total_units = sum(line.quantity for line in priced.lines)
        if total_units > settings_row.max_products_per_order:
            api_error(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "limite_productos",
                f"Un pedido admite como máximo {settings_row.max_products_per_order} "
                f"productos; tu carrito tiene {total_units}. Quita algunos para continuar.",
            )
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
    if payload.discount_code:
        _apply_discount_code_or_422(session, order, payload.discount_code)
    if payload.fulfillment_type == "delivery":
        _compose_delivery_and_shipping(session, order, payload.delivery, from_staff=False)

    # Notificaciones EN LA MISMA transacción del pedido (campana + correo):
    # A al cliente («recibimos tu pedido») y alerta de pedido web nuevo a
    # todo usuario cuyo rol otorga notifications:order_alerts.
    from backend.app.services.notification_service import (
        create_notification,
        kick_notification_dispatch,
        notify_new_web_order,
    )

    create_notification(
        session,
        user_id=current_user.id,
        kind="order_status",
        title=f"Recibimos tu pedido {order.public_code}",
        body=(
            f"¡Gracias! Recibimos tu pedido {order.public_code} y lo estamos "
            "revisando. Te avisaremos cuando esté listo o en camino. "
            "Puedes seguirlo en «Mis pedidos»."
        ),
        order_id=order.id,
    )
    notify_new_web_order(session, order)

    commit_or_conflict(session, "No fue posible registrar el pedido.")
    session.refresh(order)
    # Correos best-effort DESPUÉS del commit — jamás afectan la transacción.
    kick_notification_dispatch()
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


# NOTA de orden de rutas: debe declararse ANTES de «/mine/{order_id}», si no el
# parámetro UUID captura «active-count» y responde 422.
@router.get("/mine/active-count", response_model=MyActiveOrdersRead)
def my_active_orders_count(
    session: SessionDep,
    current_user: CurrentUser,
) -> MyActiveOrdersRead:
    """Cupo de pedidos activos del cliente: el checkout avisa al alcanzarlo."""
    settings_row = get_business_settings(session)
    return MyActiveOrdersRead(
        active=count_active_orders_for_customer(session, current_user.id),
        limit=settings_row.max_active_orders_per_user,
    )


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
    return _order_read(session, order)


def _apply_order_list_filters(
    stmt,
    *,
    statuses: Optional[str],
    source: Optional[str],
    fulfillment_type: Optional[str],
    q: Optional[str],
    created_from: Optional[datetime],
    created_to: Optional[datetime],
    customer_user_id: Optional[uuid.UUID] = None,
    purchase_mode: Optional[str] = None,
    payment_status: Optional[str] = None,
):
    """Filtros compartidos del tablero interno (lista y conteos por estado).

    ``q`` busca por folio, cliente/teléfono del pedido y, vía la entrega,
    por quien recibe y la dirección (calle/colonia). ``statuses`` acepta uno
    o varios estados separados por coma. ``purchase_mode`` (money/credits) y
    ``payment_status`` filtran el modo del pedido y su estado de cobro.
    """
    if statuses:
        parsed = [s.strip() for s in statuses.split(",") if s.strip()]
        if parsed:
            stmt = stmt.where(Order.status.in_(parsed))  # pyright: ignore[reportAttributeAccessIssue]
    if source:
        stmt = stmt.where(Order.source == source)
    if fulfillment_type:
        stmt = stmt.where(Order.fulfillment_type == fulfillment_type)
    if purchase_mode:
        stmt = stmt.where(Order.purchase_mode == purchase_mode)
    if payment_status:
        stmt = stmt.where(Order.payment_status == payment_status)
    # Ficha de cliente (§8.2): sus pedidos por cuenta registrada.
    if customer_user_id is not None:
        stmt = stmt.where(Order.customer_user_id == customer_user_id)
    if created_from is not None:
        stmt = stmt.where(Order.created_at >= created_from)
    if created_to is not None:
        stmt = stmt.where(Order.created_at < created_to)
    if q and q.strip():
        term = f"%{q.strip()}%"
        stmt = stmt.outerjoin(OrderDelivery, OrderDelivery.order_id == Order.id).where(  # pyright: ignore[reportArgumentType]
            sa_or(
                Order.public_code.ilike(term),  # pyright: ignore[reportAttributeAccessIssue]
                Order.customer_name_snapshot.ilike(term),  # pyright: ignore[reportAttributeAccessIssue]
                Order.customer_phone_snapshot.ilike(term),  # pyright: ignore[reportAttributeAccessIssue]
                Order.customer_email_snapshot.ilike(term),  # pyright: ignore[reportAttributeAccessIssue]
                OrderDelivery.recipient_name.ilike(term),  # pyright: ignore[reportAttributeAccessIssue]
                OrderDelivery.recipient_phone.ilike(term),  # pyright: ignore[reportAttributeAccessIssue]
                OrderDelivery.street.ilike(term),  # pyright: ignore[reportAttributeAccessIssue]
                OrderDelivery.neighborhood.ilike(term),  # pyright: ignore[reportAttributeAccessIssue]
            )
        )
    return stmt


def _order_list_items(session: SessionDep, orders: list[Order]) -> list[OrderListItem]:
    """Enriquece la lista del explorador con datos finales resueltos EN LOTE
    (sin N+1): aprobador (join a ``User``) y método de pago (snapshot del primer
    pago ``paid`` del pedido). La lista sigue LIGERA: sin líneas ni bitácora."""
    names = _resolve_user_names(session, [order.approved_by for order in orders])
    labels: dict[uuid.UUID, str] = {}
    order_ids = [order.id for order in orders]
    if order_ids:
        payments = session.exec(
            select(Payment).where(
                Payment.order_id.in_(order_ids),  # pyright: ignore[reportAttributeAccessIssue]
                Payment.status == "paid",
            )
        ).all()
        # El primer pago cobrado (por fecha) fija la etiqueta del método.
        for payment in sorted(payments, key=lambda p: p.created_at):
            labels.setdefault(payment.order_id, payment.payment_method_name_snapshot)
    return [
        OrderListItem(
            id=order.id,
            public_code=order.public_code,
            source=order.source,
            fulfillment_type=order.fulfillment_type,
            purchase_mode=order.purchase_mode,
            status=order.status,
            payment_status=order.payment_status,
            customer_name_snapshot=order.customer_name_snapshot,
            customer_email_snapshot=order.customer_email_snapshot,
            items_subtotal_amount=order.items_subtotal_amount,
            shipping_total_amount=order.shipping_total_amount,
            total_money_amount=order.total_money_amount,
            approved_at=order.approved_at,
            approved_by_name=names.get(order.approved_by),  # pyright: ignore[reportArgumentType]
            payment_method_label=labels.get(order.id),
            completed_at=order.completed_at,
            cancelled_at=order.cancelled_at,
            created_at=order.created_at,
        )
        for order in orders
    ]


@router.get("", response_model=OffsetPage[OrderListItem])
def list_orders(
    session: SessionDep,
    _: OrderPermissions.READ.requiere,
    status_filter: Optional[str] = Query(
        default=None,
        alias="status",
        description="Uno o varios estados separados por coma.",
    ),
    source: Optional[str] = Query(default=None),
    fulfillment_type: Optional[str] = Query(default=None),
    purchase_mode: Optional[str] = Query(default=None),
    payment_status: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None, max_length=120),
    created_from: Optional[datetime] = Query(default=None),
    created_to: Optional[datetime] = Query(default=None),
    customer_user_id: Optional[uuid.UUID] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> OffsetPage[OrderListItem]:
    """Tablero interno paginado: filtros por estado/canal/modo/pago/fechas/
    cliente y búsqueda por folio, cliente, quien recibe y dirección; cada fila
    trae aprobador, método de pago y envío (envelope estándar)."""
    stmt = _apply_order_list_filters(
        select(Order),
        statuses=status_filter,
        source=source,
        fulfillment_type=fulfillment_type,
        q=q,
        created_from=created_from,
        created_to=created_to,
        customer_user_id=customer_user_id,
        purchase_mode=purchase_mode,
        payment_status=payment_status,
    )
    subq = stmt.subquery()
    total = int(
        session.exec(select(sa_func.count(sa_func.distinct(subq.c.id)))).one()  # pyright: ignore[reportArgumentType]
    )
    rows = session.exec(
        stmt.order_by(Order.created_at.desc())  # pyright: ignore[reportAttributeAccessIssue]
        .offset(offset)
        .limit(limit)
    ).all()
    return OffsetPage(
        items=_order_list_items(session, list(rows)),
        pagination=OffsetPagination(
            limit=limit,
            offset=offset,
            total=total,
            has_next=offset + len(rows) < total,
        ),
    )


@router.get("/status-counts", response_model=dict[str, int])
def order_status_counts(
    session: SessionDep,
    _: OrderPermissions.READ.requiere,
    source: Optional[str] = Query(default=None),
    fulfillment_type: Optional[str] = Query(default=None),
    purchase_mode: Optional[str] = Query(default=None),
    payment_status: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None, max_length=120),
    created_from: Optional[datetime] = Query(default=None),
    created_to: Optional[datetime] = Query(default=None),
    customer_user_id: Optional[uuid.UUID] = Query(default=None),
) -> dict[str, int]:
    """Conteo por estado con los MISMOS filtros del tablero (menos ``status``):
    alimenta los chips «Nuevos · 3» sin traerse los pedidos. Incluye
    ``customer_user_id`` para la ficha de cliente (§8.2)."""
    stmt = _apply_order_list_filters(
        select(Order.status, sa_func.count(sa_func.distinct(Order.id))),  # pyright: ignore[reportArgumentType]
        statuses=None,
        source=source,
        fulfillment_type=fulfillment_type,
        q=q,
        created_from=created_from,
        created_to=created_to,
        customer_user_id=customer_user_id,
        purchase_mode=purchase_mode,
        payment_status=payment_status,
    ).group_by(Order.status)  # pyright: ignore[reportArgumentType]
    return {status_value: int(count) for status_value, count in session.exec(stmt).all()}


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
    return _order_read(session, get_or_404(session, Order, order_id, _NOT_FOUND))


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

    # La nota interna de la transición también se refleja en el pedido (donde
    # el equipo la lee); la bitácora conserva además el registro por transición.
    if (payload.internal_note or "").strip():
        note = payload.internal_note.strip()
        order.internal_note = (
            f"{order.internal_note} · {note}" if order.internal_note else note
        )

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
    # La campana del cliente ya viajó en la transacción (transition_order);
    # aquí solo se despachan correos (best-effort) y la alerta G al negocio.
    from backend.app.services.notification_service import kick_notification_dispatch
    from backend.app.services.order_notifications import notify_admin_unresolved_refund

    kick_notification_dispatch()
    if payload.new_status == "cancelled":
        notify_admin_unresolved_refund(session, order)
    return _order_read(session, order)


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

    # Pin del empleado: se PERSISTE en la entrega (sirve al reparto) y, si no
    # viene tarifa ni monto manual, es la base para recotizar por polígono.
    lonlat: Optional[tuple[float, float]] = None
    if payload.location is not None and order.delivery is not None:
        lonlat = payload.location.coordinates
        order.delivery.location = point_to_ewkt(*lonlat)  # type: ignore[assignment]
        order.delivery.location_source = "employee_selected"
        order.delivery.updated_at = utc_now()
        session.add(order.delivery)

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
        # La tarifa elegida trae su propio tiempo estimado (o NULL).
        shipping.estimated_minutes = rate.estimated_minutes
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
        # El monto manual no proviene de una tarifa: sin tiempo estimado.
        shipping.estimated_minutes = None
    elif lonlat is not None:
        # Recotización por polígono con el pin del empleado: el backend decide
        # zona y tarifa (PostGIS); fuera de zona o sin tarifa aplicable se pide
        # el monto manual — el empleado SIEMPRE puede fijarlo manualmente.
        quote = quote_shipping(
            session,
            subtotal=order.items_subtotal_amount,
            longitude=lonlat[0],
            latitude=lonlat[1],
        )
        if quote.status != "calculated" or quote.amount is None:
            api_error(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "fuera_de_zona",
                (
                    f"El punto cae en la zona «{quote.zone_name}», pero sin tarifa "
                    "aplicable al subtotal; ingresa el costo manualmente."
                    if quote.zone_name
                    else "El punto no cae en ninguna zona de entrega activa; "
                    "ingresa el costo manualmente."
                ),
            )
        shipping.delivery_zone_id = quote.zone_id
        shipping.delivery_zone_name_snapshot = quote.zone_name
        shipping.shipping_rate_rule_id = quote.rate_id
        shipping.shipping_rate_name_snapshot = quote.rate_name
        shipping.estimated_amount = quote.amount
        shipping.final_amount = quote.amount
        shipping.is_free_shipping = quote.is_free_shipping
        shipping.estimated_minutes = quote.estimated_minutes
        shipping.calculation_source = (
            "free_shipping_rule" if quote.is_free_shipping else "polygon_auto"
        )
    else:
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "envio_sin_datos",
            "Indica una tarifa existente, un monto manual con motivo o una "
            "ubicación en el mapa para cotizar.",
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
    return _order_read(session, order)


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
    return _order_read(session, order)
