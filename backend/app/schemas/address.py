"""Schemas de direcciones del usuario (§9.1): autoservicio del cliente.

El punto geográfico viaja como GeoJSON ``Point`` (lon, lat — SRID 4326) y es
OPCIONAL: sin punto, el pedido se recibe y el envío pasa a revisión manual.
"""

from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import Field, field_validator

from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema


class GeoPoint(ApiWriteSchema):
    """GeoJSON Point: coordinates = [longitud, latitud]."""

    type: Literal["Point"] = "Point"
    coordinates: tuple[float, float]

    @field_validator("coordinates")
    @classmethod
    def _valid_lonlat(cls, value: tuple[float, float]) -> tuple[float, float]:
        lon, lat = value
        if not (-180.0 <= lon <= 180.0) or not (-90.0 <= lat <= 90.0):
            raise ValueError("Coordenadas fuera de rango: [longitud, latitud].")
        return value


class UserAddressCreate(ApiWriteSchema):
    label: Optional[str] = Field(default=None, max_length=80)
    street: str = Field(min_length=1, max_length=180)
    external_number: Optional[str] = Field(default=None, max_length=30)
    internal_number: Optional[str] = Field(default=None, max_length=30)
    neighborhood: Optional[str] = Field(default=None, max_length=120)
    city: Optional[str] = Field(default=None, max_length=120)
    postal_code: Optional[str] = Field(default=None, max_length=20)
    references: Optional[str] = None
    location: Optional[GeoPoint] = None
    is_default: bool = False


class UserAddressUpdate(ApiPatchSchema):
    label: Optional[str] = Field(default=None, max_length=80)
    street: Optional[str] = Field(default=None, min_length=1, max_length=180)
    external_number: Optional[str] = Field(default=None, max_length=30)
    internal_number: Optional[str] = Field(default=None, max_length=30)
    neighborhood: Optional[str] = Field(default=None, max_length=120)
    city: Optional[str] = Field(default=None, max_length=120)
    postal_code: Optional[str] = Field(default=None, max_length=20)
    references: Optional[str] = None
    # Enviar null borra el punto (vuelve a revisión manual de envío).
    location: Optional[GeoPoint] = None
    is_default: Optional[bool] = None


class UserAddressRead(ApiReadSchema):
    id: UUID
    label: Optional[str] = None
    street: str
    external_number: Optional[str] = None
    internal_number: Optional[str] = None
    neighborhood: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    references: Optional[str] = None
    location: Optional[GeoPoint] = None
    is_default: bool
    is_active: bool
    created_at: datetime
