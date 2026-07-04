"""Pedido íntegro (§1.3 GOALS): modo de compra a nivel PEDIDO (money XOR credits).

Agrega ``orders.purchase_mode`` con backfill derivado de los datos históricos:
un pedido es ``credits`` sólo si canjeó créditos y no movió dinero; todo lo
demás (incluidos los híbridos históricos previos a esta regla) queda como
``money``. Los CHECK sólo restringen pedidos ``credits`` (sin dinero, con
cliente), así que el histórico monetario nunca viola la constraint. La
homogeneidad de líneas de pedidos NUEVOS la impone pricing_service.

Revision ID: b3f7a91d64c2
Revises: e8b2c47f91a3
Create Date: 2026-07-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b3f7a91d64c2"
down_revision: Union[str, Sequence[str], None] = "e8b2c47f91a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "orders",
        sa.Column(
            "purchase_mode",
            sa.String(length=20),
            nullable=False,
            server_default="money",
            comment="Modo íntegro del pedido: money o credits — nunca híbrido (§1.3).",
        ),
    )
    # Backfill: sólo los pedidos 100% canje (con créditos canjeados y CERO
    # dinero en subtotal/envío/total) se marcan como credits.
    op.execute(
        """
        UPDATE orders
        SET purchase_mode = 'credits'
        WHERE credits_redeemed_total > 0
          AND items_subtotal_amount = 0
          AND discount_total_amount = 0
          AND COALESCE(shipping_total_amount, 0) = 0
          AND COALESCE(total_money_amount, 0) = 0
          AND customer_user_id IS NOT NULL
        """
    )
    op.create_check_constraint(
        "orders_purchase_mode", "orders", "purchase_mode IN ('money', 'credits')"
    )
    op.create_check_constraint(
        "orders_credits_mode_no_money",
        "orders",
        "purchase_mode != 'credits' OR ("
        "items_subtotal_amount = 0 "
        "AND discount_total_amount = 0 "
        "AND (shipping_total_amount IS NULL OR shipping_total_amount = 0) "
        "AND (total_money_amount IS NULL OR total_money_amount = 0) "
        "AND customer_user_id IS NOT NULL"
        ")",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("orders_credits_mode_no_money", "orders", type_="check")
    op.drop_constraint("orders_purchase_mode", "orders", type_="check")
    op.drop_column("orders", "purchase_mode")
