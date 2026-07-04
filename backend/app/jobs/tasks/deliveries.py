"""Tick de reparto: purga de eventos de ubicación viejos (§19.4).

La ubicación histórica del repartidor es TEMPORAL por política de privacidad:
el cliente sólo ve la más reciente y los eventos se eliminan pasadas 72 horas.
Cada hora es más que suficiente; cuando no hay eventos vencidos, no hace nada.
"""

import asyncio

from sqlmodel import Session

from backend.app.core.database import engine
from backend.app.services.delivery_service import purge_location_events
from backend.app.taskiq_app import broker


def _run_purge() -> None:
    with Session(engine) as session:
        deleted = purge_location_events(session)
        if deleted:
            session.commit()


@broker.task(
    task_name="deliveries.purge_location_events",
    schedule=[
        {
            "cron": "13 * * * *",
            "cron_offset": "UTC",
            "schedule_id": "deliveries.purge_location_events.v1",
        }
    ],
)
async def deliveries_purge_location_events() -> None:
    await asyncio.to_thread(_run_purge)
