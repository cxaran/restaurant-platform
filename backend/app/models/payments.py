"""Pagos, evidencias, reembolsos y bitácora de tickets (§18 y §20).

Los métodos de pago son CONFIGURABLES (flags de verificación/referencia/
banco/evidencia/cambio); el pago congela el nombre del método. Nunca se
guardan datos bancarios sensibles (§18.1): ni número completo, ni CVV, ni
vencimiento — sólo referencia, banco, terminal y últimos 4 dígitos.

Los reembolsos nunca borran el pago original (§18.4). El ticket NO duplica la
venta (§20): se arma desde los snapshots del pedido; aquí sólo queda el log de
cada impresión.
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
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base

PAYMENT_STATUSES = (
    "pending",
    "pending_verification",
    "paid",
    "rejected",
    "voided",
    "partially_refunded",
    "refunded",
)
ATTACHMENT_TYPES = ("payment_proof", "terminal_receipt", "refund_proof", "other")
REFUND_STATUSES = ("pending", "processed", "rejected")
TICKET_PRINT_TYPES = (
    "customer_receipt",
    "kitchen_ticket",
    "delivery_ticket",
    "counter_ticket",
)


def _in_clause(column: str, values: tuple[str, ...]) -> str:
    quoted = ", ".join(f"'{value}'" for value in values)
    return f"{column} IN ({quoted})"


class PaymentMethodConfig(Base):
    """Método de pago configurable (§18.1)."""

    __tablename__ = "payment_method_configs"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code: Mapped[str] = mapped_column(String(40), nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(String(80), nullable=False)
    instructions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    available_online: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    available_pos: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    requires_manual_verification: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    requires_transaction_reference: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    requires_bank_name: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    requires_payment_proof: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    allows_cash_change: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class Payment(Base):
    """Pago de un pedido (§18.2); admite pagos parciales a futuro."""

    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint(_in_clause("status", PAYMENT_STATUSES), name="payments_status"),
        CheckConstraint("expected_amount >= 0", name="payments_expected_non_negative"),
        CheckConstraint("received_amount >= 0", name="payments_received_non_negative"),
        CheckConstraint("change_amount >= 0", name="payments_change_non_negative"),
        Index("ix_payments_order_status", "order_id", "status"),
        Index("ix_payments_reference", "transaction_reference"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("orders.id", ondelete="RESTRICT"), nullable=False
    )
    payment_method_config_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("payment_method_configs.id", ondelete="RESTRICT"),
        nullable=False,
    )
    payment_method_name_snapshot: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="pending")
    expected_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    received_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0")
    )
    change_requested_for_amount: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(12, 2),
        nullable=True,
        comment="Billete con el que pagará el cliente («paga con $500»).",
    )
    change_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0")
    )
    transaction_reference: Mapped[Optional[str]] = mapped_column(String(180), nullable=True)
    bank_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    terminal_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    card_last_four: Mapped[Optional[str]] = mapped_column(String(4), nullable=True)
    verified_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("user.id", ondelete="RESTRICT"), nullable=True
    )
    verified_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    rejected_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    attachments: Mapped[list["PaymentAttachment"]] = relationship(
        back_populates="payment", cascade="all, delete-orphan"
    )
    refunds: Mapped[list["PaymentRefund"]] = relationship(
        back_populates="payment", cascade="all, delete-orphan"
    )


class PaymentAttachment(Base):
    """Evidencia de pago (§18.3): comprobante, voucher de terminal, etc."""

    __tablename__ = "payment_attachments"
    __table_args__ = (
        CheckConstraint(
            _in_clause("attachment_type", ATTACHMENT_TYPES), name="payment_attachments_type"
        ),
        Index("ix_payment_attachments_payment", "payment_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    payment_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("payments.id", ondelete="CASCADE"), nullable=False
    )
    file_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("stored_files.id", ondelete="RESTRICT"), nullable=False
    )
    attachment_type: Mapped[str] = mapped_column(String(40), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    payment: Mapped["Payment"] = relationship(back_populates="attachments")


class PaymentRefund(Base):
    """Reembolso (§18.4): nunca borra el pago original."""

    __tablename__ = "payment_refunds"
    __table_args__ = (
        CheckConstraint(_in_clause("status", REFUND_STATUSES), name="payment_refunds_status"),
        CheckConstraint("amount > 0", name="payment_refunds_amount_positive"),
        Index("ix_payment_refunds_payment", "payment_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    payment_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("payments.id", ondelete="RESTRICT"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    transaction_reference: Mapped[Optional[str]] = mapped_column(String(180), nullable=True)
    bank_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="pending")
    processed_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("user.id", ondelete="RESTRICT"), nullable=False
    )
    processed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    payment: Mapped["Payment"] = relationship(back_populates="refunds")


class TicketPrintLog(Base):
    """Registro de cada impresión de ticket (§20); el contenido sale de snapshots."""

    __tablename__ = "ticket_print_logs"
    __table_args__ = (
        CheckConstraint(
            _in_clause("print_type", TICKET_PRINT_TYPES), name="ticket_print_logs_type"
        ),
        CheckConstraint("copy_number >= 1", name="ticket_print_logs_copy_positive"),
        Index("ix_ticket_print_logs_order", "order_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    print_type: Mapped[str] = mapped_column(String(40), nullable=False)
    printer_name: Mapped[Optional[str]] = mapped_column(String(180), nullable=True)
    printed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("user.id", ondelete="RESTRICT"), nullable=True
    )
    copy_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    printed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
