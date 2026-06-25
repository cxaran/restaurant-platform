"""Permisos declarados en código para consumo informativo."""

from fastapi import APIRouter

from backend.app.schemas.role import PermissionGroupRead, PermissionRead
from backend.app.security.catalog import SECURITY_GROUPS
from backend.app.security.groups.permissions import PermissionPermissions

router = APIRouter(prefix="/permissions", tags=["permissions"])


@router.get("", response_model=list[PermissionGroupRead])
def list_permissions(
    _: PermissionPermissions.READ.requiere,
) -> list[PermissionGroupRead]:
    return [
        PermissionGroupRead(
            name=group.__name__,
            permissions=[
                PermissionRead(
                    access=permission.permission,
                    description=permission.description,
                )
                for permission in group
            ],
        )
        for group in SECURITY_GROUPS
    ]
