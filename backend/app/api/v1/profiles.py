"""Perfiles 1:1 (§8.2/§8.4): búsqueda de clientes y gestión operativa del personal.

Desbloquea la operación: buscar cliente por teléfono al capturar pedidos, dar
capacidad de reparto (``can_deliver``) y la disponibilidad del propio repartidor.
La identidad y los roles siguen en ``users``; aquí sólo vive la extensión.
"""

import re
import uuid
from typing import Optional

from fastapi import APIRouter, Query, status
from sqlmodel import select

from backend.app.api.resource_actions import api_error, commit_or_conflict
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.models.profiles import CustomerProfile, StaffProfile
from backend.app.models.user import User
from backend.app.schemas.profile import (
    CourierAvailabilityUpdate,
    CustomerProfileRead,
    CustomerProfileSelfRead,
    CustomerProfileSelfUpsert,
    CustomerProfileUpsert,
    StaffProfileRead,
    StaffProfileUpsert,
)
from backend.app.security.groups.profiles import ProfilePermissions
from backend.app.services.file_service import get_active_file
from backend.app.utils.utc_now import utc_now

router = APIRouter(prefix="/profiles", tags=["profiles"])

_PROFILE_NOT_FOUND = "Perfil no encontrado"


def _normalize_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone)
    if len(digits) < 7:
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "telefono_invalido",
            "El teléfono debe tener al menos 7 dígitos.",
        )
    return digits


def _require_user(session: SessionDep, user_id: uuid.UUID) -> User:
    user = session.get(User, user_id)
    if user is None or not user.is_active:
        api_error(status.HTTP_404_NOT_FOUND, "usuario_no_encontrado", "Usuario no encontrado")
    return user


# ---------------------------------------------------------------------------
# Autoservicio del cliente
# ---------------------------------------------------------------------------

@router.get("/me", response_model=CustomerProfileSelfRead)
def my_profile(session: SessionDep, current_user: CurrentUser) -> CustomerProfileSelfRead:
    profile = session.get(CustomerProfile, current_user.id)
    if profile is None or not profile.is_active:
        api_error(status.HTTP_404_NOT_FOUND, "perfil_no_encontrado", _PROFILE_NOT_FOUND)
    return CustomerProfileSelfRead.model_validate(profile, from_attributes=True)


@router.put("/me", response_model=CustomerProfileSelfRead)
def upsert_my_profile(
    payload: CustomerProfileSelfUpsert,
    session: SessionDep,
    current_user: CurrentUser,
) -> CustomerProfileSelfRead:
    profile = session.get(CustomerProfile, current_user.id)
    if profile is None:
        profile = CustomerProfile(
            user_id=current_user.id,
            full_name=payload.full_name,
            phone=payload.phone,
            phone_normalized=_normalize_phone(payload.phone),
            email=payload.email,
        )
    else:
        profile.full_name = payload.full_name
        profile.phone = payload.phone
        profile.phone_normalized = _normalize_phone(payload.phone)
        profile.email = payload.email
        profile.is_active = True
        profile.updated_at = utc_now()
    session.add(profile)
    commit_or_conflict(session, "No fue posible guardar el perfil.")
    session.refresh(profile)
    return CustomerProfileSelfRead.model_validate(profile, from_attributes=True)


# ---------------------------------------------------------------------------
# Clientes (panel): búsqueda por teléfono para captura §14
# ---------------------------------------------------------------------------

@router.get("/customers", response_model=list[CustomerProfileRead])
def search_customers(
    session: SessionDep,
    _: ProfilePermissions.READ.requiere,
    phone: Optional[str] = Query(default=None, min_length=3, max_length=30),
    q: Optional[str] = Query(default=None, min_length=2, max_length=120),
    limit: int = Query(default=20, ge=1, le=50),
) -> list[CustomerProfileRead]:
    if not phone and not q:
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "busqueda_requerida",
            "Indica teléfono (phone) o nombre (q) para buscar.",
        )
    stmt = select(CustomerProfile).where(CustomerProfile.is_active == True)  # noqa: E712
    if phone:
        digits = re.sub(r"\D", "", phone)
        stmt = stmt.where(CustomerProfile.phone_normalized.contains(digits))  # pyright: ignore[reportAttributeAccessIssue]
    if q:
        stmt = stmt.where(CustomerProfile.full_name.ilike(f"%{q}%"))  # pyright: ignore[reportAttributeAccessIssue]
    rows = session.exec(stmt.limit(limit)).all()
    return [CustomerProfileRead.model_validate(row, from_attributes=True) for row in rows]


