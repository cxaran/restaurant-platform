"""Snapshot del negocio en el pedido para el ticket (§20).

``orders.business_snapshot`` (JSON): encabezado/pie del negocio congelados al
crear el pedido (trade_name, slogan, logo_file_id, footer_text). Reimprimir un
ticket años después muestra el branding del momento de la venta, no el actual.
El histórico queda NULL: el ticket cae al perfil vivo para esos pedidos.

Revision ID: f9b3e61a24c8
Revises: e2a9c56b41d7
Create Date: 2026-07-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f9b3e61a24c8"
down_revision: Union[str, Sequence[str], None] = "e2a9c56b41d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "orders",
        sa.Column(
            "business_snapshot",
            sa.JSON(),
            nullable=True,
            comment=(
                "Encabezado/pie del negocio al crear el pedido (trade_name, slogan, "
                "logo_file_id, footer_text): el ticket reimpreso muestra lo vendido, "
                "no el branding actual (§20). NULL en pedidos previos a este campo."
            ),
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("orders", "business_snapshot")
