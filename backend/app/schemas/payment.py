"""Schemas de pagos, tickets y venta de mostrador (§18, §20, §58.1-POS)."""

from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID

from pydantic import Field

from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema
from backend.app.schemas.order import OrderLineInput, OrderRead


# ---------------------------------------------------------------------------
# Pagos
# ---------------------------------------------------------------------------

class PaymentCreate(ApiWriteSchema):
    method_code: str = Field(min_length=1, max_length=40)
    # Si se omite, se usa el total congelado del pedido (o el subtotal + envío).
    expected_amount: Optional[Decimal] = Field(default=None, ge=0)
    change_requested_for_amount: Optional[Decimal] = Field(default=None, ge=0)
    transaction_reference: Optional[str] = Field(default=None, max_length=180)
    bank_name: Optional[str] = Field(default=None, max_length=120)
    terminal_name: Optional[str] = Field(default=None, max_length=120)
    card_last_four: Optional[str] = Field(default=None, min_length=4, max_length=4)
    notes: Optional[str] = None


class PaymentVerifyRequest(ApiWriteSchema):
    approve: bool
    received_amount: Optional[Decimal] = Field(default=None, ge=0)
    rejected_reason: Optional[str] = None


class PaymentAttachmentCreate(ApiWriteSchema):
    file_id: UUID
    attachment_type: Literal["payment_proof", "terminal_receipt", "refund_proof", "other"]
    description: Optional[str] = Field(default=None, max_length=255)


class PaymentAttachmentRead(ApiReadSchema):
    id: UUID
    file_id: UUID
    attachment_type: str
    description: Optional[str] = None


class PaymentRead(ApiReadSchema):
    id: UUID
    order_id: UUID
    payment_method_name_snapshot: str
    status: str
    expected_amount: Decimal
    received_amount: Decimal
    change_requested_for_amount: Optional[Decimal] = None
    change_amount: Decimal
    transaction_reference: Optional[str] = None
    bank_name: Optional[str] = None
    terminal_name: Optional[str] = None
    card_last_four: Optional[str] = None
    rejected_reason: Optional[str] = None
    notes: Optional[str] = None
    paid_at: Optional[datetime] = None
    created_at: datetime
    attachments: list[PaymentAttachmentRead] = Field(default_factory=list)


class PaymentMethodPublic(ApiReadSchema):
    """Método visible al elegir cómo pagar (sitio público y POS)."""

    code: str
    display_name: str
    instructions: Optional[str] = None
    requires_transaction_reference: bool
    requires_bank_name: bool
    requires_payment_proof: bool
    allows_cash_change: bool


# ---------------------------------------------------------------------------
# Métodos de pago (administración §18.1): CRUD del recurso genérico
# ---------------------------------------------------------------------------

_ACTIVE_FILTER = {
    "operator": "eq",
    "label": "Estado",
    "widget": "select",
    "options": [
        {"value": "true", "label": "Activos"},
        {"value": "false", "label": "Inactivos"},
    ],
}


class PaymentMethodConfigListItem(ApiReadSchema):
    """Fila del listado administrativo genérico de métodos de pago."""

    id: UUID
    code: str = Field(title="Código", json_schema_extra={"ui": {"list": True}})
    display_name: str = Field(title="Nombre", json_schema_extra={"ui": {"list": True}})
    available_online: bool = Field(
        title="En línea", json_schema_extra={"ui": {"list": True}}
    )
    available_pos: bool = Field(
        title="Mostrador", json_schema_extra={"ui": {"list": True}}
    )
    requires_manual_verification: bool = Field(
        title="Verificación manual", json_schema_extra={"ui": {"list": True}}
    )
    allows_cash_change: bool = Field(title="Da cambio")
    is_active: bool = Field(
        title="Activo",
        json_schema_extra={"ui": {"list": True, "filter": _ACTIVE_FILTER}},
    )
    sort_order: int = Field(title="Orden")
    created_at: datetime


