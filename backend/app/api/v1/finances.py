"""Finanzas (§21) bajo ``finances:*`` y reembolsos bajo ``payments:refund``."""

import uuid
from datetime import datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Query, status
from sqlmodel import select

from backend.app.api.resource_actions import (
    api_error,
    commit_or_conflict,
    get_or_404,
    paginate_resource,
)
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.models.finances import (
    FinancialCategory,
    FinancialEntry,
    FinancialEntryAttachment,
)
from backend.app.models.orders import Order
from backend.app.models.payments import Payment
from backend.app.resources.registry import FINANCE_CATEGORIES
from backend.app.schemas.finance import (
    BusinessSummaryRead,
    CreditRefundAllocationRead,
    CreditRefundCreate,
    FinancialCategoryCreate,
    FinancialCategoryListItem,
    FinancialCategoryRead,
    FinancialEntryAttachmentCreate,
    FinancialEntryAttachmentRead,
    FinancialEntryCreate,
    FinancialEntryRead,
    FinancialEntryVoidRequest,
    RefundCreate,
    RefundRead,
)
from backend.app.schemas.pagination import OffsetPage
from backend.app.security.groups.finances import FinancePermissions
from backend.app.security.groups.payments import PaymentPermissions
from backend.app.services.file_service import get_active_file
from backend.app.services.finance_service import (
    FinanceRuleError,
    RefundAllocationInput,
    business_summary,
    create_refund,
    record_manual_entry,
    refund_credits_only_line,
    void_entry,
)

router = APIRouter(tags=["finances"])

_ENTRY_NOT_FOUND = "Movimiento no encontrado"


def _entry_read(entry: FinancialEntry) -> FinancialEntryRead:
    data = {
        field: getattr(entry, field)
        for field in FinancialEntryRead.model_fields
        if field != "attachments"
    }
    return FinancialEntryRead(
        **data,
        attachments=[
            FinancialEntryAttachmentRead.model_validate(item, from_attributes=True)
            for item in entry.attachments
        ],
    )


@router.get("/finances/categories", response_model=OffsetPage[FinancialCategoryListItem])
def list_categories(
    session: SessionDep,
    query: Annotated[FINANCE_CATEGORIES.Query, Query()],  # pyright: ignore[reportInvalidTypeForm]
    _: FinancePermissions.READ.requiere,
) -> OffsetPage[FinancialCategoryListItem]:
    """Listado genérico (motor de query): filtro por dirección/estado y búsqueda."""
    return paginate_resource(FINANCE_CATEGORIES, session, query)


@router.get("/finances/categories/{category_id}", response_model=FinancialCategoryRead)
def get_finance_category(
    category_id: uuid.UUID,
    session: SessionDep,
    _: FinancePermissions.READ.requiere,
) -> FinancialCategoryRead:
    category = get_or_404(session, FinancialCategory, category_id, "Categoría no encontrada")
    return FinancialCategoryRead.model_validate(category, from_attributes=True)


@router.post(
    "/finances/categories",
    response_model=FinancialCategoryRead,
    status_code=status.HTTP_201_CREATED,
)
def create_category(
    payload: FinancialCategoryCreate,
    session: SessionDep,
    _: FinancePermissions.RECORD.requiere,
) -> FinancialCategoryRead:
    if payload.parent_id is not None:
        parent = session.get(FinancialCategory, payload.parent_id)
        if parent is None or parent.direction != payload.direction:
            api_error(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "categoria_invalida",
                "La categoría padre no existe o es de otra dirección.",
            )
    category = FinancialCategory(**payload.model_dump())
    session.add(category)
    commit_or_conflict(session, "Ya existe una categoría con ese nombre.")
    session.refresh(category)
    return FinancialCategoryRead.model_validate(category, from_attributes=True)


