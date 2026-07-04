"""Operación de reparto (§19): cola, autoasignación, entrega y visibilidad.

Reglas duras:
 - una sola asignación VIGENTE por pedido (índice único parcial): tomar un
   envío es transaccional y el segundo repartidor recibe conflicto (§19.5);
 - el cliente ve al repartidor SOLO con el pedido en camino (§19.2), y sólo
   datos autorizados: nombre, teléfono público, nota pública y última
   ubicación si hay sesión compartiendo;
 - salir sin internet no es limitante (§19.6): un empleado con permiso puede
   marcar entregado en nombre del repartidor;
 - el resumen diario es DERIVADO (§19.7): sin cajas ni contadores.
"""

import uuid
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from backend.app.models.deliveries import (
    CourierLocationEvent,
    CourierTrackingSession,
    DeliveryAssignment,
)
from backend.app.models.orders import Order, OrderDelivery
from backend.app.models.payments import Payment
from backend.app.models.profiles import StaffProfile
from backend.app.services.order_service import transition_order
from backend.app.services.pricing_service import business_day_bounds
from backend.app.utils.geo import point_to_ewkt, wkb_point_to_lonlat
from backend.app.utils.utc_now import utc_now


class DeliveryRuleError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def get_courier_profile(session: Session, user_id: uuid.UUID) -> StaffProfile:
    profile = session.get(StaffProfile, user_id)
    if profile is None or not profile.is_active or not profile.can_deliver:
        raise DeliveryRuleError(
            "sin_perfil_repartidor",
            "El usuario no tiene perfil de repartidor activo.",
        )
    return profile


def current_assignment(
    session: Session, order_delivery_id: uuid.UUID
) -> Optional[DeliveryAssignment]:
    return session.exec(
        select(DeliveryAssignment).where(
            DeliveryAssignment.order_delivery_id == order_delivery_id,
            DeliveryAssignment.is_current == True,  # noqa: E712
        )
    ).first()


def available_deliveries(session: Session) -> list[tuple[Order, OrderDelivery]]:
    """Cola «listos para salir» (§19.5): ready + delivery + sin asignación vigente."""
    rows = session.exec(
        select(Order, OrderDelivery)
        .join(OrderDelivery, OrderDelivery.order_id == Order.id)  # pyright: ignore[reportArgumentType]
        .where(Order.status == "ready")
        .where(Order.fulfillment_type == "delivery")
        .order_by(Order.updated_at)  # pyright: ignore[reportArgumentType]
    ).all()
    return [
        (order, delivery)
        for order, delivery in rows
        if current_assignment(session, delivery.id) is None
    ]


def _build_assignment(
    session: Session,
    delivery: OrderDelivery,
    courier: StaffProfile,
    *,
    assigned_by: uuid.UUID,
    status: str,
) -> DeliveryAssignment:
    tracking = active_tracking_session(session, courier.user_id)
    assignment = DeliveryAssignment(
        order_delivery_id=delivery.id,
        courier_user_id=courier.user_id,
        courier_name_snapshot=courier.display_name,
        courier_contact_phone_snapshot=courier.public_contact_phone,
        tracking_session_id=tracking.id if tracking else None,
        status=status,
        assigned_by=assigned_by,
        assigned_at=utc_now(),
        accepted_at=utc_now() if status == "accepted" else None,
    )
    session.add(assignment)
    return assignment


def take_delivery(
    session: Session, order_delivery_id: uuid.UUID, courier_user_id: uuid.UUID
) -> DeliveryAssignment:
    """Autoasignación (§19.5): transaccional; el primero gana."""
    courier = get_courier_profile(session, courier_user_id)
    if not courier.is_delivery_available:
        raise DeliveryRuleError(
            "repartidor_no_disponible",
            "Marca tu disponibilidad antes de tomar envíos.",
        )
    delivery = session.get(OrderDelivery, order_delivery_id)
    if delivery is None:
        raise DeliveryRuleError("entrega_no_encontrada", "Entrega no encontrada.")
    order = session.get(Order, delivery.order_id)
    if order is None or order.status != "ready":
        raise DeliveryRuleError("pedido_no_listo", "El pedido no está listo para salir.")
    if current_assignment(session, delivery.id) is not None:
        raise DeliveryRuleError("envio_ya_tomado", "Otro repartidor ya tomó este envío.")

    assignment = _build_assignment(
        session, delivery, courier, assigned_by=courier_user_id, status="accepted"
    )
    try:
        session.flush()
    except IntegrityError:
        # Carrera perdida contra el índice único parcial: el primero ganó.
        session.rollback()
        raise DeliveryRuleError("envio_ya_tomado", "Otro repartidor ya tomó este envío.")
    return assignment


