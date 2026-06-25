"""Registro neutral de recursos navegables de primer nivel.

Fuente única de las instancias ``ResourceQuery`` reutilizables (compartidas con los
routers) y de la metadata declarativa por recurso (label, ``api_path``, schemas por
operación, permisos por operación, acciones y orden de catálogo).

No importa routers ni la proyección: routers y proyección importan de aquí. Esto
evita ciclos y mantiene una sola definición de ``QueryOptions`` por recurso.
"""

from dataclasses import dataclass
from typing import Optional

from pydantic import BaseModel

from backend.app.models.user import Role, User
from backend.app.query import QueryOptions, ResourceQuery
from backend.app.schemas.capabilities import ActionScope, HttpMethod, ResourceView
from backend.app.schemas.role import RoleCreate, RoleListItem, RoleRead, RoleUpdate
from backend.app.schemas.user_admin import (
    UserAdminCreate,
    UserAdminListItem,
    UserAdminUpdate,
)
from backend.app.security.groups.permissions import PermissionPermissions
from backend.app.security.groups.roles import RolePermissions
from backend.app.security.groups.users import UserPermissions
from backend.app.security.security_group import SecurityGroup

# --- Instancias de query compartidas (movidas desde los routers) ---

USERS = ResourceQuery(
    name="UserAdminQuery",
    model=User,
    schema=UserAdminListItem,
    options=QueryOptions(
        filter_fields=("is_active", "email"),
        sort_fields=("created_at", "name", "email"),
        search_fields=("name", "email"),
        in_fields=("id",),
        default_sort="-created_at",
    ),
)

USER_ROLES = ResourceQuery(
    name="UserRoleQuery",
    model=Role,
    schema=RoleRead,
    options=QueryOptions(
        filter_fields=("is_active", "name"),
        sort_fields=("name", "created_at"),
        search_fields=("name",),
        in_fields=("id",),
        default_sort="name",
    ),
)

ROLES = ResourceQuery(
    name="RoleQuery",
    model=Role,
    schema=RoleListItem,
    options=QueryOptions(
        filter_fields=("is_active", "name"),
        sort_fields=("created_at", "name"),
        search_fields=("name",),
        in_fields=("id",),
        default_sort="name",
    ),
)


@dataclass(frozen=True)
class ActionDef:
    """Acción declarada de un recurso. ``permission`` es un control de seguridad
    existente (miembro de ``SecurityGroup``); se filtra con ``.check(current_user)``."""

    name: str
    label: str
    method: HttpMethod
    url_template: str
    scope: ActionScope
    danger: bool
    permission: SecurityGroup


@dataclass(frozen=True)
class ResourceDefinition:
    name: str
    label: str
    api_path: str
    view: ResourceView
    read_permission: SecurityGroup
    list_query: Optional[ResourceQuery] = None
    list_schema: Optional[type[BaseModel]] = None
    create_schema: Optional[type[BaseModel]] = None
    update_schema: Optional[type[BaseModel]] = None
    create_permission: Optional[SecurityGroup] = None
    update_permission: Optional[SecurityGroup] = None
    actions: tuple[ActionDef, ...] = ()


RESOURCE_REGISTRY: tuple[ResourceDefinition, ...] = (
    ResourceDefinition(
        name="users",
        label="Usuarios",
        api_path="/api/v1/users",
        view=ResourceView.TABLE,
        read_permission=UserPermissions.READ,
        list_query=USERS,
        list_schema=UserAdminListItem,
        create_schema=UserAdminCreate,
        update_schema=UserAdminUpdate,
        create_permission=UserPermissions.CREATE,
        update_permission=UserPermissions.UPDATE,
        actions=(
            ActionDef(
                name="revoke_sessions",
                label="Revocar sesiones",
                method=HttpMethod.POST,
                url_template="/api/v1/users/{id}/revoke-sessions",
                scope=ActionScope.ITEM,
                danger=True,
                permission=UserPermissions.REVOKE_SESSIONS,
            ),
            ActionDef(
                name="delete",
                label="Eliminar",
                method=HttpMethod.DELETE,
                url_template="/api/v1/users/{id}",
                scope=ActionScope.ITEM,
                danger=True,
                permission=UserPermissions.DELETE,
            ),
        ),
    ),
    ResourceDefinition(
        name="roles",
        label="Roles",
        api_path="/api/v1/roles",
        view=ResourceView.TABLE,
        read_permission=RolePermissions.READ,
        list_query=ROLES,
        list_schema=RoleListItem,
        create_schema=RoleCreate,
        update_schema=RoleUpdate,
        create_permission=RolePermissions.CREATE,
        update_permission=RolePermissions.UPDATE,
        actions=(
            ActionDef(
                name="delete",
                label="Eliminar",
                method=HttpMethod.DELETE,
                url_template="/api/v1/roles/{id}",
                scope=ActionScope.ITEM,
                danger=True,
                permission=RolePermissions.DELETE,
            ),
        ),
    ),
    ResourceDefinition(
        name="permissions",
        label="Permisos",
        api_path="/api/v1/permissions",
        view=ResourceView.GROUPED_CATALOG,
        read_permission=PermissionPermissions.READ,
    ),
)


def get_resource(name: str) -> Optional[ResourceDefinition]:
    for definition in RESOURCE_REGISTRY:
        if definition.name == name:
            return definition
    return None
