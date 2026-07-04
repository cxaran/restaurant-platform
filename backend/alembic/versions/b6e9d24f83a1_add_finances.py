"""Etapa 7 del dominio restaurante: finanzas y reembolsos por línea.

Categorías jerárquicas con seed idempotente (§21.2), movimientos monetarios
append-only con la garantía de UN ingreso por pago (índice único parcial,
§21.4), evidencias hacia stored_files y la asignación de reembolsos por línea
de pedido (§22.5).

Revision ID: b6e9d24f83a1
Revises: a4c7e81f52d9
Create Date: 2026-07-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

# revision identifiers, used by Alembic.
revision: str = "b6e9d24f83a1"
down_revision: Union[str, Sequence[str], None] = "a4c7e81f52d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_EXPENSE_ROOTS = (
    "Insumos", "Gas", "Gasolina", "Pago a repartidor", "Publicidad", "Luz", "Agua",
    "Internet", "Renta", "Sueldos", "Mantenimiento", "Reparaciones", "Maquinaria",
    "Utensilios", "Otros gastos",
)
_SUPPLY_CHILDREN = ("Pollo", "Papas", "Verduras", "Salsas", "Aderezos", "Empaques")
_INCOME_ROOTS = ("Ventas", "Ingreso manual", "Ajuste", "Otros ingresos")


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "financial_categories",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("direction", sa.String(length=10), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("parent_id", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "direction IN ('income', 'expense')", name="financial_categories_direction"
        ),
        sa.ForeignKeyConstraint(
            ["parent_id"], ["financial_categories.id"],
            name=op.f("fk_financial_categories_parent_id_financial_categories"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_financial_categories")),
    )
    op.create_index(
        "uq_financial_categories_direction_name", "financial_categories",
        ["direction", "name"], unique=True,
    )

    op.create_table(
        "financial_entries",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("category_id", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("order_id", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("payment_id", PG_UUID(as_uuid=True), nullable=True),
        sa.Column(
            "reversal_of_entry_id", PG_UUID(as_uuid=True), nullable=True,
            comment="Movimiento que este asiento reversa (reembolso → ingreso original).",
        ),
        sa.Column("direction", sa.String(length=10), nullable=False),
        sa.Column("entry_type", sa.String(length=50), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("payment_method_config_id", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("transaction_reference", sa.String(length=180), nullable=True),
        sa.Column("bank_name", sa.String(length=120), nullable=True),
        sa.Column("terminal_name", sa.String(length=120), nullable=True),
        sa.Column("counterparty_name", sa.String(length=180), nullable=True),
        sa.Column("supplier_rfc", sa.String(length=20), nullable=True),
        sa.Column("invoice_folio", sa.String(length=120), nullable=True),
        sa.Column("invoice_uuid", sa.String(length=80), nullable=True),
        sa.Column("invoice_issued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("source_type", sa.String(length=30), nullable=False),
        sa.Column("registered_by", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("voided_by", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("void_reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "direction IN ('income', 'expense')", name="financial_entries_direction"
        ),
        sa.CheckConstraint(
            "entry_type IN ('payment_income', 'manual_income', 'expense', "
            "'delivery_expense', 'refund', 'adjustment')",
            name="financial_entries_type",
        ),
        sa.CheckConstraint(
            "status IN ('recorded', 'voided')", name="financial_entries_status"
        ),
        sa.CheckConstraint(
            "source_type IN ('system', 'manual')", name="financial_entries_source"
        ),
        sa.CheckConstraint("amount > 0", name="financial_entries_amount_positive"),
        sa.ForeignKeyConstraint(
            ["category_id"], ["financial_categories.id"],
            name=op.f("fk_financial_entries_category_id_financial_categories"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"], ["orders.id"],
            name=op.f("fk_financial_entries_order_id_orders"), ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["payment_id"], ["payments.id"],
            name=op.f("fk_financial_entries_payment_id_payments"), ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["reversal_of_entry_id"], ["financial_entries.id"],
            name=op.f("fk_financial_entries_reversal_of_entry_id_financial_entries"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["payment_method_config_id"], ["payment_method_configs.id"],
            name=op.f("fk_financial_entries_payment_method_config_id_payment_method_configs"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["registered_by"], ["user.id"],
            name=op.f("fk_financial_entries_registered_by_user"), ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["voided_by"], ["user.id"],
            name=op.f("fk_financial_entries_voided_by_user"), ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_financial_entries")),
    )
    op.create_index(
        "uq_financial_entries_payment_income", "financial_entries", ["payment_id"],
        unique=True, postgresql_where=sa.text("entry_type = 'payment_income'"),
    )
    op.create_index("ix_financial_entries_occurred", "financial_entries", ["occurred_at"])
    op.create_index(
        "ix_financial_entries_direction_occurred", "financial_entries",
        ["direction", "occurred_at"],
    )
    op.create_index("ix_financial_entries_order", "financial_entries", ["order_id"])
    op.create_index("ix_financial_entries_payment", "financial_entries", ["payment_id"])

    op.create_table(
        "financial_entry_attachments",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("financial_entry_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("file_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("document_type", sa.String(length=40), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "document_type IN ('receipt', 'invoice_pdf', 'invoice_xml', 'payment_proof', "
            "'expense_photo', 'delivery_evidence', 'other')",
            name="financial_entry_attachments_type",
        ),
        sa.ForeignKeyConstraint(
            ["financial_entry_id"], ["financial_entries.id"],
            name=op.f("fk_financial_entry_attachments_financial_entry_id_financial_entries"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["file_id"], ["stored_files.id"],
            name=op.f("fk_financial_entry_attachments_file_id_stored_files"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_financial_entry_attachments")),
    )
    op.create_index(
        "ix_financial_entry_attachments_entry", "financial_entry_attachments",
        ["financial_entry_id"],
    )

    op.create_table(
        "order_line_refund_allocations",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("payment_refund_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("order_line_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("refunded_quantity", sa.Numeric(10, 2), nullable=False),
        sa.Column(
            "money_refunded_amount", sa.Numeric(12, 2), nullable=False, server_default="0"
        ),
        sa.Column("credits_refunded_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "credits_earned_reversed_total", sa.Integer(), nullable=False, server_default="0",
            comment="Créditos ganados que se revierten (ledger en etapa 8, §22.5).",
        ),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "refunded_quantity > 0", name="order_line_refund_allocations_qty_positive"
        ),
        sa.CheckConstraint(
            "money_refunded_amount >= 0",
            name="order_line_refund_allocations_money_non_negative",
        ),
        sa.ForeignKeyConstraint(
            ["payment_refund_id"], ["payment_refunds.id"],
            name=op.f("fk_order_line_refund_allocations_payment_refund_id_payment_refunds"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["order_line_id"], ["order_lines.id"],
            name=op.f("fk_order_line_refund_allocations_order_line_id_order_lines"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_order_line_refund_allocations")),
    )
    op.create_index(
        "ix_order_line_refund_allocations_refund", "order_line_refund_allocations",
        ["payment_refund_id"],
    )
    op.create_index(
        "ix_order_line_refund_allocations_line", "order_line_refund_allocations",
        ["order_line_id"],
    )

    # ------------------------------------------------------------------
    # Seed idempotente de categorías sugeridas (§21.2).
    # ------------------------------------------------------------------
    for name in _EXPENSE_ROOTS:
        op.execute(
            "INSERT INTO financial_categories (id, direction, name) "
            f"VALUES (gen_random_uuid(), 'expense', '{name}') "
            "ON CONFLICT (direction, name) DO NOTHING"
        )
    for name in _SUPPLY_CHILDREN:
        op.execute(
            "INSERT INTO financial_categories (id, direction, name, parent_id) "
            f"SELECT gen_random_uuid(), 'expense', '{name}', c.id "
            "FROM financial_categories c "
            "WHERE c.direction = 'expense' AND c.name = 'Insumos' "
            "ON CONFLICT (direction, name) DO NOTHING"
        )
    for name in _INCOME_ROOTS:
        op.execute(
            "INSERT INTO financial_categories (id, direction, name) "
            f"VALUES (gen_random_uuid(), 'income', '{name}') "
            "ON CONFLICT (direction, name) DO NOTHING"
        )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        "ix_order_line_refund_allocations_line", table_name="order_line_refund_allocations"
    )
    op.drop_index(
        "ix_order_line_refund_allocations_refund", table_name="order_line_refund_allocations"
    )
    op.drop_table("order_line_refund_allocations")
    op.drop_index(
        "ix_financial_entry_attachments_entry", table_name="financial_entry_attachments"
    )
    op.drop_table("financial_entry_attachments")
    op.drop_index("ix_financial_entries_payment", table_name="financial_entries")
    op.drop_index("ix_financial_entries_order", table_name="financial_entries")
    op.drop_index("ix_financial_entries_direction_occurred", table_name="financial_entries")
    op.drop_index("ix_financial_entries_occurred", table_name="financial_entries")
    op.drop_index("uq_financial_entries_payment_income", table_name="financial_entries")
    op.drop_table("financial_entries")
    op.drop_index(
        "uq_financial_categories_direction_name", table_name="financial_categories"
    )
    op.drop_table("financial_categories")
