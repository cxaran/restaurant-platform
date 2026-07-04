"""Códigos de descuento fijo web-only (Etapa 5 RC): panel y cotización.

Panel con ``discount_codes:read`` / ``discount_codes:manage``; la cotización
(`POST /discount-codes/quote`) sólo exige sesión de cliente: el backend valúa
las líneas con ``price_cart`` y calcula el subtotal elegible — el cliente
jamás manda montos. Los cambios de configuración se auditan con NOMBRES de
campos únicamente (``config_audit``).
"""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Query, status
from sqlmodel import select

from backend.app.api.resource_actions import (
    api_error,
    commit_or_conflict,
    get_or_404,
    serialize,
    serialize_many,
)
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.models.discounts import DiscountCode, DiscountCodeRedemption
from backend.app.models.orders import Order
from backend.app.schemas.discount import (
    DiscountCodeCreate,
    DiscountCodeListItem,
    DiscountCodeRead,
    DiscountCodeUpdate,
    DiscountQuoteRequest,
    DiscountQuoteResult,
    DiscountRedemptionListItem,
)
from backend.app.security.groups.discounts import DiscountCodePermissions
from backend.app.services.config_audit import record_config_change
from backend.app.services.discount_service import (
    DiscountRuleError,
    find_code,
    normalize_code,
    quote_discount,
)
from backend.app.utils.utc_now import utc_now

router = APIRouter(prefix="/discount-codes", tags=["discount-codes"])

_NOT_FOUND = "Código de descuento no encontrado"


def _require_coherent_dates(
    valid_from: Optional[datetime], valid_until: Optional[datetime]
) -> None:
    if valid_from is not None and valid_until is not None and valid_from >= valid_until:
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "vigencia_invalida",
            "El inicio de vigencia debe ser anterior al fin de vigencia.",
        )


def _require_coherent_amounts(
    discount_amount: Decimal, minimum_order_amount: Decimal
) -> None:
    # Regla estructural del modelo (CHECK discount_codes_amount_le_minimum):
    # validar aquí produce un 422 estable en lugar de un 409 de integridad.
    if discount_amount > minimum_order_amount:
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "descuento_mayor_al_minimo",
            "El descuento no puede superar la compra mínima requerida.",
        )


def _require_unique_code(
    session: SessionDep, normalized: str, *, exclude_id: Optional[uuid.UUID] = None
) -> None:
    stmt = select(DiscountCode).where(DiscountCode.code_normalized == normalized)
    if exclude_id is not None:
        stmt = stmt.where(DiscountCode.id != exclude_id)
    if session.exec(stmt).first() is not None:
        api_error(
            status.HTTP_409_CONFLICT,
            "codigo_duplicado",
            "Ya existe un código de descuento con ese texto.",
        )


# ---------------------------------------------------------------------------
# Cliente: cotización del carrito web
# ---------------------------------------------------------------------------

