"""Supersesión de publicación programada (§1.9 GOALS / Etapa 6 RC).

``storefront_page_revisions.scheduled_at`` registra CUÁNDO se programó la
revisión: si otra revisión se publica después de ese instante, la programación
vieja se cancela sola y ``schedule_cancelled_reason`` guarda la razón legible
que ve el editor. Nada de esto toca revisiones publicadas.

Revision ID: e2a9c56b41d7
Revises: d81c4f26ae93
Create Date: 2026-07-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e2a9c56b41d7"
down_revision: Union[str, Sequence[str], None] = "d81c4f26ae93"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "storefront_page_revisions",
        sa.Column(
            "scheduled_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Cuándo se PROGRAMÓ (regla de supersesión §1.9: una publicación posterior la cancela).",
        ),
    )
    op.add_column(
        "storefront_page_revisions",
        sa.Column(
            "schedule_cancelled_reason",
            sa.String(length=200),
            nullable=True,
            comment="Razón legible cuando la programación se canceló automáticamente.",
        ),
    )
    # Programaciones ya en vuelo: se asume que se programaron "ahora" — la
    # regla de supersesión sólo compara contra publicaciones FUTURAS.
    op.execute(
        "UPDATE storefront_page_revisions SET scheduled_at = now() "
        "WHERE status = 'scheduled' AND scheduled_at IS NULL"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("storefront_page_revisions", "schedule_cancelled_reason")
    op.drop_column("storefront_page_revisions", "scheduled_at")
