"""Notificaciones: enlace opcional (destino al tocar la notificación).

order_status/order_new derivan su destino del tipo + order_id; ``promo`` guarda
aquí un enlace OPCIONAL que define quien difunde. Nullable, sin default.

Revision ID: d6f2a8c41b93
Revises: c4d7e92f0b18
Create Date: 2026-07-06
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d6f2a8c41b93"
down_revision: Union[str, Sequence[str], None] = "c4d7e92f0b18"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "notifications", sa.Column("link_url", sa.String(length=500), nullable=True)
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("notifications", "link_url")
