"""Créditos (§22): saldo derivado, reserva transaccional y ciclo completo.

Protecciones §22.6: el frontend nunca manda saldos; el backend calcula el
disponible bajo LOCK del usuario (serializa reservas concurrentes), toma
snapshots al crear el pedido y sólo opera sobre pedidos del propio usuario.

Ciclo: reserva al crear el pedido (descuenta) → consumo al completar (sólo
estado; el descuento ya ocurrió) → liberación al cancelar (devuelve). Los
reversos por reembolso son asientos nuevos, jamás ediciones.
"""

import uuid
from dataclasses import dataclass
from typing import Optional

from sqlalchemy import func as sa_func
from sqlmodel import Session, select

from backend.app.models.credits import CreditLedgerEntry, CreditRedemption
from backend.app.models.orders import Order
from backend.app.models.user import User
from backend.app.utils.utc_now import utc_now


class CreditRuleError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def balance(session: Session, user_id: uuid.UUID) -> int:
    """Saldo disponible = SUM(credit_delta). No existe saldo editable (§22.4)."""
    value = session.exec(
        select(sa_func.coalesce(sa_func.sum(CreditLedgerEntry.credit_delta), 0)).where(
            CreditLedgerEntry.user_id == user_id
        )
    ).one()
    return int(value)


@dataclass(frozen=True)
class CreditTotals:
    available: int
    earned: int
    redeemed: int


def totals(session: Session, user_id: uuid.UUID) -> CreditTotals:
    """Tarjeta del perfil (§58.3): disponibles / ganados / canjeados, del ledger."""
    entries = session.exec(
        select(CreditLedgerEntry.entry_type, sa_func.sum(CreditLedgerEntry.credit_delta))
        .where(CreditLedgerEntry.user_id == user_id)
        .group_by(CreditLedgerEntry.entry_type)
    ).all()
    by_type = {entry_type: int(total) for entry_type, total in entries}
    earned = by_type.get("earn", 0)
    # Canjeado NETO: reservas menos liberaciones y reembolsos de canje.
    redeemed = -(
        by_type.get("redeem_reservation", 0)
        + by_type.get("redemption_release", 0)
        + by_type.get("redemption_refund", 0)
    )
    return CreditTotals(
        available=sum(by_type.values()), earned=earned, redeemed=redeemed
    )


def reserve_order_redemptions(session: Session, order: Order) -> int:
    """Reserva los canjes del pedido (§22.3). NO hace commit. Regresa lo reservado."""
    credit_lines = [
        line
        for line in order.lines
        if line.purchase_mode == "credits" and line.credits_redeemed_total > 0
    ]
    if not credit_lines:
        return 0
    if order.customer_user_id is None:
        raise CreditRuleError(
            "canje_sin_cliente",
            "El canje con créditos requiere un usuario cliente (§22.1).",
        )

    # Lock del usuario: dos pedidos simultáneos no pueden gastar el mismo saldo.
    session.exec(
        select(User).where(User.id == order.customer_user_id).with_for_update()
    ).first()

    total_needed = sum(line.credits_redeemed_total for line in credit_lines)
    available = balance(session, order.customer_user_id)
    if available < total_needed:
        raise CreditRuleError(
            "saldo_insuficiente",
            f"Créditos insuficientes: necesitas {total_needed} y tienes {available}.",
        )

    now = utc_now()
    for line in credit_lines:
        redemption = CreditRedemption(
            user_id=order.customer_user_id,
            order_id=order.id,
            order_line_id=line.id,
            credits_spent=line.credits_redeemed_total,
            status="reserved",
            reserved_at=now,
        )
        session.add(redemption)
        session.flush()
        session.add(
            CreditLedgerEntry(
                user_id=order.customer_user_id,
                order_id=order.id,
                order_line_id=line.id,
                credit_redemption_id=redemption.id,
                entry_type="redeem_reservation",
                credit_delta=-line.credits_redeemed_total,
                description=f"Canje reservado · {line.product_name_snapshot}",
                occurred_at=now,
            )
        )
    session.flush()
    return total_needed


def on_order_completed(session: Session, order: Order, *, actor_id: Optional[uuid.UUID]) -> None:
    """Completar: consume canjes y acredita lo ganado (§22.1). Sin cliente, nada."""
    now = utc_now()
    redemptions = session.exec(
        select(CreditRedemption).where(
            CreditRedemption.order_id == order.id, CreditRedemption.status == "reserved"
        )
    ).all()
    for redemption in redemptions:
        redemption.status = "consumed"
        redemption.consumed_at = now
        redemption.updated_at = now
        session.add(redemption)

    if order.customer_user_id is not None:
        for line in order.lines:
            if line.purchase_mode == "money" and line.credits_earned_total_snapshot > 0:
                session.add(
                    CreditLedgerEntry(
                        user_id=order.customer_user_id,
                        order_id=order.id,
                        order_line_id=line.id,
                        entry_type="earn",
                        credit_delta=line.credits_earned_total_snapshot,
                        description=(
                            f"Pedido {order.public_code} completado · "
                            f"{line.product_name_snapshot}"
                        ),
                        occurred_at=now,
                        created_by=actor_id,
                    )
                )
    session.flush()


