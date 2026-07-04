"""Reportes operativos iniciales (§ Fase 7): ventas por hora y más vendidos.

Fuente: pedidos COMPLETADOS y sus snapshots (nombres/importes congelados) —
el catálogo vigente jamás reconstruye históricos. Agrupación por hora en la
zona horaria del negocio. Cifras = «ventas registradas», no utilidad.
"""

from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone as dt_timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Query
from sqlmodel import select

from backend.app.core.database import SessionDep
from backend.app.models.orders import Order, OrderLine
from backend.app.schemas.report import (
    SalesByHourItem,
    SalesByHourReport,
    TopProductItem,
    TopProductsReport,
)
from backend.app.security.groups.finances import FinancePermissions
from backend.app.services.business_service import business_timezone, get_business_profile

router = APIRouter(prefix="/reports", tags=["reports"])


def _range_bounds(
    session: SessionDep, date_from: Optional[date], date_to: Optional[date]
) -> tuple[date, date, object, datetime, datetime]:
    """Rango [from, to] en días del negocio → límites UTC para consultar."""
    tz = business_timezone(get_business_profile(session))
    today = datetime.now(tz).date()
    start_day = date_from or today
    end_day = date_to or start_day
    if end_day < start_day:
        start_day, end_day = end_day, start_day
    start = datetime.combine(start_day, time.min, tzinfo=tz).astimezone(dt_timezone.utc)
    end = datetime.combine(
        end_day + timedelta(days=1), time.min, tzinfo=tz
    ).astimezone(dt_timezone.utc)
    return start_day, end_day, tz, start, end


def _completed_between(session: SessionDep, start: datetime, end: datetime):
    # utc_now() del dominio es naive-UTC: comparar naive contra naive.
    return session.exec(
        select(Order)
        .where(Order.status == "completed")
        .where(Order.completed_at >= start.replace(tzinfo=None))  # pyright: ignore[reportArgumentType]
        .where(Order.completed_at < end.replace(tzinfo=None))  # pyright: ignore[reportArgumentType]
    ).all()


@router.get("/sales-by-hour", response_model=SalesByHourReport)
def sales_by_hour(
    session: SessionDep,
    _: FinancePermissions.READ.requiere,
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
) -> SalesByHourReport:
    start_day, end_day, tz, start, end = _range_bounds(session, date_from, date_to)
    counts: dict[int, int] = defaultdict(int)
    totals: dict[int, Decimal] = defaultdict(lambda: Decimal("0"))
    for order in _completed_between(session, start, end):
        completed = order.completed_at
        if completed is None:
            continue
        if completed.tzinfo is None:
            completed = completed.replace(tzinfo=dt_timezone.utc)
        hour = completed.astimezone(tz).hour  # type: ignore[arg-type]
        counts[hour] += 1
        totals[hour] += order.total_money_amount or Decimal("0")
    return SalesByHourReport(
        date_from=start_day,
        date_to=end_day,
        timezone=str(tz),
        items=[
            SalesByHourItem(hour=hour, orders_count=counts[hour], money_total=totals[hour])
            for hour in sorted(counts)
        ],
    )


@router.get("/top-products", response_model=TopProductsReport)
def top_products(
    session: SessionDep,
    _: FinancePermissions.READ.requiere,
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    limit: int = Query(default=10, ge=1, le=50),
) -> TopProductsReport:
    start_day, end_day, _tz, start, end = _range_bounds(session, date_from, date_to)
    rows = session.exec(
        select(OrderLine)
        .join(Order, Order.id == OrderLine.order_id)  # pyright: ignore[reportArgumentType]
        .where(Order.status == "completed")
        .where(Order.completed_at >= start.replace(tzinfo=None))  # pyright: ignore[reportArgumentType]
        .where(Order.completed_at < end.replace(tzinfo=None))  # pyright: ignore[reportArgumentType]
    ).all()
    units: dict[str, int] = defaultdict(int)
    money: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    credits: dict[str, int] = defaultdict(int)
    for line in rows:
        name = line.product_name_snapshot
        units[name] += line.quantity
        money[name] += line.money_line_total_amount
        credits[name] += line.credits_redeemed_total
    ranked = sorted(units, key=lambda name: (-units[name], name))[:limit]
    return TopProductsReport(
        date_from=start_day,
        date_to=end_day,
        items=[
            TopProductItem(
                product_name=name,
                units=units[name],
                money_total=money[name],
                credits_redeemed=credits[name],
            )
            for name in ranked
        ],
    )
