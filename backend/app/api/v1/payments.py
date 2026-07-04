"""Pagos, tickets y venta de mostrador (§18, §20).

La venta a mostrador (POS) es UNA transacción: pedido aprobado + pago +
completado; nada queda a medias. El ticket se arma SIEMPRE desde snapshots y
cada impresión queda en bitácora. El estado de pago del pedido es derivado —
ningún endpoint lo edita directamente.
"""

import uuid
from decimal import Decimal

from fastapi import APIRouter, status
from sqlmodel import select

from backend.app.api.resource_actions import api_error, commit_or_conflict, get_or_404
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.models.orders import Order
from backend.app.models.payments import (
    Payment,
    PaymentAttachment,
    PaymentMethodConfig,
    TicketPrintLog,
)
from backend.app.schemas.payment import (
    PaymentAttachmentCreate,
    PaymentAttachmentRead,
    PaymentCreate,
    PaymentMethodPublic,
    PaymentRead,
    PaymentVerifyRequest,
    PosSaleRequest,
    PosSaleResult,
    TicketPrintCreate,
    TicketPrintRead,
    TicketRead,
)
from backend.app.security.groups.orders import OrderPermissions
from backend.app.security.groups.payments import PaymentPermissions, TicketPermissions
from backend.app.services.business_service import get_business_settings
from backend.app.services.file_service import get_active_file
from backend.app.services.order_service import (
    OrderIdentity,
    OrderRuleError,
    create_order,
    transition_order,
)
from backend.app.services.payment_service import (
    PaymentRuleError,
    create_payment,
    get_method_by_code,
    mark_paid,
    reject_payment,
)
from backend.app.services.ticket_service import build_ticket_payload

# Reusa el pricing/carrito del router de pedidos (misma conversión y errores).
from backend.app.api.v1.orders import _order_read, _priced_or_422

router = APIRouter(tags=["payments"])

_ORDER_NOT_FOUND = "Pedido no encontrado"
_PAYMENT_NOT_FOUND = "Pago no encontrado"


def _payment_read(payment: Payment) -> PaymentRead:
    data = {
        field: getattr(payment, field)
        for field in PaymentRead.model_fields
        if field != "attachments"
    }
    return PaymentRead(
        **data,
        attachments=[
            PaymentAttachmentRead.model_validate(item, from_attributes=True)
            for item in payment.attachments
        ],
    )


def _default_expected(order: Order) -> Decimal:
    if order.total_money_amount is not None:
        return order.total_money_amount
    shipping = Decimal("0")
    if order.shipping is not None:
        shipping = order.shipping.final_amount or order.shipping.estimated_amount or Decimal("0")
    return order.items_subtotal_amount + shipping


# ---------------------------------------------------------------------------
# Métodos disponibles (para armar la pantalla de pago)
# ---------------------------------------------------------------------------

@router.get("/payment-methods", response_model=list[PaymentMethodPublic])
def list_public_payment_methods(session: SessionDep) -> list[PaymentMethodPublic]:
    """Métodos ACTIVOS disponibles en línea (público: el checkout los muestra)."""
    rows = session.exec(
        select(PaymentMethodConfig)
        .where(PaymentMethodConfig.is_active == True)  # noqa: E712
        .where(PaymentMethodConfig.available_online == True)  # noqa: E712
        .order_by(PaymentMethodConfig.sort_order)  # pyright: ignore[reportArgumentType]
    ).all()
    return [PaymentMethodPublic.model_validate(row, from_attributes=True) for row in rows]


# ---------------------------------------------------------------------------
# Pagos de un pedido
# ---------------------------------------------------------------------------

@router.get("/orders/{order_id}/payments", response_model=list[PaymentRead])
def list_order_payments(
    order_id: uuid.UUID,
    session: SessionDep,
    _: PaymentPermissions.READ.requiere,
) -> list[PaymentRead]:
    order = get_or_404(session, Order, order_id, _ORDER_NOT_FOUND)
    payments = session.exec(
        select(Payment).where(Payment.order_id == order.id).order_by(
            Payment.created_at  # pyright: ignore[reportArgumentType]
        )
    ).all()
    return [_payment_read(payment) for payment in payments]


