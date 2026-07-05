"""Texto editable del panel lateral de las páginas de acceso (storefront_settings).

Agrega ``auth_headline`` y ``auth_subcopy`` al singleton ``storefront_settings``
para que el titular y el copy del panel lateral de login/registro/… dejen de estar
hardcodeados en el frontend. Texto libre nullable (sin CHECK); vacío = el front usa
su copy por defecto.

Revision ID: a1f7c93e0b52
Revises: c3f8a1d6e29b
Create Date: 2026-07-05
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1f7c93e0b52"
down_revision: Union[str, Sequence[str], None] = "c3f8a1d6e29b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "storefront_settings",
        sa.Column("auth_headline", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "storefront_settings",
        sa.Column("auth_subcopy", sa.String(length=300), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("storefront_settings", "auth_subcopy")
    op.drop_column("storefront_settings", "auth_headline")
