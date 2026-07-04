"""Schemas de pedidos (§14–§17): checkout, captura por personal y lecturas.

El cliente sólo envía IDs y cantidades — nunca precios ni saldos (§22.6).
Pedido íntegro (§1.3): `purchase_mode` aplica a TODO el pedido (money XOR
credits); el backend rechaza mezcla, envío y cargos monetarios en canje.
"""

from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID

from pydantic import Field

from backend.app.schemas.address import GeoPoint
from backend.app.schemas.base import ApiReadSchema, ApiWriteSchema
from backend.app.schemas.delivery import PublicCourierInfo


# ---------------------------------------------------------------------------
# Entrada: carrito
# ---------------------------------------------------------------------------

class OrderModifierInput(ApiWriteSchema):
    modifier_option_id: UUID
    # H1: entero ESTRICTO — rechaza también "1", "1.0", 1.0 y true/false.
    quantity: int = Field(default=1, ge=1, strict=True)


class OrderLineInput(ApiWriteSchema):
    product_id: UUID
    quantity: int = Field(ge=1, strict=True)
    purchase_mode: Literal["money", "credits"] = "money"
    modifiers: list[OrderModifierInput] = Field(default_factory=list)
    customer_note: Optional[str] = None


class DeliveryInput(ApiWriteSchema):
    """Dirección de entrega: guardada (propia) o capturada manualmente."""

    user_address_id: Optional[UUID] = None
    recipient_name: Optional[str] = Field(default=None, max_length=180)
    recipient_phone: Optional[str] = Field(default=None, max_length=30)
    street: Optional[str] = Field(default=None, max_length=180)
    external_number: Optional[str] = Field(default=None, max_length=30)
    internal_number: Optional[str] = Field(default=None, max_length=30)
    neighborhood: Optional[str] = Field(default=None, max_length=120)
    city: Optional[str] = Field(default=None, max_length=120)
    postal_code: Optional[str] = Field(default=None, max_length=20)
    references: Optional[str] = None
    location: Optional[GeoPoint] = None
    delivery_note: Optional[str] = None


class CheckoutRequest(ApiWriteSchema):
    """Checkout del sitio (source=online): SIEMPRE usuario registrado (§1.2)."""

    fulfillment_type: Literal["delivery", "pickup"]
    # Pedido íntegro (§1.3): el modo aplica a TODO el carrito; toda línea debe
    # coincidir con él (el backend rechaza mezcla con `modo_compra_mixto`).
    purchase_mode: Literal["money", "credits"] = "money"
    lines: list[OrderLineInput] = Field(min_length=1)
    customer_name: str = Field(min_length=1, max_length=180)
    customer_phone: str = Field(min_length=7, max_length=30)
    customer_note: Optional[str] = None
    delivery: Optional[DeliveryInput] = None
    # Etapa 5 RC: código de descuento fijo, SOLO en checkout web (la captura
    # por personal jamás aplica códigos). Sólo viaja el string; los montos los
    # calcula el backend.
    discount_code: Optional[str] = Field(default=None, max_length=40)


class CaptureRequest(ApiWriteSchema):
    """Captura por personal (§1.2): cliente OPCIONAL; el empleado queda registrado."""

    source: Literal["counter", "phone", "whatsapp", "social", "manual"]
    fulfillment_type: Literal["delivery", "pickup", "counter"]
    purchase_mode: Literal["money", "credits"] = "money"
    lines: list[OrderLineInput] = Field(min_length=1)
    customer_user_id: Optional[UUID] = None
    customer_name: Optional[str] = Field(default=None, max_length=180)
    customer_phone: Optional[str] = Field(default=None, max_length=30)
    customer_email: Optional[str] = Field(default=None, max_length=180)
    customer_note: Optional[str] = None
    internal_note: Optional[str] = None
    delivery: Optional[DeliveryInput] = None


# ---------------------------------------------------------------------------
# Acciones internas
# ---------------------------------------------------------------------------

class OrderTransitionRequest(ApiWriteSchema):
    new_status: str
    # H5 (§1.6): cancelar con pago cobrado exige RESOLUCIÓN financiera
    # explícita (cancelar no reembolsa); «retain» exige motivo auditable.
    payment_resolution: Optional[Literal["refund_now", "refund_pending", "retain"]] = None
    resolution_reason: Optional[str] = None
    reason_code: Optional[str] = Field(default=None, max_length=80)
    internal_note: Optional[str] = None
    customer_visible_note: Optional[str] = None


class OrderShippingFinalizeRequest(ApiWriteSchema):
    """Fija el envío (§17.2): tarifa existente O monto manual con motivo O
    ubicación en mapa (el backend recotiza por polígono y fija el resultado).

    ``location`` además PERSISTE el pin en la entrega (location_source
    employee_selected); puede acompañar al monto manual cuando el punto queda
    fuera de zona pero conviene guardar la ubicación de todos modos."""

    shipping_rate_rule_id: Optional[UUID] = None
    final_amount: Optional[Decimal] = Field(default=None, ge=0)
    reason: Optional[str] = None
    location: Optional[GeoPoint] = None


class OrderAdjustmentCreate(ApiWriteSchema):
    adjustment_type: Literal["discount", "promotion", "courtesy", "manual_fee"]
    direction: Literal["charge", "discount"]
    amount: Decimal = Field(gt=0)
    reason: str = Field(min_length=1)