@router.post(
    "/orders/{order_id}/payments",
    response_model=PaymentRead,
    status_code=status.HTTP_201_CREATED,
)
def record_order_payment(
    order_id: uuid.UUID,
    payload: PaymentCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: PaymentPermissions.RECORD.requiere,
) -> PaymentRead:
    order = get_or_404(session, Order, order_id, _ORDER_NOT_FOUND)
    if order.status == "cancelled":
        api_error(status.HTTP_409_CONFLICT, "pedido_cancelado", "El pedido está cancelado.")
    method = get_method_by_code(session, payload.method_code)
    if method is None:
        api_error(status.HTTP_404_NOT_FOUND, "metodo_no_encontrado", "Método de pago no encontrado")

    try:
        payment = create_payment(
            session,
            order,
            method,
            expected_amount=(
                payload.expected_amount
                if payload.expected_amount is not None
                else _default_expected(order)
            ),
            change_requested_for_amount=payload.change_requested_for_amount,
            transaction_reference=payload.transaction_reference,
            bank_name=payload.bank_name,
            terminal_name=payload.terminal_name,
            card_last_four=payload.card_last_four,
            notes=payload.notes,
        )
    except PaymentRuleError as exc:
        api_error(status.HTTP_422_UNPROCESSABLE_ENTITY, exc.code, exc.message)

    commit_or_conflict(session, "No fue posible registrar el pago.")
    session.refresh(payment)
    return _payment_read(payment)


@router.post("/payments/{payment_id}/verify", response_model=PaymentRead)
def verify_payment(
    payment_id: uuid.UUID,
    payload: PaymentVerifyRequest,
    session: SessionDep,
    current_user: CurrentUser,
    _: PaymentPermissions.VERIFY.requiere,
) -> PaymentRead:
    payment = get_or_404(session, Payment, payment_id, _PAYMENT_NOT_FOUND)
    order = get_or_404(session, Order, payment.order_id, _ORDER_NOT_FOUND)

    try:
        if payload.approve:
            mark_paid(
                session, order, payment,
                actor_id=current_user.id, received_amount=payload.received_amount,
            )
        else:
            if not (payload.rejected_reason or "").strip():
                api_error(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    "motivo_requerido",
                    "Rechazar un pago requiere el motivo.",
                )
            reject_payment(
                session, order, payment,
                actor_id=current_user.id, rejected_reason=payload.rejected_reason or "",
            )
    except PaymentRuleError as exc:
        api_error(status.HTTP_409_CONFLICT, exc.code, exc.message)

    # H10 (decisión de producto): una venta de MOSTRADOR ya entregada que solo
    # esperaba la verificación de su pago se COMPLETA al verificar — no queda
    # «approved» eterna. Pedidos web/teléfono siguen su ciclo operativo normal.
    if (
        payload.approve
        and order.source == "counter"
        and order.fulfillment_type == "counter"
        and order.status == "approved"
        and order.payment_status == "paid"
    ):
        from backend.app.services.order_service import transition_order

        transition_order(
            session, order, "completed",
            actor_id=current_user.id,
            internal_note="Venta de mostrador completada al verificar el pago.",
        )

    commit_or_conflict(session, "No fue posible actualizar el pago.")
    session.refresh(payment)
    return _payment_read(payment)


@router.post(
    "/payments/{payment_id}/attachments",
    response_model=PaymentRead,
    status_code=status.HTTP_201_CREATED,
)
def attach_payment_evidence(
    payment_id: uuid.UUID,
    payload: PaymentAttachmentCreate,
    session: SessionDep,
    _: PaymentPermissions.RECORD.requiere,
) -> PaymentRead:
    payment = get_or_404(session, Payment, payment_id, _PAYMENT_NOT_FOUND)
    stored = get_active_file(session, payload.file_id)
    if stored is None or stored.kind not in ("image", "document"):
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "archivo_invalido",
            "El archivo no existe, está inactivo o no es una evidencia válida.",
        )
    session.add(
        PaymentAttachment(
            payment_id=payment.id,
            file_id=payload.file_id,
            attachment_type=payload.attachment_type,
            description=payload.description,
        )
    )
    commit_or_conflict(session, "No fue posible asociar la evidencia.")
    session.refresh(payment)
    return _payment_read(payment)


# ---------------------------------------------------------------------------
# Ticket (§20)
# ---------------------------------------------------------------------------

