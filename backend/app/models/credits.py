"""Créditos: canjes y ledger contable inmutable (§22).

NO existe un saldo editable (§22.4): el saldo disponible es SIEMPRE
``SUM(credit_ledger_entries.credit_delta)``. La reserva descuenta al crear el
pedido, el consumo sólo cambia el estado del canje (el descuento ya ocurrió),
la liberación devuelve al cancelar y los reversos viven como asientos nuevos.
"""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base

REDEMPTION_STATUSES = ("reserved", "consumed", "released")
LEDGER_ENTRY_TYPES = (
    "earn",
    "redeem_reservation",
    "redemption_release",
    "earn_reversal",
    "redemption_refund",
    "manual_adjustment",
)


def _in_clause(column: str, values: tuple[str, ...]) -> str:
    quoted = ", ".join(f"'{value}'" for value in values)
    return f"{column} IN ({quoted})"


class CreditRedemption(Base):
    """Canje de una línea concreta (§22.3): reserved → consumed | released."""

    __tablename__ = "credit_redemptions"
    __table_args__ = (
        CheckConstraint(
            _in_clause("status", REDEMPTION_STATUSES), name="credit_redemptions_status"
        ),
        CheckConstraint("credits_spent > 0", name="credit_redemptions_spent_positive"),
        Index("uq_credit_redemptions_line", "order_line_id", unique=True),
        Index("ix_credit_redemptions_user_status", "user_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("user.id", ondelete="RESTRICT"), nullable=False
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("orders.id", ondelete="RESTRICT"), nullable=False
    )
    order_line_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("order_lines.id", ondelete="RESTRICT"), nullable=False
    )
    credits_spent: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="reserved")
    reserved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    released_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    release_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class CreditLedgerEntry(Base):
    """Asiento inmutable de créditos (§22.4). El saldo = SUM(credit_delta)."""

    __tablename__ = "credit_ledger_entries"
    __table_args__ = (
        CheckConstraint(
            _in_clause("entry_type", LEDGER_ENTRY_TYPES), name="credit_ledger_entries_type"
        ),
        CheckConstraint("credit_delta != 0", name="credit_ledger_entries_delta_nonzero"),
        Index("ix_credit_ledger_user_occurred", "user_id", "occurred_at"),
        Index("ix_credit_ledger_order", "order_id"),
        # H2: idempotencia a nivel BASE — un canje solo puede reservarse y
        # liberarse UNA vez; una asignación de reembolso solo puede producir UN
        # movimiento de cada tipo, aun con reintentos o concurrencia.
        Index(
            "uq_credit_ledger_reservation_per_redemption",
            "credit_redemption_id",
            unique=True,
            postgresql_where=text("entry_type = 'redeem_reservation'"),
            sqlite_where=text("entry_type = 'redeem_reservation'"),
        ),
        Index(
            "uq_credit_ledger_release_per_redemption",
            "credit_redemption_id",
            unique=True,
            postgresql_where=text("entry_type = 'redemption_release'"),
            sqlite_where=text("entry_type = 'redemption_release'"),
        ),
        Index(
            "uq_credit_ledger_refund_per_allocation",
            "refund_allocation_id",
            unique=True,
            postgresql_where=text("entry_type = 'redemption_refund'"),
            sqlite_where=text("entry_type = 'redemption_refund'"),
        ),
        Index(
            "uq_credit_ledger_reversal_per_allocation",
            "refund_allocation_id",
            unique=True,
            postgresql_where=text("entry_type = 'earn_reversal'"),
            sqlite_where=text("entry_type = 'earn_reversal'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("user.id", ondelete="RESTRICT"), nullable=False
    )
    order_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("orders.id", ondelete="RESTRICT"), nullable=True
    )
    order_line_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("order_lines.id", ondelete="RESTRICT"), nullable=True
    )
    credit_redemption_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("credit_redemptions.id", ondelete="RESTRICT"),
        nullable=True,
    )
    entry_type: Mapped[str] = mapped_column(String(40), nullable=False)
    credit_delta: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Positivo suma, negativo resta. Nunca se edita: se reversa con otro asiento.",
    )
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("user.id", ondelete="RESTRICT"), nullable=True
    )
    reversal_of_entry_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("credit_ledger_entries.id", ondelete="RESTRICT"),
        nullable=True,
    )
    refund_allocation_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("order_line_refund_allocations.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Causa exacta del movimiento cuando proviene de un reembolso (H2).",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
