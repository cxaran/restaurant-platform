"""Servicio financiero (§21): ingresos por pago, gastos, anulación y resumen.

Reglas duras:
 - UN ingreso por pago cobrado (§21.4): idempotente en código y garantizado
   por índice único parcial en la base;
 - nada se elimina: los movimientos se ANULAN (quién/cuándo/por qué) y los
   reembolsos referencian el ingreso original;
 - el resultado del periodo es la fórmula del reporte (§21.1):
   ingresos − gastos − reembolsos, sobre movimientos NO anulados.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlmodel import Session, select

from backend.app.models.finances import (
    FinancialCategory,
    FinancialEntry,
    OrderLineRefundAllocation,
)
from backend.app.models.orders import Order, OrderLine
from backend.app.models.payments import Payment, PaymentRefund
from backend.app.services.payment_service import recompute_order_payment_status
from backend.app.utils.utc_now import utc_now


class FinanceRuleError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _category_by_name(
    session: Session, direction: str, name: str
) -> Optional[FinancialCategory]:
    return session.exec(
        select(FinancialCategory).where(
            FinancialCategory.direction == direction, FinancialCategory.name == name
        )
    ).first()


def record_payment_income(session: Session, order: Order, payment: Payment) -> FinancialEntry:
    """UN ingreso por pago cobrado (§21.4). Idempotente: regresa el existente."""
    existing = session.exec(
        select(FinancialEntry).where(
            FinancialEntry.payment_id == payment.id,
            FinancialEntry.entry_type == "payment_income",
        )
    ).first()
    if existing is not None:
        return existing

    sales = _category_by_name(session, "income", "Ventas")
    entry = FinancialEntry(
        category_id=sales.id if sales else None,
        order_id=order.id,
        payment_id=payment.id,
        direction="income",
        entry_type="payment_income",
        amount=payment.received_amount or payment.expected_amount,
        occurred_at=payment.paid_at or utc_now(),
        payment_method_config_id=payment.payment_method_config_id,
        transaction_reference=payment.transaction_reference,
        bank_name=payment.bank_name,
        terminal_name=payment.terminal_name,
        description=f"Pago recibido del pedido {order.public_code}.",
        source_type="system",
    )
    session.add(entry)
    session.flush()
    return entry


def record_manual_entry(
    session: Session,
    *,
    direction: str,
    entry_type: str,
    amount: Decimal,
    occurred_at: datetime,
    registered_by: uuid.UUID,
    category_id: Optional[uuid.UUID] = None,
    description: Optional[str] = None,
    counterparty_name: Optional[str] = None,
    supplier_rfc: Optional[str] = None,
    invoice_folio: Optional[str] = None,
    invoice_uuid: Optional[str] = None,
    invoice_issued_at: Optional[datetime] = None,
) -> FinancialEntry:
    """Gasto o ingreso MANUAL con evidencias opcionales (§21.3)."""
    if amount <= 0:
        raise FinanceRuleError("monto_invalido", "El monto debe ser mayor a cero.")
    valid_types = {
        "income": {"manual_income", "adjustment"},
        "expense": {"expense", "delivery_expense", "adjustment"},
    }.get(direction)
    if valid_types is None or entry_type not in valid_types:
        raise FinanceRuleError(
            "tipo_incoherente", "El tipo de movimiento no corresponde a la dirección."
        )
    if category_id is not None:
        category = session.get(FinancialCategory, category_id)
        if category is None or not category.is_active or category.direction != direction:
            raise FinanceRuleError(
                "categoria_invalida", "La categoría no existe o no corresponde."
            )

    entry = FinancialEntry(
        category_id=category_id,
        direction=direction,
        entry_type=entry_type,
        amount=amount,
        occurred_at=occurred_at,
        description=description,
        counterparty_name=counterparty_name,
        supplier_rfc=supplier_rfc,
        invoice_folio=invoice_folio,
        invoice_uuid=invoice_uuid,
        invoice_issued_at=invoice_issued_at,
        source_type="manual",
        registered_by=registered_by,
    )
    session.add(entry)
    session.flush()
    return entry


def void_entry(
    session: Session, entry: FinancialEntry, *, actor_id: uuid.UUID, reason: str
) -> FinancialEntry:
    """Anula un movimiento con historial (§2: nunca se elimina)."""
    if entry.status == "voided":
        raise FinanceRuleError("movimiento_anulado", "El movimiento ya está anulado.")
    if entry.source_type == "system":
        raise FinanceRuleError(
            "movimiento_de_sistema",
            "Los ingresos de pagos no se anulan a mano: usa un reembolso.",
        )
    entry.status = "voided"
    entry.voided_by = actor_id
    entry.voided_at = utc_now()
    entry.void_reason = reason
    entry.updated_at = utc_now()
    session.add(entry)
    session.flush()
    return entry


# ---------------------------------------------------------------------------
# Reembolsos (§18.4 + §22.5)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class RefundAllocationInput:
    order_line_id: uuid.UUID
    refunded_quantity: Decimal
    money_refunded_amount: Decimal
    reason: Optional[str] = None


def create_refund(
    session: Session,
    order: Order,
    payment: Payment,
    *,
    amount: Decimal,
    reason: str,
    processed_by: uuid.UUID,
    allocations: list[RefundAllocationInput],
    transaction_reference: Optional[str] = None,
    bank_name: Optional[str] = None,
) -> PaymentRefund:
    """Reembolso (parcial o total) con asignación por línea y asiento propio."""
    if payment.status not in ("paid", "partially_refunded"):
        raise FinanceRuleError(
            "pago_no_reembolsable", "Sólo un pago cobrado puede reembolsarse."
        )
    if amount <= 0:
        raise FinanceRuleError("monto_invalido", "El monto debe ser mayor a cero.")

    already = sum(
        (refund.amount for refund in payment.refunds if refund.status == "processed"),
        Decimal("0"),
    )
    if already + amount > payment.received_amount:
        raise FinanceRuleError(
            "reembolso_excede_pago",
            "El reembolso excede lo realmente cobrado en este pago.",
        )

    now = utc_now()
    refund = PaymentRefund(
        payment_id=payment.id,
        amount=amount,
        transaction_reference=transaction_reference,
        bank_name=bank_name,
        reason=reason,
        status="processed",
        processed_by=processed_by,
        processed_at=now,
    )
    session.add(refund)
    session.flush()

    for item in allocations:
        line = session.get(OrderLine, item.order_line_id)
        if line is None or line.order_id != order.id:
            raise FinanceRuleError(
                "linea_invalida", "Alguna línea del reembolso no pertenece al pedido."
            )
        if item.refunded_quantity <= 0 or item.refunded_quantity > line.quantity:
            raise FinanceRuleError(
                "cantidad_invalida", "Cantidad reembolsada fuera de rango para la línea."
            )
        credits_earned_reversed = int(
            line.credits_awarded_per_unit_snapshot * int(item.refunded_quantity)
        )
        credits_refunded = int(
            (line.credit_redemption_price_per_unit_snapshot or 0)
            * int(item.refunded_quantity)
        )
        session.add(
            OrderLineRefundAllocation(
                payment_refund_id=refund.id,
                order_line_id=line.id,
                refunded_quantity=item.refunded_quantity,
                money_refunded_amount=item.money_refunded_amount,
                credits_refunded_total=credits_refunded,
                credits_earned_reversed_total=credits_earned_reversed,
                reason=item.reason,
            )
        )
        # §22.5: asientos del ledger (import tardío: evita ciclo).
        from backend.app.services.credit_service import on_refund_allocation

        on_refund_allocation(
            session,
            order,
            order_line_id=line.id,
            credits_earned_reversed=credits_earned_reversed,
            credits_refunded=credits_refunded,
            actor_id=processed_by,
        )

    original_income = session.exec(
        select(FinancialEntry).where(
            FinancialEntry.payment_id == payment.id,
            FinancialEntry.entry_type == "payment_income",
        )
    ).first()
    session.add(
        FinancialEntry(
            category_id=None,
            order_id=order.id,
            payment_id=payment.id,
            reversal_of_entry_id=original_income.id if original_income else None,
            direction="expense",
            entry_type="refund",
            amount=amount,
            occurred_at=now,
            transaction_reference=transaction_reference,
            bank_name=bank_name,
            description=f"Reembolso del pedido {order.public_code}.",
            source_type="system",
            registered_by=processed_by,
        )
    )

    total_refunded = already + amount
    payment.status = (
        "refunded" if total_refunded >= payment.received_amount else "partially_refunded"
    )
    payment.updated_at = now
    session.add(payment)
    session.flush()
    recompute_order_payment_status(session, order)
    return refund


# ---------------------------------------------------------------------------
# Resumen del negocio (§21.1) — derivado, sin corte de caja
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class BusinessSummary:
    income_total: Decimal
    expense_total: Decimal
    refund_total: Decimal
    net_result: Decimal
    entry_count: int


def business_summary(
    session: Session, *, date_from: datetime, date_to: datetime
) -> BusinessSummary:
    entries = session.exec(
        select(FinancialEntry)
        .where(FinancialEntry.status == "recorded")
        .where(FinancialEntry.occurred_at >= date_from)
        .where(FinancialEntry.occurred_at < date_to)
    ).all()

    income = sum((e.amount for e in entries if e.direction == "income"), Decimal("0"))
    refunds = sum((e.amount for e in entries if e.entry_type == "refund"), Decimal("0"))
    expenses = sum(
        (
            e.amount
            for e in entries
            if e.direction == "expense" and e.entry_type != "refund"
        ),
        Decimal("0"),
    )
    return BusinessSummary(
        income_total=income,
        expense_total=expenses,
        refund_total=refunds,
        net_result=income - expenses - refunds,
        entry_count=len(entries),
    )
