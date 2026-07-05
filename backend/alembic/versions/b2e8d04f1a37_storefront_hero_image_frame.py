"""Marco+sombra opcional de la imagen del hero split (storefront_heros.image_frame).

Agrega ``image_frame`` (bool, default True) a ``storefront_heros``. Solo afecta a la
plantilla split: True = recuadro redondeado + sombra detrás de la imagen (look actual);
False = la imagen se muestra sin ningún efecto extra. Default True para no alterar los
heros existentes.

Revision ID: b2e8d04f1a37
Revises: b3d9f2c1a7e4
Create Date: 2026-07-05
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b2e8d04f1a37"
down_revision: Union[str, Sequence[str], None] = "b3d9f2c1a7e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "storefront_heros",
        sa.Column(
            "image_frame",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )


def downgrade() -> None:
    op.drop_column("storefront_heros", "image_frame")
