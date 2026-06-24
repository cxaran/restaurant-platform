from dataclasses import dataclass, field
from typing import Any, Mapping

from sqlalchemy.orm.attributes import InstrumentedAttribute
from sqlalchemy.sql.elements import ColumnElement

QueryColumn = ColumnElement[Any] | InstrumentedAttribute[Any]


def _empty_column_bindings() -> dict[str, QueryColumn]:
    return {}


@dataclass(frozen=True, slots=True)
class QueryOptions:
    filter_fields: tuple[str, ...] = ()
    sort_fields: tuple[str, ...] = ()
    search_fields: tuple[str, ...] = ()
    in_fields: tuple[str, ...] = ()
    null_filter_fields: tuple[str, ...] = ()
    column_bindings: Mapping[str, QueryColumn] = field(default_factory=_empty_column_bindings)
    default_sort: str | None = None
    max_limit: int = 100
    max_in_values: int = 100
    max_sort_terms: int = 3
    max_sort_length: int = 200
    max_filter_text_length: int = 200
