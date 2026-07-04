"""Códigos de descuento fijo web-only (Etapa 5 RC): cotización y ciclo de uso.

Regla ÚNICA: «un código descuenta X pesos si el subtotal monetario elegible de
productos y modificadores alcanza o supera Y pesos». El envío NUNCA suma al
elegible y un pedido de créditos jamás acepta códigos.

Ciclo de la redención: reserva al hacer checkout (crea el ajuste ligado) →
consumo al completar (sólo estado) → liberación al cancelar o al perder el
mínimo ANTES de aprobar (quita el ajuste). Una redención ``consumed`` es
definitiva: un reembolso posterior a ``completed`` no la reactiva ni libera.

La carrera de doble pestaña la resuelven los índices únicos parciales de
``discount_code_redemptions``; aquí se traduce a ``codigo_ya_usado``.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import func as sa_func
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from backend.app.models.discounts import DiscountCode, DiscountCodeRedemption
from backend.app.models.orders import Order, OrderAdjustment
from backend.app.utils.utc_now import utc_now


class DiscountRuleError(ValueError):
    """Regla de códigos de descuento violada. Código estable para la API."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def normalize_code(code: str) -> str:
    """Forma canónica del código: sin espacios extremos y en minúsculas."""
    return code.strip().lower()


def find_code(session: Session, code: str) -> Optional[DiscountCode]:
    """Busca la definición por su forma normalizada (case-insensitive)."""
    return session.exec(
        select(DiscountCode).where(DiscountCode.code_normalized == normalize_code(code))
    ).first()


def _naive_utc(value: datetime) -> datetime:
    """Compara consistente con ``utc_now()`` (naive-UTC): SQLite devuelve naive
    y PostgreSQL (conexión UTC) devuelve aware — se normaliza quitando la zona."""
    return value.replace(tzinfo=None) if value.tzinfo is not None else value


@dataclass(frozen=True)
class QuoteOutcome:
    """Resultado de la cotización: definición encontrada y descuento aplicable."""

    code_row: DiscountCode
    discount_amount: Decimal  # ya acotado: min(X, subtotal elegible)
    eligible_subtotal: Decimal


def quote_discount(
    session: Session,
    *,
    code: str,
    customer_user_id: uuid.UUID,
    purchase_mode: str,
    source: str,
    eligible_subtotal: Decimal,
) -> QuoteOutcome:
    """Valida TODO y devuelve el descuento aplicable SIN persistir nada."""
    row = find_code(session, code)
    # Mismo error para inexistente e inactivo: no revelar la existencia.
    if row is None or not row.is_active:
        raise DiscountRuleError("codigo_no_encontrado", "El código no existe o no está disponible.")

    now = utc_now()
    if row.valid_from is not None and now < _naive_utc(row.valid_from):
        raise DiscountRuleError("codigo_no_vigente", "El código aún no está vigente.")
    if row.valid_until is not None and now >= _naive_utc(row.valid_until):
        raise DiscountRuleError("codigo_no_vigente", "El código ya no está vigente.")

    # Web-only y sólo dinero: jamás en pedidos de créditos ni fuera del sitio.
    if purchase_mode != "money" or source != "online":
        raise DiscountRuleError(
            "codigo_no_aplicable",
            "Los códigos de descuento sólo aplican en pedidos web pagados con dinero.",
        )

    if (
        row.target_customer_user_id is not None
        and row.target_customer_user_id != customer_user_id
    ):
        raise DiscountRuleError(
            "codigo_personal_ajeno", "Este código es personal y no pertenece a tu cuenta."
        )

    already_used = session.exec(
        select(DiscountCodeRedemption).where(
            DiscountCodeRedemption.discount_code_id == row.id,
            DiscountCodeRedemption.customer_user_id == customer_user_id,
            DiscountCodeRedemption.status.in_(("reserved", "consumed")),  # pyright: ignore[reportAttributeAccessIssue]
        )
    ).first()
    if already_used is not None:
        raise DiscountRuleError("codigo_ya_usado", "Ya usaste este código.")

    if eligible_subtotal < row.minimum_order_amount:
        raise DiscountRuleError(
            "compra_minima_no_alcanzada",
            f"Este código requiere una compra mínima de ${row.minimum_order_amount}.",
        )

    # Nunca un subtotal negativo: el descuento se acota al subtotal elegible
    # (defensivo: el CHECK discount_amount <= minimum_order_amount ya lo implica).
    discount = min(row.discount_amount, eligible_subtotal)
    return QuoteOutcome(
        code_row=row, discount_amount=discount, eligible_subtotal=eligible_subtotal
    )


