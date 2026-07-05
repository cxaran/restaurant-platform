"""Interruptor del programa de créditos/puntos en business_settings.

``business_settings.credits_enabled`` activa/desactiva el sistema de créditos:
apagado no se emiten créditos, no se muestran en el sitio ni se permite pagar
con ellos. Los saldos existentes se conservan (ledger inmutable). Se siembra en
true para no cambiar el comportamiento vigente.

Revision ID: a2c9f47b81e3
Revises: f1a2b3c4d5e6
Create Date: 2026-07-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a2c9f47b81e3"
down_revision: Union[str, Sequence[str], None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "business_settings",
        sa.Column(
            "credits_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
            comment=(
                "Programa de créditos/puntos. Apagado: no se emiten créditos, no se "
                "muestran en el sitio y no se permite pagar con créditos. Los saldos "
                "existentes se conservan (ledger inmutable)."
            ),
        ),
    )
    # El default a nivel app (default=True) gobierna las filas nuevas; el
    # server_default sólo sirvió para sembrar la fila singleton existente.
    op.alter_column("business_settings", "credits_enabled", server_default=None)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("business_settings", "credits_enabled")
