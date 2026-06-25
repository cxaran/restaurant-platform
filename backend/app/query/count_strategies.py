"""``CountStrategy``: cómo se calcula ``total`` (Fase 2, Paso 5).

Todas reciben el statement YA filtrado (sin ORDER BY/OFFSET/LIMIT). ``NoTotalCount``
(feeds sin total) queda para Fase 8.
"""

from typing import Any, Callable, Protocol

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from backend.app.query.plans import CompiledQueryPlan


class CountStrategy(Protocol):
    def count(self, session: Session, filtered: Select[Any], plan: CompiledQueryPlan) -> int: ...


class AutomaticCount:
    """Default: ``COUNT(*)`` sobre la subconsulta filtrada (sin order_by).

    Coherente con ``items`` para ``select(Model)`` 1:1.
    """

    def count(self, session: Session, filtered: Select[Any], plan: CompiledQueryPlan) -> int:
        stmt = select(func.count()).select_from(filtered.order_by(None).subquery())
        return session.scalar(stmt) or 0


class DistinctIdentityCount:
    """Cuenta entidades únicas: ``COUNT(*)`` sobre ``SELECT DISTINCT <identidad>``.

    Para joins 1:N que duplican filas. Usa todas las expresiones de
    ``plan.identity`` (válido para PK compuesta), no un ``COUNT(DISTINCT pk)``
    simplificado.
    """

    def count(self, session: Session, filtered: Select[Any], plan: CompiledQueryPlan) -> int:
        subquery = (
            filtered.order_by(None)
            .with_only_columns(*plan.identity.columns)
            .distinct()
            .subquery()
        )
        stmt = select(func.count()).select_from(subquery)
        return session.scalar(stmt) or 0


class CustomCountStatement:
    """Conteo provisto por el contrato. ``build_count`` recibe el statement ya
    filtrado (sin order_by) y devuelve un ``Select`` escalar de conteo."""

    def __init__(self, build_count: Callable[[Select[Any]], Select[Any]]) -> None:
        self._build_count = build_count

    def count(self, session: Session, filtered: Select[Any], plan: CompiledQueryPlan) -> int:
        return session.scalar(self._build_count(filtered.order_by(None))) or 0
