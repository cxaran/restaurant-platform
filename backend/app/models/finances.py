"""Finanzas: la fuente central de movimientos monetarios (§21).

``financial_entries`` conserva el flujo REAL: un pago cobrado genera UN solo
ingreso (garantizado por índice único parcial, §21.4); el desglose de
productos/envío vive en el pedido, nunca duplicado aquí. Nada se elimina: los
movimientos se ANULAN con quién/cuándo/por qué, y los reembolsos referencian
el ingreso original (``reversal_of_entry_id``).
"""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    CheckConstraint,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base

FINANCIAL_DIRECTIONS = ("income", "expense")
ENTRY_TYPES = (
    "payment_income",
    "manual_income",
    "expense",
    "delivery_expense",
    "refund",
    "adjustment",
)
ENTRY_STATUSES = ("recorded", "voided")
ENTRY_SOURCE_TYPES = ("system", "manual")
DOCUMENT_TYPES = (
    "receipt",
    "invoice_pdf",
    "invoice_xml",
    "payment_proof",
    "expense_photo",
    "delivery_evidence",
    "other",
)


def _in_clause(column: str, values: tuple[str, ...]) -> str:
    quoted = ", ".join(f"'{value}'" for value in values)
    return f"{column} IN ({quoted})"


class FinancialCategory(Base):
    """Categoría jerárquica de ingreso o gasto (§21.2)."""

    __tablename__ = "financial_categories"
    __table_args__ = (
        CheckConstraint(
            _in_clause("direction", FINANCIAL_DIRECTIONS), name="financial_categories_direction"
        ),
        Index("uq_financial_categories_direction_name", "direction", "name", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    direction: Mapped[str] = mapped_column(String(10), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("financial_categories.id", ondelete="RESTRICT"),
        nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class FinancialEntry(Base):
    """Movimiento monetario (§21.3): append-only, se anula con historial."""

    __tablename__ = "financial_entries"
    __table_args__ = (
        CheckConstraint(
            _in_clause("direction", FINANCIAL_DIRECTIONS), name="financial_entries_direction"
        ),
        CheckConstraint(_in_clause("entry_type", ENTRY_TYPES), name="financial_entries_type"),
        CheckConstraint(_in_clause("status", ENTRY_STATUSES), name="financial_entries_status"),
        CheckConstraint(
            _in_clause("source_type", ENTRY_SOURCE_TYPES), name="financial_entries_source"
        ),
        CheckConstraint("amount > 0", name="financial_entries_amount_positive"),
        # §21.4: un pago cobrado = UN ingreso; la base lo garantiza.
        Index(
            "uq_financial_entries_payment_income",
            "payment_id",
            unique=True,
            postgresql_where=text("entry_type = 'payment_income'"),
            sqlite_where=text("entry_type = 'payment_income'"),
        ),
        Index("ix_financial_entries_occurred", "occurred_at"),
        Index("ix_financial_entries_direction_occurred", "direction", "occurred_at"),
        Index("ix_financial_entries_order", "order_id"),
        Index("ix_financial_entries_payment", "payment_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    category_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("financial_categories.id", ondelete="RESTRICT"),
        nullable=True,
    )
    order_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("orders.id", ondelete="RESTRICT"), nullable=True
    )
    payment_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("payments.id", ondelete="RESTRICT"), nullable=True
    )
    reversal_of_entry_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("financial_entries.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Movimiento que este asiento reversa (reembolso → ingreso original).",
    )
    direction: Mapped[str] = mapped_column(String(10), nullable=False)
    entry_type: Mapped[str] = mapped_column(String(50), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="recorded")
    payment_method_config_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("payment_method_configs.id", ondelete="RESTRICT"),
        nullable=True,
    )
    transaction_reference: Mapped[Optional[str]] = mapped_column(String(180), nullable=True)
    bank_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    terminal_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    counterparty_name: Mapped[Optional[str]] = mapped_column(String(180), nullable=True)
    supplier_rfc: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    invoice_folio: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    invoice_uuid: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    invoice_issued_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_type: Mapped[str] = mapped_column(String(30), nullable=False, default="manual")
    registered_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("user.id", ondelete="RESTRICT"), nullable=True
    )
    voided_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("user.id", ondelete="RESTRICT"), nullable=True
    )
    voided_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    void_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    attachments: Mapped[list["FinancialEntryAttachment"]] = relationship(
        back_populates="entry", cascade="all, delete-orphan"
    )


class FinancialEntryAttachment(Base):
    """Evidencia del movimiento (§21.5): ticket, factura PDF/XML, foto."""

    __tablename__ = "financial_entry_attachments"
    __table_args__ = (
        CheckConstraint(
            _in_clause("document_type", DOCUMENT_TYPES),
            name="financial_entry_attachments_type",
        ),
        Index("ix_financial_entry_attachments_entry", "financial_entry_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    financial_entry_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("financial_entries.id", ondelete="CASCADE"),
        nullable=False,
    )
    file_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("stored_files.id", ondelete="RESTRICT"), nullable=False
    )
    document_type: Mapped[str] = mapped_column(String(40), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    entry: Mapped["FinancialEntry"] = relationship(back_populates="attachments")


class OrderLineRefundAllocation(Base):
    """Relación reembolso ↔ línea (§22.5): permite reembolsos parciales exactos."""

    __tablename__ = "order_line_refund_allocations"
    __table_args__ = (
        CheckConstraint(
            "refunded_quantity >= 1", name="order_line_refund_allocations_qty_positive"
        ),
        CheckConstraint(
            "money_refunded_amount >= 0",
            name="order_line_refund_allocations_money_non_negative",
        ),
        # Devolución SOLO-CRÉDITOS: sin pago no puede moverse dinero y el actor
        # es obligatorio (no existen reembolsos monetarios ficticios de $0).
        CheckConstraint(
            "payment_refund_id IS NOT NULL OR money_refunded_amount = 0",
            name="order_line_refund_allocations_credit_only_no_money",
        ),
        CheckConstraint(
            "payment_refund_id IS NOT NULL OR processed_by IS NOT NULL",
            name="order_line_refund_allocations_actor_required",
        ),
        Index("ix_order_line_refund_allocations_refund", "payment_refund_id"),
        Index("ix_order_line_refund_allocations_line", "order_line_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    payment_refund_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("payment_refunds.id", ondelete="CASCADE"),
        nullable=True,
        comment=(
            "NULL sólo en devoluciones de líneas pagadas 100% con créditos (sin pago "
            "monetario): entonces money debe ser 0 y processed_by obligatorio."
        ),
    )
    processed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Actor de la devolución (siempre registrado; obligatorio sin pago).",
    )
    order_line_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("order_lines.id", ondelete="RESTRICT"), nullable=False
    )
    refunded_quantity: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Unidades ENTERAS (H1); el tope ACUMULA reembolsos previos de la línea (H3).",
    )
    money_refunded_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0")
    )
    credits_refunded_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    credits_earned_reversed_total: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Créditos ganados que se revierten (ledger en etapa 8, §22.5).",
    )
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
