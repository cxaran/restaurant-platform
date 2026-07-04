"""Zonas de reparto y tarifas (panel interno) bajo ``shipping:*`` (§10).

La cobertura entra como GeoJSON y se valida con shapely (tipo, validez); se
persiste como MultiPolygon 4326. La cotización estimada del carrito vive en el
router público (rate-limited, sin sesión).
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status
from sqlmodel import select

from backend.app.api.resource_actions import (
    api_error,
    commit_or_conflict,
    get_or_404,
    paginate_resource,
    serialize,
    serialize_many,
)
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.models.shipping import DeliveryZone, ShippingRateRule
from backend.app.resources.registry import DELIVERY_ZONES
from backend.app.schemas.pagination import OffsetPage
from backend.app.schemas.shipping import (
    DeliveryZoneCreate,
    DeliveryZoneListItem,
    DeliveryZoneRead,
    DeliveryZoneUpdate,
    ShippingRateCreate,
    ShippingRateRead,
    ShippingRateUpdate,
)
from backend.app.security.groups.shipping import ShippingPermissions
from backend.app.services.config_audit import record_config_change
from backend.app.utils.geo import (
    GeometryValidationError,
    multipolygon_geojson_to_ewkt,
    wkb_to_geojson,
)
from backend.app.utils.utc_now import utc_now

router = APIRouter(prefix="/shipping", tags=["shipping"])

_ZONE_NOT_FOUND = "Zona de reparto no encontrada"
_RATE_NOT_FOUND = "Tarifa no encontrada"


def _coverage_to_ewkt_or_422(coverage: dict) -> str:
    try:
        return multipolygon_geojson_to_ewkt(coverage)
    except GeometryValidationError as exc:
        api_error(status.HTTP_422_UNPROCESSABLE_ENTITY, exc.code, exc.message)


def _serialize_zone(zone: DeliveryZone) -> DeliveryZoneRead:
    rates = sorted(zone.rates, key=lambda r: (-r.priority, r.name))
    return DeliveryZoneRead(
        id=zone.id,
        code=zone.code,
        name=zone.name,
        description=zone.description,
        coverage=wkb_to_geojson(zone.coverage_geometry) or {},
        priority=zone.priority,
        is_active=zone.is_active,
        rates=serialize_many(ShippingRateRead, rates),
    )


@router.get("/zones", response_model=OffsetPage[DeliveryZoneListItem])
def list_zones(
    session: SessionDep,
    query: Annotated[DELIVERY_ZONES.Query, Query()],  # pyright: ignore[reportInvalidTypeForm]
    _: ShippingPermissions.READ.requiere,
) -> OffsetPage[DeliveryZoneListItem]:
    """Listado genérico (motor de query) con campos simples; el polígono de
    cobertura y las tarifas viven en el detalle de la zona."""
    return paginate_resource(DELIVERY_ZONES, session, query)


@router.get("/zones/{zone_id}", response_model=DeliveryZoneRead)
def get_zone(
    zone_id: uuid.UUID,
    session: SessionDep,
    _: ShippingPermissions.READ.requiere,
) -> DeliveryZoneRead:
    return _serialize_zone(get_or_404(session, DeliveryZone, zone_id, _ZONE_NOT_FOUND))


@router.post("/zones", response_model=DeliveryZoneRead, status_code=status.HTTP_201_CREATED)
def create_zone(
    payload: DeliveryZoneCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: ShippingPermissions.MANAGE.requiere,
) -> DeliveryZoneRead:
    ewkt = _coverage_to_ewkt_or_422(payload.coverage)
    zone = DeliveryZone(
        code=payload.code,
        name=payload.name,
        description=payload.description,
        coverage_geometry=ewkt,  # GeoAlchemy2 acepta EWKT directamente
        priority=payload.priority,
    )
    session.add(zone)
    session.flush()
    record_config_change(
        session,
        actor_user_id=current_user.id,
        entity_type="delivery_zones",
        entity_id=zone.id,
        action="create",
        changed_fields=sorted(payload.model_dump().keys()),
    )
    commit_or_conflict(session, "Ya existe una zona con ese código.")
    session.refresh(zone)
    return _serialize_zone(zone)


@router.patch("/zones/{zone_id}", response_model=DeliveryZoneRead)
def update_zone(
    zone_id: uuid.UUID,
    payload: DeliveryZoneUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: ShippingPermissions.MANAGE.requiere,
) -> DeliveryZoneRead:
    zone = get_or_404(session, DeliveryZone, zone_id, _ZONE_NOT_FOUND)
    changes = payload.model_dump(exclude_unset=True)

    coverage = changes.pop("coverage", None)
    audited_fields = list(changes.keys())
    if coverage is not None:
        zone.coverage_geometry = _coverage_to_ewkt_or_422(coverage)
        audited_fields.append("coverage_geometry")

    for field, value in changes.items():
        setattr(zone, field, value)
    zone.updated_at = utc_now()
    session.add(zone)
    if audited_fields:
        record_config_change(
            session,
            actor_user_id=current_user.id,
            entity_type="delivery_zones",
            entity_id=zone.id,
            action="update",
            changed_fields=sorted(audited_fields),
        )
    commit_or_conflict(session, "Ya existe una zona con ese código.")
    session.refresh(zone)
    return _serialize_zone(zone)


@router.delete("/zones/{zone_id}", response_model=DeliveryZoneRead)
def delete_zone(
    zone_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: ShippingPermissions.MANAGE.requiere,
) -> DeliveryZoneRead:
    """Elimina la zona DEFINITIVAMENTE (sus tarifas caen en cascada).

    El historial de pedidos NO depende de la zona viva: cada pedido congela el
    monto cobrado y el nombre de la zona (snapshots en ``order_shipping``), y su
    referencia viva cae a NULL al borrar (FK ON DELETE SET NULL). La
    desactivación (PATCH ``is_active=false``) sigue disponible para pausar una
    zona sin destruirla.
    """
    zone = get_or_404(session, DeliveryZone, zone_id, _ZONE_NOT_FOUND)
    result = _serialize_zone(zone)
    session.delete(zone)
    record_config_change(
        session,
        actor_user_id=current_user.id,
        entity_type="delivery_zones",
        entity_id=zone.id,
        action="delete",
        changed_fields=["is_active", "code", "name"],
    )
    commit_or_conflict(session, "No fue posible eliminar la zona.")
    return result


# ---------------------------------------------------------------------------
# Tarifas
# ---------------------------------------------------------------------------

@router.post(
    "/zones/{zone_id}/rates",
    response_model=ShippingRateRead,
    status_code=status.HTTP_201_CREATED,
)
def create_rate(
    zone_id: uuid.UUID,
    payload: ShippingRateCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: ShippingPermissions.MANAGE.requiere,
) -> ShippingRateRead:
    zone = get_or_404(session, DeliveryZone, zone_id, _ZONE_NOT_FOUND)
    rate = ShippingRateRule(delivery_zone_id=zone.id, **payload.model_dump())
    session.add(rate)
    session.flush()
    record_config_change(
        session,
        actor_user_id=current_user.id,
        entity_type="shipping_rate_rules",
        entity_id=rate.id,
        action="create",
        changed_fields=sorted(payload.model_dump().keys()),
    )
    commit_or_conflict(session, "No fue posible crear la tarifa.")
    session.refresh(rate)
    return serialize(ShippingRateRead, rate)


@router.patch("/rates/{rate_id}", response_model=ShippingRateRead)
def update_rate(
    rate_id: uuid.UUID,
    payload: ShippingRateUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: ShippingPermissions.MANAGE.requiere,
) -> ShippingRateRead:
    rate = get_or_404(session, ShippingRateRule, rate_id, _RATE_NOT_FOUND)
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(rate, field, value)
    rate.updated_at = utc_now()
    session.add(rate)
    if changes:
        record_config_change(
            session,
            actor_user_id=current_user.id,
            entity_type="shipping_rate_rules",
            entity_id=rate.id,
            action="update",
            changed_fields=sorted(changes.keys()),
        )
    commit_or_conflict(session, "No fue posible guardar la tarifa.")
    session.refresh(rate)
    return serialize(ShippingRateRead, rate)


@router.delete("/rates/{rate_id}", response_model=ShippingRateRead)
def deactivate_rate(
    rate_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: ShippingPermissions.MANAGE.requiere,
) -> ShippingRateRead:
    rate = get_or_404(session, ShippingRateRule, rate_id, _RATE_NOT_FOUND)
    if not rate.is_active:
        api_error(status.HTTP_409_CONFLICT, "tarifa_inactiva", "La tarifa ya está inactiva.")
    rate.is_active = False
    rate.updated_at = utc_now()
    session.add(rate)
    record_config_change(
        session,
        actor_user_id=current_user.id,
        entity_type="shipping_rate_rules",
        entity_id=rate.id,
        action="deactivate",
        changed_fields=["is_active"],
    )
    commit_or_conflict(session, "No fue posible desactivar la tarifa.")
    session.refresh(rate)
    return serialize(ShippingRateRead, rate)
