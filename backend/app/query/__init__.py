"""Helpers para construir consultas desde schemas Pydantic."""

from backend.app.query.compiler import apply_query_schema
from backend.app.query.executor import paginate
from backend.app.query.factory import make_offset_query_schema
from backend.app.query.options import QueryOptions
from backend.app.query.resource import ResourceQuery
from backend.app.query.schema import (
    OffsetPage,
    OffsetPagination,
    OffsetQuerySchema,
    QuerySchema,
)
from backend.app.query.validation import QueryParameterError, QuerySchemaConfigError

__all__ = [
    "OffsetPage",
    "OffsetPagination",
    "OffsetQuerySchema",
    "QueryOptions",
    "QueryParameterError",
    "QuerySchema",
    "QuerySchemaConfigError",
    "ResourceQuery",
    "apply_query_schema",
    "make_offset_query_schema",
    "paginate",
]
