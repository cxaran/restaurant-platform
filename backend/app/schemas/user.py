import uuid
from datetime import datetime
from typing import Optional, Set

from pydantic import EmailStr, Field, SecretStr

from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema


# Usuario autenticado en sesión (no es un XBase de dominio: lleva permisos y la
# lógica de control de acceso usada por las dependencias de auth).
class SessionUser(ApiReadSchema):
    id: uuid.UUID
    name: str
    last_name: str
    email: EmailStr
    permissions: Set[str] = Field(default_factory=set)

    def access_control(self, access: str) -> bool:
        return access in self.permissions


class UserRead(ApiReadSchema):
    """Representación pública completa de un usuario."""

    id: uuid.UUID
    name: str
    last_name: str
    email: EmailStr
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None


class UserListItem(ApiReadSchema):
    """Versión reducida para listados de usuarios."""

    id: uuid.UUID
    name: str
    last_name: str
    email: EmailStr
    is_active: bool
    created_at: datetime


class UserUpdate(ApiPatchSchema):
    """Actualización parcial de un usuario (PATCH)."""

    name: Optional[str] = Field(default=None, min_length=4, max_length=50)
    last_name: Optional[str] = Field(default=None, min_length=4, max_length=50)
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = None



# Auxiliar para validar la contraseña
def validate_password(password: SecretStr) -> SecretStr:
    """Valida que la contraseña cumpla reglas de seguridad."""
    pw = password.get_secret_value()

    # if not any(c.isupper() for c in pw):
    #     raise ValueError("La contraseña debe contener al menos una letra mayúscula")

    if not any(c.islower() for c in pw):
        raise ValueError("La contraseña debe contener al menos una letra minúscula")

    if not any(c.isdigit() for c in pw):
        raise ValueError("La contraseña debe contener al menos un número")

    return password


