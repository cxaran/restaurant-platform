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
    refunded_quantity: int  # H1: unidades enteras
    money_refunded_amount: Decimal
    reason: Optional[str] = None


def _lock_line_and_check_remaining(
    session: Session,
    order: Order,
    *,
    order_line_id: uuid.UUID,
    refunded_quantity: int,
    money_refunded_amount: Decimal,
) -> OrderLine:
    """H3: bloquea la línea y valida contra el remanente HISTÓRICO acumulado.

    Política de montos (controlada por backend): el cliente sólo declara
    cantidad y, en reembolsos monetarios, el dinero a devolver — acotado por el
    remanente de ``money_line_total_amount`` (que ya incluye modificadores) menos
    lo ya devuelto. Los créditos a devolver/revertir NUNCA vienen del payload:
    los calcula el ledger según snapshots y estado del canje. Los ajustes
    monetarios excepcionales (descuentos post-venta, compensaciones) van por
    ``order_adjustments`` o asientos manuales, no disfrazados de devolución.
    """
    if isinstance(refunded_quantity, bool) or not isinstance(refunded_quantity, int) \
            or refunded_quantity < 1:
        raise FinanceRuleError(
            "cantidad_invalida",
            "La cantidad reembolsada debe ser un entero mayor o igual a 1.",
        )
    # El LOCK serializa reembolsos concurrentes de la misma línea; los
    # remanentes se calculan DENTRO de esta transacción.
    line = session.exec(
        select(OrderLine).where(OrderLine.id == order_line_id).with_for_update()
    ).first()
    if line is None or line.order_id != order.id:
        raise FinanceRuleError(
            "linea_invalida", "Alguna línea del reembolso no pertenece al pedido."
        )

    previous = session.exec(
        select(OrderLineRefundAllocation).where(
            OrderLineRefundAllocation.order_line_id == line.id
        )
    ).all()
    already_quantity = sum(prev.refunded_quantity for prev in previous)
    already_money = sum((prev.money_refunded_amount for prev in previous), Decimal("0"))
    if refunded_quantity > line.quantity - already_quantity:
        raise FinanceRuleError(
            "reembolso_excede_linea",
            f"La línea vendió {line.quantity} y ya tiene {already_quantity} "
            "unidades reembolsadas.",
        )
    if money_refunded_amount > line.money_line_total_amount - already_money:
        raise FinanceRuleError(
            "reembolso_excede_dinero_linea",
            "El dinero reembolsado excede el remanente histórico de la línea.",
        )
    return line


def refund_credits_only_line(
    session: Session,
    order: Order,
    *,
    order_line_id: uuid.UUID,
    refunded_quantity: int,
    reason: str,
    processed_by: uuid.UUID,
) -> OrderLineRefundAllocation:
    """Devolución de una línea pagada 100% con créditos, SIN pago monetario.

    Un pedido canjeado por completo no tiene ``payments``: la asignación se crea
    sin ``payment_refund_id`` (dinero forzado a 0 por CHECK), con actor y motivo
    obligatorios, y el ledger aplica la devolución según el estado real del
    canje (sólo ``consumed``, con tope acumulado — H2/H3). Idempotencia por los
    índices únicos parciales sobre ``refund_allocation_id``.
    """
    if not (reason or "").strip():
        raise FinanceRuleError("motivo_requerido", "La devolución requiere motivo.")
    line = _lock_line_and_check_remaining(
        session,
        order,
        order_line_id=order_line_id,
        refunded_quantity=refunded_quantity,
        money_refunded_amount=Decimal("0"),
    )
    if line.purchase_mode != "credits":
        raise FinanceRuleError(
            "linea_no_canjeada",
            "Esta vía sólo devuelve líneas canjeadas con créditos; el dinero se "
            "reembolsa sobre su pago.",
        )

    allocation = OrderLineRefundAllocation(
        payment_refund_id=None,
        order_line_id=line.id,
        refunded_quantity=refunded_quantity,
        money_refunded_amount=Decimal("0"),
        processed_by=processed_by,
        reason=reason,
    )
    session.add(allocation)
    session.flush()

    from backend.app.services.credit_service import on_refund_allocation

    applied_reversal, applied_refund = on_refund_allocation(
        session,
        order,
        allocation,
        requested_earned_reversal=(
            line.credits_awarded_per_unit_snapshot * refunded_quantity
        ),
        requested_credits_refund=(
            (line.credit_redemption_price_per_unit_snapshot or 0) * refunded_quantity
        ),
        actor_id=processed_by,
    )
    if applied_refund == 0 and applied_reversal == 0:
        raise FinanceRuleError(
            "canje_no_devolvible",
            "El canje de esta línea no está consumido o ya devolvió todo su remanente.",
        )
    allocation.credits_earned_reversed_total = applied_reversal
    allocation.credits_refunded_total = applied_refund
    session.add(allocation)
    session.flush()
    return allocation


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

    # Orden DETERMINISTA de locks: siempre por id ascendente de línea, para que
    # dos reembolsos concurrentes del mismo pedido no puedan abrazarse (H6-local).
    for item in sorted(allocations, key=lambda a: str(a.order_line_id)):
        line = _lock_line_and_check_remaining(
            session,
            order,
            order_line_id=item.order_line_id,
            refunded_quantity=item.refunded_quantity,
            money_refunded_amount=item.money_refunded_amount,
        )

        allocation = OrderLineRefundAllocation(
            payment_refund_id=refund.id,
            order_line_id=line.id,
            refunded_quantity=item.refunded_quantity,
            money_refunded_amount=item.money_refunded_amount,
            processed_by=processed_by,
            reason=item.reason,
        )
        session.add(allocation)
        session.flush()

        # §22.5 + H2: el ledger decide lo APLICABLE según el estado real del
        # canje y del pedido; la asignación registra lo aplicado, no lo teórico.
        from backend.app.services.credit_service import on_refund_allocation

        applied_reversal, applied_refund = on_refund_allocation(
            session,
            order,
            allocation,
            requested_earned_reversal=(
                line.credits_awarded_per_unit_snapshot * item.refunded_quantity
            ),
            requested_credits_refund=(
                (line.credit_redemption_price_per_unit_snapshot or 0)
                * item.refunded_quantity
            ),
            actor_id=processed_by,
        )
        allocation.credits_earned_reversed_total = applied_reversal
        allocation.credits_refunded_total = applied_refund
        session.add(allocation)
        session.flush()

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
