"""Repartidores: asignaciones y ubicación opcional en tiempo real (§19).

Un pedido puede cambiar de repartidor: cada intento es una fila de
``delivery_assignments`` y SOLO una puede estar vigente (índice único parcial
sobre ``is_current``) — dos repartidores no pueden tomar el mismo envío. La
ubicación es OPCIONAL, temporal y visible únicamente con el pedido en camino
(§19.2); los eventos históricos se purgan (§19.4).
"""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base
from .geometry import PointGeometry

ASSIGNMENT_STATUSES = (
    "assigned",
    "accepted",
    "in_progress",
    "completed",
    "cancelled",
    "reassigned",
)
TRACKING_STATUSES = ("inactive", "active", "paused", "ended")


def _in_clause(column: str, values: tuple[str, ...]) -> str:
    quoted = ", ".join(f"'{value}'" for value in values)
    return f"{column} IN ({quoted})"


class CourierTrackingSession(Base):
    """Sesión de ubicación del repartidor (§19.3): voluntaria y temporal."""

    __tablename__ = "courier_tracking_sessions"
    __table_args__ = (
        CheckConstraint(_in_clause("status", TRACKING_STATUSES), name="courier_tracking_status"),
        Index("ix_courier_tracking_courier", "courier_user_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    courier_user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("user.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="inactive")
    sharing_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    current_location: Mapped[Optional[Any]] = mapped_column(PointGeometry(), nullable=True)
    current_location_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    current_accuracy_meters: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(8, 2), nullable=True
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_reason: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    location_events: Mapped[list["CourierLocationEvent"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


class CourierLocationEvent(Base):
    """Historial TEMPORAL de ubicaciones (§19.4): se purga tras 72 horas."""

    __tablename__ = "courier_location_events"
    __table_args__ = (Index("ix_courier_location_events_session", "tracking_session_id", "captured_at"),)

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tracking_session_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("courier_tracking_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    location: Mapped[Any] = mapped_column(PointGeometry(), nullable=False)
    accuracy_meters: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 2), nullable=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    session: Mapped["CourierTrackingSession"] = relationship(back_populates="location_events")


class DeliveryAssignment(Base):
    """Asignación de repartidor a una entrega (§19.1): una vigente por pedido."""

    __tablename__ = "delivery_assignments"
    __table_args__ = (
        CheckConstraint(
            _in_clause("status", ASSIGNMENT_STATUSES), name="delivery_assignments_status"
        ),
        # Regla dura del reporte: UNIQUE(order_delivery_id) WHERE is_current.
        Index(
            "uq_delivery_assignments_current",
            "order_delivery_id",
            unique=True,
            postgresql_where=text("is_current"),
            sqlite_where=text("is_current"),
        ),
        Index("ix_delivery_assignments_courier", "courier_user_id", "assigned_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    order_delivery_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("order_deliveries.id", ondelete="CASCADE"),
        nullable=False,
    )
    courier_user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("user.id", ondelete="RESTRICT"), nullable=False
    )
    courier_name_snapshot: Mapped[str] = mapped_column(String(180), nullable=False)
    courier_contact_phone_snapshot: Mapped[Optional[str]] = mapped_column(
        String(30),
        nullable=True,
        comment="Teléfono AUTORIZADO para el cliente (public_contact_phone), nunca el personal.",
    )
    tracking_session_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("courier_tracking_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="assigned")
    is_current: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    assigned_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Empleado que asignó; el PROPIO repartidor cuando se autoasigna (§19.5).",
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cancellation_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    internal_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
