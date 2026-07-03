"""Perfiles 1:1 del usuario (§8.2 y §8.4 del reporte integral).

NO son entidades con identidad propia: su llave primaria ES ``user_id``. La
identidad, el acceso y los roles viven siempre en ``users`` (cliente = usuario;
empleado = usuario + rol). Estas tablas sólo agregan los campos de restaurante
que la tabla genérica del core no tiene (teléfono, notas, datos operativos),
para no contaminar ``platform-core``.
"""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class CustomerProfile(Base):
    """Datos comerciales extra del usuario cliente (§8.2). Complementa, no sustituye."""

    __tablename__ = "customer_profiles"
    __table_args__ = (
        Index("ix_customer_profiles_phone_normalized", "phone_normalized"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    full_name: Mapped[str] = mapped_column(String(180), nullable=False)
    phone: Mapped[str] = mapped_column(String(30), nullable=False)
    phone_normalized: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        comment="Sólo dígitos: búsqueda del cliente al capturar pedidos por teléfono/WhatsApp.",
    )
    email: Mapped[Optional[str]] = mapped_column(
        String(180),
        nullable=True,
        comment="Copia comercial de contacto; la identidad de acceso es user.email.",
    )
    internal_notes: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Notas internas de operación (§8.2): NUNCA se muestran al cliente.",
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class StaffProfile(Base):
    """Datos operativos extra del usuario del personal (§8.4).

    NO define quién es empleado — eso lo definen los roles. Aquí viven el
    teléfono público autorizado, la foto y la capacidad/disponibilidad de reparto.
    """

    __tablename__ = "staff_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    display_name: Mapped[str] = mapped_column(String(180), nullable=False)
    contact_phone: Mapped[Optional[str]] = mapped_column(
        String(30),
        nullable=True,
        comment="Número interno del empleado: nunca se expone al cliente.",
    )
    contact_phone_normalized: Mapped[Optional[str]] = mapped_column(
        String(30), nullable=True
    )
    public_contact_phone: Mapped[Optional[str]] = mapped_column(
        String(30),
        nullable=True,
        comment="Único número autorizado para mostrarse al cliente durante la entrega.",
    )
    photo_file_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("stored_files.id", ondelete="RESTRICT"),
        nullable=True,
    )
    can_deliver: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment="Capacidad de reparto: habilita ver la cola de envíos y tomar pedidos.",
    )
    is_delivery_available: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment="El repartidor marca si está disponible para tomar envíos AHORA (§19.5).",
    )
    courier_public_note: Mapped[Optional[str]] = mapped_column(
        String(120),
        nullable=True,
        comment=(
            "Descripción breve visible al cliente SÓLO con el pedido en camino "
            "(§19.2): «Moto roja», etc."
        ),
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
