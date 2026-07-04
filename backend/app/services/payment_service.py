"""Pagos por método configurable, verificación y estado derivado (§18).

El estado de pago del PEDIDO nunca se edita a mano: se deriva de sus pagos
(``recompute_order_payment_status``). Un pago marcado como pagado generará UN
solo ingreso financiero (§21.4) — hook de la etapa 7. Las instrucciones de
cobro del repartidor (§19.5) también se derivan de aquí.
"""

import uuid
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from sqlmodel import Session, select

from backend.app.models.orders import Order
from backend.app.models.payments import Payment, PaymentMethodConfig
from backend.app.utils.utc_now import utc_now


class PaymentRuleError(ValueError):
    """Regla de pago violada. Código estable para la API."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def get_method_by_code(session: Session, code: str) -> Optional[PaymentMethodConfig]:
    return session.exec(
        select(PaymentMethodConfig).where(
            PaymentMethodConfig.code == code,
            PaymentMethodConfig.is_active == True,  # noqa: E712
        )
    ).first()


def create_payment(
    session: Session,
    order: Order,
    method: PaymentMethodConfig,
    *,
    expected_amount: Decimal,
    change_requested_for_amount: Optional[Decimal] = None,
    transaction_reference: Optional[str] = None,
    bank_name: Optional[str] = None,
    terminal_name: Optional[str] = None,
    card_last_four: Optional[str] = None,
    notes: Optional[str] = None,
) -> Payment:
    """Crea el pago aplicando las reglas del método (§18.1). NO hace commit."""
    if method.requires_transaction_reference and not (transaction_reference or "").strip():
        raise PaymentRuleError(
            "referencia_requerida",
            f"«{method.display_name}» requiere referencia de la transacción.",
        )
    if method.requires_bank_name and not (bank_name or "").strip():
        raise PaymentRuleError(
            "banco_requerido", f"«{method.display_name}» requiere el banco emisor."
        )

    change_amount = Decimal("0")
    if change_requested_for_amount is not None:
        if not method.allows_cash_change:
            raise PaymentRuleError(
                "cambio_no_aplicable",
                f"«{method.display_name}» no maneja cambio de efectivo.",
            )
        if change_requested_for_amount < expected_amount:
            raise PaymentRuleError(
                "billete_insuficiente",
                "El monto con el que pagará el cliente es menor al total.",
            )
        change_amount = change_requested_for_amount - expected_amount

    payment = Payment(
        order_id=order.id,
        payment_method_config_id=method.id,
        payment_method_name_snapshot=method.display_name,
        status="pending_verification" if method.requires_manual_verification else "pending",
        expected_amount=expected_amount,
        change_requested_for_amount=change_requested_for_amount,
        change_amount=change_amount,
        transaction_reference=transaction_reference,
        bank_name=bank_name,
        terminal_name=terminal_name,
        card_last_four=card_last_four,
        notes=notes,
    )
    session.add(payment)
    session.flush()
    recompute_order_payment_status(session, order)
    return payment


def mark_paid(
    session: Session,
    order: Order,
    payment: Payment,
    *,
    actor_id: Optional[uuid.UUID],
    received_amount: Optional[Decimal] = None,
) -> Payment:
    """Marca el pago como recibido. Hook etapa 7: registrar payment_income ÚNICO."""
    if payment.status not in ("pending", "pending_verification"):
        raise PaymentRuleError(
            "pago_no_pendiente", "Sólo un pago pendiente puede marcarse como pagado."
        )
    now = utc_now()
    payment.status = "paid"
    payment.received_amount = received_amount if received_amount is not None else payment.expected_amount
    payment.paid_at = now
    if payment.verified_at is None:
        payment.verified_by = actor_id
        payment.verified_at = now
    payment.updated_at = now
    session.add(payment)
    session.flush()
    recompute_order_payment_status(session, order)

    # §21.4: UN ingreso financiero por pago cobrado (import tardío: evita ciclo).
    from backend.app.services.finance_service import record_payment_income

    record_payment_income(session, order, payment)
    return payment


def reject_payment(
    session: Session,
    order: Order,
    payment: Payment,
    *,
    actor_id: Optional[uuid.UUID],
    rejected_reason: str,
) -> Payment:
    if payment.status not in ("pending", "pending_verification"):
        raise PaymentRuleError(
            "pago_no_pendiente", "Sólo un pago pendiente puede rechazarse."
        )
    now = utc_now()
    payment.status = "rejected"
    payment.rejected_reason = rejected_reason
    payment.verified_by = actor_id
    payment.verified_at = now
    payment.updated_at = now
    session.add(payment)
    session.flush()
    recompute_order_payment_status(session, order)
    return payment


def recompute_order_payment_status(session: Session, order: Order) -> str:
    """Deriva orders.payment_status desde sus pagos; nunca se edita a mano."""
    payments = session.exec(select(Payment).where(Payment.order_id == order.id)).all()
    statuses = {payment.status for payment in payments}
    paid_total = sum(
        (payment.received_amount for payment in payments if payment.status == "paid"),
        Decimal("0"),
    )
    target = order.total_money_amount or order.items_subtotal_amount

    if "refunded" in statuses and paid_total == 0:
        derived = "refunded"
    elif "refunded" in statuses or "partially_refunded" in statuses:
        derived = "partially_refunded"
    elif paid_total >= target and target >= 0 and any(s == "paid" for s in statuses):
        derived = "paid"
    elif "pending_verification" in statuses:
        derived = "pending_verification"
    elif "pending" in statuses:
        derived = "pending"
    else:
        derived = "unpaid"

    if order.payment_status != derived:
        order.payment_status = derived
        order.updated_at = utc_now()
        session.add(order)
        session.flush()
    return derived


@dataclass(frozen=True)
class CollectionInstruction:
    """Instrucción de cobro derivada para el repartidor (§19.5)."""

    must_collect: bool
    amount: Optional[Decimal]
    change_for: Optional[Decimal]
    change_amount: Optional[Decimal]
    label: str


def collection_instruction(session: Session, order: Order) -> CollectionInstruction:
    payments = session.exec(select(Payment).where(Payment.order_id == order.id)).all()
    pending_cash = [
        payment
        for payment in payments
        if payment.status == "pending" and payment.change_requested_for_amount is not None
    ] or [payment for payment in payments if payment.status == "pending"]

    if order.payment_status == "paid" or not pending_cash:
        method = next((p.payment_method_name_snapshot for p in payments if p.status == "paid"), None)
        label = f"Pagado con {method.lower()} · no cobrar" if method else "Pagado · no cobrar"
        return CollectionInstruction(
            must_collect=False, amount=None, change_for=None, change_amount=None, label=label
        )

    payment = pending_cash[0]
    label = f"Cobrar ${payment.expected_amount} en efectivo"
    if payment.change_requested_for_amount is not None:
        label += (
            f" · llevar cambio de ${payment.change_requested_for_amount}"
            f" (${payment.change_amount})"
        )
    return CollectionInstruction(
        must_collect=True,
        amount=payment.expected_amount,
        change_for=payment.change_requested_for_amount,
        change_amount=payment.change_amount,
        label=label,
    )
