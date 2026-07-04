"""Códigos de descuento fijo web-only (Etapa 5 del Release Candidate).

Regla ÚNICA e inmutable: «un código descuenta X pesos si el subtotal monetario
elegible de productos y modificadores alcanza o supera Y pesos». No existen
porcentajes, envío gratis, límites globales de uso ni segmentación: el alcance
es final.

La redención guarda SNAPSHOTS inmutables de la definición al momento de
reservar: editar un código sólo afecta usos futuros. La concurrencia la
protegen índices únicos PARCIALES (reserved|consumed ocupan el cupo; released
lo libera): un uso por usuario por código y un código activo por pedido.
"""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

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
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base

REDEMPTION_STATUSES = ("reserved", "consumed", "released")


def _in_clause(column: str, values: tuple[str, ...]) -> str:
    quoted = ", ".join(f"'{value}'" for value in values)
    return f"{column} IN ({quoted})"


class DiscountCode(Base):
    """Definición VIGENTE de un código; el histórico vive en los snapshots."""

    __tablename__ = "discount_codes"
    __table_args__ = (
        CheckConstraint("discount_amount > 0", name="discount_codes_amount_positive"),
        CheckConstraint(
            "minimum_order_amount >= 0", name="discount_codes_minimum_non_negative"
        ),
        # El descuento jamás supera la compra mínima: garantiza estructuralmente
        # que el subtotal elegible nunca queda negativo tras aplicar el código.
        CheckConstraint(
            "discount_amount <= minimum_order_amount",
            name="discount_codes_amount_le_minimum",
        ),
        Index("uq_discount_codes_code_normalized", "code_normalized", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    code: Mapped[str] = mapped_column(
        String(40), nullable=False, comment="Código tal como lo escribió el administrador."
    )
    code_normalized: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
        comment="Código en minúsculas: unicidad y búsqueda case-insensitive.",
    )
    discount_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, comment="Pesos que descuenta el código (X)."
    )
    minimum_order_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        comment="Subtotal monetario elegible mínimo para aplicar (Y).",
    )
    valid_from: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    valid_until: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    target_customer_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Cliente destinatario de un código personal; NULL = código general.",
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("user.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class DiscountCodeRedemption(Base):
    """Uso de un código en un pedido: reserved → consumed | released.

    Los snapshots son INMUTABLES: congelan la definición al reservar; editar el
    código después no los toca. ``released`` nunca se aplica a ``consumed``.
    """

    __tablename__ = "discount_code_redemptions"
    __table_args__ = (
        CheckConstraint(
            _in_clause("status", REDEMPTION_STATUSES),
            name="discount_code_redemptions_status",
        ),
        # Un uso por usuario por código: reserved|consumed ocupan el cupo;
        # released lo devuelve (índice único PARCIAL, PG y SQLite).
        Index(
            "uq_discount_redemptions_code_user",
            "discount_code_id",
            "customer_user_id",
            unique=True,
            postgresql_where=text("status IN ('reserved', 'consumed')"),
            sqlite_where=text("status IN ('reserved', 'consumed')"),
        ),
        # Un código activo por pedido.
        Index(
            "uq_discount_redemptions_order",
            "order_id",
            unique=True,
            postgresql_where=text("status IN ('reserved', 'consumed')"),
            sqlite_where=text("status IN ('reserved', 'consumed')"),
        ),
        Index("ix_discount_redemptions_code", "discount_code_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    discount_code_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("discount_codes.id", ondelete="RESTRICT"),
        nullable=False,
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("orders.id", ondelete="RESTRICT"), nullable=False
    )
    customer_user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("user.id", ondelete="RESTRICT"), nullable=False
    )
    code_snapshot: Mapped[str] = mapped_column(String(40), nullable=False)
    name_snapshot: Mapped[str] = mapped_column(String(180), nullable=False)
    discount_amount_snapshot: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    minimum_order_amount_snapshot: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="reserved")
    reserved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    released_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    release_reason: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
