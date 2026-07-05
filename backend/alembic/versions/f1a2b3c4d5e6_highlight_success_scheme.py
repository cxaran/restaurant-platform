"""Esquema de color «success» para destacados (chips de confianza del checkout).

Amplía el CHECK de ``storefront_highlights.color_scheme`` para admitir
``success`` (tono verde), usado en los chips de «Pago seguro» del checkout
(Turno 11c). Cambio aditivo: no toca filas existentes.

Revision ID: f1a2b3c4d5e6
Revises: e5b93a47c210
Create Date: 2026-07-04
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "e5b93a47c210"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CONSTRAINT = "storefront_highlights_color_scheme"
_TABLE = "storefront_highlights"


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_constraint(_CONSTRAINT, _TABLE, type_="check")
    op.create_check_constraint(
        _CONSTRAINT,
        _TABLE,
        "color_scheme IN ('brand', 'soft', 'accent', 'success')",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(_CONSTRAINT, _TABLE, type_="check")
    op.create_check_constraint(
        _CONSTRAINT,
        _TABLE,
        "color_scheme IN ('brand', 'soft', 'accent')",
    )
