import uuid
from datetime import datetime
from typing import Optional

from pydantic import Field

from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema


class PermissionRead(ApiReadSchema):
    access: str
    description: Optional[str] = None


class PermissionGroupRead(ApiReadSchema):
    name: str
    permissions: list[PermissionRead]


class RoleCreate(ApiWriteSchema):
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = None
    permissions: list[str] = Field(default_factory=list)


class RoleUpdate(ApiPatchSchema):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = None
    is_active: Optional[bool] = None


class RolePermissionsReplace(ApiWriteSchema):
    """Reemplazo completo de permisos asignados a un rol (PUT)."""

    permissions: list[str]


class RoleRead(ApiReadSchema):
    id: uuid.UUID
    name: str
    description: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None


class RoleListItem(RoleRead):
    """Versión de listado compatible con ``ResourceQuery``."""


class RoleDetailRead(RoleRead):
    """Detalle de rol incluyendo los permisos asignados."""

    permissions: list[str]
