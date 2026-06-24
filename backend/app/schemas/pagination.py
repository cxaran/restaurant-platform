"""Contratos de respuesta de paginación, compartidos por toda la API.

Fuente única de ``OffsetPage``/``OffsetPagination``. El motor de query
(``backend.app.query``) los importa desde aquí; así la capa de schemas es la que
define los contratos HTTP y el motor solo los consume.
"""

from typing import Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")

DEFAULT_LIMIT = 20
MAX_LIMIT = 100


class OffsetPagination(BaseModel):
    limit: int = Field(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT)
    offset: int = Field(default=0, ge=0)
    has_next: bool
    total: int = Field(ge=0)


class OffsetPage(BaseModel, Generic[T]):
    items: list[T]
    pagination: OffsetPagination
