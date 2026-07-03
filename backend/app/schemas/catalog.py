"""Schemas del catálogo (§11–§13): administración y menú público.

La coherencia comercial del producto (§11.2) se valida aquí Y como CHECK en la
base: venta monetaria exige precio, y todo producto debe poder venderse con
dinero o canjearse con créditos.
"""

from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID

from pydantic import Field, model_validator

from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema


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
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = None


class CategoryUpdate(ApiPatchSchema):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = None
    is_active: Optional[bool] = None


class CategoryRead(ApiReadSchema):
    id: UUID
    name: str
    description: Optional[str] = None
    sort_order: int
    is_active: bool


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
    category_id: UUID
    sku: Optional[str] = Field(default=None, max_length=80)
    name: str = Field(min_length=1, max_length=180)
    description: Optional[str] = None
    money_price_amount: Optional[Decimal] = Field(default=None, ge=0)
    is_money_purchase_available: bool = True
    credits_awarded_per_unit: int = Field(default=0, ge=0)
    credit_redemption_price: Optional[int] = Field(default=None, ge=1)
    is_available: bool = True
    is_featured: bool = False
    preparation_minutes: Optional[int] = Field(default=None, ge=0)
    max_units_per_order: Optional[int] = Field(default=None, ge=1)
    daily_unit_limit: Optional[int] = Field(default=None, ge=1)

    @model_validator(mode="after")
    def _coherence(self) -> "ProductCreate":
        _validate_product_coherence(
            is_money_purchase_available=self.is_money_purchase_available,
            money_price_amount=self.money_price_amount,
            credit_redemption_price=self.credit_redemption_price,
        )
        return self


class ProductUpdate(ApiPatchSchema):
    category_id: Optional[UUID] = None
    sku: Optional[str] = Field(default=None, max_length=80)
    name: Optional[str] = Field(default=None, min_length=1, max_length=180)
    description: Optional[str] = None
    money_price_amount: Optional[Decimal] = Field(default=None, ge=0)
    is_money_purchase_available: Optional[bool] = None
    credits_awarded_per_unit: Optional[int] = Field(default=None, ge=0)
    credit_redemption_price: Optional[int] = Field(default=None, ge=1)
    is_available: Optional[bool] = None
    is_featured: Optional[bool] = None
    preparation_minutes: Optional[int] = Field(default=None, ge=0)
    max_units_per_order: Optional[int] = Field(default=None, ge=1)
    daily_unit_limit: Optional[int] = Field(default=None, ge=1)
    is_active: Optional[bool] = None


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
    name: str = Field(min_length=1, max_length=120)
    selection_type: Literal["single", "multiple"] = "single"
    min_selections: int = Field(default=0, ge=0)
    max_selections: Optional[int] = Field(default=None, ge=1)
    is_required: bool = False

    @model_validator(mode="after")
    def _max_gte_min(self) -> "ModifierGroupCreate":
        if self.max_selections is not None and self.max_selections < self.min_selections:
            raise ValueError("max_selections no puede ser menor que min_selections.")
        return self


class ModifierGroupUpdate(ApiPatchSchema):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    selection_type: Optional[Literal["single", "multiple"]] = None
    min_selections: Optional[int] = Field(default=None, ge=0)
    max_selections: Optional[int] = Field(default=None, ge=1)
    is_required: Optional[bool] = None
    is_active: Optional[bool] = None


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
