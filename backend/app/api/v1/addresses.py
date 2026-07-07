"""Direcciones del usuario autenticado (§9.1): autoservicio puro.

Sin permisos administrativos: el usuario opera SOLO sobre sus propias
direcciones (propiedad del registro, §8.1). ``get_owned_or_404`` nunca revela
la existencia de direcciones ajenas. El punto geográfico es GeoJSON opcional.
"""

import uuid

from fastapi import APIRouter, status
from sqlmodel import select

from backend.app.api.resource_actions import api_error, commit_or_conflict, get_owned_or_404
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.models.addresses import UserAddress
from backend.app.schemas.address import (
    GeoPoint,
    UserAddressCreate,
    UserAddressRead,
    UserAddressUpdate,
)
from backend.app.utils.geo import point_to_ewkt, wkb_point_to_lonlat
from backend.app.utils.utc_now import utc_now

router = APIRouter(prefix="/users/me/addresses", tags=["addresses"])

_NOT_FOUND = "Dirección no encontrada"
_MAX_ACTIVE_ADDRESSES = 20


def _to_read(address: UserAddress) -> UserAddressRead:
    lonlat = wkb_point_to_lonlat(address.location)
    return UserAddressRead(
        id=address.id,
        label=address.label,
        street=address.street,
        external_number=address.external_number,
        internal_number=address.internal_number,
        neighborhood=address.neighborhood,
        city=address.city,
        postal_code=address.postal_code,
        references=address.references,
        contact_phone=address.contact_phone,
        location=GeoPoint(coordinates=lonlat) if lonlat is not None else None,
        is_default=address.is_default,
        is_active=address.is_active,
        created_at=address.created_at,
    )


def _clear_default(session: SessionDep, user_id: uuid.UUID, *, except_id: uuid.UUID | None = None) -> None:
    rows = session.exec(
        select(UserAddress).where(
            UserAddress.user_id == user_id,
            UserAddress.is_default == True,  # noqa: E712
            UserAddress.is_active == True,  # noqa: E712
        )
    ).all()
    for row in rows:
        if except_id is not None and row.id == except_id:
            continue
        row.is_default = False
        row.updated_at = utc_now()
        session.add(row)


@router.get("", response_model=list[UserAddressRead])
def list_my_addresses(session: SessionDep, current_user: CurrentUser) -> list[UserAddressRead]:
    rows = session.exec(
        select(UserAddress)
        .where(UserAddress.user_id == current_user.id)
        .where(UserAddress.is_active == True)  # noqa: E712
        .order_by(
            UserAddress.is_default.desc(),  # pyright: ignore[reportAttributeAccessIssue]
            UserAddress.created_at.desc(),  # pyright: ignore[reportAttributeAccessIssue]
        )
    ).all()
    return [_to_read(row) for row in rows]


@router.post("", response_model=UserAddressRead, status_code=status.HTTP_201_CREATED)
def create_my_address(
    payload: UserAddressCreate,
    session: SessionDep,
    current_user: CurrentUser,
) -> UserAddressRead:
    active_count = len(
        session.exec(
            select(UserAddress.id)
            .where(UserAddress.user_id == current_user.id)
            .where(UserAddress.is_active == True)  # noqa: E712
        ).all()
    )
    if active_count >= _MAX_ACTIVE_ADDRESSES:
        api_error(
            status.HTTP_409_CONFLICT,
            "limite_direcciones",
            "Alcanzaste el máximo de direcciones guardadas; elimina alguna primero.",
        )

    if payload.is_default:
        _clear_default(session, current_user.id)

    data = payload.model_dump(exclude={"location"})
    address = UserAddress(**data, user_id=current_user.id)
    if payload.location is not None:
        lon, lat = payload.location.coordinates
        address.location = point_to_ewkt(lon, lat)  # type: ignore[assignment]  # GeoAlchemy2 acepta EWKT
    session.add(address)
    commit_or_conflict(session, "No fue posible guardar la dirección.")
    session.refresh(address)
    return _to_read(address)


@router.patch("/{address_id}", response_model=UserAddressRead)
def update_my_address(
    address_id: uuid.UUID,
    payload: UserAddressUpdate,
    session: SessionDep,
    current_user: CurrentUser,
) -> UserAddressRead:
    address = get_owned_or_404(session, UserAddress, address_id, current_user.id, _NOT_FOUND)
    if not address.is_active:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)

    changes = payload.model_dump(exclude_unset=True)
    location_sent = "location" in changes
    changes.pop("location", None)

    if changes.get("is_default"):
        _clear_default(session, current_user.id, except_id=address.id)

    for field, value in changes.items():
        setattr(address, field, value)
    if location_sent:
        if payload.location is None:
            address.location = None
        else:
            lon, lat = payload.location.coordinates
            address.location = point_to_ewkt(lon, lat)  # type: ignore[assignment]
    address.updated_at = utc_now()
    session.add(address)
    commit_or_conflict(session, "No fue posible guardar la dirección.")
    session.refresh(address)
    return _to_read(address)


@router.delete("/{address_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_address(
    address_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> None:
    address = get_owned_or_404(session, UserAddress, address_id, current_user.id, _NOT_FOUND)
    if not address.is_active:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", _NOT_FOUND)
    # Baja lógica: los pedidos históricos guardan su propio snapshot de dirección
    # (§17.1); la fila puede quedar inactiva sin romper nada.
    address.is_active = False
    address.is_default = False
    address.updated_at = utc_now()
    session.add(address)
    commit_or_conflict(session, "No fue posible eliminar la dirección.")
