"""Operación de reparto (§19): vista del repartidor y asignación manual.

El repartidor opera con ``deliveries:self_assign``: cola de listos,
disponibilidad, tomar/iniciar/entregar SUS envíos y su tracking voluntario.
Marcar entregado también lo puede hacer un empleado con
``deliveries:complete_for_courier`` (operación sin conexión, §19.6).
"""

import uuid

from fastapi import APIRouter, status
from sqlmodel import Session, select

from backend.app.api.resource_actions import api_error, commit_or_conflict, get_or_404
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.models.deliveries import DeliveryAssignment
from backend.app.models.profiles import StaffProfile
from backend.app.schemas.delivery import (
    AssignCourierRequest,
    AssignmentRead,
    AvailableDeliveryItem,
    CompleteDeliveryRequest,
    CourierAvailabilityUpdate,
    CourierSummaryRead,
    LocationReportRequest,
    TrackingToggleRequest,
)
from backend.app.security.groups.deliveries import DeliveryPermissions
from backend.app.services.delivery_service import (
    DeliveryRuleError,
    assign_courier,
    available_deliveries,
    complete_delivery,
    courier_daily_summary,
    current_assignment,
    get_courier_profile,
    report_location,
    set_tracking,
    start_delivery,
    take_delivery,
)
from backend.app.services.order_service import OrderRuleError
from backend.app.services.payment_service import collection_instruction
from backend.app.services.file_service import get_active_file
from backend.app.utils.utc_now import utc_now

router = APIRouter(tags=["deliveries"])


from typing import NoReturn


def _raise(exc: DeliveryRuleError | OrderRuleError, *, conflict: bool = True) -> NoReturn:
    api_error(
        status.HTTP_409_CONFLICT if conflict else status.HTTP_422_UNPROCESSABLE_ENTITY,
        exc.code,
        exc.message,
    )


def _assignment_read(assignment: DeliveryAssignment) -> AssignmentRead:
    return AssignmentRead.model_validate(assignment, from_attributes=True)


def _own_current_assignment(
    session: Session, order_delivery_id: uuid.UUID, courier_user_id: uuid.UUID
) -> DeliveryAssignment:
    assignment = current_assignment(session, order_delivery_id)
    if assignment is None or assignment.courier_user_id != courier_user_id:
        api_error(
            status.HTTP_404_NOT_FOUND,
            "asignacion_no_encontrada",
            "No tienes este envío asignado.",
        )
    return assignment


# ---------------------------------------------------------------------------
# Vista del repartidor
# ---------------------------------------------------------------------------

@router.get("/courier/available-orders", response_model=list[AvailableDeliveryItem])
def list_available_orders(
    session: SessionDep,
    _: DeliveryPermissions.SELF_ASSIGN.requiere,
) -> list[AvailableDeliveryItem]:
    items: list[AvailableDeliveryItem] = []
    for order, delivery in available_deliveries(session):
        address = delivery.street
        if delivery.neighborhood:
            address += f", {delivery.neighborhood}"
        shipping = order.shipping
        items.append(
            AvailableDeliveryItem(
                order_id=order.id,
                order_delivery_id=delivery.id,
                public_code=order.public_code,
                customer_name=order.customer_name_snapshot,
                address_summary=address,
                zone_name=shipping.delivery_zone_name_snapshot if shipping else None,
                collection_label=collection_instruction(session, order).label,
                ready_since=order.updated_at,
            )
        )
    return items


@router.post("/courier/availability", response_model=CourierSummaryRead)
def set_availability(
    payload: CourierAvailabilityUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: DeliveryPermissions.SELF_ASSIGN.requiere,
) -> CourierSummaryRead:
    try:
        profile = get_courier_profile(session, current_user.id)
    except DeliveryRuleError as exc:
        _raise(exc)
    profile.is_delivery_available = payload.is_available
    profile.updated_at = utc_now()
    session.add(profile)
    commit_or_conflict(session, "No fue posible actualizar la disponibilidad.")
    summary = courier_daily_summary(session, current_user.id)
    return CourierSummaryRead(
        deliveries_completed=summary.deliveries_completed,
        cash_collected=summary.cash_collected,
        shipping_charged=summary.shipping_charged,
    )


@router.post("/courier/deliveries/{order_delivery_id}/take", response_model=AssignmentRead)
def take(
    order_delivery_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: DeliveryPermissions.SELF_ASSIGN.requiere,
) -> AssignmentRead:
    try:
        assignment = take_delivery(session, order_delivery_id, current_user.id)
    except DeliveryRuleError as exc:
        _raise(exc)
    commit_or_conflict(session, "Otro repartidor ya tomó este envío.")
    session.refresh(assignment)
    return _assignment_read(assignment)


