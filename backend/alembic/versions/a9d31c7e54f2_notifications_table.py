"""Notificaciones persistentes por usuario (campana in-app + cola de correo).

Cada fila llega por AMBOS medios: la campana (read_at) y un correo cuya cola
vive en la misma fila (email_status pending→sent/failed/skipped), despachada
por hilo best-effort post-commit y por el tick Taskiq como red de seguridad.

Revision ID: a9d31c7e54f2
Revises: 8f4c2d91ab37
Create Date: 2026-07-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "a9d31c7e54f2"
down_revision: Union[str, Sequence[str], None] = "8f4c2d91ab37"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=140), nullable=False),
        sa.Column("body", sa.String(length=500), nullable=False),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("email_status", sa.String(length=10), nullable=False),
        sa.Column("email_error", sa.String(length=200), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "kind IN ('order_status', 'order_new', 'promo')", name="notifications_kind"
        ),
        sa.CheckConstraint(
            "email_status IN ('pending', 'sent', 'failed', 'skipped')",
            name="notifications_email_status",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notifications_user_read", "notifications", ["user_id", "read_at"])
    op.create_index(
        "ix_notifications_email_pending", "notifications", ["email_status", "created_at"]
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_notifications_email_pending", table_name="notifications")
    op.drop_index("ix_notifications_user_read", table_name="notifications")
    op.drop_table("notifications")
    # Limpieza best-effort de los permisos del grupo (dejarían de existir en código).
    op.execute(
        "DELETE FROM role_access WHERE access IN "
        "('notifications:send', 'notifications:order_alerts')"
    )
