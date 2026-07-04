"""Switch: pedidos web sólo dentro del horario de atención.

``business_settings.online_orders_require_open_hours`` (default false, opt-in):
con el switch encendido el checkout web rechaza pedidos cuando el horario
efectivo (semanal + fechas especiales) dice cerrado. La captura de staff y el
POS quedan exentos; «Aceptando pedidos» sigue mandando por encima de todo.

Revision ID: c4f81b26d9a5
Revises: b7e42a91c5d3
Create Date: 2026-07-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4f81b26d9a5"
down_revision: Union[str, Sequence[str], None] = "b7e42a91c5d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "business_settings",
        sa.Column(
            "online_orders_require_open_hours",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
            comment=(
                "Los pedidos WEB sólo se aceptan dentro del horario de atención "
                "(semanal + fechas especiales). Sin horarios configurados el negocio "
                "cuenta como cerrado, por eso es opt-in. La captura de staff y el POS "
                "quedan exentos; el switch «Aceptando pedidos» manda por encima."
            ),
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("business_settings", "online_orders_require_open_hours")
