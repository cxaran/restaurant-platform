"""Créditos (§22): autoservicio del cliente y administración del ledger.

El cliente ve su tarjeta (disponibles/ganados/canjeados) y sus movimientos por
propiedad del registro. El panel puede consultar a cualquier cliente y hacer
ajustes manuales — siempre como asientos nuevos del ledger, nunca editando un
saldo (§22.4).
"""

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Query, status
from pydantic import Field
from sqlmodel import select

from backend.app.api.resource_actions import api_error, commit_or_conflict
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.models.credits import CreditLedgerEntry
from backend.app.schemas.base import ApiReadSchema, ApiWriteSchema
from backend.app.security.groups.credits import CreditPermissions
from backend.app.services.credit_service import (
    CreditRuleError,
    manual_adjustment,
    totals,
)

router = APIRouter(prefix="/credits", tags=["credits"])


class CreditTotalsRead(ApiReadSchema):
    """Tarjeta de créditos (§58.3): tres agregaciones del ledger."""

    available: int
    earned: int
    redeemed: int


class CreditMovementRead(ApiReadSchema):
    id: uuid.UUID
    entry_type: str
    credit_delta: int
    description: Optional[str] = None
    order_id: Optional[uuid.UUID] = None
    occurred_at: datetime


class CreditAdjustmentCreate(ApiWriteSchema):
    user_id: uuid.UUID
    delta: int = Field(description="Positivo suma, negativo resta; nunca deja saldo negativo.")
    description: str = Field(min_length=1)


def _totals_read(session: SessionDep, user_id: uuid.UUID) -> CreditTotalsRead:
    data = totals(session, user_id)
    return CreditTotalsRead(
        available=data.available, earned=data.earned, redeemed=data.redeemed
    )


def _movements(session: SessionDep, user_id: uuid.UUID, limit: int) -> list[CreditMovementRead]:
    rows = session.exec(
        select(CreditLedgerEntry)
        .where(CreditLedgerEntry.user_id == user_id)
        .order_by(CreditLedgerEntry.occurred_at.desc())  # pyright: ignore[reportAttributeAccessIssue]
        .limit(limit)
    ).all()
    return [CreditMovementRead.model_validate(row, from_attributes=True) for row in rows]


@router.get("/me", response_model=CreditTotalsRead)
def my_credits(session: SessionDep, current_user: CurrentUser) -> CreditTotalsRead:
    return _totals_read(session, current_user.id)


@router.get("/me/movements", response_model=list[CreditMovementRead])
def my_movements(
    session: SessionDep,
    current_user: CurrentUser,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[CreditMovementRead]:
    return _movements(session, current_user.id, limit)


@router.get("/users/{user_id}", response_model=CreditTotalsRead)
def user_credits(
    user_id: uuid.UUID,
    session: SessionDep,
    _: CreditPermissions.READ_ALL.requiere,
) -> CreditTotalsRead:
    return _totals_read(session, user_id)


@router.get("/users/{user_id}/movements", response_model=list[CreditMovementRead])
def user_movements(
    user_id: uuid.UUID,
    session: SessionDep,
    _: CreditPermissions.READ_ALL.requiere,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[CreditMovementRead]:
    return _movements(session, user_id, limit)


@router.post("/adjustments", response_model=CreditMovementRead, status_code=status.HTTP_201_CREATED)
def adjust_credits(
    payload: CreditAdjustmentCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: CreditPermissions.MANUAL_ADJUST.requiere,
) -> CreditMovementRead:
    try:
        entry = manual_adjustment(
            session,
            user_id=payload.user_id,
            delta=payload.delta,
            description=payload.description,
            created_by=current_user.id,
        )
    except CreditRuleError as exc:
        api_error(status.HTTP_422_UNPROCESSABLE_ENTITY, exc.code, exc.message)
    commit_or_conflict(session, "No fue posible registrar el ajuste.")
    session.refresh(entry)
    return CreditMovementRead.model_validate(entry, from_attributes=True)
