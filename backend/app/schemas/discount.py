"""Schemas de códigos de descuento fijo web-only (Etapa 5 RC).

El cliente NUNCA envía montos, totales ni elegibilidad: en cotización y
checkout sólo viaja el string del código (y las líneas del carrito, que el
backend valúa con ``price_cart``). Los montos siempre los calcula el servidor.
"""

from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import Field

from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema
from backend.app.schemas.order import OrderLineInput


class DiscountCodeCreate(ApiWriteSchema):
    name: str = Field(min_length=1, max_length=180)
    description: Optional[str] = None
    code: str = Field(min_length=1, max_length=40)
    discount_amount: Decimal = Field(gt=0)
    minimum_order_amount: Decimal = Field(ge=0)
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    target_customer_user_id: Optional[UUID] = None
    is_active: bool = True


class DiscountCodeUpdate(ApiPatchSchema):
    name: Optional[str] = Field(default=None, min_length=1, max_length=180)
    description: Optional[str] = None
    code: Optional[str] = Field(default=None, min_length=1, max_length=40)
    discount_amount: Optional[Decimal] = Field(default=None, gt=0)
    minimum_order_amount: Optional[Decimal] = Field(default=None, ge=0)
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    target_customer_user_id: Optional[UUID] = None
    is_active: Optional[bool] = None


class DiscountCodeRead(ApiReadSchema):
    id: UUID
    name: str
    description: Optional[str] = None
    code: str
    discount_amount: Decimal
    minimum_order_amount: Decimal
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    target_customer_user_id: Optional[UUID] = None
    is_active: bool
    created_at: datetime


class DiscountCodeListItem(ApiReadSchema):
    id: UUID
    name: str
    code: str
    discount_amount: Decimal
    minimum_order_amount: Decimal
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    target_customer_user_id: Optional[UUID] = None
    is_active: bool
    created_at: datetime


class DiscountRedemptionListItem(ApiReadSchema):
    id: UUID
    order_id: UUID
    order_public_code: str
    customer_user_id: UUID
    code_snapshot: str
    name_snapshot: str
    discount_amount_snapshot: Decimal
    minimum_order_amount_snapshot: Decimal
    status: str
    reserved_at: datetime
    consumed_at: Optional[datetime] = None
    released_at: Optional[datetime] = None
    release_reason: Optional[str] = None


class DiscountQuoteRequest(ApiWriteSchema):
    """Cotización del carrito web: sólo el código y las líneas (IDs+cantidades)."""

    discount_code: str = Field(min_length=1, max_length=40)
    lines: list[OrderLineInput] = Field(min_length=1)


class DiscountQuoteResult(ApiReadSchema):
    valid: bool
    code: str
    name: str
    discount_amount: Decimal
    minimum_order_amount: Decimal
    eligible_subtotal: Decimal