@router.get("/orders/{order_id}/ticket", response_model=TicketRead)
def get_order_ticket(
    order_id: uuid.UUID,
    session: SessionDep,
    _: TicketPermissions.PRINT.requiere,
) -> TicketRead:
    order = get_or_404(session, Order, order_id, _ORDER_NOT_FOUND)
    return TicketRead.model_validate(build_ticket_payload(session, order))


@router.post(
    "/orders/{order_id}/ticket-prints",
    response_model=TicketPrintRead,
    status_code=status.HTTP_201_CREATED,
)
def log_ticket_print(
    order_id: uuid.UUID,
    payload: TicketPrintCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: TicketPermissions.PRINT.requiere,
) -> TicketPrintRead:
    order = get_or_404(session, Order, order_id, _ORDER_NOT_FOUND)
    log = TicketPrintLog(
        order_id=order.id,
        print_type=payload.print_type,
        printer_name=payload.printer_name,
        printed_by=current_user.id,
        copy_number=payload.copy_number,
    )
    session.add(log)
    commit_or_conflict(session, "No fue posible registrar la impresión.")
    session.refresh(log)
    return TicketPrintRead.model_validate(log, from_attributes=True)


# ---------------------------------------------------------------------------
# Venta a mostrador (POS): una sola transacción
# ---------------------------------------------------------------------------

@router.post("/pos/sales", response_model=PosSaleResult, status_code=status.HTTP_201_CREATED)
def pos_sale(
    payload: PosSaleRequest,
    session: SessionDep,
    current_user: CurrentUser,
    _capture: OrderPermissions.CAPTURE.requiere,
    _record: PaymentPermissions.RECORD.requiere,
) -> PosSaleResult:
    """Venta presencial (§16 mostrador): submitted→approved→(pago)→completed.

    La aprobación es implícita en la venta presencial; si el pago requiere
    verificación (transferencia/terminal), el pedido queda aprobado y el pago
    pendiente de verificar — no se marca completado hasta cobrar.
    """
    settings_row = get_business_settings(session)
    if not settings_row.allow_counter_sales:
        api_error(status.HTTP_409_CONFLICT, "mostrador_deshabilitado", "La venta a mostrador está deshabilitada.")

    method = get_method_by_code(session, payload.payment.method_code)
    if method is None or not method.available_pos:
        api_error(
            status.HTTP_404_NOT_FOUND, "metodo_no_encontrado",
            "Método de pago no disponible en mostrador.",
        )

    priced = _priced_or_422(session, payload.lines)
    # La venta POS es una operación MONETARIA de un paso (pedido + cobro). El
    # canje con créditos sigue el ciclo normal (captura → completar), sin
    # registrar aquí un pago de $0 (§1.3).
    if priced.purchase_mode != "money":
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "pos_solo_dinero",
            "La venta de mostrador se cobra en dinero; el canje de créditos "
            "se captura como pedido normal.",
        )
    try:
        order = create_order(
            session,
            priced,
            OrderIdentity(
                source="counter",
                fulfillment_type="counter",
                customer_user_id=payload.customer_user_id,
                created_by=current_user.id,
                customer_name=payload.customer_name,
            ),
        )
        if payload.internal_note:
            order.internal_note = payload.internal_note
            session.add(order)

        transition_order(session, order, "pending_approval", actor_id=current_user.id)
        transition_order(session, order, "approved", actor_id=current_user.id)

        payment = create_payment(
            session,
            order,
            method,
            expected_amount=order.total_money_amount or priced.items_subtotal_amount,
            change_requested_for_amount=payload.payment.change_requested_for_amount,
            transaction_reference=payload.payment.transaction_reference,
            bank_name=payload.payment.bank_name,
            terminal_name=payload.payment.terminal_name,
            card_last_four=payload.payment.card_last_four,
        )
        if not method.requires_manual_verification:
            mark_paid(session, order, payment, actor_id=current_user.id)
            transition_order(session, order, "completed", actor_id=current_user.id)
    except (OrderRuleError, PaymentRuleError) as exc:
        api_error(status.HTTP_422_UNPROCESSABLE_ENTITY, exc.code, exc.message)

    commit_or_conflict(session, "No fue posible registrar la venta.")
    session.refresh(order)
    session.refresh(payment)
    return PosSaleResult(order=_order_read(order), payment=_payment_read(payment))
