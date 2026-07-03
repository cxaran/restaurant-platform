"""Servicio del negocio único: singletons, teléfonos y horario efectivo.

Singletons (§5): ``business_profile`` y ``business_settings`` con el mismo
patrón que ``system_settings_service`` — la migración siembra la fila, aquí hay
get-or-create defensivo y actualización parcial AUDITADA (sólo nombres de
campos, nunca valores).

Horarios (§6): la disponibilidad del día se resuelve con prioridad
``fecha especial → horario semanal → sin horario = cerrado``. Un rango con
``closes_at <= opens_at`` cruza medianoche y pertenece al día en que INICIA:
el estado «abierto» a las 00:30 del domingo puede venir del slot 17:00–01:00
del sábado.
"""

import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any, Optional
from zoneinfo import ZoneInfo

from sqlmodel import Session, select

from backend.app.models.business import (
    BusinessProfile,
    BusinessSettings,
    BusinessSpecialDate,
    BusinessWeeklyHours,
    SINGLETON_ID,
)
from backend.app.services.config_audit import record_config_change
from backend.app.utils.utc_now import utc_now

# entity_id determinístico para auditar los singletons de id entero (=1):
# audit_events.entity_id es UUID; el tipo de entidad distingue perfil de settings.
# El hex incluye letras a propósito: en SQLite (tests) la columna UUID tiene
# afinidad NUMERIC y un hex de puros dígitos se degradaría a entero.
SINGLETON_AUDIT_ID = uuid.UUID("00000000-0000-4000-a000-b051e5510001")

DEFAULT_TRADE_NAME = "Mi Restaurante"
DEFAULT_TIMEZONE = "America/Mexico_City"


# ---------------------------------------------------------------------------
# Singletons
# ---------------------------------------------------------------------------

def get_business_profile(session: Session, *, for_update: bool = False) -> BusinessProfile:
    """Fila singleton del perfil (la migración la siembra; si falta, se crea)."""
    statement = select(BusinessProfile).where(BusinessProfile.id == SINGLETON_ID)
    if for_update:
        statement = statement.with_for_update()
    row = session.exec(statement).first()
    if row is None:
        row = BusinessProfile(id=SINGLETON_ID, trade_name=DEFAULT_TRADE_NAME)
        session.add(row)
        session.flush()
    return row


def get_business_settings(session: Session, *, for_update: bool = False) -> BusinessSettings:
    """Fila singleton de política operativa (sembrada por migración)."""
    statement = select(BusinessSettings).where(BusinessSettings.id == SINGLETON_ID)
    if for_update:
        statement = statement.with_for_update()
    row = session.exec(statement).first()
    if row is None:
        row = BusinessSettings(id=SINGLETON_ID)
        session.add(row)
        session.flush()
    return row


def apply_singleton_update(
    session: Session,
    row: BusinessProfile | BusinessSettings,
    changes: dict[str, Any],
    *,
    actor_user_id: Optional[uuid.UUID],
) -> list[str]:
    """Aplica un PATCH parcial al singleton y audita los campos cambiados.

    ``changes`` viene de ``model_dump(exclude_unset=True)`` del schema PATCH:
    sólo campos enviados. Devuelve los nombres realmente modificados.
    """
    changed: list[str] = []
    for field, value in changes.items():
        if getattr(row, field) != value:
            setattr(row, field, value)
            changed.append(field)

    if changed:
        row.updated_at = utc_now()
        session.add(row)
        record_config_change(
            session,
            actor_user_id=actor_user_id,
            entity_type=row.__tablename__,
            entity_id=SINGLETON_AUDIT_ID,
            action="update",
            changed_fields=sorted(changed),
        )
        session.flush()
    return changed


def business_timezone(profile: BusinessProfile) -> ZoneInfo:
    """Zona horaria del negocio con degradación segura al default."""
    try:
        return ZoneInfo(profile.timezone)
    except (KeyError, ValueError):
        return ZoneInfo(DEFAULT_TIMEZONE)


# ---------------------------------------------------------------------------
# Horario efectivo
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class DaySchedule:
    """Horario efectivo de UNA fecha: de dónde salió y sus rangos."""

    source: str  # "special" | "weekly" | "none"
    slots: tuple[tuple[time, time], ...]  # (opens_at, closes_at), orden por slot


def effective_schedule_for_date(session: Session, day: date) -> DaySchedule:
    """Prioridad §6.3: fecha especial → semanal → cerrado.

    Una fecha especial cerrada gana siempre. Una fecha especial abierta usa SUS
    slots; si no tiene slots (sólo registra un motivo) se cae al horario
    semanal para no dejar el día cerrado por accidente.
    """
    special = session.exec(
        select(BusinessSpecialDate).where(BusinessSpecialDate.calendar_date == day)
    ).first()
    if special is not None:
        if special.is_closed:
            return DaySchedule(source="special", slots=())
        slot_rows = sorted(special.slots, key=lambda s: s.slot_number)
        if slot_rows:
            return DaySchedule(
                source="special",
                slots=tuple((s.opens_at, s.closes_at) for s in slot_rows),
            )

    weekly = session.exec(
        select(BusinessWeeklyHours)
        .where(BusinessWeeklyHours.day_of_week == day.weekday())
        .where(BusinessWeeklyHours.is_active == True)  # noqa: E712
        .order_by(BusinessWeeklyHours.slot_number)  # pyright: ignore[reportArgumentType]
    ).all()
    if weekly:
        return DaySchedule(
            source="weekly",
            slots=tuple((s.opens_at, s.closes_at) for s in weekly),
        )
    return DaySchedule(source="none", slots=())


def _slot_covers(opens: time, closes: time, t: time, *, overnight_tail: bool) -> bool:
    crosses_midnight = closes <= opens
    if overnight_tail:
        # Cola de un slot nocturno del día ANTERIOR: sólo aplica la parte t < closes.
        return crosses_midnight and t < closes
    if crosses_midnight:
        return t >= opens
    return opens <= t < closes


def is_open_at(session: Session, moment: datetime) -> bool:
    """¿El negocio está abierto en ese instante? (``moment`` consciente de tz;
    naive se interpreta en la zona del negocio)."""
    profile = get_business_profile(session)
    tz = business_timezone(profile)
    local = moment.astimezone(tz) if moment.tzinfo is not None else moment.replace(tzinfo=tz)
    t = local.time()
    today = local.date()

    for opens, closes in effective_schedule_for_date(session, today).slots:
        if _slot_covers(opens, closes, t, overnight_tail=False):
            return True

    # Cola nocturna del día anterior (ej. sábado 17:00–01:00 cubre domingo 00:30).
    yesterday = today - timedelta(days=1)
    for opens, closes in effective_schedule_for_date(session, yesterday).slots:
        if _slot_covers(opens, closes, t, overnight_tail=True):
            return True
    return False


def is_open_now(session: Session) -> bool:
    """Estado abierto/cerrado AHORA en la zona horaria del negocio."""
    profile = get_business_profile(session)
    return is_open_at(session, datetime.now(business_timezone(profile)))
