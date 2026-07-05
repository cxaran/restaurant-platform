"""Configuración del negocio (panel interno) bajo ``business:read``/``business:update``.

Singletons de perfil y política (PATCH parcial auditado con nombres de campos),
teléfonos (a lo sumo un principal activo), horario semanal (reemplazo atómico
completo) y fechas especiales con slots. El endpoint público del sitio vive en
``public_site.py`` y no usa permisos.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, status
from sqlmodel import select

from backend.app.api.resource_actions import (
    api_error,
    commit_or_conflict,
    get_or_404,
    serialize,
    serialize_many,
)
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.models.business import (
    BusinessPhone,
    BusinessSpecialDate,
    BusinessSpecialDateSlot,
    BusinessWeeklyHours,
)
from backend.app.schemas.business import (
    BusinessPhoneCreate,
    BusinessPhoneRead,
    BusinessPhoneUpdate,
    BusinessProfileRead,
    BusinessProfileUpdate,
    BusinessSettingsRead,
    BusinessSettingsUpdate,
    SpecialDateCreate,
    SpecialDateRead,
    SpecialDateUpdate,
    WeeklyHourRead,
    WeeklyHoursReplace,
)
from backend.app.security.groups.business import BusinessPermissions
from backend.app.services.business_service import (
    SINGLETON_AUDIT_ID,
    apply_singleton_update,
    get_business_profile,
    get_business_settings,
)
from backend.app.services.config_audit import record_config_change
from backend.app.services.file_service import get_active_file
from backend.app.utils.phone import normalize_phone
from backend.app.utils.utc_now import utc_now

router = APIRouter(prefix="/business", tags=["business"])

_PHONE_NOT_FOUND = "Teléfono no encontrado"
_SPECIAL_DATE_NOT_FOUND = "Fecha especial no encontrada"


# ---------------------------------------------------------------------------
# Singletons: perfil y política operativa
# ---------------------------------------------------------------------------

@router.get("/profile", response_model=BusinessProfileRead)
def read_profile(session: SessionDep, _: BusinessPermissions.READ.requiere) -> BusinessProfileRead:
    return serialize(BusinessProfileRead, get_business_profile(session))


@router.patch("/profile", response_model=BusinessProfileRead)
def update_profile(
    payload: BusinessProfileUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: BusinessPermissions.UPDATE.requiere,
) -> BusinessProfileRead:
    changes = payload.model_dump(exclude_unset=True)
    logo_file_id = changes.get("logo_file_id")
    if logo_file_id is not None and get_active_file(session, logo_file_id) is None:
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "archivo_no_encontrado",
            "El archivo del logo no existe o está inactivo.",
        )
    profile = get_business_profile(session, for_update=True)
    apply_singleton_update(session, profile, changes, actor_user_id=current_user.id)
    commit_or_conflict(session, "No fue posible guardar el perfil del negocio.")
    return serialize(BusinessProfileRead, get_business_profile(session))


@router.get("/settings", response_model=BusinessSettingsRead)
def read_settings(session: SessionDep, _: BusinessPermissions.READ.requiere) -> BusinessSettingsRead:
    return serialize(BusinessSettingsRead, get_business_settings(session))


@router.patch("/settings", response_model=BusinessSettingsRead)
def update_settings(
    payload: BusinessSettingsUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: BusinessPermissions.UPDATE.requiere,
) -> BusinessSettingsRead:
    changes = payload.model_dump(exclude_unset=True)
    settings_row = get_business_settings(session, for_update=True)
    apply_singleton_update(session, settings_row, changes, actor_user_id=current_user.id)
    commit_or_conflict(session, "No fue posible guardar la política del negocio.")
    return serialize(BusinessSettingsRead, get_business_settings(session))


# ---------------------------------------------------------------------------
# Teléfonos
# ---------------------------------------------------------------------------

def _clear_primary_phone(session: SessionDep, *, except_id: Optional[uuid.UUID] = None) -> None:
    rows = session.exec(
        select(BusinessPhone).where(
            BusinessPhone.is_primary == True,  # noqa: E712
            BusinessPhone.is_active == True,  # noqa: E712
        )
    ).all()
    for row in rows:
        if except_id is not None and row.id == except_id:
            continue
        row.is_primary = False
        row.updated_at = utc_now()
        session.add(row)


@router.get("/phones", response_model=list[BusinessPhoneRead])
def list_phones(session: SessionDep, _: BusinessPermissions.READ.requiere) -> list[BusinessPhoneRead]:
    rows = session.exec(
        select(BusinessPhone).order_by(
            BusinessPhone.sort_order,  # pyright: ignore[reportArgumentType]
            BusinessPhone.created_at,  # pyright: ignore[reportArgumentType]
        )
    ).all()
    return serialize_many(BusinessPhoneRead, rows)


@router.post("/phones", response_model=BusinessPhoneRead, status_code=status.HTTP_201_CREATED)
def create_phone(
    payload: BusinessPhoneCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: BusinessPermissions.UPDATE.requiere,
) -> BusinessPhoneRead:
    normalized = normalize_phone(payload.phone)
    if len(normalized) < 7:
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "telefono_invalido",
            "El teléfono debe contener al menos 7 dígitos.",
        )
    if payload.is_primary:
        _clear_primary_phone(session)
    phone = BusinessPhone(
        **payload.model_dump(),
        phone_normalized=normalized,
    )
    session.add(phone)
    session.flush()
    record_config_change(
        session,
        actor_user_id=current_user.id,
        entity_type="business_phones",
        entity_id=phone.id,
        action="create",
        changed_fields=sorted(payload.model_dump().keys()),
    )
    commit_or_conflict(session, "Ya existe un teléfono principal activo.")
    session.refresh(phone)
    return serialize(BusinessPhoneRead, phone)


@router.patch("/phones/{phone_id}", response_model=BusinessPhoneRead)
def update_phone(
    phone_id: uuid.UUID,
    payload: BusinessPhoneUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: BusinessPermissions.UPDATE.requiere,
) -> BusinessPhoneRead:
    phone = get_or_404(session, BusinessPhone, phone_id, _PHONE_NOT_FOUND)
    changes = payload.model_dump(exclude_unset=True)

    if "phone" in changes:
        normalized = normalize_phone(changes["phone"])
        if len(normalized) < 7:
            api_error(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "telefono_invalido",
                "El teléfono debe contener al menos 7 dígitos.",
            )
        changes["phone_normalized"] = normalized
    if changes.get("is_primary"):
        _clear_primary_phone(session, except_id=phone.id)

    for field, value in changes.items():
        setattr(phone, field, value)
    phone.updated_at = utc_now()
    session.add(phone)
    record_config_change(
        session,
        actor_user_id=current_user.id,
        entity_type="business_phones",
        entity_id=phone.id,
        action="update",
        changed_fields=sorted(changes.keys()),
    )
    commit_or_conflict(session, "Ya existe un teléfono principal activo.")
    session.refresh(phone)
    return serialize(BusinessPhoneRead, phone)


@router.delete("/phones/{phone_id}", response_model=BusinessPhoneRead)
def deactivate_phone(
    phone_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: BusinessPermissions.UPDATE.requiere,
) -> BusinessPhoneRead:
    phone = get_or_404(session, BusinessPhone, phone_id, _PHONE_NOT_FOUND)
    if not phone.is_active:
        api_error(status.HTTP_409_CONFLICT, "telefono_inactivo", "El teléfono ya está inactivo.")
    phone.is_active = False
    phone.updated_at = utc_now()
    session.add(phone)
    record_config_change(
        session,
        actor_user_id=current_user.id,
        entity_type="business_phones",
        entity_id=phone.id,
        action="deactivate",
        changed_fields=["is_active"],
    )
    commit_or_conflict(session, "No fue posible desactivar el teléfono.")
    session.refresh(phone)
    return serialize(BusinessPhoneRead, phone)


# ---------------------------------------------------------------------------
# Horario semanal (reemplazo atómico completo, §13: transacción única)
# ---------------------------------------------------------------------------

@router.get("/weekly-hours", response_model=list[WeeklyHourRead])
def list_weekly_hours(
    session: SessionDep, _: BusinessPermissions.READ.requiere
) -> list[WeeklyHourRead]:
    rows = session.exec(
        select(BusinessWeeklyHours).order_by(
            BusinessWeeklyHours.day_of_week,  # pyright: ignore[reportArgumentType]
            BusinessWeeklyHours.slot_number,  # pyright: ignore[reportArgumentType]
        )
    ).all()
    return serialize_many(WeeklyHourRead, rows)


@router.put("/weekly-hours", response_model=list[WeeklyHourRead])
def replace_weekly_hours(
    payload: WeeklyHoursReplace,
    session: SessionDep,
    current_user: CurrentUser,
    _: BusinessPermissions.UPDATE.requiere,
) -> list[WeeklyHourRead]:
    seen: set[tuple[int, int]] = set()
    for slot in payload.slots:
        key = (slot.day_of_week, slot.slot_number)
        if key in seen:
            api_error(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "slot_duplicado",
                f"Slot duplicado para el día {slot.day_of_week} (slot {slot.slot_number}).",
            )
        seen.add(key)

    existing = session.exec(select(BusinessWeeklyHours)).all()
    for row in existing:
        session.delete(row)
    # Emitir los DELETE antes de los INSERT: sin este flush, el unit of work de
    # SQLAlchemy puede ordenar el INSERT de una (day_of_week, slot_number) que
    # reutiliza una clave aún pendiente de borrar y viola el UniqueConstraint
    # (por eso solo fallaba al REEMPLAZAR un horario existente, no al crearlo).
    session.flush()
    for slot in payload.slots:
        session.add(
            BusinessWeeklyHours(
                day_of_week=slot.day_of_week,
                slot_number=slot.slot_number,
                opens_at=slot.opens_at,
                closes_at=slot.closes_at,
            )
        )
    record_config_change(
        session,
        actor_user_id=current_user.id,
        entity_type="business_weekly_hours",
        entity_id=SINGLETON_AUDIT_ID,
        action="replace",
        changed_fields=["slots"],
    )
    commit_or_conflict(session, "No fue posible guardar el horario semanal.")
    return list_weekly_hours(session, True)  # type: ignore[arg-type]  # permiso ya validado


# ---------------------------------------------------------------------------
# Fechas especiales
# ---------------------------------------------------------------------------

def _serialize_special_date(row: BusinessSpecialDate) -> SpecialDateRead:
    ordered = sorted(row.slots, key=lambda s: s.slot_number)
    return SpecialDateRead(
        id=row.id,
        calendar_date=row.calendar_date,
        is_closed=row.is_closed,
        reason=row.reason,
        slots=[
            {"slot_number": s.slot_number, "opens_at": s.opens_at, "closes_at": s.closes_at}  # type: ignore[list-item]
            for s in ordered
        ],
    )


def _validate_slot_numbers(slots: list) -> None:
    numbers = [slot.slot_number for slot in slots]
    if len(numbers) != len(set(numbers)):
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "slot_duplicado",
            "Los slots de la fecha tienen números repetidos.",
        )


@router.get("/special-dates", response_model=list[SpecialDateRead])
def list_special_dates(
    session: SessionDep, _: BusinessPermissions.READ.requiere
) -> list[SpecialDateRead]:
    rows = session.exec(
        select(BusinessSpecialDate).order_by(
            BusinessSpecialDate.calendar_date  # pyright: ignore[reportArgumentType]
        )
    ).all()
    return [_serialize_special_date(row) for row in rows]


@router.post("/special-dates", response_model=SpecialDateRead, status_code=status.HTTP_201_CREATED)
def create_special_date(
    payload: SpecialDateCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: BusinessPermissions.UPDATE.requiere,
) -> SpecialDateRead:
    _validate_slot_numbers(payload.slots)
    row = BusinessSpecialDate(
        calendar_date=payload.calendar_date,
        is_closed=payload.is_closed,
        reason=payload.reason,
    )
    session.add(row)
    session.flush()
    for slot in payload.slots:
        session.add(
            BusinessSpecialDateSlot(
                special_date_id=row.id,
                slot_number=slot.slot_number,
                opens_at=slot.opens_at,
                closes_at=slot.closes_at,
            )
        )
    record_config_change(
        session,
        actor_user_id=current_user.id,
        entity_type="business_special_dates",
        entity_id=row.id,
        action="create",
        changed_fields=["calendar_date", "is_closed", "reason", "slots"],
    )
    commit_or_conflict(session, "Ya existe una fecha especial para ese día.")
    session.refresh(row)
    return _serialize_special_date(row)


@router.patch("/special-dates/{special_date_id}", response_model=SpecialDateRead)
def update_special_date(
    special_date_id: uuid.UUID,
    payload: SpecialDateUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: BusinessPermissions.UPDATE.requiere,
) -> SpecialDateRead:
    row = get_or_404(session, BusinessSpecialDate, special_date_id, _SPECIAL_DATE_NOT_FOUND)
    changes = payload.model_dump(exclude_unset=True)
    slots = changes.pop("slots", None)

    for field, value in changes.items():
        setattr(row, field, value)
    if slots is not None:
        _validate_slot_numbers(payload.slots or [])
        for slot_row in list(row.slots):
            session.delete(slot_row)
        for slot in payload.slots or []:
            session.add(
                BusinessSpecialDateSlot(
                    special_date_id=row.id,
                    slot_number=slot.slot_number,
                    opens_at=slot.opens_at,
                    closes_at=slot.closes_at,
                )
            )
    row.updated_at = utc_now()
    session.add(row)
    record_config_change(
        session,
        actor_user_id=current_user.id,
        entity_type="business_special_dates",
        entity_id=row.id,
        action="update",
        changed_fields=sorted([*changes.keys(), *(["slots"] if slots is not None else [])]),
    )
    commit_or_conflict(session, "No fue posible guardar la fecha especial.")
    session.refresh(row)
    return _serialize_special_date(row)


@router.delete("/special-dates/{special_date_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_special_date(
    special_date_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: BusinessPermissions.UPDATE.requiere,
) -> None:
    # Configuración futura sin histórico económico: la eliminación física es válida
    # aquí (a diferencia de pedidos/pagos, §2). El evento queda auditado.
    row = get_or_404(session, BusinessSpecialDate, special_date_id, _SPECIAL_DATE_NOT_FOUND)
    record_config_change(
        session,
        actor_user_id=current_user.id,
        entity_type="business_special_dates",
        entity_id=row.id,
        action="delete",
        changed_fields=["calendar_date"],
    )
    session.delete(row)
    commit_or_conflict(session, "No fue posible eliminar la fecha especial.")
