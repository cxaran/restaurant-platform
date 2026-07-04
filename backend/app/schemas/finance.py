"""Schemas de finanzas (§21) y reembolsos por línea (§22.5)."""

from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID

from pydantic import Field

from backend.app.schemas.base import ApiReadSchema, ApiWriteSchema


class FinancialCategoryCreate(ApiWriteSchema):
    direction: Literal["income", "expense"]
    name: str = Field(min_length=1, max_length=120)
    parent_id: Optional[UUID] = None


class FinancialCategoryRead(ApiReadSchema):
    id: UUID
    direction: str
    name: str
    parent_id: Optional[UUID] = None
    is_active: bool


class FinancialEntryCreate(ApiWriteSchema):
    direction: Literal["income", "expense"]
    entry_type: Literal["manual_income", "expense", "delivery_expense", "adjustment"]
    amount: Decimal = Field(gt=0)
    occurred_at: datetime
    category_id: Optional[UUID] = None
    description: Optional[str] = None
    counterparty_name: Optional[str] = Field(default=None, max_length=180)
    supplier_rfc: Optional[str] = Field(default=None, max_length=20)
    invoice_folio: Optional[str] = Field(default=None, max_length=120)
    invoice_uuid: Optional[str] = Field(default=None, max_length=80)
    invoice_issued_at: Optional[datetime] = None


class FinancialEntryVoidRequest(ApiWriteSchema):
    reason: str = Field(min_length=1)


class FinancialEntryAttachmentCreate(ApiWriteSchema):
    file_id: UUID
    document_type: Literal[
        "receipt", "invoice_pdf", "invoice_xml", "payment_proof",
        "expense_photo", "delivery_evidence", "other",
    ]
    description: Optional[str] = Field(default=None, max_length=255)


class FinancialEntryAttachmentRead(ApiReadSchema):
    id: UUID
    file_id: UUID
    document_type: str
    description: Optional[str] = None


class FinancialEntryRead(ApiReadSchema):
    id: UUID
    category_id: Optional[UUID] = None
    order_id: Optional[UUID] = None
    payment_id: Optional[UUID] = None
    reversal_of_entry_id: Optional[UUID] = None
    direction: str
    entry_type: str
    amount: Decimal
    occurred_at: datetime
    status: str
    counterparty_name: Optional[str] = None
    invoice_folio: Optional[str] = None
    description: Optional[str] = None
    source_type: str
    void_reason: Optional[str] = None
    created_at: datetime
    attachments: list[FinancialEntryAttachmentRead] = Field(default_factory=list)


class BusinessSummaryRead(ApiReadSchema):
    """Fórmula del periodo (§21.1): ingresos − gastos − reembolsos."""

    income_total: Decimal
    expense_total: Decimal
    refund_total: Decimal
    net_result: Decimal
    entry_count: int


# ---------------------------------------------------------------------------
# Reembolsos
# ---------------------------------------------------------------------------

class RefundAllocationItem(ApiWriteSchema):
    order_line_id: UUID
    refunded_quantity: Decimal = Field(gt=0)
    money_refunded_amount: Decimal = Field(ge=0)
    reason: Optional[str] = None


class RefundCreate(ApiWriteSchema):
    amount: Decimal = Field(gt=0)
    reason: str = Field(min_length=1)
    allocations: list[RefundAllocationItem] = Field(default_factory=list)
    transaction_reference: Optional[str] = Field(default=None, max_length=180)
    bank_name: Optional[str] = Field(default=None, max_length=120)


class RefundRead(ApiReadSchema):
    id: UUID
    payment_id: UUID
    amount: Decimal
    reason: str
    status: str
    processed_at: Optional[datetime] = None
