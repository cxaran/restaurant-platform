"""Tick del storefront: publica revisiones PROGRAMADAS vencidas (§48).

La programación se guarda en la base (``scheduled_publish_at``) — como los
respaldos, el cron sólo consulta trabajo vencido cada minuto. Una revisión que
ya no valida vuelve a borrador (el editor la ve), nunca se reintenta a ciegas.
"""

import asyncio

from sqlmodel import Session

from backend.app.core.database import engine
from backend.app.services.storefront_service import publish_due_scheduled
from backend.app.taskiq_app import broker


def _run_publish_due() -> None:
    with Session(engine) as session:
        published = publish_due_scheduled(session)
        if published:
            session.commit()


@broker.task(
    task_name="storefront.publish_scheduled",
    schedule=[
        {
            "cron": "* * * * *",
            "cron_offset": "UTC",
            "schedule_id": "storefront.publish_scheduled.v1",
        }
    ],
)
async def storefront_publish_scheduled() -> None:
    await asyncio.to_thread(_run_publish_due)
