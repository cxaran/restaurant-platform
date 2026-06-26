"""Contrato HTTP público de capabilities (Commit 3).

Describe, por recurso navegable y filtrado por el usuario actual, qué puede
presentar el frontend: columnas de lista, paginación/búsqueda/orden, formularios
de creación/actualización y acciones permitidas.

Reglas del contrato:
- Los tipos de valor, widgets, métodos HTTP, scope y view son ``Enum`` (no ``str``
  libre).
- Nunca se serializan permisos, ``SecurityControl``, expresiones SQLAlchemy,
  bindings de columnas, ``orderable_columns``, ``tie_breakers`` ni PK internas.
- ``create``/``update`` no autorizados se omiten (``None`` + ``response_model_exclude_none``),
  nunca ``allowed: false``. ``actions`` solo contiene acciones permitidas.
"""

from enum import Enum
from typing import Optional

from pydantic import Field

from backend.app.schemas.base import ApiReadSchema


class FieldValueType(str, Enum):
    STRING = "string"
    EMAIL = "email"
    UUID = "uuid"
    INTEGER = "integer"
    DECIMAL = "decimal"
    BOOLEAN = "boolean"
    DATE = "date"
    DATETIME = "datetime"
    ENUM = "enum"
    ARRAY = "array"


class WidgetType(str, Enum):
    TEXT = "text"
    EMAIL = "email"
    PASSWORD = "password"
    SWITCH = "switch"
    TEXTAREA = "textarea"
    MULTISELECT = "multiselect"
    SELECT = "select"


class FilterOperator(str, Enum):
    EQ = "eq"
    GTE = "gte"
    LTE = "lte"
    IN = "in"
    ISNULL = "isnull"


class HttpMethod(str, Enum):
    GET = "GET"
    POST = "POST"
    PATCH = "PATCH"
    PUT = "PUT"
    DELETE = "DELETE"


class ActionScope(str, Enum):
    RESOURCE = "resource"
    ITEM = "item"


class ResourceView(str, Enum):
    TABLE = "table"
    GROUPED_CATALOG = "grouped_catalog"


class ResourceFieldCapability(ApiReadSchema):
    name: str
    label: str
    description: Optional[str] = None
    type: FieldValueType
    visible_in_list: bool
    sortable: bool
    searchable: bool
    # Capacidad técnica de lectura (qué operadores admite el campo en el plan). Los
    # controles de filtro *visibles* se declaran en ``ResourceListCapability.filters``.
    filter_operators: list[FilterOperator]


class ResourceFilterOption(ApiReadSchema):
    value: str
    label: str


class ResourceFilterCapability(ApiReadSchema):
    field: str
    parameter: str
    operator: FilterOperator
    label: str
    description: Optional[str] = None
    type: FieldValueType
    widget: WidgetType
    options: Optional[list[ResourceFilterOption]] = None


class PaginationCapability(ApiReadSchema):
    default_limit: int
    max_limit: int


class SearchCapability(ApiReadSchema):
    enabled: bool
    min_length: Optional[int] = None
    max_length: Optional[int] = None


class SortCapability(ApiReadSchema):
    default_sort: Optional[str] = None
    fixed_server_order: bool
    max_terms: int
    max_length: int


class ResourceListCapability(ApiReadSchema):
    fields: list[ResourceFieldCapability]
    filters: list[ResourceFilterCapability] = []
    pagination: PaginationCapability
    search: SearchCapability
    sort: SortCapability


class ResourceFormFieldCapability(ApiReadSchema):
    name: str
    label: str
    description: Optional[str] = None
    type: FieldValueType
    required: bool
    widget: Optional[WidgetType] = None


class ResourceFormCapability(ApiReadSchema):
    method: HttpMethod
    url_template: str
    fields: list[ResourceFormFieldCapability]


class ResourceFormsCapability(ApiReadSchema):
    create: Optional[ResourceFormCapability] = None
    update: Optional[ResourceFormCapability] = None


class ResourceActionCapability(ApiReadSchema):
    name: str
    label: str
    method: HttpMethod
    url_template: str
    scope: ActionScope
    danger: bool


class ResourceCapability(ApiReadSchema):
    name: str
    label: str
    api_path: str
    view: ResourceView
    # El atributo se llama ``list_`` para no sombrear el builtin ``list`` dentro del
    # cuerpo de la clase; se serializa/valida como ``list`` vía alias.
    list_: Optional[ResourceListCapability] = Field(default=None, alias="list")
    forms: Optional[ResourceFormsCapability] = None
    actions: list[ResourceActionCapability] = []
