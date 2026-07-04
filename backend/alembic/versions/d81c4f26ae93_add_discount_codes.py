"""Etapa 5 RC: códigos de descuento fijo web-only.

``discount_codes`` (definición vigente) y ``discount_code_redemptions``
(uso por pedido con snapshots inmutables: reserved → consumed | released).
Índices únicos PARCIALES: un uso por usuario por código y un código activo
por pedido (reserved|consumed ocupan el cupo).

``order_adjustments`` gana el tipo ``discount_code`` (se regenera el CHECK)
y la columna ``discount_code_redemption_id`` (única cuando no es NULL): el
ajuste del descuento queda ligado a su redención.

Revision ID: d81c4f26ae93
Revises: c5e8d73a91f4
Create Date: 2026-07-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

# revision identifiers, used by Alembic.
revision: str = "d81c4f26ae93"
down_revision: Union[str, Sequence[str], None] = "c5e8d73a91f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_OLD_ADJUSTMENT_TYPES = "adjustment_type IN ('discount', 'promotion', 'courtesy', 'manual_fee')"
_NEW_ADJUSTMENT_TYPES = (
    "adjustment_type IN ('discount', 'promotion', 'courtesy', 'manual_fee', 'discount_code')"
)


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "discount_codes",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "code",
            sa.String(length=40),
            nullable=False,
            comment="Código tal como lo escribió el administrador.",
        ),
        sa.Column(
            "code_normalized",
            sa.String(length=40),
            nullable=False,
            comment="Código en minúsculas: unicidad y búsqueda case-insensitive.",
        ),
        sa.Column(
            "discount_amount",
            sa.Numeric(12, 2),
            nullable=False,
            comment="Pesos que descuenta el código (X).",
        ),
        sa.Column(
            "minimum_order_amount",
            sa.Numeric(12, 2),
            nullable=False,
            comment="Subtotal monetario elegible mínimo para aplicar (Y).",
        ),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("valid_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "target_customer_user_id",
            PG_UUID(as_uuid=True),
            nullable=True,
            comment="Cliente destinatario de un código personal; NULL = código general.",
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_by", PG_UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("discount_amount > 0", name="discount_codes_amount_positive"),
        sa.CheckConstraint(
            "minimum_order_amount >= 0", name="discount_codes_minimum_non_negative"
        ),
        sa.CheckConstraint(
            "discount_amount <= minimum_order_amount",
            name="discount_codes_amount_le_minimum",
        ),
        sa.ForeignKeyConstraint(
            ["target_customer_user_id"], ["user.id"],
            name=op.f("fk_discount_codes_target_customer_user_id_user"), ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["user.id"],
            name=op.f("fk_discount_codes_created_by_user"), ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_discount_codes")),
    )
    op.create_index(
        "uq_discount_codes_code_normalized", "discount_codes", ["code_normalized"], unique=True
    )

    op.create_table(
        "discount_code_redemptions",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("discount_code_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("order_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("customer_user_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("code_snapshot", sa.String(length=40), nullable=False),
        sa.Column("name_snapshot", sa.String(length=180), nullable=False),
        sa.Column("discount_amount_snapshot", sa.Numeric(12, 2), nullable=False),
        sa.Column("minimum_order_amount_snapshot", sa.Numeric(12, 2), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("reserved_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("release_reason", sa.String(length=80), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('reserved', 'consumed', 'released')",
            name="discount_code_redemptions_status",
        ),
        sa.ForeignKeyConstraint(
            ["discount_code_id"], ["discount_codes.id"],
            name=op.f("fk_discount_code_redemptions_discount_code_id_discount_codes"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"], ["orders.id"],
            name=op.f("fk_discount_code_redemptions_order_id_orders"), ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["customer_user_id"], ["user.id"],
            name=op.f("fk_discount_code_redemptions_customer_user_id_user"), ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_discount_code_redemptions")),
    )
    op.create_index(
        "uq_discount_redemptions_code_user",
        "discount_code_redemptions",
        ["discount_code_id", "customer_user_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('reserved', 'consumed')"),
    )
    op.create_index(
        "uq_discount_redemptions_order",
        "discount_code_redemptions",
        ["order_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('reserved', 'consumed')"),
    )
    op.create_index(
        "ix_discount_redemptions_code", "discount_code_redemptions", ["discount_code_id"]
    )

    op.add_column(
        "order_adjustments",
        sa.Column(
            "discount_code_redemption_id",
            PG_UUID(as_uuid=True),
            nullable=True,
            comment="Redención del código de descuento que originó este ajuste (Etapa 5 RC).",
        ),
    )
    op.create_foreign_key(
        op.f("fk_order_adjustments_discount_code_redemption"),
        "order_adjustments",
        "discount_code_redemptions",
        ["discount_code_redemption_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "uq_order_adjustments_discount_redemption",
        "order_adjustments",
        ["discount_code_redemption_id"],
        unique=True,
        postgresql_where=sa.text("discount_code_redemption_id IS NOT NULL"),
    )
    # Regenerar el CHECK del tipo de ajuste con 'discount_code' incluido.
    op.drop_constraint(
        op.f("ck_order_adjustments_order_adjustments_type"), "order_adjustments", type_="check"
    )
    op.create_check_constraint(
        "order_adjustments_type", "order_adjustments", _NEW_ADJUSTMENT_TYPES
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        op.f("ck_order_adjustments_order_adjustments_type"), "order_adjustments", type_="check"
    )
    op.create_check_constraint(
        "order_adjustments_type", "order_adjustments", _OLD_ADJUSTMENT_TYPES
    )
    op.drop_index("uq_order_adjustments_discount_redemption", table_name="order_adjustments")
    op.drop_constraint(
        op.f("fk_order_adjustments_discount_code_redemption"), "order_adjustments", type_="foreignkey"
    )
    op.drop_column("order_adjustments", "discount_code_redemption_id")

    op.drop_index("ix_discount_redemptions_code", table_name="discount_code_redemptions")
    op.drop_index("uq_discount_redemptions_order", table_name="discount_code_redemptions")
    op.drop_index("uq_discount_redemptions_code_user", table_name="discount_code_redemptions")
    op.drop_table("discount_code_redemptions")

    op.drop_index("uq_discount_codes_code_normalized", table_name="discount_codes")
    op.drop_table("discount_codes")