# ---------------------------------------------------------------------------
# Lecturas
# ---------------------------------------------------------------------------

class OrderLineModifierRead(ApiReadSchema):
    group_name_snapshot: str
    option_name_snapshot: str
    quantity: int
    unit_price_adjustment: Decimal
    total_amount: Decimal


class OrderLineRead(ApiReadSchema):
    id: UUID
    product_id: Optional[UUID] = None
    product_name_snapshot: str
    quantity: int
    purchase_mode: str
    money_unit_price_snapshot: Decimal
    modifier_money_total_per_unit: Decimal
    money_line_total_amount: Decimal
    credits_earned_total_snapshot: int
    credits_redeemed_total: int
    customer_note: Optional[str] = None
    modifiers: list[OrderLineModifierRead] = Field(default_factory=list)


class OrderAdjustmentRead(ApiReadSchema):
    id: UUID
    adjustment_type: str
    direction: str
    amount: Decimal
    reason: str


class OrderShippingRead(ApiReadSchema):
    calculation_status: str
    calculation_source: str
    delivery_zone_name_snapshot: Optional[str] = None
    shipping_rate_name_snapshot: Optional[str] = None
    estimated_amount: Optional[Decimal] = None
    final_amount: Optional[Decimal] = None
    is_free_shipping: bool


class OrderDeliveryRead(ApiReadSchema):
    recipient_name: str
    recipient_phone: str
    street: str
    external_number: Optional[str] = None
    internal_number: Optional[str] = None
    neighborhood: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    references: Optional[str] = None
    location: Optional[GeoPoint] = None
    location_source: str
    delivery_note: Optional[str] = None
    delivered_at: Optional[datetime] = None


class OrderVisibleNoteRead(ApiReadSchema):
    """Aclaración registrada en una transición (p. ej. al aprobar) y visible
    fuera del equipo: la ven el cliente en su seguimiento y el repartidor en
    su entrega, además del panel. La nota interna NUNCA sale por aquí."""

    new_status: str
    note: str
    changed_at: datetime


class OrderRead(ApiReadSchema):
    """Vista interna completa (panel)."""

    id: UUID
    order_number: int
    public_code: str
    customer_user_id: Optional[UUID] = None
    source: str
    fulfillment_type: str
    purchase_mode: str
    status: str
    payment_status: str
    customer_name_snapshot: Optional[str] = None
    customer_phone_snapshot: Optional[str] = None
    items_subtotal_amount: Decimal
    discount_total_amount: Decimal
    shipping_total_amount: Optional[Decimal] = None
    total_money_amount: Optional[Decimal] = None
    credits_earned_total_snapshot: int
    credits_redeemed_total: int
    customer_note: Optional[str] = None
    internal_note: Optional[str] = None
    cancellation_money_resolution: Optional[str] = None
    cancellation_resolution_note: Optional[str] = None
    created_by: Optional[UUID] = None
    created_at: datetime
    lines: list[OrderLineRead] = Field(default_factory=list)
    adjustments: list[OrderAdjustmentRead] = Field(default_factory=list)
    shipping: Optional[OrderShippingRead] = None
    delivery: Optional[OrderDeliveryRead] = None
    visible_notes: list[OrderVisibleNoteRead] = Field(default_factory=list)


class OrderListItem(ApiReadSchema):
    id: UUID
    public_code: str
    source: str
    fulfillment_type: str
    purchase_mode: str
    status: str
    payment_status: str
    customer_name_snapshot: Optional[str] = None
    items_subtotal_amount: Decimal
    total_money_amount: Optional[Decimal] = None
    created_at: datetime


class CancelledWithPaymentItem(ApiReadSchema):
    """Cola de conciliación H5: cancelados con cobro y devolución abierta."""

    order_id: UUID
    public_code: str
    cancelled_at: Optional[datetime] = None
    cancellation_money_resolution: Optional[str] = None
    cancellation_resolution_note: Optional[str] = None
    paid_total: Decimal
    refunded_total: Decimal
    outstanding_amount: Decimal


class MyOrderRead(ApiReadSchema):
    """Vista del CLIENTE: etiqueta pública, sin datos internos (§58.2)."""

    id: UUID
    public_code: str
    status: str
    status_label: str
    fulfillment_type: str
    purchase_mode: str
    items_subtotal_amount: Decimal
    # Descuento por código (Etapa 5): monto aplicado y etiqueta snapshot
    # («Código VERANO100») — histórico, nunca la definición vigente.
    discount_total_amount: Decimal = Decimal("0")
    discount_code_label: Optional[str] = None
    shipping_amount: Optional[Decimal] = None
    shipping_pending_review: bool
    total_money_amount: Optional[Decimal] = None
    credits_earned_total_snapshot: int
    credits_redeemed_total: int
    customer_note: Optional[str] = None
    created_at: datetime
    lines: list[OrderLineRead] = Field(default_factory=list)
    delivery: Optional[OrderDeliveryRead] = None
    # Visible SOLO con el pedido en camino y asignación vigente (§19.2).
    courier: Optional[PublicCourierInfo] = None
    # Aclaraciones del restaurante hacia el cliente (§15.4: bitácora).
    visible_notes: list[OrderVisibleNoteRead] = Field(default_factory=list)
