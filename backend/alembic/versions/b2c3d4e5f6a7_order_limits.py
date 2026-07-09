"""Topes anti-abuso del pedido web: máximo de productos y de pedidos activos.

Dos columnas OPCIONALES en ``business_settings`` (singleton):
``max_products_per_order`` (unidades por pedido) y
``max_active_orders_per_user`` (pedidos no terminales simultáneos por cliente).
NULL en ambas = sin límite (comportamiento previo). Solo aplican al checkout
web; el POS y la captura del panel quedan exentos.

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-09
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "business_settings",
        sa.Column("max_products_per_order", sa.Integer(), nullable=True),
    )
    op.add_column(
        "business_settings",
        sa.Column("max_active_orders_per_user", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("business_settings", "max_active_orders_per_user")
    op.drop_column("business_settings", "max_products_per_order")
