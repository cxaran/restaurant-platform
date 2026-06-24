from typing import Any, NoReturn, cast

from sqlalchemy import Select, or_
from sqlalchemy.orm.attributes import InstrumentedAttribute
from sqlalchemy.sql.elements import ColumnElement

from backend.app.query.schema import OffsetQuerySchema
from backend.app.query.validation import fail_query

QueryableColumn = ColumnElement[Any] | InstrumentedAttribute[Any]


def apply_query_schema(
    *,
    stmt: Select[Any],
    query: OffsetQuerySchema,
) -> Select[Any]:
    query_type = type(query)
    filter_columns = cast("dict[str, QueryableColumn]", query_type.__query_columns__)
    all_columns = cast("dict[str, QueryableColumn]", query_type.__query_all_columns__)
    range_fields = query_type.__query_range_fields__
    in_fields = query_type.__query_in_fields__
    null_filter_fields = query_type.__query_null_filter_fields__
    search_columns = cast("tuple[QueryableColumn, ...]", query_type.__query_search_columns__)

    for field_name, column in filter_columns.items():
        value = getattr(query, field_name)
        if value is not None:
            stmt = _apply_equality_filter(stmt, column, value)

        if field_name in range_fields:
            gte_value = getattr(query, f"{field_name}_gte")
            if gte_value is not None:
                stmt = stmt.where(column >= gte_value)

            lte_value = getattr(query, f"{field_name}_lte")
            if lte_value is not None:
                stmt = stmt.where(column <= lte_value)

    for field_name in in_fields:
        in_values = getattr(query, f"{field_name}_in")
        if in_values:
            stmt = stmt.where(all_columns[field_name].in_(in_values))

    for field_name in null_filter_fields:
        isnull = getattr(query, f"{field_name}_isnull")
        if isnull is not None:
            column = all_columns[field_name]
            stmt = stmt.where(column.is_(None) if isnull else column.isnot(None))

    q = getattr(query, "q", None)
    if q is not None and search_columns:
        stmt = _apply_search(stmt, search_columns, q)

    if not query.sort:
        _fail("invalid_sort", "El parámetro sort no puede estar vacío.", field_name="sort")
    stmt = _apply_sort(stmt, query.sort, query_type)

    return stmt


def _apply_equality_filter(
    stmt: Select[Any],
    column: QueryableColumn,
    value: Any,
) -> Select[Any]:
    if isinstance(value, bool):
        return stmt.where(column.is_(value))
    return stmt.where(column == value)


def _apply_search(
    stmt: Select[Any],
    columns: tuple[QueryableColumn, ...],
    value: str,
) -> Select[Any]:
    pattern = f"%{_escape_like(value)}%"
    return stmt.where(or_(*(column.ilike(pattern, escape="\\") for column in columns)))


def _apply_sort(
    stmt: Select[Any],
    raw_sort: str,
    query_type: type[OffsetQuerySchema],
) -> Select[Any]:
    sort_columns = cast("dict[str, QueryableColumn]", query_type.__query_sort_columns__)
    primary_keys = cast("tuple[ColumnElement[Any], ...]", query_type.__query_primary_keys__)
    terms = _parse_sort(raw_sort, query_type.__query_max_sort_terms__)
    requested_fields = {field_name for field_name, _ in terms}

    expressions: list[Any] = []
    for field_name, descending in terms:
        maybe_column = sort_columns.get(field_name)
        if maybe_column is None:
            _fail(
                "unsupported_sort_field",
                f"No se permite ordenar por '{field_name}'.",
                field_name="sort",
            )
        column = maybe_column
        expressions.append(column.desc().nulls_last() if descending else column.asc().nulls_last())

    # Desempate determinista: añade todas las columnas de la primary key que el
    # cliente no haya pedido ya, para que LIMIT/OFFSET no devuelva subconjuntos
    # arbitrarios (incluye claves compuestas).
    last_descending = terms[-1][1]
    for primary_key in primary_keys:
        if primary_key.key not in requested_fields:
            expressions.append(primary_key.desc() if last_descending else primary_key.asc())

    return stmt.order_by(*expressions)


def _parse_sort(raw_sort: str, max_sort_terms: int) -> list[tuple[str, bool]]:
    terms: list[tuple[str, bool]] = []
    seen: set[str] = set()

    for raw_term in raw_sort.split(","):
        term = raw_term.strip()
        if not term or term == "-":
            _fail("invalid_sort", "El parámetro sort contiene un campo vacío.", field_name="sort")

        descending = term.startswith("-")
        field_name = term[1:] if descending else term
        if not field_name:
            _fail("invalid_sort", "El parámetro sort contiene un campo vacío.", field_name="sort")
        if field_name in seen:
            _fail("duplicated_sort_field", f"El campo '{field_name}' está duplicado en sort.", field_name="sort")

        seen.add(field_name)
        terms.append((field_name, descending))

    if len(terms) > max_sort_terms:
        _fail("too_many_sort_fields", f"sort no puede incluir más de {max_sort_terms} campos.", field_name="sort")

    return terms


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _fail(code: str, message: str, field_name: str | None = None) -> NoReturn:
    fail_query(code, message, field_name=field_name)
