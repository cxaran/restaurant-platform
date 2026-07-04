"""Schemas del catálogo (§11–§13): administración y menú público.

La coherencia comercial del producto (§11.2) se valida aquí Y como CHECK en la
base: venta monetaria exige precio, y todo producto debe poder venderse con
dinero o canjearse con créditos.
"""

from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID

from pydantic import Field, model_validator

from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema

# Declaración compartida del filtro de estado (mismo contrato que users/roles).
_ACTIVE_FILTER = {
    "operator": "eq",
    "label": "Estado",
    "widget": "select",
    "options": [
        {"value": "true", "label": "Activos"},
        {"value": "false", "label": "Inactivos"},
    ],
}
_SELECTION_TYPE_OPTIONS = [
    {"value": "single", "label": "Una sola opción"},
    {"value": "multiple", "label": "Varias opciones"},
]


# ---------------------------------------------------------------------------
# Reorden atómico (contrato §13, común a todas las colecciones)
# ---------------------------------------------------------------------------

class SortOrderReplace(ApiWriteSchema):
    """Lista COMPLETA de IDs de la colección, en el nuevo orden."""

    ids: list[UUID] = Field(min_length=1)


# ---------------------------------------------------------------------------
# Categorías
# ---------------------------------------------------------------------------

class CategoryCreate(ApiWriteSchema):
    name: str = Field(
        min_length=1,
        max_length=100,
        title="Nombre",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    description: Optional[str] = Field(
        default=None,
        title="Descripción",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )


class CategoryUpdate(ApiPatchSchema):
    name: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=100,
        title="Nombre",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    description: Optional[str] = Field(
        default=None,
        title="Descripción",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    is_active: Optional[bool] = Field(
        default=None,
        title="Activa",
        json_schema_extra={"ui": {"form": True, "widget": "switch"}},
    )


class CategoryRead(ApiReadSchema):
    id: UUID
    name: str
    description: Optional[str] = None
    sort_order: int
    is_active: bool


class CategoryListItem(ApiReadSchema):
    """Fila del listado administrativo genérico de categorías (shell contract-driven)."""

    id: UUID
    name: str = Field(title="Nombre", json_schema_extra={"ui": {"list": True}})
    description: Optional[str] = Field(
        default=None, title="Descripción", json_schema_extra={"ui": {"list": True}}
    )
    sort_order: int = Field(title="Orden", json_schema_extra={"ui": {"list": True}})
    is_active: bool = Field(
        title="Activa",
        json_schema_extra={"ui": {"list": True, "filter": _ACTIVE_FILTER}},
    )
    created_at: datetime = Field(
        title="Creada", json_schema_extra={"ui": {"list": True}}
    )


# ---------------------------------------------------------------------------
# Productos
# ---------------------------------------------------------------------------

def _validate_product_coherence(
    *,
    is_money_purchase_available: bool,
    money_price_amount: Optional[Decimal],
    credit_redemption_price: Optional[int],
) -> None:
    if is_money_purchase_available and money_price_amount is None:
        raise ValueError(
            "Un producto disponible por dinero requiere money_price_amount."
        )
    if not is_money_purchase_available and credit_redemption_price is None:
        raise ValueError(
            "El producto debe poder venderse de alguna forma: dinero o canje en créditos."
        )


class ProductCreate(ApiWriteSchema):
    category_id: UUID = Field(
        title="Categoría (ID)",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    sku: Optional[str] = Field(
        default=None,
        max_length=80,
        title="SKU",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    name: str = Field(
        min_length=1,
        max_length=180,
        title="Nombre",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    description: Optional[str] = Field(
        default=None,
        title="Descripción",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    money_price_amount: Optional[Decimal] = Field(
        default=None,
        ge=0,
        title="Precio",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    is_money_purchase_available: bool = Field(
        default=True,
        title="Venta por dinero",
        json_schema_extra={"ui": {"form": True, "widget": "switch"}},
    )
    credits_awarded_per_unit: int = Field(
        default=0,
        ge=0,
        title="Créditos por unidad",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    credit_redemption_price: Optional[int] = Field(
        default=None,
        ge=1,
        title="Precio en créditos",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    is_available: bool = Field(
        default=True,
        title="Disponible",
        json_schema_extra={"ui": {"form": True, "widget": "switch"}},
    )
    is_featured: bool = Field(
        default=False,
        title="Destacado",
        json_schema_extra={"ui": {"form": True, "widget": "switch"}},
    )
    preparation_minutes: Optional[int] = Field(
        default=None,
        ge=0,
        title="Minutos de preparación",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    max_units_per_order: Optional[int] = Field(
        default=None,
        ge=1,
        title="Máximo por pedido",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    daily_unit_limit: Optional[int] = Field(
        default=None,
        ge=1,
        title="Límite diario",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )

    @model_validator(mode="after")
    def _coherence(self) -> "ProductCreate":
        _validate_product_coherence(
            is_money_purchase_available=self.is_money_purchase_available,
            money_price_amount=self.money_price_amount,
            credit_redemption_price=self.credit_redemption_price,
        )
        return self


class ProductUpdate(ApiPatchSchema):
    category_id: Optional[UUID] = Field(
        default=None,
        title="Categoría (ID)",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    sku: Optional[str] = Field(
        default=None,
        max_length=80,
        title="SKU",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    name: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=180,
        title="Nombre",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    description: Optional[str] = Field(
        default=None,
        title="Descripción",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    money_price_amount: Optional[Decimal] = Field(
        default=None,
        ge=0,
        title="Precio",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    is_money_purchase_available: Optional[bool] = Field(
        default=None,
        title="Venta por dinero",
        json_schema_extra={"ui": {"form": True, "widget": "switch"}},
    )
    credits_awarded_per_unit: Optional[int] = Field(
        default=None,
        ge=0,
        title="Créditos por unidad",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    credit_redemption_price: Optional[int] = Field(
        default=None,
        ge=1,
        title="Precio en créditos",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    is_available: Optional[bool] = Field(
        default=None,
        title="Disponible",
        json_schema_extra={"ui": {"form": True, "widget": "switch"}},
    )
    is_featured: Optional[bool] = Field(
        default=None,
        title="Destacado",
        json_schema_extra={"ui": {"form": True, "widget": "switch"}},
    )
    preparation_minutes: Optional[int] = Field(
        default=None,
        ge=0,
        title="Minutos de preparación",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    max_units_per_order: Optional[int] = Field(
        default=None,
        ge=1,
        title="Máximo por pedido",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    daily_unit_limit: Optional[int] = Field(
        default=None,
        ge=1,
        title="Límite diario",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    is_active: Optional[bool] = Field(
        default=None,
        title="Activo",
        json_schema_extra={"ui": {"form": True, "widget": "switch"}},
    )


class ProductImageRead(ApiReadSchema):
    id: UUID
    file_id: UUID
    alt_text: Optional[str] = None
    sort_order: int
    is_primary: bool


class ProductInclusionItem(ApiWriteSchema):
    name: str = Field(min_length=1, max_length=180)
    description: Optional[str] = None


class ProductInclusionsReplace(ApiWriteSchema):
    """PUT de inclusiones: la lista enviada (en orden) sustituye TODO."""

    inclusions: list[ProductInclusionItem]


class ProductInclusionRead(ApiReadSchema):
    name: str
    description: Optional[str] = None
    sort_order: int


class ProductRead(ApiReadSchema):
    id: UUID
    category_id: UUID
    sku: Optional[str] = None
    name: str
    description: Optional[str] = None
    money_price_amount: Optional[Decimal] = None
    is_money_purchase_available: bool
    credits_awarded_per_unit: int
    credit_redemption_price: Optional[int] = None
    is_available: bool
    is_featured: bool
    preparation_minutes: Optional[int] = None
    max_units_per_order: Optional[int] = None
    daily_unit_limit: Optional[int] = None
    sort_order: int
    is_active: bool
    images: list[ProductImageRead] = Field(default_factory=list)
    inclusions: list[ProductInclusionRead] = Field(default_factory=list)


class ProductListItem(ApiReadSchema):
    """Fila del listado administrativo genérico de productos.

    Sin imágenes, inclusiones ni modificadores: esas colecciones se administran
    en la pantalla especializada del catálogo, no en la tabla genérica."""

    id: UUID
    category_id: UUID = Field(
        # Campo de scoping: no es columna visible, pero su filtro EQ permite acotar
        # la lista a una categoría (mismo parámetro ``category_id`` de siempre).
        title="Categoría",
        json_schema_extra={"ui": {"list": False}},
    )
    name: str = Field(title="Nombre", json_schema_extra={"ui": {"list": True}})
    sku: Optional[str] = Field(
        default=None, title="SKU", json_schema_extra={"ui": {"list": True}}
    )
    money_price_amount: Optional[Decimal] = Field(
        default=None, title="Precio", json_schema_extra={"ui": {"list": True}}
    )
    credit_redemption_price: Optional[int] = Field(
        default=None, title="Precio en créditos", json_schema_extra={"ui": {"list": True}}
    )
    is_available: bool = Field(
        title="Disponible", json_schema_extra={"ui": {"list": True}}
    )
    is_featured: bool = Field(
        title="Destacado", json_schema_extra={"ui": {"list": True}}
    )
    sort_order: int = Field(title="Orden", json_schema_extra={"ui": {"list": True}})
    is_active: bool = Field(
        title="Activo",
        json_schema_extra={"ui": {"list": True, "filter": _ACTIVE_FILTER}},
    )
    created_at: datetime = Field(
        title="Creado", json_schema_extra={"ui": {"list": True}}
    )


# ---------------------------------------------------------------------------
# Imágenes de producto
# ---------------------------------------------------------------------------

class ProductImageAttach(ApiWriteSchema):
    file_id: UUID
    alt_text: Optional[str] = Field(default=None, max_length=180)
    is_primary: bool = False


# ---------------------------------------------------------------------------
# Modificadores
# ---------------------------------------------------------------------------

class ModifierGroupCreate(ApiWriteSchema):
    name: str = Field(
        min_length=1,
        max_length=120,
        title="Nombre",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    selection_type: Literal["single", "multiple"] = Field(
        default="single",
        title="Tipo de selección",
        json_schema_extra={
            "ui": {"form": True, "widget": "select", "options": _SELECTION_TYPE_OPTIONS}
        },
    )
    min_selections: int = Field(
        default=0,
        ge=0,
        title="Selecciones mínimas",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    max_selections: Optional[int] = Field(
        default=None,
        ge=1,
        title="Selecciones máximas",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    is_required: bool = Field(
        default=False,
        title="Obligatorio",
        json_schema_extra={"ui": {"form": True, "widget": "switch"}},
    )

    @model_validator(mode="after")
    def _max_gte_min(self) -> "ModifierGroupCreate":
        if self.max_selections is not None and self.max_selections < self.min_selections:
            raise ValueError("max_selections no puede ser menor que min_selections.")
        return self


class ModifierGroupUpdate(ApiPatchSchema):
    name: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=120,
        title="Nombre",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    selection_type: Optional[Literal["single", "multiple"]] = Field(
        default=None,
        title="Tipo de selección",
        json_schema_extra={
            "ui": {"form": True, "widget": "select", "options": _SELECTION_TYPE_OPTIONS}
        },
    )
    min_selections: Optional[int] = Field(
        default=None,
        ge=0,
        title="Selecciones mínimas",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    max_selections: Optional[int] = Field(
        default=None,
        ge=1,
        title="Selecciones máximas",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    is_required: Optional[bool] = Field(
        default=None,
        title="Obligatorio",
        json_schema_extra={"ui": {"form": True, "widget": "switch"}},
    )
    is_active: Optional[bool] = Field(
        default=None,
        title="Activo",
        json_schema_extra={"ui": {"form": True, "widget": "switch"}},
    )


class ModifierOptionCreate(ApiWriteSchema):
    name: str = Field(min_length=1, max_length=120)
    description: Optional[str] = None
    price_adjustment: Decimal = Field(default=Decimal("0"), ge=0)


class ModifierOptionUpdate(ApiPatchSchema):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = None
    price_adjustment: Optional[Decimal] = Field(default=None, ge=0)
    is_available: Optional[bool] = None
    is_active: Optional[bool] = None


class ModifierOptionRead(ApiReadSchema):
    id: UUID
    name: str
    description: Optional[str] = None
    price_adjustment: Decimal
    sort_order: int
    is_available: bool
    is_active: bool


class ModifierGroupRead(ApiReadSchema):
    id: UUID
    name: str
    selection_type: str
    min_selections: int
    max_selections: Optional[int] = None
    is_required: bool
    sort_order: int
    is_active: bool
    options: list[ModifierOptionRead] = Field(default_factory=list)


class ModifierGroupListItem(ApiReadSchema):
    """Fila del listado administrativo genérico de grupos de modificadores.

    Sin las opciones anidadas: se administran en los endpoints especializados del
    grupo (crear/editar/reordenar opciones)."""

    id: UUID
    name: str = Field(title="Nombre", json_schema_extra={"ui": {"list": True}})
    selection_type: str = Field(
        title="Tipo de selección", json_schema_extra={"ui": {"list": True}}
    )
    min_selections: int = Field(
        title="Mínimo", json_schema_extra={"ui": {"list": True}}
    )
    max_selections: Optional[int] = Field(
        default=None, title="Máximo", json_schema_extra={"ui": {"list": True}}
    )
    is_required: bool = Field(
        title="Obligatorio", json_schema_extra={"ui": {"list": True}}
    )
    sort_order: int = Field(title="Orden", json_schema_extra={"ui": {"list": True}})
    is_active: bool = Field(
        title="Activo",
        json_schema_extra={"ui": {"list": True, "filter": _ACTIVE_FILTER}},
    )
    created_at: datetime = Field(
        title="Creado", json_schema_extra={"ui": {"list": True}}
    )


# ---------------------------------------------------------------------------
# Vínculo producto ↔ grupos (reemplazo atómico con overrides)
# ---------------------------------------------------------------------------

class ProductModifierGroupItem(ApiWriteSchema):
    modifier_group_id: UUID
    min_selections_override: Optional[int] = Field(default=None, ge=0)
    max_selections_override: Optional[int] = Field(default=None, ge=1)


class ProductModifierGroupsReplace(ApiWriteSchema):
    """PUT de grupos del producto: la lista (en orden) sustituye TODO el vínculo."""

    groups: list[ProductModifierGroupItem]


class ProductModifierGroupRead(ApiReadSchema):
    modifier_group_id: UUID
    name: str
    min_selections_override: Optional[int] = None
    max_selections_override: Optional[int] = None
    sort_order: int


# ---------------------------------------------------------------------------
# Menú público (§ regla de experiencia: catálogo real, nunca contenido manual)
# ---------------------------------------------------------------------------

class PublicModifierOption(ApiReadSchema):
    id: UUID
    name: str
    description: Optional[str] = None
    price_adjustment: Decimal


class PublicModifierGroup(ApiReadSchema):
    id: UUID
    name: str
    selection_type: str
    is_required: bool
    min_selections: int
    max_selections: Optional[int] = None
    options: list[PublicModifierOption]


class PublicInclusion(ApiReadSchema):
    name: str
    description: Optional[str] = None


class PublicProduct(ApiReadSchema):
    id: UUID
    name: str
    description: Optional[str] = None
    money_price_amount: Optional[Decimal] = None
    is_money_purchase_available: bool
    credits_awarded_per_unit: int
    credit_redemption_price: Optional[int] = None
    is_featured: bool
    max_units_per_order: Optional[int] = None
    image_file_ids: list[UUID]
    inclusions: list[PublicInclusion]
    modifier_groups: list[PublicModifierGroup]


class PublicMenuCategory(ApiReadSchema):
    id: UUID
    name: str
    description: Optional[str] = None
    products: list[PublicProduct]
