"""Etapa 4a del dominio restaurante: núcleo de pedidos (8 tablas + secuencia).

Una sola tabla ``orders`` para todos los canales, con la invariante «no hay
pedido sin usuario» como CHECK; líneas/modificadores/ajustes con snapshots
congelados (§15); bitácoras append-only de estados (§15.4) y de envío (§17.3);
entrega como snapshot de dirección con punto opcional (§17.1) y decisión de
envío única por pedido (§17.2). Folio: secuencia ÚNICA para todos los canales.

Revision ID: e5b8c30d47a1
Revises: d8f1a72c95e4
Create Date: 2026-07-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

# revision identifiers, used by Alembic.
revision: str = "e5b8c30d47a1"
down_revision: Union[str, Sequence[str], None] = "d8f1a72c95e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _uuid_pk() -> sa.Column:
    return sa.Column("id", PG_UUID(as_uuid=True), nullable=False)


def _created_at() -> sa.Column:
    return sa.Column(
        "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
    )


def _updated_at() -> sa.Column:
    return sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True)


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("CREATE SEQUENCE IF NOT EXISTS orders_order_number_seq")

    op.create_table(
        "orders",
        _uuid_pk(),
        sa.Column("order_number", sa.BigInteger(), nullable=False),
        sa.Column("public_code", sa.String(length=40), nullable=False),
        sa.Column("customer_user_id", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("source", sa.String(length=30), nullable=False),
        sa.Column("fulfillment_type", sa.String(length=30), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("payment_status", sa.String(length=40), nullable=False),
        sa.Column("customer_name_snapshot", sa.String(length=180), nullable=True),
        sa.Column("customer_phone_snapshot", sa.String(length=30), nullable=True),
        sa.Column("customer_email_snapshot", sa.String(length=180), nullable=True),
        sa.Column("items_subtotal_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("discount_total_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("shipping_total_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("total_money_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column(
            "credits_earned_total_snapshot", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column("credits_redeemed_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("customer_note", sa.Text(), nullable=True),
        sa.Column("internal_note", sa.Text(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_by", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_by", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("created_by", PG_UUID(as_uuid=True), nullable=True),
        _created_at(),
        _updated_at(),
        sa.CheckConstraint(
            "source IN ('online', 'counter', 'phone', 'whatsapp', 'social', 'manual')",
            name="orders_source",
        ),
        sa.CheckConstraint(
            "fulfillment_type IN ('delivery', 'pickup', 'counter')",
            name="orders_fulfillment_type",
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'submitted', 'pending_shipping_review', "
            "'pending_payment_verification', 'pending_approval', 'approved', 'preparing', "
            "'ready', 'out_for_delivery', 'completed', 'cancelled')",
            name="orders_status",
        ),
        sa.CheckConstraint(
            "payment_status IN ('unpaid', 'pending', 'pending_verification', 'paid', "
            "'partially_refunded', 'refunded', 'voided')",
            name="orders_payment_status",
        ),
        sa.CheckConstraint(
            "customer_user_id IS NOT NULL OR created_by IS NOT NULL",
            name="orders_requires_user",
        ),
        sa.CheckConstraint(
            "source != 'online' OR customer_user_id IS NOT NULL",
            name="orders_online_requires_customer",
        ),
        sa.ForeignKeyConstraint(
            ["customer_user_id"], ["user.id"],
            name=op.f("fk_orders_customer_user_id_user"), ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["approved_by"], ["user.id"],
            name=op.f("fk_orders_approved_by_user"), ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["cancelled_by"], ["user.id"],
            name=op.f("fk_orders_cancelled_by_user"), ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["user.id"],
            name=op.f("fk_orders_created_by_user"), ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_orders")),
    )
    op.create_index("uq_orders_order_number", "orders", ["order_number"], unique=True)
    op.create_index("uq_orders_public_code", "orders", ["public_code"], unique=True)
    op.create_index("ix_orders_customer_created", "orders", ["customer_user_id", "created_at"])
    op.create_index("ix_orders_status_created", "orders", ["status", "created_at"])
    op.create_index("ix_orders_source_created", "orders", ["source", "created_at"])

    op.create_table(
        "order_lines",
        _uuid_pk(),
        sa.Column("order_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("product_id", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("product_name_snapshot", sa.String(length=180), nullable=False),
        sa.Column("product_description_snapshot", sa.Text(), nullable=True),
        sa.Column("quantity", sa.Numeric(10, 2), nullable=False),
        sa.Column("purchase_mode", sa.String(length=20), nullable=False),
        sa.Column(
            "money_unit_price_snapshot", sa.Numeric(12, 2), nullable=False, server_default="0"
        ),
        sa.Column(
            "modifier_money_total_per_unit", sa.Numeric(12, 2), nullable=False, server_default="0"
        ),
        sa.Column(
            "money_line_total_amount", sa.Numeric(12, 2), nullable=False, server_default="0"
        ),
        sa.Column(
            "credits_awarded_per_unit_snapshot", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column(
            "credits_earned_total_snapshot", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column("credit_redemption_price_per_unit_snapshot", sa.Integer(), nullable=True),
        sa.Column("credits_redeemed_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("customer_note", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        _created_at(),
        _updated_at(),
        sa.CheckConstraint(
            "purchase_mode IN ('money', 'credits', 'complimentary')", name="order_lines_mode"
        ),
        sa.CheckConstraint("quantity > 0", name="order_lines_quantity_positive"),
        sa.ForeignKeyConstraint(
            ["order_id"], ["orders.id"],
            name=op.f("fk_order_lines_order_id_orders"), ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["product_id"], ["products.id"],
            name=op.f("fk_order_lines_product_id_products"), ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_order_lines")),
    )
    op.create_index("ix_order_lines_order", "order_lines", ["order_id"])
    op.create_index("ix_order_lines_product", "order_lines", ["product_id"])

    op.create_table(
        "order_line_modifiers",
        _uuid_pk(),
        sa.Column("order_line_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("modifier_option_id", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("group_name_snapshot", sa.String(length=120), nullable=False),
        sa.Column("option_name_snapshot", sa.String(length=180), nullable=False),
        sa.Column("quantity", sa.Numeric(10, 2), nullable=False, server_default="1"),
        sa.Column("unit_price_adjustment", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        _created_at(),
        _updated_at(),
        sa.ForeignKeyConstraint(
            ["order_line_id"], ["order_lines.id"],
            name=op.f("fk_order_line_modifiers_order_line_id_order_lines"), ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["modifier_option_id"], ["modifier_options.id"],
            name=op.f("fk_order_line_modifiers_modifier_option_id_modifier_options"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_order_line_modifiers")),
    )
    op.create_index("ix_order_line_modifiers_line", "order_line_modifiers", ["order_line_id"])

    op.create_table(
        "order_adjustments",
        _uuid_pk(),
        sa.Column("order_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("adjustment_type", sa.String(length=40), nullable=False),
        sa.Column("direction", sa.String(length=10), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("authorized_by", PG_UUID(as_uuid=True), nullable=False),
        _created_at(),
        _updated_at(),
        sa.CheckConstraint(
            "adjustment_type IN ('discount', 'promotion', 'courtesy', 'manual_fee')",
            name="order_adjustments_type",
        ),
        sa.CheckConstraint(
            "direction IN ('charge', 'discount')", name="order_adjustments_direction"
        ),
        sa.CheckConstraint("amount >= 0", name="order_adjustments_amount_non_negative"),
        sa.ForeignKeyConstraint(
            ["order_id"], ["orders.id"],
            name=op.f("fk_order_adjustments_order_id_orders"), ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["authorized_by"], ["user.id"],
            name=op.f("fk_order_adjustments_authorized_by_user"), ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_order_adjustments")),
    )
    op.create_index("ix_order_adjustments_order", "order_adjustments", ["order_id"])

    op.create_table(
        "order_status_history",
        _uuid_pk(),
        sa.Column("order_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("previous_status", sa.String(length=40), nullable=True),
        sa.Column("new_status", sa.String(length=40), nullable=False),
        sa.Column("reason_code", sa.String(length=80), nullable=True),
        sa.Column("internal_note", sa.Text(), nullable=True),
        sa.Column("customer_visible_note", sa.Text(), nullable=True),
        sa.Column("changed_by", PG_UUID(as_uuid=True), nullable=True),
        sa.Column(
            "changed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["order_id"], ["orders.id"],
            name=op.f("fk_order_status_history_order_id_orders"), ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["changed_by"], ["user.id"],
            name=op.f("fk_order_status_history_changed_by_user"), ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_order_status_history")),
    )
    op.create_index(
        "ix_order_status_history_order", "order_status_history", ["order_id", "changed_at"]
    )

    op.create_table(
        "order_deliveries",
        _uuid_pk(),
        sa.Column("order_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("user_address_id", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("recipient_name", sa.String(length=180), nullable=False),
        sa.Column("recipient_phone", sa.String(length=30), nullable=False),
        sa.Column("street", sa.String(length=180), nullable=False),
        sa.Column("external_number", sa.String(length=30), nullable=True),
        sa.Column("internal_number", sa.String(length=30), nullable=True),
        sa.Column("neighborhood", sa.String(length=120), nullable=True),
        sa.Column("city", sa.String(length=120), nullable=True),
        sa.Column("postal_code", sa.String(length=20), nullable=True),
        sa.Column("references", sa.Text(), nullable=True),
        sa.Column(
            "location",
            Geometry(geometry_type="POINT", srid=4326, spatial_index=False),
            nullable=True,
        ),
        sa.Column("location_source", sa.String(length=40), nullable=False),
        sa.Column("delivery_note", sa.Text(), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered_to_name", sa.String(length=180), nullable=True),
        sa.Column("delivery_proof_file_id", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("delivery_completion_note", sa.Text(), nullable=True),
        _created_at(),
        _updated_at(),
        sa.CheckConstraint(
            "location_source IN ('customer_selected', 'saved_address', 'employee_selected', "
            "'geocoded', 'not_provided')",
            name="order_deliveries_location_source",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"], ["orders.id"],
            name=op.f("fk_order_deliveries_order_id_orders"), ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_address_id"], ["user_addresses.id"],
            name=op.f("fk_order_deliveries_user_address_id_user_addresses"), ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["delivery_proof_file_id"], ["stored_files.id"],
            name=op.f("fk_order_deliveries_delivery_proof_file_id_stored_files"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_order_deliveries")),
    )
    op.create_index("uq_order_deliveries_order", "order_deliveries", ["order_id"], unique=True)
    op.create_index(
        "ix_order_deliveries_location", "order_deliveries", ["location"],
        postgresql_using="gist",
    )

    op.create_table(
        "order_shipping",
        _uuid_pk(),
        sa.Column("order_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("delivery_zone_id", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("delivery_zone_name_snapshot", sa.String(length=120), nullable=True),
        sa.Column("shipping_rate_rule_id", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("shipping_rate_name_snapshot", sa.String(length=120), nullable=True),
        sa.Column("calculation_status", sa.String(length=40), nullable=False),
        sa.Column("calculation_source", sa.String(length=40), nullable=False),
        sa.Column("estimated_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("final_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column(
            "is_free_shipping", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column("manual_override_reason", sa.Text(), nullable=True),
        sa.Column("finalized_by", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("finalized_at", sa.DateTime(timezone=True), nullable=True),
        _created_at(),
        _updated_at(),
        sa.CheckConstraint(
            "calculation_status IN ('calculated', 'pending_review', 'finalized', "
            "'not_available')",
            name="order_shipping_status",
        ),
        sa.CheckConstraint(
            "calculation_source IN ('polygon_auto', 'employee_selected_rate', "
            "'employee_manual_override', 'free_shipping_rule')",
            name="order_shipping_source",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"], ["orders.id"],
            name=op.f("fk_order_shipping_order_id_orders"), ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["delivery_zone_id"], ["delivery_zones.id"],
            name=op.f("fk_order_shipping_delivery_zone_id_delivery_zones"), ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["shipping_rate_rule_id"], ["shipping_rate_rules.id"],
            name=op.f("fk_order_shipping_shipping_rate_rule_id_shipping_rate_rules"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["finalized_by"], ["user.id"],
            name=op.f("fk_order_shipping_finalized_by_user"), ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_order_shipping")),
    )
    op.create_index("uq_order_shipping_order", "order_shipping", ["order_id"], unique=True)

    op.create_table(
        "order_shipping_history",
        _uuid_pk(),
        sa.Column("order_shipping_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("previous_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("new_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("previous_zone_name_snapshot", sa.String(length=120), nullable=True),
        sa.Column("new_zone_name_snapshot", sa.String(length=120), nullable=True),
        sa.Column("previous_rate_name_snapshot", sa.String(length=120), nullable=True),
        sa.Column("new_rate_name_snapshot", sa.String(length=120), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("changed_by", PG_UUID(as_uuid=True), nullable=True),
        sa.Column(
            "changed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["order_shipping_id"], ["order_shipping.id"],
            name=op.f("fk_order_shipping_history_order_shipping_id_order_shipping"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["changed_by"], ["user.id"],
            name=op.f("fk_order_shipping_history_changed_by_user"), ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_order_shipping_history")),
    )
    op.create_index(
        "ix_order_shipping_history_shipping", "order_shipping_history", ["order_shipping_id"]
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_order_shipping_history_shipping", table_name="order_shipping_history")
    op.drop_table("order_shipping_history")
    op.drop_index("uq_order_shipping_order", table_name="order_shipping")
    op.drop_table("order_shipping")
    op.drop_index("ix_order_deliveries_location", table_name="order_deliveries")
    op.drop_index("uq_order_deliveries_order", table_name="order_deliveries")
    op.drop_table("order_deliveries")
    op.drop_index("ix_order_status_history_order", table_name="order_status_history")
    op.drop_table("order_status_history")
    op.drop_index("ix_order_adjustments_order", table_name="order_adjustments")
    op.drop_table("order_adjustments")
    op.drop_index("ix_order_line_modifiers_line", table_name="order_line_modifiers")
    op.drop_table("order_line_modifiers")
    op.drop_index("ix_order_lines_product", table_name="order_lines")
    op.drop_index("ix_order_lines_order", table_name="order_lines")
    op.drop_table("order_lines")
    op.drop_index("ix_orders_source_created", table_name="orders")
    op.drop_index("ix_orders_status_created", table_name="orders")
    op.drop_index("ix_orders_customer_created", table_name="orders")
    op.drop_index("uq_orders_public_code", table_name="orders")
    op.drop_index("uq_orders_order_number", table_name="orders")
    op.drop_table("orders")
    op.execute("DROP SEQUENCE IF EXISTS orders_order_number_seq")
