"""Cotización de envío (§10 y §17.2): zona por polígono + tarifa por prioridad.

Reglas del reporte:

    Ubicación dentro de zona   → tarifa sugerida (status ``calculated``).
    Ubicación sin zona         → se recibe, queda ``pending_review``.
    Ubicación no proporcionada → se recibe, queda ``pending_review``.

El envío gratis puede venir de la tarifa (``free_shipping_from_amount``) o de
la configuración global (``business_settings.free_shipping_global_from_amount``);
aplica el primer umbral alcanzado. La cotización es ESTIMADA: la decisión final
por pedido vive en ``order_shipping`` (etapa 4) con su propia bitácora.
"""

from dataclasses import dataclass
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import func as sa_func
from sqlmodel import Session, select

from backend.app.models.shipping import DeliveryZone, ShippingRateRule
from backend.app.services.business_service import get_business_settings

STATUS_CALCULATED = "calculated"
STATUS_PENDING_REVIEW = "pending_review"


@dataclass(frozen=True)
class ShippingQuote:
    """Resultado de cotización estimada."""

    status: str  # calculated | pending_review
    zone_id: Optional[UUID] = None
    zone_name: Optional[str] = None
    rate_id: Optional[UUID] = None
    rate_name: Optional[str] = None
    amount: Optional[Decimal] = None
    is_free_shipping: bool = False
    estimated_minutes: Optional[int] = None


def resolve_zone(session: Session, longitude: float, latitude: float) -> Optional[DeliveryZone]:
    """Zona activa que cubre el punto; en solapes gana la prioridad mayor.

    Ejecuta ``ST_Covers`` en PostGIS: requiere PostgreSQL (los tests de esta
    función corren contra el stack de desarrollo, no sobre SQLite).
    """
    point = sa_func.ST_SetSRID(sa_func.ST_MakePoint(longitude, latitude), 4326)
    statement = (
        select(DeliveryZone)
        .where(DeliveryZone.is_active == True)  # noqa: E712
        .where(sa_func.ST_Covers(DeliveryZone.coverage_geometry, point))
        .order_by(
            DeliveryZone.priority.desc(),  # pyright: ignore[reportAttributeAccessIssue]
            DeliveryZone.created_at,  # pyright: ignore[reportArgumentType]
        )
        .limit(1)
    )
    return session.exec(statement).first()


def select_rate(zone: DeliveryZone, subtotal: Decimal) -> Optional[ShippingRateRule]:
    """Tarifa aplicable de la zona: activa, con mínimo cumplido, prioridad mayor."""
    candidates = [
        rate
        for rate in zone.rates
        if rate.is_active
        and (rate.minimum_order_amount is None or subtotal >= rate.minimum_order_amount)
    ]
    if not candidates:
        return None
    candidates.sort(key=lambda rate: (-rate.priority, rate.created_at or 0))
    return candidates[0]


def quote_shipping(
    session: Session,
    *,
    subtotal: Decimal,
    longitude: Optional[float] = None,
    latitude: Optional[float] = None,
) -> ShippingQuote:
    """Cotización estimada para el carrito/checkout (§17.2)."""
    if longitude is None or latitude is None:
        # Sin punto no hay cálculo automático: el pedido se recibe igual (§9.1).
        return ShippingQuote(status=STATUS_PENDING_REVIEW)

    zone = resolve_zone(session, longitude, latitude)
    if zone is None:
        return ShippingQuote(status=STATUS_PENDING_REVIEW)

    rate = select_rate(zone, subtotal)
    if rate is None:
        return ShippingQuote(
            status=STATUS_PENDING_REVIEW, zone_id=zone.id, zone_name=zone.name
        )

    free_threshold = _effective_free_threshold(session, rate)
    is_free = free_threshold is not None and subtotal >= free_threshold
    return ShippingQuote(
        status=STATUS_CALCULATED,
        zone_id=zone.id,
        zone_name=zone.name,
        rate_id=rate.id,
        rate_name=rate.name,
        amount=Decimal("0") if is_free else rate.base_fee,
        is_free_shipping=is_free,
        estimated_minutes=rate.estimated_minutes,
    )


def _effective_free_threshold(
    session: Session, rate: ShippingRateRule
) -> Optional[Decimal]:
    """Umbral de envío gratis efectivo: el de la tarifa o el global, el MENOR."""
    global_threshold = get_business_settings(session).free_shipping_global_from_amount
    thresholds = [
        threshold
        for threshold in (rate.free_shipping_from_amount, global_threshold)
        if threshold is not None
    ]
    return min(thresholds) if thresholds else None