def list_public_coupons(session: Session) -> list[DiscountCode]:
    """Cupones GENERALES vigentes ahora, para el documento legal público.

    Vigente = activo, dentro de su ventana temporal (o sin ventana) y SIN
    destinatario (los códigos personales jamás se anuncian). Ordenados por
    fecha de creación para una lista estable.
    """
    now = utc_now()
    rows = session.exec(
        select(DiscountCode)
        .where(DiscountCode.is_active == True)  # noqa: E712
        .where(DiscountCode.target_customer_user_id.is_(None))  # pyright: ignore[reportAttributeAccessIssue]
        .order_by(DiscountCode.created_at)  # pyright: ignore[reportArgumentType]
    ).all()
    vigentes: list[DiscountCode] = []
    for row in rows:
        if row.valid_from is not None and now < _naive_utc(row.valid_from):
            continue
        if row.valid_until is not None and now >= _naive_utc(row.valid_until):
            continue
        vigentes.append(row)
    return vigentes


def _recalc_discount_total(session: Session, order: Order) -> None:
    """Recalcula el descuento corriente del pedido desde sus ajustes."""
    total = session.exec(
        select(sa_func.coalesce(sa_func.sum(OrderAdjustment.amount), 0)).where(
            OrderAdjustment.order_id == order.id,
            OrderAdjustment.direction == "discount",
        )
    ).one()
    order.discount_total_amount = Decimal(str(total))
    session.add(order)


def reserve_redemption(
    session: Session, *, code_row: DiscountCode, order: Order
) -> DiscountCodeRedemption:
    """Reserva el código para el pedido y crea el ajuste ligado. NO hace commit.

    Re-valida con :func:`quote_discount` DENTRO de la transacción del checkout.
    La doble reserva concurrente (doble pestaña) la detiene el índice único
    parcial y se traduce a ``codigo_ya_usado``.
    """
    if order.customer_user_id is None:
        raise DiscountRuleError(
            "codigo_no_aplicable",
            "Los códigos de descuento sólo aplican en pedidos web pagados con dinero.",
        )
    outcome = quote_discount(
        session,
        code=code_row.code,
        customer_user_id=order.customer_user_id,
        purchase_mode=order.purchase_mode,
        source=order.source,
        eligible_subtotal=order.items_subtotal_amount,
    )

    now = utc_now()
    redemption = DiscountCodeRedemption(
        discount_code_id=code_row.id,
        order_id=order.id,
        customer_user_id=order.customer_user_id,
        code_snapshot=code_row.code,
        name_snapshot=code_row.name,
        discount_amount_snapshot=code_row.discount_amount,
        minimum_order_amount_snapshot=code_row.minimum_order_amount,
        status="reserved",
        reserved_at=now,
    )
    session.add(redemption)
    try:
        session.flush()
    except IntegrityError:
        session.rollback()
        raise DiscountRuleError("codigo_ya_usado", "Ya usaste este código.") from None

    session.add(
        OrderAdjustment(
            order_id=order.id,
            adjustment_type="discount_code",
            direction="discount",
            amount=outcome.discount_amount,
            reason=f"Código {redemption.code_snapshot}",
            # El propio cliente autoriza al aplicar su código en el checkout.
            authorized_by=order.customer_user_id,
            discount_code_redemption_id=redemption.id,
        )
    )
    session.flush()
    _recalc_discount_total(session, order)
    session.flush()
    return redemption


def consume_order_redemption(
    session: Session, order: Order, *, actor_id: Optional[uuid.UUID]
) -> None:
    """Completar el pedido: reserved → consumed. Idempotente (sólo reserved)."""
    now = utc_now()
    redemptions = session.exec(
        select(DiscountCodeRedemption).where(
            DiscountCodeRedemption.order_id == order.id,
            DiscountCodeRedemption.status == "reserved",
        )
    ).all()
    for redemption in redemptions:
        redemption.status = "consumed"
        redemption.consumed_at = now
        redemption.updated_at = now
        session.add(redemption)
    session.flush()


def release_order_redemption(session: Session, order: Order, *, reason: str) -> None:
    """Libera la reserva del pedido y elimina su ajuste. JAMÁS toca ``consumed``."""
    now = utc_now()
    redemptions = session.exec(
        select(DiscountCodeRedemption).where(
            DiscountCodeRedemption.order_id == order.id,
            DiscountCodeRedemption.status == "reserved",
        )
    ).all()
    if not redemptions:
        return
    for redemption in redemptions:
        redemption.status = "released"
        redemption.released_at = now
        redemption.release_reason = reason
        redemption.updated_at = now
        session.add(redemption)
        adjustment = session.exec(
            select(OrderAdjustment).where(
                OrderAdjustment.discount_code_redemption_id == redemption.id
            )
        ).first()
        if adjustment is not None:
            session.delete(adjustment)
    session.flush()
    _recalc_discount_total(session, order)
    session.flush()


def revalidate_reserved_redemption(session: Session, order: Order) -> None:
    """Pre-aprobación: si el pedido ya no alcanza el mínimo del SNAPSHOT de su
    redención reservada, la libera y recalcula (se evalúa contra el snapshot,
    nunca contra la definición vigente)."""
    redemption = session.exec(
        select(DiscountCodeRedemption).where(
            DiscountCodeRedemption.order_id == order.id,
            DiscountCodeRedemption.status == "reserved",
        )
    ).first()
    if redemption is None:
        return
    if order.items_subtotal_amount < redemption.minimum_order_amount_snapshot:
        release_order_redemption(session, order, reason="minimum_not_met")
