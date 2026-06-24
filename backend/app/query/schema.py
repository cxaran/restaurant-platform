from typing import Any, ClassVar

from pydantic import BaseModel, ConfigDict, Field

# Reexportados desde la capa de schemas (fuente única de los contratos de página).
from backend.app.schemas.pagination import OffsetPage, OffsetPagination

__all__ = [
    "QuerySchema",
    "OffsetQuerySchema",
    "OffsetPage",
    "OffsetPagination",
]


class QuerySchema(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )


class OffsetQuerySchema(QuerySchema):
    model: ClassVar[type[Any] | None] = None
    __query_columns__: ClassVar[dict[str, Any]] = {}
    __query_all_columns__: ClassVar[dict[str, Any]] = {}
    __query_range_fields__: ClassVar[set[str]] = set()
    __query_in_fields__: ClassVar[set[str]] = set()
    __query_null_filter_fields__: ClassVar[set[str]] = set()
    __query_sort_columns__: ClassVar[dict[str, Any]] = {}
    __query_search_columns__: ClassVar[tuple[Any, ...]] = ()
    __query_primary_keys__: ClassVar[tuple[Any, ...]] = ()
    __query_max_sort_terms__: ClassVar[int] = 3

    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)
    sort: str = Field(min_length=1, max_length=200)
