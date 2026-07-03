"""Etapa 3 del dominio restaurante: zonas de reparto y tarifas de envío.

``delivery_zones`` con cobertura MultiPolygon (SRID 4326, índice GIST) y
prioridad para solapes; ``shipping_rate_rules`` como lista editable de tarifas
por zona con mínimo de compra y umbral propio de envío gratis (§10).

Revision ID: d8f1a72c95e4
Revises: c7e2f94a63d8
Create Date: 2026-07-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

# revision identifiers, used by Alembic.
revision: str = "d8f1a72c95e4"
down_revision: Union[str, Sequence[str], None] = "c7e2f94a63d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "delivery_zones",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "coverage_geometry",
            Geometry(geometry_type="MULTIPOLYGON", srid=4326, spatial_index=False),
            nullable=False,
            comment="Cobertura como MultiPolygon (SRID 4326). La API habla GeoJSON.",
        ),
        sa.Column(
            "priority",
            sa.Integer(),
            nullable=False,
            server_default="0",
            comment="Resuelve solapes entre zonas: gana la prioridad MAYOR.",
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_delivery_zones")),
        sa.UniqueConstraint("code", name=op.f("uq_delivery_zones_code")),
    )
    op.create_index(
        "ix_delivery_zones_coverage",
        "delivery_zones",
        ["coverage_geometry"],
        unique=False,
        postgresql_using="gist",
    )

    op.create_table(
        "shipping_rate_rules",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("delivery_zone_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("base_fee", sa.Numeric(12, 2), nullable=False),
        sa.Column(
            "minimum_order_amount",
            sa.Numeric(12, 2),
            nullable=True,
            comment="Compra mínima para que la tarifa aplique; NULL = sin mínimo.",
        ),
        sa.Column(
            "free_shipping_from_amount",
            sa.Numeric(12, 2),
            nullable=True,
            comment="Umbral de envío gratis PROPIO de la tarifa; convive con el global (§10.2).",
        ),
        sa.Column("estimated_minutes", sa.Integer(), nullable=True),
        sa.Column(
            "priority",
            sa.Integer(),
            nullable=False,
            server_default="0",
            comment="Entre tarifas aplicables de la zona gana la prioridad MAYOR.",
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("base_fee >= 0", name="shipping_rate_rules_fee_non_negative"),
        sa.CheckConstraint(
            "minimum_order_amount IS NULL OR minimum_order_amount >= 0",
            name="shipping_rate_rules_minimum_non_negative",
        ),
        sa.CheckConstraint(
            "free_shipping_from_amount IS NULL OR free_shipping_from_amount >= 0",
            name="shipping_rate_rules_free_from_non_negative",
        ),
        sa.CheckConstraint(
            "estimated_minutes IS NULL OR estimated_minutes >= 0",
            name="shipping_rate_rules_minutes_non_negative",
        ),
        sa.ForeignKeyConstraint(
            ["delivery_zone_id"],
            ["delivery_zones.id"],
            name=op.f("fk_shipping_rate_rules_delivery_zone_id_delivery_zones"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_shipping_rate_rules")),
    )
    op.create_index(
        "ix_shipping_rate_rules_zone",
        "shipping_rate_rules",
        ["delivery_zone_id", "priority"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_shipping_rate_rules_zone", table_name="shipping_rate_rules")
    op.drop_table("shipping_rate_rules")
    op.drop_index("ix_delivery_zones_coverage", table_name="delivery_zones")
    op.drop_table("delivery_zones")
