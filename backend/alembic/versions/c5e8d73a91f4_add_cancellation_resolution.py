"""H5 (§1.6 GOALS): resolución financiera explícita al cancelar con cobro.

``orders.cancellation_money_resolution`` (refund_now | refund_pending | retain)
y ``orders.cancellation_resolution_note``. Cancelar nunca reembolsa: la
resolución registra la decisión y alimenta la cola de conciliación
(`GET /orders/cancellations/pending-refunds`). «retain» exige motivo (CHECK).
El histórico queda NULL (cancelaciones previas a la regla).

Revision ID: c5e8d73a91f4
Revises: b3f7a91d64c2
Create Date: 2026-07-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c5e8d73a91f4"
down_revision: Union[str, Sequence[str], None] = "b3f7a91d64c2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "orders",
        sa.Column(
            "cancellation_money_resolution",
            sa.String(length=20),
            nullable=True,
            comment="H5: refund_now | refund_pending | retain; sólo al cancelar con cobro.",
        ),
    )
    op.add_column(
        "orders",
        sa.Column(
            "cancellation_resolution_note",
            sa.Text(),
            nullable=True,
            comment="Motivo de la resolución (obligatorio al retener).",
        ),
    )
    op.create_check_constraint(
        "orders_cancel_resolution",
        "orders",
        "cancellation_money_resolution IS NULL OR "
        "cancellation_money_resolution IN ('refund_now', 'refund_pending', 'retain')",
    )
    op.create_check_constraint(
        "orders_retain_requires_note",
        "orders",
        "cancellation_money_resolution != 'retain' "
        "OR cancellation_resolution_note IS NOT NULL",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("orders_retain_requires_note", "orders", type_="check")
    op.drop_constraint("orders_cancel_resolution", "orders", type_="check")
    op.drop_column("orders", "cancellation_resolution_note")
    op.drop_column("orders", "cancellation_money_resolution")
