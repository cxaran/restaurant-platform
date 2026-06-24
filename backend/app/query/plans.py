"""``CompiledQueryPlan``: metadata SQLAlchemy del motor de query, tipada e inmutable.

Pieza **pasiva**: no importa ``factory``, ``compiler`` ni ``executor``, y no genera
schemas. El factory construye el plan; ``compiler``/``executor`` solo lo consumen.

Cuando no se pasa un plan explícito, ``from_schema`` lo reconstruye desde los
atributos ``__query_*__`` que el factory sigue inyectando en el schema generado
(ruta heredada). En este paso el plan describe exactamente la misma metadata que
hoy vive en ``__query_*__``; ``sort_columns`` conserva su nombre heredado (la
separación de sort público/desempate llega en un paso posterior).
"""

from __future__ import annotations

from dataclasses import dataclass
from types import MappingProxyType
from typing import Any, Mapping

from sqlalchemy.orm.attributes import InstrumentedAttribute
from sqlalchemy.sql.elements import ColumnElement

QueryColumn = ColumnElement[Any] | InstrumentedAttribute[Any]


@dataclass(frozen=True)
class CompiledQueryPlan:
    filter_columns: Mapping[str, QueryColumn]
    all_columns: Mapping[str, QueryColumn]
    range_fields: frozenset[str]
    in_fields: frozenset[str]
    null_filter_fields: frozenset[str]
    sort_columns: Mapping[str, QueryColumn]
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
        object.__setattr__(self, "sort_columns", MappingProxyType(dict(self.sort_columns)))
        object.__setattr__(self, "range_fields", frozenset(self.range_fields))
        object.__setattr__(self, "in_fields", frozenset(self.in_fields))
        object.__setattr__(self, "null_filter_fields", frozenset(self.null_filter_fields))
        object.__setattr__(self, "search_columns", tuple(self.search_columns))
        object.__setattr__(self, "primary_keys", tuple(self.primary_keys))

    @classmethod
    def from_schema(cls, query_type: type[Any]) -> CompiledQueryPlan:
        """Reconstruye el plan desde los ``__query_*__`` del schema (ruta heredada)."""
        return cls(
            filter_columns=query_type.__query_columns__,
            all_columns=query_type.__query_all_columns__,
            range_fields=frozenset(query_type.__query_range_fields__),
            in_fields=frozenset(query_type.__query_in_fields__),
            null_filter_fields=frozenset(query_type.__query_null_filter_fields__),
            sort_columns=query_type.__query_sort_columns__,
            search_columns=tuple(query_type.__query_search_columns__),
            primary_keys=tuple(query_type.__query_primary_keys__),
            max_sort_terms=query_type.__query_max_sort_terms__,
        )
