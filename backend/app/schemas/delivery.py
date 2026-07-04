"""Schemas de reparto (§19): cola, asignaciones, tracking y resumen diario."""

from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import Field

from backend.app.schemas.address import GeoPoint
from backend.app.schemas.base import ApiReadSchema, ApiWriteSchema


class AvailableDeliveryItem(ApiReadSchema):
    """Elemento de la cola «listos para salir» (§19.5).

    Incluye lo que el repartidor necesita para navegar y contactar SIN abrir
    el pedido completo: teléfono del destinatario, referencias y coordenadas
    (cuando el cliente/empleado fijó punto en mapa).
    """

    order_id: UUID
    order_delivery_id: UUID
    public_code: str
    customer_name: Optional[str] = None
    address_summary: str
    zone_name: Optional[str] = None
    collection_label: str
    ready_since: Optional[datetime] = None
    recipient_phone: Optional[str] = None
    references: Optional[str] = None
    location: Optional[GeoPoint] = None
    total_amount: Optional[Decimal] = None
    # Aclaraciones del equipo visibles fuera del panel (p. ej. al aprobar):
    # el repartidor las ve aquí; el cliente en su seguimiento (§15.4).
    visible_notes: list[str] = Field(default_factory=list)


class MyActiveDelivery(AvailableDeliveryItem):
    """Entrega vigente del propio repartidor: la cola + el estado de SU asignación."""

    assignment_status: str


class AssignmentRead(ApiReadSchema):
    id: UUID
    order_delivery_id: UUID
    courier_user_id: UUID
    courier_name_snapshot: str
    status: str
    is_current: bool
    assigned_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class CourierAvailabilityUpdate(ApiWriteSchema):
    is_available: bool


class AssignCourierRequest(ApiWriteSchema):
    courier_user_id: UUID
    reason: Optional[str] = None


class CompleteDeliveryRequest(ApiWriteSchema):
    delivered_to_name: Optional[str] = Field(default=None, max_length=180)
    completion_note: Optional[str] = None
    proof_file_id: Optional[UUID] = None


class TrackingToggleRequest(ApiWriteSchema):
    sharing_enabled: bool


class LocationReportRequest(ApiWriteSchema):
    location: GeoPoint
    accuracy_meters: Optional[Decimal] = Field(default=None, ge=0)


class CourierSummaryRead(ApiReadSchema):
    """Resumen DERIVADO del día del repartidor (§19.7): sin cajas ni cortes.

    Incluye la disponibilidad vigente para que el panel arranque sincronizado
    con el servidor (no con estado local).
    """

    deliveries_completed: int
    cash_collected: Decimal
    shipping_charged: Decimal
    is_delivery_available: bool = False


class PublicCourierInfo(ApiReadSchema):
    """Lo único del repartidor que ve el cliente, sólo en camino (§19.2).

    ``cash_change_amount``: cambio que lleva el repartidor cuando el pedido se
    cobra en efectivo contra entrega («lleva tu cambio de $X»).
    """

    name: str
    public_phone: Optional[str] = None
    public_note: Optional[str] = None
    location: Optional[GeoPoint] = None
    location_at: Optional[datetime] = None
    cash_change_amount: Optional[Decimal] = None
