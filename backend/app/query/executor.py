"""Ejecuta un QuerySchema contra la base de datos y arma la página de resultados."""

from typing import Any, TypeVar

from pydantic import BaseModel
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from backend.app.query.compiler import apply_query_schema
from backend.app.query.plans import CompiledQueryPlan
from backend.app.query.schema import OffsetQuerySchema
from backend.app.schemas.pagination import OffsetPage, OffsetPagination

TItem = TypeVar("TItem", bound=BaseModel)


def paginate(
    session: Session,
    *,
    stmt: Select[Any],
    query: OffsetQuerySchema,
    item_schema: type[TItem],
    plan: CompiledQueryPlan | None = None,
) -> OffsetPage[TItem]:
    """Aplica filtros/orden del ``query``, cuenta el total y devuelve una página.

    El conteo reutiliza exactamente los mismos filtros que la consulta de datos
    (descartando el ``order_by``), de modo que ``total`` siempre es coherente con
    ``items``. ``plan`` es opcional: si se omite, el compiler usa el fallback a
    ``__query_*__``. No altera el contrato HTTP ni la paginación.
    """
    filtered = apply_query_schema(stmt=stmt, query=query, plan=plan)

    count_stmt = select(func.count()).select_from(filtered.order_by(None).subquery())
    total = session.scalar(count_stmt) or 0

    rows = session.scalars(filtered.offset(query.offset).limit(query.limit)).all()
    items = [item_schema.model_validate(row, from_attributes=True) for row in rows]

    pagination = OffsetPagination(
        limit=query.limit,
        offset=query.offset,
        total=total,
        has_next=query.offset + len(items) < total,
    )
    return OffsetPage(items=items, pagination=pagination)
