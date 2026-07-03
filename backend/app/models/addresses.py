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

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    LargeBinary,
    String,
    Text,
    TypeDecorator,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class PointGeometry(TypeDecorator):
    """``geometry(Point, 4326)`` en PostgreSQL; binario inerte en otros dialectos.

    Los tests unitarios crean el metadata completo sobre SQLite en memoria; el
    tipo ``Geometry`` de GeoAlchemy2 exigiría SpatiaLite ahí. Este decorador
    entrega el tipo real sólo bajo PostgreSQL (el único dialecto de producción;
    las migraciones reales declaran ``Geometry`` a mano) y un BLOB neutro en el
    resto, donde la columna nunca se usa.
    """

    impl = LargeBinary
    cache_ok = True

    def load_dialect_impl(self, dialect):  # type: ignore[override]
        if dialect.name == "postgresql":
            return dialect.type_descriptor(
                Geometry(geometry_type="POINT", srid=4326, spatial_index=False)
            )
        return dialect.type_descriptor(LargeBinary())


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
