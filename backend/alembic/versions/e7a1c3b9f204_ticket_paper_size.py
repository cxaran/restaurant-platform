"""Ajustes del negocio: tamaño de hoja del ticket PDF (recibo térmico).

``ticket_paper_size`` (58/80 mm) define el ancho del PDF que se envía por correo
al completar el pedido. NOT NULL con default 'thermal_80'; la impresión del
frontend (58 mm) es independiente y no cambia.

Revision ID: e7a1c3b9f204
Revises: d6f2a8c41b93
Create Date: 2026-07-06
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e7a1c3b9f204"
down_revision: Union[str, Sequence[str], None] = "d6f2a8c41b93"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "business_settings",
        sa.Column(
            "ticket_paper_size",
            sa.String(length=16),
            nullable=False,
            server_default="thermal_80",
        ),
    )
    op.create_check_constraint(
        "business_settings_ticket_paper_size",
        "business_settings",
        "ticket_paper_size in ('thermal_58', 'thermal_80')",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        "business_settings_ticket_paper_size", "business_settings", type_="check"
    )
    op.drop_column("business_settings", "ticket_paper_size")
