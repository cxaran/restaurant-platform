import uuid
from datetime import datetime
from typing import Optional

from pydantic import EmailStr, Field, SecretStr, field_validator, model_validator
from typing_extensions import Annotated, Self

from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema
from backend.app.schemas.user import validate_password


class UserAdminCreate(ApiWriteSchema):
    """Creación administrativa de un usuario."""

    name: Annotated[str, Field(min_length=4, max_length=50)]
    last_name: Annotated[str, Field(min_length=4, max_length=50)]
    email: EmailStr
    password: SecretStr = Field(..., min_length=8, max_length=128)
    confirm_password: SecretStr = Field(..., min_length=8, max_length=128)
    is_active: bool = True

    @field_validator("name", "last_name")
    def names_not_empty(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("El nombre y apellido no pueden estar vacíos")
        return value

    @field_validator("password")
    def password_validator(cls, value: SecretStr) -> SecretStr:
        return validate_password(value)

    @model_validator(mode="after")
    def check_passwords_match(self) -> Self:
        if self.password != self.confirm_password:
            raise ValueError("Las contraseñas no coinciden")
        return self


class UserAdminRead(ApiReadSchema):
    """Representación administrativa completa de un usuario."""

    id: uuid.UUID
    name: str
    last_name: str
    email: EmailStr
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None


class UserAdminListItem(ApiReadSchema):
    """Versión reducida para listados administrativos de usuarios."""

    id: uuid.UUID
    name: str
    last_name: str
    email: EmailStr
    is_active: bool
    created_at: datetime


class UserAdminUpdate(ApiPatchSchema):
    """Actualización parcial administrativa de un usuario (PATCH)."""

    name: Optional[str] = Field(default=None, min_length=4, max_length=50)
    last_name: Optional[str] = Field(default=None, min_length=4, max_length=50)
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = None


class UserRolesReplace(ApiWriteSchema):
    """Reemplazo completo de los roles asignados a un usuario (PUT)."""

    role_ids: list[uuid.UUID]