def on_order_cancelled(session: Session, order: Order, *, actor_id: Optional[uuid.UUID]) -> None:
    """Cancelar: libera las reservas (§22.3 reserved → released)."""
    now = utc_now()
    redemptions = session.exec(
        select(CreditRedemption).where(
            CreditRedemption.order_id == order.id, CreditRedemption.status == "reserved"
        )
    ).all()
    for redemption in redemptions:
        redemption.status = "released"
        redemption.released_at = now
        redemption.release_reason = "order_cancelled"
        redemption.updated_at = now
        session.add(redemption)
        session.add(
            CreditLedgerEntry(
                user_id=redemption.user_id,
                order_id=order.id,
                order_line_id=redemption.order_line_id,
                credit_redemption_id=redemption.id,
                entry_type="redemption_release",
                credit_delta=redemption.credits_spent,
                description="Pedido cancelado antes de completarse.",
                occurred_at=now,
                created_by=actor_id,
            )
        )
    session.flush()


def _ledger_sum(
    session: Session, *, order_line_id: uuid.UUID, entry_type: str
) -> int:
    value = session.exec(
        select(sa_func.coalesce(sa_func.sum(CreditLedgerEntry.credit_delta), 0)).where(
            CreditLedgerEntry.order_line_id == order_line_id,
            CreditLedgerEntry.entry_type == entry_type,
        )
    ).one()
    return int(value)


def on_refund_allocation(
    session: Session,
    order: Order,
    allocation,
    *,
    requested_earned_reversal: int,
    requested_credits_refund: int,
    actor_id: Optional[uuid.UUID],
) -> tuple[int, int]:
    """Reembolso por línea (§22.5) con el lifecycle DEFINITIVO (H2).

    Reglas de estado del canje:
        reserved  → sólo puede liberarse (cancelación); NUNCA redemption_refund.
        consumed  → puede devolver créditos, hasta lo realmente gastado.
        released  → no vuelve a liberarse, consumirse ni devolverse.

    earn_reversal SOLO si el pedido está ``completed`` (el earn existió) y hasta
    el remanente aún no revertido de la línea. Devuelve la tupla APLICADA
    ``(earned_reversed, credits_refunded)`` — puede ser menor a lo solicitado y
    la asignación debe registrar estos valores, no los teóricos.

    Idempotencia: cada asiento referencia ``refund_allocation_id`` y los índices
    únicos parciales del ledger impiden un segundo movimiento del mismo tipo
    para la misma asignación, aun con reintentos o concurrencia.
    """
    if order.customer_user_id is None:
        # Regla dura: sin cliente no existen créditos (CHECK en orders + aquí).
        return (0, 0)
    now = utc_now()
    applied_reversal = 0
    applied_refund = 0

    if requested_earned_reversal > 0 and order.status == "completed":
        earned = _ledger_sum(
            session, order_line_id=allocation.order_line_id, entry_type="earn"
        )
        already_reversed = -_ledger_sum(
            session, order_line_id=allocation.order_line_id, entry_type="earn_reversal"
        )
        applied_reversal = max(0, min(requested_earned_reversal, earned - already_reversed))
        if applied_reversal > 0:
            session.add(
                CreditLedgerEntry(
                    user_id=order.customer_user_id,
                    order_id=order.id,
                    order_line_id=allocation.order_line_id,
                    refund_allocation_id=allocation.id,
                    entry_type="earn_reversal",
                    credit_delta=-applied_reversal,
                    description=f"Reverso por reembolso del pedido {order.public_code}.",
                    occurred_at=now,
                    created_by=actor_id,
                )
            )

    if requested_credits_refund > 0:
        redemption = session.exec(
            select(CreditRedemption).where(
                CreditRedemption.order_line_id == allocation.order_line_id
            )
        ).first()
        # SOLO canjes CONSUMIDOS devuelven créditos; los reserved se liberan por
        # cancelación y los released ya devolvieron lo suyo.
        if redemption is not None and redemption.status == "consumed":
            already_refunded = _ledger_sum(
                session,
                order_line_id=allocation.order_line_id,
                entry_type="redemption_refund",
            )
            applied_refund = max(
                0, min(requested_credits_refund, redemption.credits_spent - already_refunded)
            )
            if applied_refund > 0:
                session.add(
                    CreditLedgerEntry(
                        user_id=order.customer_user_id,
                        order_id=order.id,
                        order_line_id=allocation.order_line_id,
                        credit_redemption_id=redemption.id,
                        refund_allocation_id=allocation.id,
                        entry_type="redemption_refund",
                        credit_delta=applied_refund,
                        description=f"Devolución de canje del pedido {order.public_code}.",
                        occurred_at=now,
                        created_by=actor_id,
                    )
                )

    session.flush()
    return (applied_reversal, applied_refund)


def manual_adjustment(
    session: Session,
    *,
    user_id: uuid.UUID,
    delta: int,
    description: str,
    created_by: uuid.UUID,
) -> CreditLedgerEntry:
    """Ajuste manual auditado; negativo no puede dejar saldo bajo cero."""
    if delta == 0:
        raise CreditRuleError("delta_invalido", "El ajuste no puede ser cero.")
    if delta < 0 and balance(session, user_id) + delta < 0:
        raise CreditRuleError(
            "saldo_insuficiente", "El ajuste dejaría el saldo en negativo."
        )
    entry = CreditLedgerEntry(
        user_id=user_id,
        entry_type="manual_adjustment",
        credit_delta=delta,
        description=description,
        occurred_at=utc_now(),
        created_by=created_by,
    )
    session.add(entry)
    session.flush()
    return entry