class PaymentMethodConfigRead(ApiReadSchema):
    id: UUID
    code: str
    display_name: str
    instructions: Optional[str] = None
    available_online: bool
    available_pos: bool
    requires_manual_verification: bool
    requires_transaction_reference: bool
    requires_bank_name: bool
    requires_payment_proof: bool
    allows_cash_change: bool
    is_active: bool
    sort_order: int
    created_at: datetime
    updated_at: Optional[datetime] = None


class PaymentMethodConfigCreate(ApiWriteSchema):
    code: str = Field(
        min_length=1,
        max_length=40,
        pattern=r"^[a-z0-9_]+$",
        title="Código (minúsculas, sin espacios)",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    display_name: str = Field(
        min_length=1,
        max_length=80,
        title="Nombre visible",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    instructions: Optional[str] = Field(
        default=None,
        title="Instrucciones para el cliente",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    available_online: bool = Field(
        default=True,
        title="Disponible en línea",
        json_schema_extra={"ui": {"form": True, "widget": "switch"}},
    )
    available_pos: bool = Field(
        default=True,
        title="Disponible en mostrador",
        json_schema_extra={"ui": {"form": True, "widget": "switch"}},
    )
    requires_manual_verification: bool = Field(
        default=False,
        title="Requiere verificación manual",
        json_schema_extra={"ui": {"form": True, "widget": "switch"}},
    )
    requires_transaction_reference: bool = Field(
        default=False,
        title="Requiere referencia",
        json_schema_extra={"ui": {"form": True, "widget": "switch"}},
    )
    requires_bank_name: bool = Field(
        default=False,
        title="Requiere banco",
        json_schema_extra={"ui": {"form": True, "widget": "switch"}},
    )
    requires_payment_proof: bool = Field(
        default=False,
        title="Requiere comprobante",
        json_schema_extra={"ui": {"form": True, "widget": "switch"}},
    )
    allows_cash_change: bool = Field(
        default=False,
        title="Permite cambio en efectivo",
        json_schema_extra={"ui": {"form": True, "widget": "switch"}},
    )
    sort_order: int = Field(
        default=0,
        title="Orden",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )


class PaymentMethodConfigUpdate(ApiPatchSchema):
    """PATCH parcial; el ``code`` es INMUTABLE (los pagos históricos lo citan
    vía snapshot y el checkout lo referencia — cambiarlo rompería enlaces)."""

    display_name: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=80,
        title="Nombre visible",
        json_schema_extra={"ui": {"form": True, "widget": "text"}},
    )
    instructions: Optional[str] = Field(
        default=None,
        title="Instrucciones para el cliente",
        json_schema_extra={"ui": {"form": True, "widget": "textarea"}},
    )
    available_online: Optional[bool] = Field(
        default=None,
        title="Disponible en línea",
        json_schema_extra={"ui": {"form": True, "widget": "switch"}},
    )
    available_pos: Optional[bool] = Field(
        default=None,
        title="Disponible en mostrador",
        json_schema_extra={"ui": {"form": True, "widget": "switch"}},
    )
    requires_manual_verification: Optional[bool] = Field(
        default=None,
        title="Requiere verificación manual",
        json_schema_extra={"ui": {"form": True, "widget": "switch"}},
    )
    requires_transaction_reference: Optional[bool] = Field(
        default=None,
        title="Requiere referencia",
        json_schema_extra={"ui": {"form": True, "widget": "switch"}},
    )
    requires_bank_name: Optional[bool] = Field(
        default=None,
        title="Requiere banco",
        json_schema_extra={"ui": {"form": True, "widget": "switch"}},
    )
    requires_payment_proof: Optional[bool] = Field(
        default=None,
        title="Requiere comprobante",
        json_schema_extra={"ui": {"form": True, "widget": "switch"}},
    )
    allows_cash_change: Optional[bool] = Field(
        default=None,
        title="Permite cambio en efectivo",
        json_schema_extra={"ui": {"form": True, "widget": "switch"}},
    )
    sort_order: Optional[int] = Field(
        default=None,
        title="Orden",
        json_schema_extra={"ui": {"form": True, "widget": "number"}},
    )
    is_active: Optional[bool] = None


# ---------------------------------------------------------------------------
# Ticket (§20) — payload imprimible desde snapshots
# ---------------------------------------------------------------------------

class TicketBusiness(ApiReadSchema):
    trade_name: str
    slogan: Optional[str] = None
    logo_file_id: Optional[UUID] = None
    footer_text: Optional[str] = None


class TicketCustomer(ApiReadSchema):
    name: Optional[str] = None
    phone: Optional[str] = None


class TicketDelivery(ApiReadSchema):
    street: str
    external_number: Optional[str] = None
    internal_number: Optional[str] = None
    neighborhood: Optional[str] = None
    city: Optional[str] = None
    references: Optional[str] = None


class TicketLineModifier(ApiReadSchema):
    group: str
    option: str
    quantity: int
    total: Decimal


class TicketLine(ApiReadSchema):
    name: str
    quantity: int
    purchase_mode: str
    unit_price: Decimal
    line_total: Decimal
    customer_note: Optional[str] = None
    credits_redeemed: int
    modifiers: list[TicketLineModifier] = Field(default_factory=list)


class TicketTotals(ApiReadSchema):
    items_subtotal: Decimal
    discounts: Decimal
    # Código aplicado (snapshot de la redención activa) — la spec exige que el
    # descuento aparezca en el ticket con su concepto.
    discount_code: Optional[str] = None
    shipping: Optional[Decimal] = None
    total: Optional[Decimal] = None
    credits_earned: int
    credits_redeemed: int


class TicketPayment(ApiReadSchema):
    method: str
    status: str
    expected_amount: Decimal
    received_amount: Optional[Decimal] = None
    change_requested_for_amount: Optional[Decimal] = None
    change_amount: Decimal


class TicketRead(ApiReadSchema):
    business: TicketBusiness
    public_code: str
    created_at: datetime
    source: str
    fulfillment_type: str
    status: str
    status_label: str
    attended_by: Optional[str] = None
    customer: TicketCustomer
    delivery: Optional[TicketDelivery] = None
    lines: list[TicketLine]
    totals: TicketTotals
    payments: list[TicketPayment] = Field(default_factory=list)


class TicketPrintCreate(ApiWriteSchema):
    print_type: Literal[
        "customer_receipt", "kitchen_ticket", "delivery_ticket", "counter_ticket"
    ]
    printer_name: Optional[str] = Field(default=None, max_length=180)
    copy_number: int = Field(default=1, ge=1)


class TicketPrintRead(ApiReadSchema):
    id: UUID
    order_id: UUID
    print_type: str
    printer_name: Optional[str] = None
    printed_by: Optional[UUID] = None
    copy_number: int
    printed_at: datetime


# ---------------------------------------------------------------------------
# Venta a mostrador (POS): pedido + pago + completado en UNA transacción
# ---------------------------------------------------------------------------

class PosPaymentInput(ApiWriteSchema):
    method_code: str = Field(min_length=1, max_length=40)
    change_requested_for_amount: Optional[Decimal] = Field(default=None, ge=0)
    transaction_reference: Optional[str] = Field(default=None, max_length=180)
    bank_name: Optional[str] = Field(default=None, max_length=120)
    terminal_name: Optional[str] = Field(default=None, max_length=120)
    card_last_four: Optional[str] = Field(default=None, min_length=4, max_length=4)


class PosSaleRequest(ApiWriteSchema):
    lines: list[OrderLineInput] = Field(min_length=1)
    # Fuente del pedido (1h): la venta cobrada al momento puede originarse por
    # teléfono/redes además del mostrador; el cumplimiento sigue siendo counter.
    source: Literal["counter", "phone", "whatsapp", "social", "manual"] = "counter"
    customer_user_id: Optional[UUID] = None
    customer_name: Optional[str] = Field(default=None, max_length=180)
    payment: PosPaymentInput
    internal_note: Optional[str] = None


class PosSaleResult(ApiReadSchema):
    order: OrderRead
    payment: PaymentRead
