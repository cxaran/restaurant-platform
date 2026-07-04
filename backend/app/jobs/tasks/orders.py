"""Tick de pedidos: expira pedidos web «submitted» abandonados (§1.12).

Como los respaldos, el cron sólo consulta trabajo vencido en
la base cada minuto. Expirar cancela con ``reason_code=expired``: los hooks de
la transición liberan créditos reservados y códigos de descuento, y el cupo
diario se libera porque los cancelados no cuentan. Nunca hay reembolso
automático; un pedido con dinero cobrado queda para revisión humana (H5).
"""

import asyncio

from sqlmodel import Session

from backend.app.core.database import engine
from backend.app.services.order_service import expire_abandoned_submitted
from backend.app.taskiq_app import broker


def _run_expire() -> None:
    with Session(engine) as session:
        expired = expire_abandoned_submitted(session)
        if expired:
            session.commit()


@broker.task(
    task_name="orders.expire_submitted",
    schedule=[
        {
            "cron": "* * * * *",
            "cron_offset": "UTC",
            "schedule_id": "orders.expire_submitted.v1",
        }
    ],
)
async def orders_expire_submitted() -> None:
    await asyncio.to_thread(_run_expire)
