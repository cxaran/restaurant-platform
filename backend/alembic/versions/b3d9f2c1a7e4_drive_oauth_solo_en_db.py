"""Credenciales OAuth de Drive sólo en la base (se retira el fallback del entorno).

Sin cambios estructurales: actualiza el comentario de la columna
``backup_settings.google_drive_client_id`` para reflejar que la fila es la única
fuente de las credenciales (GOOGLE_DRIVE_* dejó de existir en el entorno).

Revision ID: b3d9f2c1a7e4
Revises: a1f7c93e0b52
Create Date: 2026-07-05
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b3d9f2c1a7e4"
down_revision: Union[str, Sequence[str], None] = "a1f7c93e0b52"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "backup_settings",
        "google_drive_client_id",
        existing_type=sa.String(length=255),
        existing_nullable=True,
        comment="Client ID del OAuth de Google (capturado en la UI; única fuente: esta fila).",
        existing_comment="Client ID del OAuth de Google (editable en la UI; el entorno actúa como fallback).",
    )


def downgrade() -> None:
    op.alter_column(
        "backup_settings",
        "google_drive_client_id",
        existing_type=sa.String(length=255),
        existing_nullable=True,
        comment="Client ID del OAuth de Google (editable en la UI; el entorno actúa como fallback).",
        existing_comment="Client ID del OAuth de Google (capturado en la UI; única fuente: esta fila).",
    )
