"""Etapa 6 del dominio restaurante: repartidores y tracking opcional.

Sesiones de ubicación voluntarias con eventos temporales (se purgan, §19.4) y
asignaciones de entrega con UNA vigente por pedido (índice único parcial):
dos repartidores no pueden tomar el mismo envío (§19.5).

Revision ID: a4c7e81f52d9
Revises: f2a6d95c31b8
Create Date: 2026-07-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

# revision identifiers, used by Alembic.
revision: str = "a4c7e81f52d9"
down_revision: Union[str, Sequence[str], None] = "f2a6d95c31b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "courier_tracking_sessions",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("courier_user_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column(
            "sharing_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column(
            "current_location",
            Geometry(geometry_type="POINT", srid=4326, spatial_index=False),
            nullable=True,
        ),
        sa.Column("current_location_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_accuracy_meters", sa.Numeric(8, 2), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_reason", sa.String(length=80), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('inactive', 'active', 'paused', 'ended')",
            name="courier_tracking_status",
        ),
        sa.ForeignKeyConstraint(
            ["courier_user_id"], ["user.id"],
            name=op.f("fk_courier_tracking_sessions_courier_user_id_user"), ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_courier_tracking_sessions")),
    )
    op.create_index(
        "ix_courier_tracking_courier", "courier_tracking_sessions",
        ["courier_user_id", "status"],
    )

    op.create_table(
        "courier_location_events",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("tracking_session_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column(
            "location",
            Geometry(geometry_type="POINT", srid=4326, spatial_index=False),
            nullable=False,
        ),
        sa.Column("accuracy_meters", sa.Numeric(8, 2), nullable=True),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["tracking_session_id"], ["courier_tracking_sessions.id"],
            name=op.f("fk_courier_location_events_tracking_session_id_courier_tracking_sessions"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_courier_location_events")),
    )
    op.create_index(
        "ix_courier_location_events_session", "courier_location_events",
        ["tracking_session_id", "captured_at"],
    )

    op.create_table(
        "delivery_assignments",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("order_delivery_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("courier_user_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("courier_name_snapshot", sa.String(length=180), nullable=False),
        sa.Column(
            "courier_contact_phone_snapshot", sa.String(length=30), nullable=True,
            comment="Teléfono AUTORIZADO para el cliente (public_contact_phone), nunca el personal.",
        ),
        sa.Column("tracking_session_id", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("is_current", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "assigned_by", PG_UUID(as_uuid=True), nullable=True,
            comment="Empleado que asignó; el PROPIO repartidor cuando se autoasigna (§19.5).",
        ),
        sa.Column(
            "assigned_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancellation_reason", sa.Text(), nullable=True),
        sa.Column("internal_note", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('assigned', 'accepted', 'in_progress', 'completed', 'cancelled', "
            "'reassigned')",
            name="delivery_assignments_status",
        ),
        sa.ForeignKeyConstraint(
            ["order_delivery_id"], ["order_deliveries.id"],
            name=op.f("fk_delivery_assignments_order_delivery_id_order_deliveries"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["courier_user_id"], ["user.id"],
            name=op.f("fk_delivery_assignments_courier_user_id_user"), ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["tracking_session_id"], ["courier_tracking_sessions.id"],
            name=op.f("fk_delivery_assignments_tracking_session_id_courier_tracking_sessions"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["assigned_by"], ["user.id"],
            name=op.f("fk_delivery_assignments_assigned_by_user"), ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_delivery_assignments")),
    )
    op.create_index(
        "uq_delivery_assignments_current",
        "delivery_assignments",
        ["order_delivery_id"],
        unique=True,
        postgresql_where=sa.text("is_current"),
    )
    op.create_index(
        "ix_delivery_assignments_courier", "delivery_assignments",
        ["courier_user_id", "assigned_at"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_delivery_assignments_courier", table_name="delivery_assignments")
    op.drop_index("uq_delivery_assignments_current", table_name="delivery_assignments")
    op.drop_table("delivery_assignments")
    op.drop_index("ix_courier_location_events_session", table_name="courier_location_events")
    op.drop_table("courier_location_events")
    op.drop_index("ix_courier_tracking_courier", table_name="courier_tracking_sessions")
    op.drop_table("courier_tracking_sessions")
