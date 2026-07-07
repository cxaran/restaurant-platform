"""Direcciones reutilizables del usuario (§9.1 del reporte integral).

La ubicación exacta (``location``) es OPCIONAL: el cliente puede capturar sólo
calle, número, colonia y referencias. Sin punto no hay cálculo automático de
envío — el pedido se recibe y el costo se revisa manualmente (§17.2).

La API habla GeoJSON (Point, SRID 4326); la conversión a WKB vive en la capa de
schemas/servicios, nunca se acepta WKT crudo del cliente.
"""

import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base
from .geometry import PointGeometry


class UserAddress(Base):
    """Dirección guardada del usuario, con punto geográfico opcional."""

    __tablename__ = "user_addresses"
    __table_args__ = (
        Index("ix_user_addresses_user_active", "user_id", "is_active"),
        # A lo sumo una dirección predeterminada ACTIVA por usuario.
        Index(
            "uq_user_addresses_default_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("is_default AND is_active"),
        ),
        # El índice GIST del punto se crea en la migración (ix_user_addresses_location).
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=False,
    )
    label: Mapped[Optional[str]] = mapped_column(
        String(80),
        nullable=True,
        comment="Etiqueta del usuario: «Casa», «Oficina», …",
    )
    street: Mapped[str] = mapped_column(String(180), nullable=False)
    external_number: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    internal_number: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    neighborhood: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    postal_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    references: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Referencias de entrega: «casa azul frente a la tienda».",
    )
    contact_phone: Mapped[Optional[str]] = mapped_column(
        String(30),
        nullable=True,
        comment="Teléfono de contacto guardado con la dirección: prellena el "
        "checkout para no volver a pedirlo.",
    )
    location: Mapped[Optional[Any]] = mapped_column(
        PointGeometry(),
        nullable=True,
        comment="Punto exacto OPCIONAL (SRID 4326). Sin punto: envío a revisión manual.",
    )
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
