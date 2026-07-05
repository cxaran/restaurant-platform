# Tareas en segundo plano (Taskiq sobre PostgreSQL)

Trabajo fuera del ciclo request/response **sin Redis ni Celery**: la cola vive
en la misma base PostgreSQL, en canal y tabla propios del broker
(`restaurant_platform_taskiq*` — la crea el broker, no Alembic).

## Principio arquitectónico

```
proceso FastAPI                 procesos Taskiq (profile "taskiq")
──────────────                  ──────────────────────────────────
publica (kick)                  taskiq-worker    → ejecuta tareas
   task.kiq() ──► PostgreSQL ◄─ taskiq-scheduler → encola las programadas (cron)
                 (tabla del broker)
```

FastAPI **nunca** levanta worker ni scheduler: son servicios Docker opt-in. El
lifespan de la API solo inicia el broker para *publicar* (y un fallo del broker
no impide arrancar la API). El encolado desde la API debe ser **no fatal**: la
verdad vive en la base y el tick procesa lo pendiente aunque el kick falle.

## Tareas registradas (todas en `backend/app/jobs/tasks/`)

| Tarea | Cron | Qué hace |
|---|---|---|
| `backups.tick` | por minuto | Procesa respaldos VENCIDOS según `backup_settings.next_run_at` (horario editable en BD) |
| `orders.expire_submitted` | por minuto | Cancela pedidos web `submitted` abandonados (60 min, sin cobros): libera créditos, códigos y cupo |
| `notifications.tick` | por minuto | Despacha correos pendientes de la cola de notificaciones (`FOR UPDATE SKIP LOCKED` — convive con el hilo post-commit sin duplicar) |
| `deliveries.purge_location_events` | por minuto | Purga eventos de ubicación de repartidores fuera de retención |

**Patrón obligatorio para horarios editables**: cron FIJO barato que consulta
la verdad en PostgreSQL (como los cuatro de arriba) — nunca schedules
dinámicos. Cambiar el horario real no requiere reiniciar nada.

## Ejecutar

```bash
docker compose -f compose.dev.yml --profile taskiq up taskiq-worker taskiq-scheduler
# producción: docker compose --profile taskiq up -d taskiq-worker taskiq-scheduler
```

- Worker: `taskiq worker backend.app.taskiq_app:broker --workers 1 --max-async-tasks 1`
- Scheduler: `taskiq scheduler backend.app.taskiq_app:scheduler --skip-first-run`
  — **una sola réplica** del scheduler.
- Primer arranque: si worker y scheduler crean la tabla del broker a la vez,
  Postgres puede lanzar `UniqueViolation` transitorio; el `restart` lo absorbe.

## Registrar una tarea nueva

1. Módulo en `backend/app/jobs/tasks/` con `@broker.task(task_name="area.nombre")`
   e **importarlo al final** de `backend/app/taskiq_app.py` (registro explícito).
2. Si es programada: `schedule=[{"cron": "...", "cron_offset": "UTC",
   "schedule_id": "area.nombre.vN"}]` como label.
3. Argumentos/resultados **sin datos sensibles ni texto libre**: referencias
   mínimas (ids). Nada de secretos en logs (el DSN lleva contraseña: no
   loguearlo).
4. Para despertar desde la API: `await mi_tarea.kiq(...)` — best-effort.

## Fuera de alcance (deliberado)

Result backend, schedules dinámicos en BD, Redis/Celery/RabbitMQ y
`taskiq-fastapi`. Tests: `backend/tests/test_taskiq_app.py` (la integración
real del broker requiere `TEST_POSTGRES_URL`).
