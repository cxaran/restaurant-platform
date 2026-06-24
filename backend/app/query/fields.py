"""``FieldSpec``: declaración única por campo consultable (Fase 2, Paso 1).

Concentra el contrato de un campo: tipo público, fuente ORM, operadores reales y
si participa en la búsqueda global. La metadata de UI (label/widget/visibilidad) se
añadirá en pasos posteriores; los campos query-only no se exponen a UI por defecto.
"""

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm.attributes import InstrumentedAttribute
from sqlalchemy.sql.elements import ColumnElement

from backend.app.query.operators import Operator, param_names_for

QueryColumn = ColumnElement[Any] | InstrumentedAttribute[Any]


@dataclass(frozen=True)
class FieldSpec:
    name: str
    type: type[Any]
    source: QueryColumn
    operators: frozenset[Operator] = field(default_factory=frozenset)
    searchable: bool = False

    @property
    def param_names(self) -> set[str]:
        return param_names_for(self.name, self.operators)