@router.post("/quote", response_model=DiscountQuoteResult)
def quote_discount_code(
    payload: DiscountQuoteRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> DiscountQuoteResult:
    """Cotiza un código contra el carrito ACTUAL del cliente autenticado.

    El backend valúa las líneas con ``price_cart``: el subtotal elegible es la
    suma monetaria de productos y modificadores — el envío NUNCA cuenta.
    """
    from backend.app.api.v1.orders import _priced_or_422

    priced = _priced_or_422(session, payload.lines)
    try:
        outcome = quote_discount(
            session,
            code=payload.discount_code,
            customer_user_id=current_user.id,
            purchase_mode=priced.purchase_mode,
            source="online",
            eligible_subtotal=priced.items_subtotal_amount,
        )
    except DiscountRuleError as exc:
        api_error(status.HTTP_422_UNPROCESSABLE_ENTITY, exc.code, exc.message)
    return DiscountQuoteResult(
        valid=True,
        code=outcome.code_row.code,
        name=outcome.code_row.name,
        discount_amount=outcome.discount_amount,
        minimum_order_amount=outcome.code_row.minimum_order_amount,
        eligible_subtotal=outcome.eligible_subtotal,
    )


# ---------------------------------------------------------------------------
# Panel: administración de códigos
# ---------------------------------------------------------------------------

@router.get("", response_model=list[DiscountCodeListItem])
def list_discount_codes(
    session: SessionDep,
    _: DiscountCodePermissions.READ.requiere,
    q: Optional[str] = Query(default=None, max_length=180),
    is_active: Optional[bool] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[DiscountCodeListItem]:
    stmt = select(DiscountCode)
    if q:
        needle = f"%{q.strip()}%"
        stmt = stmt.where(
            DiscountCode.code.ilike(needle)  # pyright: ignore[reportAttributeAccessIssue]
            | DiscountCode.name.ilike(needle)  # pyright: ignore[reportAttributeAccessIssue]
        )
    if is_active is not None:
        stmt = stmt.where(DiscountCode.is_active == is_active)
    stmt = (
        stmt.order_by(DiscountCode.created_at.desc())  # pyright: ignore[reportAttributeAccessIssue]
        .offset(offset)
        .limit(limit)
    )
    return serialize_many(DiscountCodeListItem, session.exec(stmt).all())


@router.post("", response_model=DiscountCodeRead, status_code=status.HTTP_201_CREATED)
def create_discount_code(
    payload: DiscountCodeCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: DiscountCodePermissions.MANAGE.requiere,
) -> DiscountCodeRead:
    """Crea un código. El texto es del administrador: NO hay generador automático."""
    normalized = normalize_code(payload.code)
    _require_unique_code(session, normalized)
    _require_coherent_dates(payload.valid_from, payload.valid_until)
    _require_coherent_amounts(payload.discount_amount, payload.minimum_order_amount)

    row = DiscountCode(
        **payload.model_dump(),
        code_normalized=normalized,
        created_by=current_user.id,
    )
    session.add(row)
    session.flush()
    record_config_change(
        session,
        actor_user_id=current_user.id,
        entity_type="discount_codes",
        entity_id=row.id,
        action="create",
        changed_fields=sorted(payload.model_dump().keys()),
    )
    commit_or_conflict(session, "Ya existe un código de descuento con ese texto.", code="codigo_duplicado")
    session.refresh(row)
    return serialize(DiscountCodeRead, row)


@router.get("/{code_id}", response_model=DiscountCodeRead)
def get_discount_code(
    code_id: uuid.UUID,
    session: SessionDep,
    _: DiscountCodePermissions.READ.requiere,
) -> DiscountCodeRead:
    return serialize(DiscountCodeRead, get_or_404(session, DiscountCode, code_id, _NOT_FOUND))


@router.patch("/{code_id}", response_model=DiscountCodeRead)
def update_discount_code(
    code_id: uuid.UUID,
    payload: DiscountCodeUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: DiscountCodePermissions.MANAGE.requiere,
) -> DiscountCodeRead:
    """Edita la definición VIGENTE del código. Todos los campos son editables.

    Los cambios sólo afectan usos FUTUROS: las redenciones existentes conservan
    sus snapshots inmutables (código, nombre y montos del momento de reservar) y
    jamás se tocan al editar.
    """
    row = get_or_404(session, DiscountCode, code_id, _NOT_FOUND)
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return serialize(DiscountCodeRead, row)

    if "code" in changes:
        normalized = normalize_code(changes["code"])
        _require_unique_code(session, normalized, exclude_id=row.id)
        row.code_normalized = normalized
    _require_coherent_dates(
        changes.get("valid_from", row.valid_from),
        changes.get("valid_until", row.valid_until),
    )
    _require_coherent_amounts(
        changes.get("discount_amount", row.discount_amount),
        changes.get("minimum_order_amount", row.minimum_order_amount),
    )

    for field, value in changes.items():
        setattr(row, field, value)
    row.updated_at = utc_now()
    session.add(row)
    record_config_change(
        session,
        actor_user_id=current_user.id,
        entity_type="discount_codes",
        entity_id=row.id,
        action="update",
        changed_fields=sorted(changes.keys()),
    )
    commit_or_conflict(session, "Ya existe un código de descuento con ese texto.", code="codigo_duplicado")
    session.refresh(row)
    return serialize(DiscountCodeRead, row)


@router.get("/{code_id}/redemptions", response_model=list[DiscountRedemptionListItem])
def list_discount_code_redemptions(
    code_id: uuid.UUID,
    session: SessionDep,
    _: DiscountCodePermissions.READ.requiere,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[DiscountRedemptionListItem]:
    get_or_404(session, DiscountCode, code_id, _NOT_FOUND)
    rows = session.exec(
        select(DiscountCodeRedemption, Order.public_code)
        .join(Order, Order.id == DiscountCodeRedemption.order_id)  # pyright: ignore[reportArgumentType]
        .where(DiscountCodeRedemption.discount_code_id == code_id)
        .order_by(DiscountCodeRedemption.reserved_at.desc())  # pyright: ignore[reportAttributeAccessIssue]
        .offset(offset)
        .limit(limit)
    ).all()
    return [
        DiscountRedemptionListItem(
            id=redemption.id,
            order_id=redemption.order_id,
            order_public_code=public_code,
            customer_user_id=redemption.customer_user_id,
            code_snapshot=redemption.code_snapshot,
            name_snapshot=redemption.name_snapshot,
            discount_amount_snapshot=redemption.discount_amount_snapshot,
            minimum_order_amount_snapshot=redemption.minimum_order_amount_snapshot,
            status=redemption.status,
            reserved_at=redemption.reserved_at,
            consumed_at=redemption.consumed_at,
            released_at=redemption.released_at,
            release_reason=redemption.release_reason,
        )
        for redemption, public_code in rows
    ]
