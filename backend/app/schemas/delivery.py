"""Schemas de reparto (§19): cola, asignaciones, tracking y resumen diario."""

from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import Field

from backend.app.schemas.address import GeoPoint
from backend.app.schemas.base import ApiReadSchema, ApiWriteSchema


class AvailableDeliveryItem(ApiReadSchema):
    """Elemento de la cola «listos para salir» (§19.5)."""

    order_id: UUID
    order_delivery_id: UUID
    public_code: str
    customer_name: Optional[str] = None
    address_summary: str
    zone_name: Optional[str] = None
    collection_label: str
    ready_since: Optional[datetime] = None


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
    """Resumen DERIVADO del día del repartidor (§19.7): sin cajas ni cortes."""

    deliveries_completed: int
    cash_collected: Decimal
    shipping_charged: Decimal


class PublicCourierInfo(ApiReadSchema):
    """Lo único del repartidor que ve el cliente, sólo en camino (§19.2)."""

    name: str
    public_phone: Optional[str] = None
    public_note: Optional[str] = None
    location: Optional[GeoPoint] = None
    location_at: Optional[datetime] = None