def assign_courier(
    session: Session,
    order_delivery_id: uuid.UUID,
    courier_user_id: uuid.UUID,
    *,
    assigned_by: uuid.UUID,
    reason: Optional[str] = None,
) -> DeliveryAssignment:
    """Asignación/reasignación MANUAL por empleado; convive con la autoasignación."""
    courier = get_courier_profile(session, courier_user_id)
    delivery = session.get(OrderDelivery, order_delivery_id)
    if delivery is None:
        raise DeliveryRuleError("entrega_no_encontrada", "Entrega no encontrada.")

    existing = current_assignment(session, delivery.id)
    if existing is not None:
        existing.is_current = False
        existing.status = "reassigned"
        existing.cancelled_at = utc_now()
        existing.cancellation_reason = reason
        existing.updated_at = utc_now()
        session.add(existing)
        session.flush()

    assignment = _build_assignment(
        session, delivery, courier, assigned_by=assigned_by, status="assigned"
    )
    session.flush()
    return assignment


def start_delivery(
    session: Session, assignment: DeliveryAssignment, *, actor_id: uuid.UUID
) -> DeliveryAssignment:
    """Inicia el reparto: el pedido sale «en camino»."""
    order = _order_of(session, assignment)
    transition_order(session, order, "out_for_delivery", actor_id=actor_id)
    assignment.status = "in_progress"
    assignment.started_at = utc_now()
    assignment.updated_at = utc_now()
    session.add(assignment)
    session.flush()
    return assignment


def complete_delivery(
    session: Session,
    assignment: DeliveryAssignment,
    *,
    actor_id: uuid.UUID,
    delivered_to_name: Optional[str] = None,
    completion_note: Optional[str] = None,
    proof_file_id: Optional[uuid.UUID] = None,
) -> DeliveryAssignment:
    """Marca entregado (repartidor o empleado en su nombre, §19.6).

    Invariante de etapa 4: el efectivo contra entrega se cobra ATÓMICAMENTE con
    la completion — los pagos cash pendientes (guardia H9) quedan pagados aquí
    mismo; una transferencia sin verificar NUNCA se marca pagada al entregar.
    """
    from backend.app.services.payment_service import mark_paid, pending_cash_payments

    order = _order_of(session, assignment)
    delivery = session.get(OrderDelivery, assignment.order_delivery_id)
    now = utc_now()

    transition_order(session, order, "completed", actor_id=actor_id)
    for payment in pending_cash_payments(session, order):
        mark_paid(session, order, payment, actor_id=actor_id)
    if delivery is not None:
        delivery.delivered_at = now
        delivery.delivered_to_name = delivered_to_name
        delivery.delivery_completion_note = completion_note
        delivery.delivery_proof_file_id = proof_file_id
        delivery.updated_at = now
        session.add(delivery)

    assignment.status = "completed"
    assignment.completed_at = now
    assignment.updated_at = now
    session.add(assignment)
    session.flush()
    return assignment


def _order_of(session: Session, assignment: DeliveryAssignment) -> Order:
    delivery = session.get(OrderDelivery, assignment.order_delivery_id)
    if delivery is None:
        raise DeliveryRuleError("entrega_no_encontrada", "Entrega no encontrada.")
    order = session.get(Order, delivery.order_id)
    if order is None:
        raise DeliveryRuleError("pedido_no_encontrado", "Pedido no encontrado.")
    return order


# ---------------------------------------------------------------------------
# Visibilidad para el cliente (§19.2)
# ---------------------------------------------------------------------------

def public_courier_info(session: Session, order: Order) -> Optional[dict]:
    """Datos del repartidor visibles al cliente SOLO con el pedido en camino."""
    if order.status != "out_for_delivery" or order.delivery is None:
        return None
    assignment = current_assignment(session, order.delivery.id)
    if assignment is None:
        return None

    profile = session.get(StaffProfile, assignment.courier_user_id)
    location = None
    location_at = None
    tracking = active_tracking_session(session, assignment.courier_user_id)
    if tracking is not None and tracking.sharing_enabled:
        lonlat = wkb_point_to_lonlat(tracking.current_location)
        if lonlat is not None:
            location = {"type": "Point", "coordinates": list(lonlat)}
            location_at = tracking.current_location_at

    # «Lleva tu cambio de $X»: sólo cuando el cobro contra entrega es efectivo
    # con billete declarado (H9); nunca para pagos ya cobrados o por verificar.
    from backend.app.services.payment_service import collection_instruction

    instruction = collection_instruction(session, order)
    cash_change = instruction.change_amount if instruction.must_collect else None

    return {
        "name": assignment.courier_name_snapshot,
        "public_phone": assignment.courier_contact_phone_snapshot,
        "public_note": profile.courier_public_note if profile else None,
        "location": location,
        "location_at": location_at,
        "cash_change_amount": cash_change,
    }


