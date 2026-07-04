"""Schemas de zonas de reparto y tarifas (§10) + cotización pública.

La cobertura viaja como GeoJSON ``Polygon``/``MultiPolygon``; la validación
geométrica real (shapely) ocurre en la capa de servicio/router y produce EWKT.
"""

from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import Field

from backend.app.schemas.address import GeoPoint
from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema

# Declaración compartida del filtro de estado (mismo contrato que users/roles).
_ACTIVE_FILTER = {
    "operator": "eq",
    "label": "Estado",
    "widget": "select",
    "options": [
        {"value": "true", "label": "Activas"},
        {"value": "false", "label": "Inactivas"},
    ],
}


# ---------------------------------------------------------------------------
# Zonas
# ---------------------------------------------------------------------------

class DeliveryZoneCreate(ApiWriteSchema):
    code: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=120)
    description: Optional[str] = None
    # GeoJSON Polygon o MultiPolygon; se valida con shapely en el backend.
    coverage: dict
    priority: int = 0


class DeliveryZoneUpdate(ApiPatchSchema):
    # Los campos SIMPLES declaran metadata ui para el formulario genérico del shell
    # administrativo; ``coverage`` (el polígono GeoJSON) NO la declara a propósito:
    # la geometría se edita en la pantalla especializada de zonas, no en la tabla.
    code: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=40,
        title="Código",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    name: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=120,
        title="Nombre",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    description: Optional[str] = Field(
        default=None,
        title="Descripción",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    coverage: Optional[dict] = None
    priority: Optional[int] = Field(
        default=None,
        title="Prioridad",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    is_active: Optional[bool] = Field(
        default=None,
        title="Activa",
        json_schema_extra={"ui": {"form": True, "widget": "switch"}},
    )


class ShippingRateRead(ApiReadSchema):
    id: UUID
    name: str
    base_fee: Decimal
    minimum_order_amount: Optional[Decimal] = None
    free_shipping_from_amount: Optional[Decimal] = None
    estimated_minutes: Optional[int] = None
    priority: int
    is_active: bool


class DeliveryZoneRead(ApiReadSchema):
    id: UUID
    code: str
    name: str
    description: Optional[str] = None
    coverage: dict
    priority: int
    is_active: bool
    rates: list[ShippingRateRead] = Field(default_factory=list)


class DeliveryZoneListItem(ApiReadSchema):
    """Fila del listado administrativo genérico de zonas.

    Sin ``coverage`` ni ``rates``: el polígono y las tarifas se administran en la
    pantalla especializada de envíos."""

    id: UUID
    code: str = Field(title="Código", json_schema_extra={"ui": {"list": True}})
    name: str = Field(title="Nombre", json_schema_extra={"ui": {"list": True}})
    description: Optional[str] = Field(
        default=None, title="Descripción", json_schema_extra={"ui": {"list": True}}
    )
    priority: int = Field(title="Prioridad", json_schema_extra={"ui": {"list": True}})
    is_active: bool = Field(
        title="Activa",
        json_schema_extra={"ui": {"list": True, "filter": _ACTIVE_FILTER}},
    )
    created_at: datetime = Field(
        title="Creada", json_schema_extra={"ui": {"list": True}}
    )


# ---------------------------------------------------------------------------
# Tarifas
# ---------------------------------------------------------------------------

class ShippingRateCreate(ApiWriteSchema):
    name: str = Field(min_length=1, max_length=120)
    base_fee: Decimal = Field(ge=0)
    minimum_order_amount: Optional[Decimal] = Field(default=None, ge=0)
    free_shipping_from_amount: Optional[Decimal] = Field(default=None, ge=0)
    estimated_minutes: Optional[int] = Field(default=None, ge=0)
    priority: int = 0


class ShippingRateUpdate(ApiPatchSchema):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    base_fee: Optional[Decimal] = Field(default=None, ge=0)
    minimum_order_amount: Optional[Decimal] = Field(default=None, ge=0)
    free_shipping_from_amount: Optional[Decimal] = Field(default=None, ge=0)
    estimated_minutes: Optional[int] = Field(default=None, ge=0)
    priority: Optional[int] = None
    is_active: Optional[bool] = None


# ---------------------------------------------------------------------------
# Cotización pública (carrito / checkout)
# ---------------------------------------------------------------------------

class PublicShippingQuoteRequest(ApiWriteSchema):
    subtotal: Decimal = Field(ge=0)
    # Sin ubicación la cotización queda pending_review (§17.2); el pedido se
    # recibe igual y el costo se valida manualmente.
    location: Optional[GeoPoint] = None


class PublicShippingQuoteResult(ApiReadSchema):
    status: str  # calculated | pending_review
    zone_name: Optional[str] = None
    amount: Optional[Decimal] = None
    is_free_shipping: bool = False
    estimated_minutes: Optional[int] = None
