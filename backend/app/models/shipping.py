"""Zonas de reparto y tarifas de envío (§10 del reporte integral).

Las zonas son polígonos PostGIS configurados desde la primera versión; la
pertenencia de un punto se resuelve con ``ST_Covers`` y los solapes con
``priority`` (gana la mayor). Las tarifas son una lista editable por zona; el
costo FINAL de un pedido vive en ``order_shipping`` (etapa 4) — aquí sólo está
la configuración vigente que produce cotizaciones estimadas.
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
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base
from .geometry import MultiPolygonGeometry


class DeliveryZone(Base):
    """Zona de cobertura (§10.1): MultiPolygon SRID 4326 + prioridad para solapes."""

    __tablename__ = "delivery_zones"
    # El índice GIST de coverage_geometry se crea en la migración
    # (ix_delivery_zones_coverage).

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code: Mapped[str] = mapped_column(String(40), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    coverage_geometry: Mapped[Any] = mapped_column(
        MultiPolygonGeometry(),
        nullable=False,
        comment="Cobertura como MultiPolygon (SRID 4326). La API habla GeoJSON.",
    )
    priority: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Resuelve solapes entre zonas: gana la prioridad MAYOR.",
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    rates: Mapped[list["ShippingRateRule"]] = relationship(
        back_populates="zone", cascade="all, delete-orphan"
    )


class ShippingRateRule(Base):
    """Tarifa aplicable a una zona (§10.2)."""

    __tablename__ = "shipping_rate_rules"
    __table_args__ = (
        CheckConstraint("base_fee >= 0", name="shipping_rate_rules_fee_non_negative"),
        CheckConstraint(
            "minimum_order_amount IS NULL OR minimum_order_amount >= 0",
            name="shipping_rate_rules_minimum_non_negative",
        ),
        CheckConstraint(
            "free_shipping_from_amount IS NULL OR free_shipping_from_amount >= 0",
            name="shipping_rate_rules_free_from_non_negative",
        ),
        CheckConstraint(
            "estimated_minutes IS NULL OR estimated_minutes >= 0",
            name="shipping_rate_rules_minutes_non_negative",
        ),
        Index("ix_shipping_rate_rules_zone", "delivery_zone_id", "priority"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    delivery_zone_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("delivery_zones.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    base_fee: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    minimum_order_amount: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(12, 2),
        nullable=True,
        comment="Compra mínima para que la tarifa aplique; NULL = sin mínimo.",
    )
    free_shipping_from_amount: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(12, 2),
        nullable=True,
        comment="Umbral de envío gratis PROPIO de la tarifa; convive con el global (§10.2).",
    )
    estimated_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    priority: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Entre tarifas aplicables de la zona gana la prioridad MAYOR.",
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    zone: Mapped["DeliveryZone"] = relationship(back_populates="rates")
