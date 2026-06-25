"""``CompiledQueryPlan``: metadata SQLAlchemy del motor de query, tipada e inmutable.

Pieza **pasiva**: no importa ``factory``, ``compiler`` ni ``executor``, y no genera
schemas. El factory construye el plan; ``compiler``/``executor`` solo lo consumen.

Cuando no se pasa un plan explícito, ``from_schema`` lo reconstruye desde los
atributos ``__query_*__`` que el factory sigue inyectando en el schema generado
(ruta heredada).

El orden tiene tres roles separados (Fase 2, Paso 4):

- ``public_sort_columns`` — campos que el cliente puede pedir con ``?sort=``.
- ``orderable_columns`` — superconjunto que ``default_order`` puede usar (incluye
  columnas internas no públicas).
- ``tie_breakers`` — pares ``(clave_lógica, columna)`` que el compiler añade
  siempre para estabilidad (default: la primary key). El desempate se decide por
  clave lógica, no por identidad de objeto.
"""

from __future__ import annotations

from dataclasses import dataclass
from types import MappingProxyType
from typing import Any, Mapping

from sqlalchemy.orm.attributes import InstrumentedAttribute
from sqlalchemy.sql.elements import ColumnElement

from backend.app.query.identity import IdentitySpec
from backend.app.query.search import IlikeSearch, SearchStrategy

QueryColumn = ColumnElement[Any] | InstrumentedAttribute[Any]


@dataclass(frozen=True)
class CompiledQueryPlan:
    filter_columns: Mapping[str, QueryColumn]
    all_columns: Mapping[str, QueryColumn]
    range_fields: frozenset[str]
    in_fields: frozenset[str]
    null_filter_fields: frozenset[str]
    public_sort_columns: Mapping[str, QueryColumn]
    orderable_columns: Mapping[str, QueryColumn]
    tie_breakers: tuple[tuple[str, QueryColumn], ...]
    default_order: str
    identity: IdentitySpec
    search_strategy: SearchStrategy
    search_columns: tuple[QueryColumn, ...]
    primary_keys: tuple[ColumnElement[Any], ...]
    max_sort_terms: int
    # Límites de validación (Pydantic ya los aplica en el schema); se incluyen para
    # que el plan sea autodescriptivo. La ruta heredada (from_schema) no los conoce.
    max_in_values: int | None = None
    max_sort_length: int | None = None
    max_filter_text_length: int | None = None

    def __post_init__(self) -> None:
        # Snapshot independiente e inmutable: el plan no comparte contenedores
        # mutables con __query_*__, así que mutar la metadata heredada no lo afecta.
        # (Las expresiones de columna SQLAlchemy son inmutables y sí se comparten.)
        object.__setattr__(self, "filter_columns", MappingProxyType(dict(self.filter_columns)))
        object.__setattr__(self, "all_columns", MappingProxyType(dict(self.all_columns)))
        object.__setattr__(self, "public_sort_columns", MappingProxyType(dict(self.public_sort_columns)))
        object.__setattr__(self, "orderable_columns", MappingProxyType(dict(self.orderable_columns)))
        object.__setattr__(self, "range_fields", frozenset(self.range_fields))
        object.__setattr__(self, "in_fields", frozenset(self.in_fields))
        object.__setattr__(self, "null_filter_fields", frozenset(self.null_filter_fields))
        object.__setattr__(self, "search_columns", tuple(self.search_columns))
        object.__setattr__(self, "primary_keys", tuple(self.primary_keys))
        object.__setattr__(self, "tie_breakers", tuple(self.tie_breakers))

    @classmethod
    def from_schema(cls, query_type: type[Any]) -> CompiledQueryPlan:
        """Reconstruye el plan desde los ``__query_*__`` del schema (ruta heredada).

        En la ruta heredada ``__query_sort_columns__`` es a la vez público y
        orderable (semántica legacy: la PK añadida es solicitable), y los
        tie-breakers son la primary key por su clave de columna.
        """
        sort_columns = query_type.__query_sort_columns__
        primary_keys = tuple(query_type.__query_primary_keys__)
        return cls(
            filter_columns=query_type.__query_columns__,
            all_columns=query_type.__query_all_columns__,
            range_fields=frozenset(query_type.__query_range_fields__),
            in_fields=frozenset(query_type.__query_in_fields__),
            null_filter_fields=frozenset(query_type.__query_null_filter_fields__),
            public_sort_columns=sort_columns,
            orderable_columns=sort_columns,
            tie_breakers=tuple((primary_key.key, primary_key) for primary_key in primary_keys),
            default_order=query_type.model_fields["sort"].default,
            identity=IdentitySpec(columns=primary_keys),
            search_strategy=IlikeSearch(),
            search_columns=tuple(query_type.__query_search_columns__),
            primary_keys=primary_keys,
            max_sort_terms=query_type.__query_max_sort_terms__,
        )
