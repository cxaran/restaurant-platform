"""Ejecuta un QuerySchema contra la base de datos y arma la página de resultados."""

from typing import Any, TypeVar

from pydantic import BaseModel
from sqlalchemy import Select
from sqlalchemy.orm import Session

from backend.app.query.compiler import apply_query_schema
from backend.app.query.count_strategies import AutomaticCount, CountStrategy
from backend.app.query.plans import CompiledQueryPlan
from backend.app.query.schema import OffsetQuerySchema
from backend.app.query.serializers import EntitySerializer, RowSerializer
from backend.app.schemas.pagination import OffsetPage, OffsetPagination

TItem = TypeVar("TItem", bound=BaseModel)


def paginate(
    session: Session,
    *,
    stmt: Select[Any],
    query: OffsetQuerySchema,
    item_schema: type[TItem],
    plan: CompiledQueryPlan | None = None,
    count_strategy: CountStrategy | None = None,
    row_serializer: RowSerializer | None = None,
) -> OffsetPage[TItem]:
    """Aplica filtros/orden del ``query``, cuenta el total y devuelve una página.

    El conteo reutiliza exactamente los mismos filtros que la consulta de datos
    (descartando el ``order_by``), de modo que ``total`` siempre es coherente con
    ``items``. ``plan`` opcional (fallback a ``__query_*__`` si se omite).
    ``count_strategy``/``row_serializer`` por defecto reproducen el comportamiento
    actual (``AutomaticCount`` + ``EntitySerializer``). No altera el contrato HTTP.
    """
    resolved_plan = plan if plan is not None else CompiledQueryPlan.from_schema(type(query))
    counter: CountStrategy = count_strategy if count_strategy is not None else AutomaticCount()
    serializer: RowSerializer = row_serializer if row_serializer is not None else EntitySerializer()

    filtered = apply_query_schema(stmt=stmt, query=query, plan=resolved_plan)

    total = counter.count(session, filtered, resolved_plan)
    rows = serializer.rows(session, filtered.offset(query.offset).limit(query.limit))
    items = [serializer.serialize(row, item_schema) for row in rows]

    pagination = OffsetPagination(
        limit=query.limit,
        offset=query.offset,
        total=total,
        has_next=query.offset + len(items) < total,
    )
    return OffsetPage(items=items, pagination=pagination)