@router.get("/finances/entries", response_model=list[FinancialEntryRead])
def list_entries(
    session: SessionDep,
    _: FinancePermissions.READ.requiere,
    direction: Optional[str] = Query(default=None),
    entry_type: Optional[str] = Query(default=None),
    date_from: Optional[datetime] = Query(default=None, alias="from"),
    date_to: Optional[datetime] = Query(default=None, alias="to"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[FinancialEntryRead]:
    stmt = select(FinancialEntry)
    if direction:
        stmt = stmt.where(FinancialEntry.direction == direction)
    if entry_type:
        stmt = stmt.where(FinancialEntry.entry_type == entry_type)
    if date_from:
        stmt = stmt.where(FinancialEntry.occurred_at >= date_from)
    if date_to:
        stmt = stmt.where(FinancialEntry.occurred_at < date_to)
    stmt = (
        stmt.order_by(FinancialEntry.occurred_at.desc())  # pyright: ignore[reportAttributeAccessIssue]
        .offset(offset)
        .limit(limit)
    )
    return [_entry_read(entry) for entry in session.exec(stmt).all()]


@router.post(
    "/finances/entries", response_model=FinancialEntryRead, status_code=status.HTTP_201_CREATED
)
def create_entry(
    payload: FinancialEntryCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: FinancePermissions.RECORD.requiere,
) -> FinancialEntryRead:
    try:
        entry = record_manual_entry(
            session, registered_by=current_user.id, **payload.model_dump()
        )
    except FinanceRuleError as exc:
        api_error(status.HTTP_422_UNPROCESSABLE_ENTITY, exc.code, exc.message)
    commit_or_conflict(session, "No fue posible registrar el movimiento.")
    session.refresh(entry)
    return _entry_read(entry)


@router.post("/finances/entries/{entry_id}/void", response_model=FinancialEntryRead)
def void_financial_entry(
    entry_id: uuid.UUID,
    payload: FinancialEntryVoidRequest,
    session: SessionDep,
    current_user: CurrentUser,
    _: FinancePermissions.VOID.requiere,
) -> FinancialEntryRead:
    entry = get_or_404(session, FinancialEntry, entry_id, _ENTRY_NOT_FOUND)
    try:
        void_entry(session, entry, actor_id=current_user.id, reason=payload.reason)
    except FinanceRuleError as exc:
        api_error(status.HTTP_409_CONFLICT, exc.code, exc.message)
    commit_or_conflict(session, "No fue posible anular el movimiento.")
    session.refresh(entry)
    return _entry_read(entry)


@router.post(
    "/finances/entries/{entry_id}/attachments",
    response_model=FinancialEntryRead,
    status_code=status.HTTP_201_CREATED,
)
def attach_entry_evidence(
    entry_id: uuid.UUID,
    payload: FinancialEntryAttachmentCreate,
    session: SessionDep,
    _: FinancePermissions.RECORD.requiere,
) -> FinancialEntryRead:
    entry = get_or_404(session, FinancialEntry, entry_id, _ENTRY_NOT_FOUND)
    stored = get_active_file(session, payload.file_id)
    if stored is None or stored.kind not in ("image", "document"):
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "archivo_invalido",
            "El archivo no existe, está inactivo o no es una evidencia válida.",
        )
    session.add(FinancialEntryAttachment(financial_entry_id=entry.id, **payload.model_dump()))
    commit_or_conflict(session, "No fue posible asociar la evidencia.")
    session.refresh(entry)
    return _entry_read(entry)


@router.get("/finances/summary", response_model=BusinessSummaryRead)
def read_summary(
    session: SessionDep,
    _: FinancePermissions.READ.requiere,
    date_from: datetime = Query(alias="from"),
    date_to: datetime = Query(alias="to"),
) -> BusinessSummaryRead:
    summary = business_summary(session, date_from=date_from, date_to=date_to)
    return BusinessSummaryRead(
        income_total=summary.income_total,
        expense_total=summary.expense_total,
        refund_total=summary.refund_total,
        net_result=summary.net_result,
        entry_count=summary.entry_count,
    )


# ---------------------------------------------------------------------------
# Reembolsos (§18.4): nunca borran el pago original
# ---------------------------------------------------------------------------

@router.post(
    "/orders/{order_id}/credit-refunds",
    response_model=CreditRefundAllocationRead,
    status_code=status.HTTP_201_CREATED,
)
def refund_credit_line(
    order_id: uuid.UUID,
    payload: CreditRefundCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: PaymentPermissions.REFUND.requiere,
) -> CreditRefundAllocationRead:
    """Devolución de una línea 100% canjeada: pedidos SIN pago monetario.

    No crea pagos ni reembolsos monetarios ficticios: la asignación vive sin
    ``payment_refund_id`` (dinero 0 por CHECK), con actor y motivo, y el ledger
    aplica sólo lo devolvible según el estado del canje (H2/H3).
    """
    order = get_or_404(session, Order, order_id, "Pedido no encontrado")
    try:
        allocation = refund_credits_only_line(
            session,
            order,
            order_line_id=payload.order_line_id,
            refunded_quantity=payload.refunded_quantity,
            reason=payload.reason,
            processed_by=current_user.id,
        )
    except FinanceRuleError as exc:
        api_error(status.HTTP_422_UNPROCESSABLE_ENTITY, exc.code, exc.message)
    commit_or_conflict(session, "No fue posible registrar la devolución.")
    session.refresh(allocation)
    return CreditRefundAllocationRead.model_validate(allocation, from_attributes=True)


@router.post(
    "/payments/{payment_id}/refunds",
    response_model=RefundRead,
    status_code=status.HTTP_201_CREATED,
)
def refund_payment(
    payment_id: uuid.UUID,
    payload: RefundCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: PaymentPermissions.REFUND.requiere,
) -> RefundRead:
    payment = get_or_404(session, Payment, payment_id, "Pago no encontrado")
    order = get_or_404(session, Order, payment.order_id, "Pedido no encontrado")
    try:
        refund = create_refund(
            session,
            order,
            payment,
            amount=payload.amount,
            reason=payload.reason,
            processed_by=current_user.id,
            allocations=[
                RefundAllocationInput(
                    order_line_id=item.order_line_id,
                    refunded_quantity=item.refunded_quantity,
                    money_refunded_amount=item.money_refunded_amount,
                    reason=item.reason,
                )
                for item in payload.allocations
            ],
            transaction_reference=payload.transaction_reference,
            bank_name=payload.bank_name,
        )
    except FinanceRuleError as exc:
        api_error(status.HTTP_422_UNPROCESSABLE_ENTITY, exc.code, exc.message)
    commit_or_conflict(session, "No fue posible registrar el reembolso.")
    session.refresh(refund)
    return RefundRead.model_validate(refund, from_attributes=True)
