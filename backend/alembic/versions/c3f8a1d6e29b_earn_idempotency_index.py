"""Índice de idempotencia del EARN de créditos (un earn por línea de pedido).

Blinda a nivel BASE la emisión de créditos ganados: hasta ahora la no-duplicación
la garantizaba solo la máquina de estados (``completed`` es terminal), sin un
índice único como sí tienen reserva/liberación/reembolso/reversión. Este índice
parcial cierra esa fragilidad ante cualquier cambio futuro en ORDER_TRANSITIONS o
reintento concurrente. El earn siempre lleva ``order_line_id`` (nunca NULL).

Revision ID: c3f8a1d6e29b
Revises: b7d4e29c63f1
Create Date: 2026-07-04
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3f8a1d6e29b"
down_revision: Union[str, Sequence[str], None] = "b7d4e29c63f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "uq_credit_ledger_earn_per_line",
        "credit_ledger_entries",
        ["order_line_id"],
        unique=True,
        postgresql_where=sa.text("entry_type = 'earn'"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_credit_ledger_earn_per_line", table_name="credit_ledger_entries"
    )
