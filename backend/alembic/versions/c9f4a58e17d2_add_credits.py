"""Etapa 8 del dominio restaurante: canjes y ledger de créditos.

``credit_ledger_entries`` es la ÚNICA fuente del saldo (SUM(credit_delta),
§22.4): no existe columna de saldo editable. ``credit_redemptions`` sigue el
ciclo reserved → consumed | released con un canje por línea (§22.3).

Revision ID: c9f4a58e17d2
Revises: b6e9d24f83a1
Create Date: 2026-07-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

# revision identifiers, used by Alembic.
revision: str = "c9f4a58e17d2"
down_revision: Union[str, Sequence[str], None] = "b6e9d24f83a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "credit_redemptions",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("order_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("order_line_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("credits_spent", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("reserved_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("release_reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('reserved', 'consumed', 'released')", name="credit_redemptions_status"
        ),
        sa.CheckConstraint("credits_spent > 0", name="credit_redemptions_spent_positive"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["user.id"],
            name=op.f("fk_credit_redemptions_user_id_user"), ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"], ["orders.id"],
            name=op.f("fk_credit_redemptions_order_id_orders"), ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["order_line_id"], ["order_lines.id"],
            name=op.f("fk_credit_redemptions_order_line_id_order_lines"), ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_credit_redemptions")),
    )
    op.create_index(
        "uq_credit_redemptions_line", "credit_redemptions", ["order_line_id"], unique=True
    )
    op.create_index(
        "ix_credit_redemptions_user_status", "credit_redemptions", ["user_id", "status"]
    )

    op.create_table(
        "credit_ledger_entries",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("order_id", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("order_line_id", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("credit_redemption_id", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("entry_type", sa.String(length=40), nullable=False),
        sa.Column(
            "credit_delta", sa.Integer(), nullable=False,
            comment="Positivo suma, negativo resta. Nunca se edita: se reversa con otro asiento.",
        ),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("reversal_of_entry_id", PG_UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "entry_type IN ('earn', 'redeem_reservation', 'redemption_release', "
            "'earn_reversal', 'redemption_refund', 'manual_adjustment')",
            name="credit_ledger_entries_type",
        ),
        sa.CheckConstraint("credit_delta != 0", name="credit_ledger_entries_delta_nonzero"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["user.id"],
            name=op.f("fk_credit_ledger_entries_user_id_user"), ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"], ["orders.id"],
            name=op.f("fk_credit_ledger_entries_order_id_orders"), ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["order_line_id"], ["order_lines.id"],
            name=op.f("fk_credit_ledger_entries_order_line_id_order_lines"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["credit_redemption_id"], ["credit_redemptions.id"],
            name=op.f("fk_credit_ledger_entries_credit_redemption_id_credit_redemptions"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["user.id"],
            name=op.f("fk_credit_ledger_entries_created_by_user"), ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["reversal_of_entry_id"], ["credit_ledger_entries.id"],
            name=op.f("fk_credit_ledger_entries_reversal_of_entry_id_credit_ledger_entries"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_credit_ledger_entries")),
    )
    op.create_index(
        "ix_credit_ledger_user_occurred", "credit_ledger_entries", ["user_id", "occurred_at"]
    )
    op.create_index("ix_credit_ledger_order", "credit_ledger_entries", ["order_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_credit_ledger_order", table_name="credit_ledger_entries")
    op.drop_index("ix_credit_ledger_user_occurred", table_name="credit_ledger_entries")
    op.drop_table("credit_ledger_entries")
    op.drop_index("ix_credit_redemptions_user_status", table_name="credit_redemptions")
    op.drop_index("uq_credit_redemptions_line", table_name="credit_redemptions")
    op.drop_table("credit_redemptions")