# ---------------------------------------------------------------------------
# Tracking opcional (§19.3–§19.4)
# ---------------------------------------------------------------------------

def active_tracking_session(
    session: Session, courier_user_id: uuid.UUID
) -> Optional[CourierTrackingSession]:
    return session.exec(
        select(CourierTrackingSession).where(
            CourierTrackingSession.courier_user_id == courier_user_id,
            CourierTrackingSession.status.in_(["active", "paused"]),  # pyright: ignore[reportAttributeAccessIssue]
        )
    ).first()


def set_tracking(
    session: Session, courier_user_id: uuid.UUID, *, enabled: bool
) -> CourierTrackingSession:
    tracking = active_tracking_session(session, courier_user_id)
    now = utc_now()
    if enabled:
        if tracking is None:
            tracking = CourierTrackingSession(
                courier_user_id=courier_user_id,
                status="active",
                sharing_enabled=True,
                started_at=now,
            )
        else:
            tracking.status = "active"
            tracking.sharing_enabled = True
            tracking.updated_at = now
        session.add(tracking)
    else:
        if tracking is None:
            raise DeliveryRuleError("sin_sesion", "No hay sesión de ubicación activa.")
        tracking.status = "ended"
        tracking.sharing_enabled = False
        tracking.ended_at = now
        tracking.ended_reason = "courier_disabled"
        tracking.updated_at = now
        session.add(tracking)
    session.flush()
    return tracking


def report_location(
    session: Session,
    courier_user_id: uuid.UUID,
    *,
    longitude: float,
    latitude: float,
    accuracy_meters: Optional[Decimal] = None,
) -> CourierTrackingSession:
    tracking = active_tracking_session(session, courier_user_id)
    if tracking is None or not tracking.sharing_enabled:
        raise DeliveryRuleError("sin_sesion", "Activa la ubicación antes de reportarla.")
    now = utc_now()
    ewkt = point_to_ewkt(longitude, latitude)
    tracking.current_location = ewkt  # type: ignore[assignment]
    tracking.current_location_at = now
    tracking.current_accuracy_meters = accuracy_meters
    tracking.updated_at = now
    session.add(tracking)
    session.add(
        CourierLocationEvent(
            tracking_session_id=tracking.id,
            location=ewkt,
            accuracy_meters=accuracy_meters,
            captured_at=now,
            received_at=now,
        )
    )
    session.flush()
    return tracking


def purge_location_events(session: Session, *, keep_hours: int = 72) -> int:
    """Elimina eventos viejos (§19.4). Lo invoca el tick de Taskiq."""
    from datetime import timedelta

    cutoff = utc_now() - timedelta(hours=keep_hours)
    rows = session.exec(
        select(CourierLocationEvent).where(CourierLocationEvent.captured_at < cutoff)
    ).all()
    for row in rows:
        session.delete(row)
    session.flush()
    return len(rows)


# ---------------------------------------------------------------------------
# Resumen diario derivado (§19.7)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class CourierDailySummary:
    deliveries_completed: int
    cash_collected: Decimal
    shipping_charged: Decimal


def courier_daily_summary(session: Session, courier_user_id: uuid.UUID) -> CourierDailySummary:
    start, end = business_day_bounds(session)
    assignments = session.exec(
        select(DeliveryAssignment).where(
            DeliveryAssignment.courier_user_id == courier_user_id,
            DeliveryAssignment.status == "completed",
            DeliveryAssignment.completed_at >= start,
            DeliveryAssignment.completed_at < end,
        )
    ).all()

    cash = Decimal("0")
    shipping = Decimal("0")
    for assignment in assignments:
        delivery = session.get(OrderDelivery, assignment.order_delivery_id)
        if delivery is None:
            continue
        order = session.get(Order, delivery.order_id)
        if order is None:
            continue
        shipping += order.shipping_total_amount or Decimal("0")
        payments = session.exec(
            select(Payment).where(
                Payment.order_id == order.id, Payment.status == "paid"
            )
        ).all()
        # Efectivo cobrado por el repartidor: pagos con manejo de cambio.
        cash += sum(
            (p.received_amount for p in payments if p.change_requested_for_amount is not None),
            Decimal("0"),
        )

    return CourierDailySummary(
        deliveries_completed=len(assignments),
        cash_collected=cash,
        shipping_charged=shipping,
    )
