"""order_shipping: zona/tarifa con ON DELETE SET NULL.

El historial del pedido vive en los snapshots (``delivery_zone_name_snapshot``,
``shipping_rate_name_snapshot``) y en los montos congelados: la zona/tarifa viva
no forma parte del historial. Con RESTRICT una zona con pedidos jamás podía
eliminarse; ahora el borrado deja la referencia en NULL sin tocar lo cobrado.

Revision ID: a1d5f83c72e9
Revises: f9b3e61a24c8
Create Date: 2026-07-04 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1d5f83c72e9"
down_revision: Union[str, Sequence[str], None] = "f9b3e61a24c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ZONE_FK = "fk_order_shipping_delivery_zone_id_delivery_zones"
_RATE_FK = "fk_order_shipping_shipping_rate_rule_id_shipping_rate_rules"


def upgrade() -> None:
    op.drop_constraint(op.f(_ZONE_FK), "order_shipping", type_="foreignkey")
    op.create_foreign_key(
        op.f(_ZONE_FK),
        "order_shipping",
        "delivery_zones",
        ["delivery_zone_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.drop_constraint(op.f(_RATE_FK), "order_shipping", type_="foreignkey")
    op.create_foreign_key(
        op.f(_RATE_FK),
        "order_shipping",
        "shipping_rate_rules",
        ["shipping_rate_rule_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    # RESTRICT de vuelta: falla si ya existen referencias huérfanas (esperado).
    op.drop_constraint(op.f(_RATE_FK), "order_shipping", type_="foreignkey")
    op.create_foreign_key(
        op.f(_RATE_FK),
        "order_shipping",
        "shipping_rate_rules",
        ["shipping_rate_rule_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.drop_constraint(op.f(_ZONE_FK), "order_shipping", type_="foreignkey")
    op.create_foreign_key(
        op.f(_ZONE_FK),
        "order_shipping",
        "delivery_zones",
        ["delivery_zone_id"],
        ["id"],
        ondelete="RESTRICT",
    )
