"""Reportes iniciales del dashboard (§ Fase 7): SIEMPRE desde snapshots.

Los números salen de ``orders``/``order_lines`` históricos — jamás se
reconstruyen con el catálogo vigente. El lenguaje es «ventas registradas»:
sin costos de receta/inventario no se promete utilidad exacta.
"""

from datetime import date
from decimal import Decimal

from backend.app.schemas.base import ApiReadSchema


class SalesByHourItem(ApiReadSchema):
    hour: int
    orders_count: int
    money_total: Decimal


class SalesByHourReport(ApiReadSchema):
    date_from: date
    date_to: date
    timezone: str
    items: list[SalesByHourItem]


class TopProductItem(ApiReadSchema):
    product_name: str
    units: int
    money_total: Decimal
    credits_redeemed: int


class TopProductsReport(ApiReadSchema):
    date_from: date
    date_to: date
    items: list[TopProductItem]
