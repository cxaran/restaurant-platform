"""``SearchStrategy``: cómo se aplica el parámetro de búsqueda ``q`` (Fase 2, Paso 5).

Interfaz extensible. ``IlikeSearch`` es la única implementación por ahora; full-text,
trigram, sin acentos, etc. son Fase 8. La estrategia produce un predicado
SQLAlchemy a partir de las columnas buscables y el texto.
"""

from typing import Any, Protocol

from sqlalchemy import or_
from sqlalchemy.orm.attributes import InstrumentedAttribute
from sqlalchemy.sql.elements import ColumnElement

QueryColumn = ColumnElement[Any] | InstrumentedAttribute[Any]


class SearchStrategy(Protocol):
    def predicate(self, columns: tuple[QueryColumn, ...], value: str) -> Any: ...


def escape_like(value: str) -> str:
    """Escapa ``\\``, ``%`` y ``_`` para que la búsqueda sea literal, no comodín."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


class IlikeSearch:
    """Búsqueda parcial case-insensitive (``ILIKE '%texto%'``) con escape de
    comodines sobre cada columna buscable (OR)."""

    def predicate(self, columns: tuple[QueryColumn, ...], value: str) -> Any:
        pattern = f"%{escape_like(value)}%"
        return or_(*(column.ilike(pattern, escape="\\") for column in columns))