@router.post("/courier/deliveries/{order_delivery_id}/start", response_model=AssignmentRead)
def start(
    order_delivery_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: DeliveryPermissions.SELF_ASSIGN.requiere,
) -> AssignmentRead:
    assignment = _own_current_assignment(session, order_delivery_id, current_user.id)
    try:
        start_delivery(session, assignment, actor_id=current_user.id)
    except (DeliveryRuleError, OrderRuleError) as exc:
        _raise(exc)
    commit_or_conflict(session, "No fue posible iniciar el reparto.")
    session.refresh(assignment)
    return _assignment_read(assignment)


@router.post("/courier/deliveries/{order_delivery_id}/complete", response_model=AssignmentRead)
def complete(
    order_delivery_id: uuid.UUID,
    payload: CompleteDeliveryRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> AssignmentRead:
    """Marca entregado: el repartidor DUEÑO del envío, o un empleado con
    ``deliveries:complete_for_courier`` en su nombre (§19.6)."""
    assignment = current_assignment(session, order_delivery_id)
    if assignment is None:
        api_error(status.HTTP_404_NOT_FOUND, "asignacion_no_encontrada", "Envío sin asignación vigente.")

    is_owner = assignment.courier_user_id == current_user.id and current_user.access_control(
        DeliveryPermissions.SELF_ASSIGN.permission
    )
    on_behalf = current_user.access_control(DeliveryPermissions.COMPLETE_FOR_COURIER.permission)
    if not (is_owner or on_behalf):
        api_error(status.HTTP_403_FORBIDDEN, "forbidden", "No puedes completar este envío.")

    if payload.proof_file_id is not None and get_active_file(session, payload.proof_file_id) is None:
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "archivo_no_encontrado",
            "La evidencia de entrega no existe o está inactiva.",
        )

    try:
        complete_delivery(
            session,
            assignment,
            actor_id=current_user.id,
            delivered_to_name=payload.delivered_to_name,
            completion_note=payload.completion_note,
            proof_file_id=payload.proof_file_id,
        )
    except (DeliveryRuleError, OrderRuleError) as exc:
        _raise(exc)
    commit_or_conflict(session, "No fue posible completar la entrega.")
    session.refresh(assignment)
    return _assignment_read(assignment)


@router.get("/courier/summary", response_model=CourierSummaryRead)
def my_summary(
    session: SessionDep,
    current_user: CurrentUser,
    _: DeliveryPermissions.SELF_ASSIGN.requiere,
) -> CourierSummaryRead:
    summary = courier_daily_summary(session, current_user.id)
    return CourierSummaryRead(
        deliveries_completed=summary.deliveries_completed,
        cash_collected=summary.cash_collected,
        shipping_charged=summary.shipping_charged,
    )


@router.post("/courier/tracking", status_code=status.HTTP_204_NO_CONTENT)
def toggle_tracking(
    payload: TrackingToggleRequest,
    session: SessionDep,
    current_user: CurrentUser,
    _: DeliveryPermissions.SELF_ASSIGN.requiere,
) -> None:
    try:
        set_tracking(session, current_user.id, enabled=payload.sharing_enabled)
    except DeliveryRuleError as exc:
        _raise(exc)
    commit_or_conflict(session, "No fue posible actualizar el tracking.")


@router.post("/courier/tracking/location", status_code=status.HTTP_204_NO_CONTENT)
def push_location(
    payload: LocationReportRequest,
    session: SessionDep,
    current_user: CurrentUser,
    _: DeliveryPermissions.SELF_ASSIGN.requiere,
) -> None:
    longitude, latitude = payload.location.coordinates
    try:
        report_location(
            session,
            current_user.id,
            longitude=longitude,
            latitude=latitude,
            accuracy_meters=payload.accuracy_meters,
        )
    except DeliveryRuleError as exc:
        _raise(exc)
    commit_or_conflict(session, "No fue posible registrar la ubicación.")


# ---------------------------------------------------------------------------
# Asignación manual por empleado
# ---------------------------------------------------------------------------

@router.post("/deliveries/{order_delivery_id}/assign", response_model=AssignmentRead)
def assign_manual(
    order_delivery_id: uuid.UUID,
    payload: AssignCourierRequest,
    session: SessionDep,
    current_user: CurrentUser,
    _: DeliveryPermissions.ASSIGN.requiere,
) -> AssignmentRead:
    try:
        assignment = assign_courier(
            session,
            order_delivery_id,
            payload.courier_user_id,
            assigned_by=current_user.id,
            reason=payload.reason,
        )
    except DeliveryRuleError as exc:
        _raise(exc)
    commit_or_conflict(session, "No fue posible asignar el repartidor.")
    session.refresh(assignment)
    return _assignment_read(assignment)


@router.get("/deliveries/queue", response_model=list[AvailableDeliveryItem])
def deliveries_queue(
    session: SessionDep,
    _: DeliveryPermissions.READ.requiere,
) -> list[AvailableDeliveryItem]:
    return list_available_orders(session, True)  # type: ignore[arg-type]
