"""Direcciones del usuario: teléfono de contacto guardado con la dirección.

``contact_phone`` prellena el teléfono del checkout al elegir una dirección
guardada, para no volver a pedirlo. Columna OPCIONAL (nullable); no afecta
pedidos históricos (guardan su propio snapshot de contacto).

Revision ID: a1b2c3d4e5f6
Revises: e7a1c3b9f204
Create Date: 2026-07-06
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "e7a1c3b9f204"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "user_addresses",
        sa.Column("contact_phone", sa.String(length=30), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("user_addresses", "contact_phone")
