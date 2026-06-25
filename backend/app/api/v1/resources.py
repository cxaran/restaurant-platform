"""Capabilities de recursos navegables, filtradas por el usuario actual.

Solo requieren autenticación (``CurrentUser``); no un permiso global adicional. El
listado devuelve únicamente recursos legibles por el usuario; el detalle devuelve el
mismo 404 para un recurso inexistente y para uno no visible (no revela el catálogo).
"""

from fastapi import APIRouter, status

from backend.app.api.resource_actions import api_error
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.resources.projection import (
    build_capability_if_visible,
    build_visible_capabilities,
)
from backend.app.schemas.capabilities import ResourceCapability

router = APIRouter(prefix="/resources", tags=["resources"])


@router.get(
    "",
    response_model=list[ResourceCapability],
    response_model_exclude_none=True,
)
def list_resources(current_user: CurrentUser) -> list[ResourceCapability]:
    return build_visible_capabilities(current_user)


@router.get(
    "/{resource_name}",
    response_model=ResourceCapability,
    response_model_exclude_none=True,
)
def get_resource_capability(
    resource_name: str,
    current_user: CurrentUser,
) -> ResourceCapability:
    capability = build_capability_if_visible(resource_name, current_user)
    if capability is None:
        api_error(status.HTTP_404_NOT_FOUND, "resource_not_found", "Recurso no encontrado")
    return capability
