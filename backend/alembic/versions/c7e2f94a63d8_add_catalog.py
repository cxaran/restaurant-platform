"""Etapa 2 del dominio restaurante: catálogo de productos y modificadores.

Categorías, productos (precio monetario y/o canje en créditos, límites de
venta §11.2), imágenes e inclusiones, y el sistema genérico de modificadores
(§12: grupos, opciones y vínculo por producto con overrides). CHECKs de
coherencia: venta monetaria exige precio y todo producto debe ser vendible de
alguna forma.

Revision ID: c7e2f94a63d8
Revises: a9d3e57c81f2
Create Date: 2026-07-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

# revision identifiers, used by Alembic.
revision: str = "c7e2f94a63d8"
down_revision: Union[str, Sequence[str], None] = "a9d3e57c81f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "product_categories",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
            comment="Oculta el grupo del sitio sin perder productos ni historial.",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_product_categories")),
    )
    op.create_index("ix_product_categories_sort", "product_categories", ["sort_order"])

    op.create_table(
        "products",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("category_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("sku", sa.String(length=80), nullable=True),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "money_price_amount",
            sa.Numeric(12, 2),
            nullable=True,
            comment="Precio monetario VIGENTE; los pedidos guardan su propio snapshot (§15).",
        ),
        sa.Column(
            "is_money_purchase_available",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "credits_awarded_per_unit",
            sa.Integer(),
            nullable=False,
            server_default="0",
            comment="Créditos que otorga cada unidad comprada con dinero (§22.1).",
        ),
        sa.Column(
            "credit_redemption_price",
            sa.Integer(),
            nullable=True,
            comment="Precio alternativo en créditos; NULL = no canjeable.",
        ),
        sa.Column(
            "is_available",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
            comment="Disponibilidad MANUAL del día (§11.2): sin reactivación automática.",
        ),
        sa.Column(
            "is_featured", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column("preparation_minutes", sa.Integer(), nullable=True),
        sa.Column(
            "max_units_per_order",
            sa.Integer(),
            nullable=True,
            comment="Límite de unidades del producto en UN pedido; para más, otro pedido.",
        ),
        sa.Column(
            "daily_unit_limit",
            sa.Integer(),
            nullable=True,
            comment=(
                "Tope de unidades aceptadas por día (evita sobrepedidos). El consumo se "
                "calcula desde order_lines; no existe contador editable."
            ),
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "NOT is_money_purchase_available OR money_price_amount IS NOT NULL",
            name="products_money_requires_price",
        ),
        sa.CheckConstraint(
            "is_money_purchase_available OR credit_redemption_price IS NOT NULL",
            name="products_sellable_somehow",
        ),
        sa.CheckConstraint(
            "money_price_amount IS NULL OR money_price_amount >= 0",
            name="products_price_non_negative",
        ),
        sa.CheckConstraint(
            "credits_awarded_per_unit >= 0", name="products_credits_awarded_non_negative"
        ),
        sa.CheckConstraint(
            "credit_redemption_price IS NULL OR credit_redemption_price >= 1",
            name="products_redemption_positive",
        ),
        sa.CheckConstraint(
            "preparation_minutes IS NULL OR preparation_minutes >= 0",
            name="products_preparation_non_negative",
        ),
        sa.CheckConstraint(
            "max_units_per_order IS NULL OR max_units_per_order >= 1",
            name="products_max_units_positive",
        ),
        sa.CheckConstraint(
            "daily_unit_limit IS NULL OR daily_unit_limit >= 1",
            name="products_daily_limit_positive",
        ),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["product_categories.id"],
            name=op.f("fk_products_category_id_product_categories"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_products")),
    )
    op.create_index("ix_products_category_sort", "products", ["category_id", "sort_order"])
    op.create_index("ix_products_active_available", "products", ["is_active", "is_available"])

    op.create_table(
        "product_images",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("product_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("file_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("alt_text", sa.String(length=180), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "is_primary", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name=op.f("fk_product_images_product_id_products"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["file_id"],
            ["stored_files.id"],
            name=op.f("fk_product_images_file_id_stored_files"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_product_images")),
    )
    op.create_index(
        "uq_product_images_primary_per_product",
        "product_images",
        ["product_id"],
        unique=True,
        postgresql_where=sa.text("is_primary"),
    )
    op.create_index(
        "ix_product_images_product_sort", "product_images", ["product_id", "sort_order"]
    )

    op.create_table(
        "product_inclusions",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("product_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name=op.f("fk_product_inclusions_product_id_products"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_product_inclusions")),
    )
    op.create_index(
        "ix_product_inclusions_product_sort",
        "product_inclusions",
        ["product_id", "sort_order"],
    )

    op.create_table(
        "modifier_groups",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column(
            "selection_type",
            sa.String(length=20),
            nullable=False,
            server_default="single",
            comment="single = una opción (salsa); multiple = varias (extras).",
        ),
        sa.Column("min_selections", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_selections", sa.Integer(), nullable=True),
        sa.Column(
            "is_required", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "selection_type IN ('single', 'multiple')", name="modifier_groups_selection_type"
        ),
        sa.CheckConstraint("min_selections >= 0", name="modifier_groups_min_non_negative"),
        sa.CheckConstraint(
            "max_selections IS NULL OR max_selections >= 1", name="modifier_groups_max_positive"
        ),
        sa.CheckConstraint(
            "max_selections IS NULL OR max_selections >= min_selections",
            name="modifier_groups_max_gte_min",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_modifier_groups")),
    )

    op.create_table(
        "modifier_options",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("modifier_group_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "price_adjustment",
            sa.Numeric(12, 2),
            nullable=False,
            server_default="0",
            comment="Cargo adicional VIGENTE por elegir la opción; 0 = sin costo.",
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "is_available", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("price_adjustment >= 0", name="modifier_options_price_non_negative"),
        sa.ForeignKeyConstraint(
            ["modifier_group_id"],
            ["modifier_groups.id"],
            name=op.f("fk_modifier_options_modifier_group_id_modifier_groups"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_modifier_options")),
    )
    op.create_index(
        "ix_modifier_options_group_sort", "modifier_options", ["modifier_group_id", "sort_order"]
    )

    op.create_table(
        "product_modifier_groups",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("product_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("modifier_group_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("min_selections_override", sa.Integer(), nullable=True),
        sa.Column("max_selections_override", sa.Integer(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "min_selections_override IS NULL OR min_selections_override >= 0",
            name="product_modifier_groups_min_non_negative",
        ),
        sa.CheckConstraint(
            "max_selections_override IS NULL OR max_selections_override >= 1",
            name="product_modifier_groups_max_positive",
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name=op.f("fk_product_modifier_groups_product_id_products"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["modifier_group_id"],
            ["modifier_groups.id"],
            name=op.f("fk_product_modifier_groups_modifier_group_id_modifier_groups"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_product_modifier_groups")),
    )
    op.create_index(
        "uq_product_modifier_groups_pair",
        "product_modifier_groups",
        ["product_id", "modifier_group_id"],
        unique=True,
    )
    op.create_index(
        "ix_product_modifier_groups_product_sort",
        "product_modifier_groups",
        ["product_id", "sort_order"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        "ix_product_modifier_groups_product_sort", table_name="product_modifier_groups"
    )
    op.drop_index("uq_product_modifier_groups_pair", table_name="product_modifier_groups")
    op.drop_table("product_modifier_groups")
    op.drop_index("ix_modifier_options_group_sort", table_name="modifier_options")
    op.drop_table("modifier_options")
    op.drop_table("modifier_groups")
    op.drop_index("ix_product_inclusions_product_sort", table_name="product_inclusions")
    op.drop_table("product_inclusions")
    op.drop_index("ix_product_images_product_sort", table_name="product_images")
    op.drop_index("uq_product_images_primary_per_product", table_name="product_images")
    op.drop_table("product_images")
    op.drop_index("ix_products_active_available", table_name="products")
    op.drop_index("ix_products_category_sort", table_name="products")
    op.drop_table("products")
    op.drop_index("ix_product_categories_sort", table_name="product_categories")
    op.drop_table("product_categories")
