"""Etapa 5 del dominio restaurante: pagos, evidencias, reembolsos y tickets.

Métodos de pago configurables (con seed idempotente de los cinco iniciales,
§18.1), pagos con reglas por método y cambio de efectivo, evidencias hacia
stored_files, reembolsos que nunca borran el pago original, y la bitácora de
impresión de tickets (el contenido del ticket sale de snapshots, §20).

Revision ID: f2a6d95c31b8
Revises: e5b8c30d47a1
Create Date: 2026-07-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

# revision identifiers, used by Alembic.
revision: str = "f2a6d95c31b8"
down_revision: Union[str, Sequence[str], None] = "e5b8c30d47a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "payment_method_configs",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("display_name", sa.String(length=80), nullable=False),
        sa.Column("instructions", sa.Text(), nullable=True),
        sa.Column("available_online", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("available_pos", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "requires_manual_verification", sa.Boolean(), nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "requires_transaction_reference", sa.Boolean(), nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "requires_bank_name", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column(
            "requires_payment_proof", sa.Boolean(), nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "allows_cash_change", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payment_method_configs")),
        sa.UniqueConstraint("code", name=op.f("uq_payment_method_configs_code")),
    )

    op.create_table(
        "payments",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("order_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("payment_method_config_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("payment_method_name_snapshot", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("expected_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("received_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column(
            "change_requested_for_amount", sa.Numeric(12, 2), nullable=True,
            comment="Billete con el que pagará el cliente («paga con $500»).",
        ),
        sa.Column("change_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("transaction_reference", sa.String(length=180), nullable=True),
        sa.Column("bank_name", sa.String(length=120), nullable=True),
        sa.Column("terminal_name", sa.String(length=120), nullable=True),
        sa.Column("card_last_four", sa.String(length=4), nullable=True),
        sa.Column("verified_by", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejected_reason", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending', 'pending_verification', 'paid', 'rejected', 'voided', "
            "'partially_refunded', 'refunded')",
            name="payments_status",
        ),
        sa.CheckConstraint("expected_amount >= 0", name="payments_expected_non_negative"),
        sa.CheckConstraint("received_amount >= 0", name="payments_received_non_negative"),
        sa.CheckConstraint("change_amount >= 0", name="payments_change_non_negative"),
        sa.ForeignKeyConstraint(
            ["order_id"], ["orders.id"],
            name=op.f("fk_payments_order_id_orders"), ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["payment_method_config_id"], ["payment_method_configs.id"],
            name=op.f("fk_payments_payment_method_config_id_payment_method_configs"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["verified_by"], ["user.id"],
            name=op.f("fk_payments_verified_by_user"), ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payments")),
    )
    op.create_index("ix_payments_order_status", "payments", ["order_id", "status"])
    op.create_index("ix_payments_reference", "payments", ["transaction_reference"])

    op.create_table(
        "payment_attachments",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("payment_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("file_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("attachment_type", sa.String(length=40), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "attachment_type IN ('payment_proof', 'terminal_receipt', 'refund_proof', 'other')",
            name="payment_attachments_type",
        ),
        sa.ForeignKeyConstraint(
            ["payment_id"], ["payments.id"],
            name=op.f("fk_payment_attachments_payment_id_payments"), ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["file_id"], ["stored_files.id"],
            name=op.f("fk_payment_attachments_file_id_stored_files"), ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payment_attachments")),
    )
    op.create_index("ix_payment_attachments_payment", "payment_attachments", ["payment_id"])

    op.create_table(
        "payment_refunds",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("payment_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("transaction_reference", sa.String(length=180), nullable=True),
        sa.Column("bank_name", sa.String(length=120), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("processed_by", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending', 'processed', 'rejected')", name="payment_refunds_status"
        ),
        sa.CheckConstraint("amount > 0", name="payment_refunds_amount_positive"),
        sa.ForeignKeyConstraint(
            ["payment_id"], ["payments.id"],
            name=op.f("fk_payment_refunds_payment_id_payments"), ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["processed_by"], ["user.id"],
            name=op.f("fk_payment_refunds_processed_by_user"), ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payment_refunds")),
    )
    op.create_index("ix_payment_refunds_payment", "payment_refunds", ["payment_id"])

    op.create_table(
        "ticket_print_logs",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("order_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("print_type", sa.String(length=40), nullable=False),
        sa.Column("printer_name", sa.String(length=180), nullable=True),
        sa.Column("printed_by", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("copy_number", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "printed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "print_type IN ('customer_receipt', 'kitchen_ticket', 'delivery_ticket', "
            "'counter_ticket')",
            name="ticket_print_logs_type",
        ),
        sa.CheckConstraint("copy_number >= 1", name="ticket_print_logs_copy_positive"),
        sa.ForeignKeyConstraint(
            ["order_id"], ["orders.id"],
            name=op.f("fk_ticket_print_logs_order_id_orders"), ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["printed_by"], ["user.id"],
            name=op.f("fk_ticket_print_logs_printed_by_user"), ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ticket_print_logs")),
    )
    op.create_index("ix_ticket_print_logs_order", "ticket_print_logs", ["order_id"])

    # Seed idempotente de métodos iniciales (§18.1): get-or-create por code.
    op.execute(
        """
        INSERT INTO payment_method_configs
            (id, code, display_name, available_online, available_pos,
             requires_manual_verification, requires_transaction_reference,
             requires_bank_name, requires_payment_proof, allows_cash_change, sort_order)
        VALUES
            (gen_random_uuid(), 'cash_delivery', 'Efectivo al repartidor',
             true, false, false, false, false, false, true, 10),
            (gen_random_uuid(), 'cash_counter', 'Efectivo en mostrador',
             false, true, false, false, false, false, true, 20),
            (gen_random_uuid(), 'bank_transfer', 'Transferencia bancaria',
             true, true, true, true, true, false, false, 30),
            (gen_random_uuid(), 'card_terminal', 'Tarjeta en terminal',
             true, true, true, true, false, false, false, 40),
            (gen_random_uuid(), 'other', 'Otro método',
             true, true, false, false, false, false, false, 50)
        ON CONFLICT (code) DO NOTHING
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_ticket_print_logs_order", table_name="ticket_print_logs")
    op.drop_table("ticket_print_logs")
    op.drop_index("ix_payment_refunds_payment", table_name="payment_refunds")
    op.drop_table("payment_refunds")
    op.drop_index("ix_payment_attachments_payment", table_name="payment_attachments")
    op.drop_table("payment_attachments")
    op.drop_index("ix_payments_reference", table_name="payments")
    op.drop_index("ix_payments_order_status", table_name="payments")
    op.drop_table("payments")
    op.drop_table("payment_method_configs")
