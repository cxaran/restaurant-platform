"""Tiempo estimado de entrega congelado en el envío del pedido.

``order_shipping.estimated_minutes`` guarda el tiempo estimado (min) de la
tarifa de la zona al cotizar/finalizar, para mostrarlo en el panel y calcular
la hora estimada de entrega del cliente. NULL cuando la tarifa no lo define o
el envío se fijó manualmente (§10.2/§17.2).

Revision ID: d3a7c92f10b8
Revises: c4f81b26d9a5
Create Date: 2026-07-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d3a7c92f10b8"
down_revision: Union[str, Sequence[str], None] = "c4f81b26d9a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "order_shipping",
        sa.Column(
            "estimated_minutes",
            sa.Integer(),
            nullable=True,
            comment=(
                "Tiempo estimado de entrega (min) CONGELADO de la tarifa de la zona; "
                "NULL si la tarifa no lo define o el envío fue manual (§10.2/§17.2)."
            ),
        ),
    )
    op.create_check_constraint(
        "order_shipping_minutes_non_negative",
        "order_shipping",
        "estimated_minutes IS NULL OR estimated_minutes >= 0",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        "order_shipping_minutes_non_negative", "order_shipping", type_="check"
    )
    op.drop_column("order_shipping", "estimated_minutes")
