"""Web Push: suscripciones por dispositivo, credenciales VAPID y cola push.

Tercer medio de la MISMA fila de notificación: ``push_status`` espeja la
máquina de estados de ``email_status`` (pending→sent/failed/skipped). Las
filas EXISTENTES quedan en 'skipped' (no se re-empujan avisos viejos); las
nuevas nacen 'pending' desde el default de la aplicación.

Revision ID: c4d7e92f0b18
Revises: b2e8d04f1a37
Create Date: 2026-07-06
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c4d7e92f0b18"
down_revision: Union[str, Sequence[str], None] = "b2e8d04f1a37"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "push_subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("p256dh", sa.String(length=255), nullable=False),
        sa.Column("auth", sa.String(length=255), nullable=False),
        sa.Column("user_agent", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("endpoint"),
    )
    op.create_index("ix_push_subscriptions_user", "push_subscriptions", ["user_id"])

    op.create_table(
        "web_push_credentials",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("public_key", sa.String(length=255), nullable=False),
        sa.Column("private_key_encrypted", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # Cola push en la fila de notificación: viejas 'skipped', nuevas 'pending'
    # (default de la app; el server_default solo puebla lo existente).
    op.add_column(
        "notifications",
        sa.Column(
            "push_status", sa.String(length=10), nullable=False,
            server_default=sa.text("'skipped'"),
        ),
    )
    op.add_column(
        "notifications", sa.Column("push_error", sa.String(length=200), nullable=True)
    )
    op.create_check_constraint(
        op.f("notifications_push_status"),
        "notifications",
        "push_status IN ('pending', 'sent', 'failed', 'skipped')",
    )
    op.create_index(
        "ix_notifications_push_pending", "notifications", ["push_status", "created_at"]
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_notifications_push_pending", table_name="notifications")
    op.drop_constraint(op.f("notifications_push_status"), "notifications", type_="check")
    op.drop_column("notifications", "push_error")
    op.drop_column("notifications", "push_status")
    op.drop_table("web_push_credentials")
    op.drop_index("ix_push_subscriptions_user", table_name="push_subscriptions")
    op.drop_table("push_subscriptions")
