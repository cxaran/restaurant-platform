"""Schemas del negocio único: perfil, política, teléfonos y horarios (§5–§6).

Convención por operación (schemas/base.py). El endpoint público expone SOLO lo
necesario para el sitio (teléfonos públicos, estado abierto/cerrado, umbral de
envío gratis); los datos internos nunca se proyectan ahí.
"""

from datetime import date, datetime, time
from decimal import Decimal
from typing import Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from pydantic import Field, field_validator

from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema


# ---------------------------------------------------------------------------
# Perfil (singleton)
# ---------------------------------------------------------------------------

class BusinessProfileRead(ApiReadSchema):
    trade_name: str
    legal_name: Optional[str] = None
    slogan: Optional[str] = None
    email: Optional[str] = None
    main_address: Optional[str] = None
    terms_extra: Optional[str] = None
    privacy_extra: Optional[str] = None
    currency_code: str
    timezone: str
    order_prefix: str
    logo_file_id: Optional[UUID] = None
    is_accepting_orders: bool
    updated_at: Optional[datetime] = None


class BusinessProfileUpdate(ApiPatchSchema):
    trade_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    legal_name: Optional[str] = Field(default=None, max_length=180)
    slogan: Optional[str] = Field(default=None, max_length=180)
    email: Optional[str] = Field(default=None, max_length=180)
    main_address: Optional[str] = None
    terms_extra: Optional[str] = Field(default=None, max_length=20_000)
    privacy_extra: Optional[str] = Field(default=None, max_length=20_000)
    currency_code: Optional[str] = Field(default=None, min_length=3, max_length=3)
    timezone: Optional[str] = Field(default=None, max_length=64)
    order_prefix: Optional[str] = Field(default=None, min_length=1, max_length=12)
    logo_file_id: Optional[UUID] = None
    is_accepting_orders: Optional[bool] = None

    @field_validator("currency_code")
    @classmethod
    def _currency_upper(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        cleaned = value.strip().upper()
        if not cleaned.isalpha():
            raise ValueError("El código de moneda debe ser ISO 4217 (tres letras).")
        return cleaned

    @field_validator("timezone")
    @classmethod
    def _timezone_exists(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        try:
            ZoneInfo(value)
        except (KeyError, ValueError):
            raise ValueError("Zona horaria IANA no reconocida.")
        return value


# ---------------------------------------------------------------------------
# Política operativa (singleton)
# ---------------------------------------------------------------------------

class BusinessSettingsRead(ApiReadSchema):
    allow_online_orders: bool
    allow_delivery: bool
    allow_pickup: bool
    allow_counter_sales: bool
    allow_customer_registration: bool
    require_registered_user_for_checkout: bool
    order_approval_required: bool
    online_orders_require_open_hours: bool
    minimum_delivery_order_amount: Optional[Decimal] = None
    free_shipping_global_from_amount: Optional[Decimal] = None
    ticket_footer_text: Optional[str] = None
    updated_at: Optional[datetime] = None


class BusinessSettingsUpdate(ApiPatchSchema):
    allow_online_orders: Optional[bool] = None
    allow_delivery: Optional[bool] = None
    allow_pickup: Optional[bool] = None
    allow_counter_sales: Optional[bool] = None
    allow_customer_registration: Optional[bool] = None
    require_registered_user_for_checkout: Optional[bool] = None
    order_approval_required: Optional[bool] = None
    online_orders_require_open_hours: Optional[bool] = None
    minimum_delivery_order_amount: Optional[Decimal] = Field(default=None, ge=0)
    free_shipping_global_from_amount: Optional[Decimal] = Field(default=None, ge=0)
    ticket_footer_text: Optional[str] = None


# ---------------------------------------------------------------------------
# Teléfonos
# ---------------------------------------------------------------------------

class BusinessPhoneBase(ApiWriteSchema):
    label: Optional[str] = Field(default=None, max_length=80)
    phone: str = Field(min_length=7, max_length=30)
    is_whatsapp: bool = False
    is_public: bool = True
    is_primary: bool = False
    sort_order: int = 0


class BusinessPhoneCreate(BusinessPhoneBase):
    pass


class BusinessPhoneUpdate(ApiPatchSchema):
    label: Optional[str] = Field(default=None, max_length=80)
    phone: Optional[str] = Field(default=None, min_length=7, max_length=30)
    is_whatsapp: Optional[bool] = None
    is_public: Optional[bool] = None
    is_primary: Optional[bool] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class BusinessPhoneRead(ApiReadSchema):
    id: UUID
    label: Optional[str] = None
    phone: str
    phone_normalized: str
    is_whatsapp: bool
    is_public: bool
    is_primary: bool
    is_active: bool
    sort_order: int


# ---------------------------------------------------------------------------
# Horario semanal (reemplazo atómico completo)
# ---------------------------------------------------------------------------

class WeeklyHourSlot(ApiWriteSchema):
    day_of_week: int = Field(ge=0, le=6, description="0=lunes … 6=domingo.")
    slot_number: int = Field(default=1, ge=1)
    opens_at: time
    closes_at: time


class WeeklyHoursReplace(ApiWriteSchema):
    """PUT del horario semanal completo: lo enviado sustituye TODO lo anterior."""

    slots: list[WeeklyHourSlot]


class WeeklyHourRead(ApiReadSchema):
    id: UUID
    day_of_week: int
    slot_number: int
    opens_at: time
    closes_at: time
    is_active: bool


# ---------------------------------------------------------------------------
# Fechas especiales
# ---------------------------------------------------------------------------

class SpecialDateSlotInput(ApiWriteSchema):
    slot_number: int = Field(default=1, ge=1)
    opens_at: time
    closes_at: time


class SpecialDateCreate(ApiWriteSchema):
    calendar_date: date
    is_closed: bool = False
    reason: Optional[str] = Field(default=None, max_length=250)
    slots: list[SpecialDateSlotInput] = Field(default_factory=list)


class SpecialDateUpdate(ApiPatchSchema):
    is_closed: Optional[bool] = None
    reason: Optional[str] = Field(default=None, max_length=250)
    # Si se envía, sustituye TODOS los slots de la fecha.
    slots: Optional[list[SpecialDateSlotInput]] = None


class SpecialDateSlotRead(ApiReadSchema):
    slot_number: int
    opens_at: time
    closes_at: time


class SpecialDateRead(ApiReadSchema):
    id: UUID
    calendar_date: date
    is_closed: bool
    reason: Optional[str] = None
    slots: list[SpecialDateSlotRead] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Sitio público
# ---------------------------------------------------------------------------

class PublicBusinessPhone(ApiReadSchema):
    label: Optional[str] = None
    phone: str
    phone_normalized: str
    is_whatsapp: bool


class PublicDaySlot(ApiReadSchema):
    opens_at: time
    closes_at: time


class PublicBusinessRead(ApiReadSchema):
    """Lo que el sitio público necesita del negocio; nada interno."""

    trade_name: str
    slogan: Optional[str] = None
    logo_file_id: Optional[UUID] = None
    currency_code: str
    timezone: str
    is_accepting_orders: bool
    is_open_now: bool
    # Con el switch encendido, «cerrado» BLOQUEA el checkout web (no es solo
    # informativo): el carrito lo usa para avisar y deshabilitar el pago.
    online_orders_require_open_hours: bool
    today_slots: list[PublicDaySlot]
    phones: list[PublicBusinessPhone]
    allow_online_orders: bool
    allow_delivery: bool
    allow_pickup: bool
    minimum_delivery_order_amount: Optional[Decimal] = None
    free_shipping_global_from_amount: Optional[Decimal] = None


# ---------------------------------------------------------------------------
# Página legal pública (Términos y Condiciones + Aviso de Privacidad)
# ---------------------------------------------------------------------------

class PublicLegalCoupon(ApiReadSchema):
    """Definición vigente de un cupón GENERAL, para generar sus cláusulas."""

    code: str
    name: str
    description: Optional[str] = None
    discount_amount: Decimal
    minimum_order_amount: Decimal
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None


class PublicLegalTermsRead(ApiReadSchema):
    """Datos para armar el documento legal autogenerado del sitio (/terminos)."""

    trade_name: str
    legal_name: Optional[str] = None
    main_address: Optional[str] = None
    email: Optional[str] = None
    currency_code: str
    phones: list[PublicBusinessPhone] = Field(default_factory=list)
    coupons: list[PublicLegalCoupon] = Field(default_factory=list)
    # Cláusulas opcionales que el administrador edita en el perfil del negocio.
    terms_extra: Optional[str] = None
    privacy_extra: Optional[str] = None
    generated_at: datetime
