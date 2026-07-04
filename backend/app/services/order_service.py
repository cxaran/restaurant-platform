"""Ciclo de vida del pedido: creación, máquina de estados y totales (§14–§16).

La máquina de estados es una TABLA declarativa (transiciones válidas por
estado origen), no ``if``s dispersos: el punto de mayor riesgo de regresión
del dominio queda en un solo lugar auditable. Cada transición escribe SIEMPRE
``order_status_history`` (§15.4).

Reglas duras aplicadas aquí:
 - identidad por canal (§1.2): online exige cliente; canales de personal
   exigen ``created_by``; delivery/pickup exigen nombre y teléfono snapshot;
 - la aprobación CONGELA los totales (§16): subtotal + cargos − descuentos +
   envío; un delivery no se aprueba sin ``final_amount`` de envío (§17.2);
 - después de aprobar no hay edición libre: sólo ajustes registrados,
   reembolso o cancelación (las etapas 7–8 se enganchan en los hooks).

El cliente ve etiquetas públicas simples (§58.2), nunca los estados internos
granulares.
"""

import uuid
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from sqlalchemy import text as sa_text
from sqlmodel import Session, select

from backend.app.models.orders import (
    CANCELLATION_MONEY_RESOLUTIONS,
    FULFILLMENT_TYPES,
    ORDER_SOURCES,
    Order,
    OrderStatusHistory,
)
from backend.app.services.business_service import get_business_profile
from backend.app.services.pricing_service import PricedOrder
from backend.app.utils.utc_now import utc_now