@router.get("/customers/{user_id}", response_model=CustomerProfileRead)
def read_customer_profile(
    user_id: uuid.UUID,
    session: SessionDep,
    _: ProfilePermissions.READ.requiere,
) -> CustomerProfileRead:
    profile = session.get(CustomerProfile, user_id)
    if profile is None:
        api_error(status.HTTP_404_NOT_FOUND, "perfil_no_encontrado", _PROFILE_NOT_FOUND)
    return CustomerProfileRead.model_validate(profile, from_attributes=True)


@router.put("/customers/{user_id}", response_model=CustomerProfileRead)
def upsert_customer_profile(
    user_id: uuid.UUID,
    payload: CustomerProfileUpsert,
    session: SessionDep,
    _: ProfilePermissions.MANAGE_CUSTOMERS.requiere,
) -> CustomerProfileRead:
    _require_user(session, user_id)
    profile = session.get(CustomerProfile, user_id)
    normalized = _normalize_phone(payload.phone)
    if profile is None:
        profile = CustomerProfile(
            user_id=user_id, phone_normalized=normalized, **payload.model_dump()
        )
    else:
        for field, value in payload.model_dump().items():
            setattr(profile, field, value)
        profile.phone_normalized = normalized
        profile.is_active = True
        profile.updated_at = utc_now()
    session.add(profile)
    commit_or_conflict(session, "No fue posible guardar el perfil.")
    session.refresh(profile)
    return CustomerProfileRead.model_validate(profile, from_attributes=True)


# ---------------------------------------------------------------------------
# Personal (panel): capacidad de reparto y datos operativos
# ---------------------------------------------------------------------------

@router.get("/staff", response_model=list[StaffProfileRead])
def list_staff_profiles(
    session: SessionDep,
    _: ProfilePermissions.READ.requiere,
    can_deliver: Optional[bool] = Query(default=None),
) -> list[StaffProfileRead]:
    stmt = select(StaffProfile).where(StaffProfile.is_active == True)  # noqa: E712
    if can_deliver is not None:
        stmt = stmt.where(StaffProfile.can_deliver == can_deliver)
    rows = session.exec(stmt).all()
    return [StaffProfileRead.model_validate(row, from_attributes=True) for row in rows]


@router.put("/staff/{user_id}", response_model=StaffProfileRead)
def upsert_staff_profile(
    user_id: uuid.UUID,
    payload: StaffProfileUpsert,
    session: SessionDep,
    _: ProfilePermissions.MANAGE_STAFF.requiere,
) -> StaffProfileRead:
    _require_user(session, user_id)
    if payload.photo_file_id is not None:
        stored = get_active_file(session, payload.photo_file_id)
        if stored is None or stored.kind != "image":
            api_error(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "archivo_invalido",
                "La foto del empleado debe ser una imagen activa.",
            )
    profile = session.get(StaffProfile, user_id)
    data = payload.model_dump()
    contact_phone = data.get("contact_phone")
    normalized = re.sub(r"\D", "", contact_phone) if contact_phone else None
    if profile is None:
        profile = StaffProfile(
            user_id=user_id, contact_phone_normalized=normalized, **data
        )
    else:
        for field, value in data.items():
            setattr(profile, field, value)
        profile.contact_phone_normalized = normalized
        profile.updated_at = utc_now()
        # Quitar capacidad de reparto también lo saca de servicio ahora.
        if not profile.can_deliver:
            profile.is_delivery_available = False
    session.add(profile)
    commit_or_conflict(session, "No fue posible guardar el perfil del empleado.")
    session.refresh(profile)
    return StaffProfileRead.model_validate(profile, from_attributes=True)


@router.patch("/staff/me/availability", response_model=StaffProfileRead)
def set_my_availability(
    payload: CourierAvailabilityUpdate,
    session: SessionDep,
    current_user: CurrentUser,
) -> StaffProfileRead:
    """El propio repartidor marca si está disponible AHORA (§19.5)."""
    profile = session.get(StaffProfile, current_user.id)
    if profile is None or not profile.is_active or not profile.can_deliver:
        api_error(
            status.HTTP_403_FORBIDDEN,
            "sin_capacidad_reparto",
            "Tu perfil no tiene capacidad de reparto.",
        )
    changes = payload.model_dump(exclude_unset=True)
    if "is_delivery_available" in changes:
        profile.is_delivery_available = bool(changes["is_delivery_available"])
        profile.updated_at = utc_now()
    session.add(profile)
    commit_or_conflict(session, "No fue posible actualizar la disponibilidad.")
    session.refresh(profile)
    return StaffProfileRead.model_validate(profile, from_attributes=True)