class OrderRuleError(ValueError):
    """Regla del ciclo de vida violada. Código estable para la API."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


# ---------------------------------------------------------------------------
# Estados públicos (§58.2): etiqueta simple por estado interno.
# ---------------------------------------------------------------------------

PUBLIC_STATUS_LABELS: dict[str, str] = {
    "draft": "Pedido recibido",
    "submitted": "Pedido recibido",
    "pending_shipping_review": "Pedido recibido",
    "pending_payment_verification": "Pedido recibido",
    "pending_approval": "Pedido recibido",
    "approved": "Confirmado",
    "preparing": "En preparación",
    "ready": "Listo",
    "out_for_delivery": "En camino",
    "completed": "Entregado",
    "cancelled": "Cancelado",
}


def public_status(status: str) -> str:
    return PUBLIC_STATUS_LABELS.get(status, status)


# ---------------------------------------------------------------------------
# Máquina de estados declarativa (§16)
# ---------------------------------------------------------------------------

# Estado origen → destinos permitidos. Cancelar es posible en todo estado no
# terminal. ``approved → completed`` cubre el flujo de mostrador; ``ready →
# completed`` cubre pickup (recoger no pasa por «en camino»).
ORDER_TRANSITIONS: dict[str, tuple[str, ...]] = {
    "draft": ("submitted", "cancelled"),
    "submitted": (
        "pending_shipping_review",
        "pending_payment_verification",
        "pending_approval",
        "approved",
        "cancelled",
    ),
    "pending_shipping_review": (
        "pending_payment_verification",
        "pending_approval",
        "cancelled",
    ),
    "pending_payment_verification": ("pending_approval", "cancelled"),
    "pending_approval": ("approved", "cancelled"),
    "approved": ("preparing", "completed", "cancelled"),
    "preparing": ("ready", "cancelled"),
    "ready": ("out_for_delivery", "completed", "cancelled"),
    "out_for_delivery": ("completed", "cancelled"),
    "completed": (),
    "cancelled": (),
}


def transition_order(
    session: Session,
    order: Order,
    new_status: str,
    *,
    actor_id: Optional[uuid.UUID],
    reason_code: Optional[str] = None,
    internal_note: Optional[str] = None,
    customer_visible_note: Optional[str] = None,
    payment_resolution: Optional[str] = None,
    resolution_reason: Optional[str] = None,
) -> Order:
    """Aplica una transición válida, sus efectos y la bitácora. NO hace commit."""
    allowed = ORDER_TRANSITIONS.get(order.status, ())
    if new_status not in allowed:
        raise OrderRuleError(
            "transicion_invalida",
            f"No se puede pasar de «{order.status}» a «{new_status}».",
        )

    if new_status == "out_for_delivery" and order.fulfillment_type != "delivery":
        raise OrderRuleError(
            "transicion_invalida",
            "Sólo los pedidos a domicilio salen «en camino».",
        )

    now = utc_now()
    if new_status == "approved":
        _freeze_totals_on_approval(order)
        order.approved_by = actor_id
        order.approved_at = now
        # H4: el total recién congelado (con envío) puede dejar corto un pago
        # previo — recalcular AQUÍ evita el «paid» prematuro de deliveries.
        from backend.app.services.payment_service import recompute_order_payment_status

        recompute_order_payment_status(session, order)
    elif new_status == "completed":
        order.completed_at = now
        # §22: consumir canjes y acreditar créditos ganados (import tardío: sin ciclo).
        from backend.app.services.credit_service import on_order_completed

        on_order_completed(session, order, actor_id=actor_id)
    elif new_status == "cancelled":
        # H5 (§1.6): cancelar NO reembolsa. Con dinero cobrado, quien cancela
        # elige una resolución explícita: reembolso ahora, reembolso pendiente
        # o retención excepcional con motivo. El reembolso en sí es un flujo
        # aparte; la cola de conciliación vive sobre esta resolución.
        from backend.app.models.payments import Payment as _Payment

        paid = session.exec(
            select(_Payment).where(
                _Payment.order_id == order.id,
                _Payment.status.in_(("paid", "partially_refunded")),  # pyright: ignore[reportAttributeAccessIssue]
            )
        ).first()
        if paid is not None:
            if payment_resolution not in CANCELLATION_MONEY_RESOLUTIONS:
                raise OrderRuleError(
                    "resolucion_requerida",
                    "Este pedido tiene pagos cobrados: cancelar no reembolsa. "
                    "Elige una resolución: reembolsar ahora, dejar el reembolso "
                    "pendiente o retener el pago con motivo.",
                )
            if payment_resolution == "retain" and not (resolution_reason or "").strip():
                raise OrderRuleError(
                    "motivo_requerido",
                    "Retener un pago cobrado exige un motivo auditable.",
                )
            order.cancellation_money_resolution = payment_resolution
            order.cancellation_resolution_note = resolution_reason
            resolution_label = {
                "refund_now": "reembolso registrado ahora",
                "refund_pending": "reembolso pendiente de procesar",
                "retain": "pago retenido excepcionalmente",
            }[payment_resolution]
            internal_note = (
                (internal_note + " · " if internal_note else "")
                + f"Cancelado con pago cobrado; resolución: {resolution_label}."
            )
        order.cancelled_at = now
        order.cancelled_by = actor_id
        # §22.3: liberar las reservas de canje.
        from backend.app.services.credit_service import on_order_cancelled

        on_order_cancelled(session, order, actor_id=actor_id)

    session.add(
        OrderStatusHistory(
            order_id=order.id,
            previous_status=order.status,
            new_status=new_status,
            reason_code=reason_code,
            internal_note=internal_note,
            customer_visible_note=customer_visible_note,
            changed_by=actor_id,
            changed_at=now,
        )
    )
    order.status = new_status
    order.updated_at = now
    session.add(order)
    session.flush()
    return order


def _freeze_totals_on_approval(order: Order) -> None:
    """Congela totales al aprobar (§16). Delivery exige envío FINAL (§17.2)."""
    shipping_amount = Decimal("0")
    if order.fulfillment_type == "delivery":
        shipping = order.shipping
        if shipping is None or shipping.final_amount is None:
            raise OrderRuleError(
                "envio_no_definido",
                "El pedido a domicilio no puede aprobarse sin costo de envío final.",
            )
        shipping_amount = shipping.final_amount
        order.shipping_total_amount = shipping.final_amount

    charges = sum(
        (adj.amount for adj in order.adjustments if adj.direction == "charge"),
        Decimal("0"),
    )
    discounts = sum(
        (adj.amount for adj in order.adjustments if adj.direction == "discount"),
        Decimal("0"),
    )
    order.discount_total_amount = discounts
    total = order.items_subtotal_amount + charges - discounts + shipping_amount
    order.total_money_amount = total if total > 0 else Decimal("0")


# ---------------------------------------------------------------------------
# Creación de pedidos (todos los canales)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class OrderIdentity:
    """Identidad y contacto del pedido según el canal (§1.2/§14.1)."""

    source: str
    fulfillment_type: str
    customer_user_id: Optional[uuid.UUID] = None
    created_by: Optional[uuid.UUID] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None


def create_order(
    session: Session,
    priced: PricedOrder,
    identity: OrderIdentity,
    *,
    customer_note: Optional[str] = None,
) -> Order:
    """Crea el pedido con folio único, líneas valuadas y bitácora inicial.

    NO hace commit: checkout/captura componen entrega y envío en la misma
    transacción antes de confirmar.
    """
    if identity.source not in ORDER_SOURCES:
        raise OrderRuleError("canal_invalido", "Canal de venta no reconocido.")
    if identity.fulfillment_type not in FULFILLMENT_TYPES:
        raise OrderRuleError("entrega_invalida", "Tipo de entrega no reconocido.")

    # Identidad por canal (invariante «no hay pedido sin usuario»).
    if identity.source == "online" and identity.customer_user_id is None:
        raise OrderRuleError(
            "cliente_requerido", "Un pedido web requiere usuario registrado."
        )
    if identity.source != "online" and identity.created_by is None:
        raise OrderRuleError(
            "empleado_requerido",
            "Un pedido capturado por personal debe registrar al empleado.",
        )

    # Contacto por canal: pickup exige contacto a nivel pedido (hay que avisar);
    # en DELIVERY el contacto obligatorio vive en el snapshot de order_deliveries
    # (recipient_name/phone), así una captura manual sin cliente sigue siendo
    # entregable. La composición de la entrega valida esa parte.
    if identity.fulfillment_type == "pickup" and (
        not identity.customer_name or not identity.customer_phone
    ):
        raise OrderRuleError(
            "datos_contacto_requeridos",
            "Nombre y teléfono de contacto son obligatorios para avisar al cliente.",
        )

    # Pedido íntegro de canje (§1.3): requiere cliente y NO admite envío —
    # en v1 sólo fulfillment sin costo de envío (pickup o mostrador).
    if priced.purchase_mode == "credits":
        if identity.customer_user_id is None:
            raise OrderRuleError(
                "canje_sin_cliente",
                "El canje con créditos requiere un usuario cliente (§22.1).",
            )
        if identity.fulfillment_type == "delivery":
            raise OrderRuleError(
                "canje_sin_envio",
                "Un pedido pagado con créditos no permite envío a domicilio; "
                "elige recoger en tienda.",
            )

    # Créditos SOLO con cliente (CHECK orders_credits_require_customer):
    # sin customer_user_id no se canjea (error) ni se gana (snapshots en cero).
    if identity.customer_user_id is None:
        if priced.credits_redeemed_total > 0:
            raise OrderRuleError(
                "canje_sin_cliente",
                "El canje con créditos requiere un usuario cliente (§22.1).",
            )
        priced.credits_earned_total = 0
        for line in priced.lines:
            line.credits_earned_total_snapshot = 0
            line.credits_awarded_per_unit_snapshot = 0

    profile = get_business_profile(session)
    number = _next_order_number(session)
    now = utc_now()
    order = Order(
        order_number=number,
        public_code=f"{profile.order_prefix}-{number:06d}",
        customer_user_id=identity.customer_user_id,
        source=identity.source,
        fulfillment_type=identity.fulfillment_type,
        purchase_mode=priced.purchase_mode,
        status="submitted",
        payment_status="unpaid",
        customer_name_snapshot=identity.customer_name,
        customer_phone_snapshot=identity.customer_phone,
        customer_email_snapshot=identity.customer_email,
        items_subtotal_amount=priced.items_subtotal_amount,
        credits_earned_total_snapshot=priced.credits_earned_total,
        credits_redeemed_total=priced.credits_redeemed_total,
        customer_note=customer_note,
        submitted_at=now,
        created_by=identity.created_by,
    )
    order.lines = priced.lines
    session.add(order)
    session.flush()

    session.add(
        OrderStatusHistory(
            order_id=order.id,
            previous_status=None,
            new_status="submitted",
            changed_by=identity.created_by or identity.customer_user_id,
            changed_at=now,
        )
    )
    session.flush()
    return order


def _next_order_number(session: Session) -> int:
    """Folio consecutivo: secuencia PostgreSQL; fallback max+1 en tests SQLite."""
    bind = session.get_bind()
    if bind is not None and bind.dialect.name == "postgresql":
        return int(session.exec(sa_text("SELECT nextval('orders_order_number_seq')")).one()[0])  # type: ignore[arg-type]
    current = session.exec(
        select(Order.order_number).order_by(
            Order.order_number.desc()  # pyright: ignore[reportAttributeAccessIssue]
        )
    ).first()
    return int(current or 0) + 1
