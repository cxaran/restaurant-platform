"""Operadores declarativos del modelo de query (Fase 2, Paso 1).

Operadores REALES (cada uno genera, a lo sumo, un parámetro de query):

    eq      -> {name}
    in      -> {name}_in
    isnull  -> {name}_isnull
    gte     -> {name}_gte
    lte     -> {name}_lte

``range`` NO es un operador real: es un atajo de configuración que se normaliza a
``{gte, lte}``. ``searchable`` tampoco es operador: es una capacidad separada para
participar en ``q`` y no genera parámetro por campo (vive en ``FieldSpec.searchable``).
"""

from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Iterable
from uuid import UUID

from pydantic import EmailStr


class Operator(str, Enum):
    EQ = "eq"
    IN = "in"
    ISNULL = "isnull"
    GTE = "gte"
    LTE = "lte"


# Atajo de configuración (no operador real): se expande a gte + lte.
RANGE = "range"

_RANGE_EXPANSION = (Operator.GTE, Operator.LTE)

# Sufijo del parámetro generado por cada operador (eq no añade sufijo).
_PARAM_SUFFIX: dict[Operator, str] = {
    Operator.IN: "_in",
    Operator.ISNULL: "_isnull",
    Operator.GTE: "_gte",
    Operator.LTE: "_lte",
}

_TEXT_TYPES = (str, EmailStr)


def normalize_operators(raw: Iterable[Operator | str]) -> frozenset[Operator]:
    """Normaliza una declaración de operadores expandiendo el atajo ``range``."""
    result: set[Operator] = set()
    for item in raw:
        if item == RANGE:
            result.update(_RANGE_EXPANSION)
        elif isinstance(item, Operator):
            result.add(item)
        else:
            result.add(Operator(item))  # ValueError si no es un operador válido
    return frozenset(result)


def _is_enum(field_type: Any) -> bool:
    return isinstance(field_type, type) and issubclass(field_type, Enum)


def default_operators(field_type: type[Any]) -> frozenset[Operator]:
    """Operadores por defecto según el tipo escalar (autoría nativa de policy).

    ``isnull`` (nullable) e ``in`` adicionales son opt-in explícitos; no se derivan
    solo del tipo. El adaptador desde ``QueryOptions`` no usa estos defaults: deriva
    los operadores de las listas explícitas (filter/in/null).
    """
    if field_type in _TEXT_TYPES:
        return frozenset({Operator.EQ})
    if field_type is bool:
        return frozenset({Operator.EQ})
    if field_type is UUID:
        return frozenset({Operator.EQ, Operator.IN})
    if _is_enum(field_type):
        return frozenset({Operator.EQ, Operator.IN})
    if field_type in (int, Decimal):
        return frozenset({Operator.EQ, Operator.GTE, Operator.LTE})
    if field_type in (date, datetime):
        return frozenset({Operator.GTE, Operator.LTE})
    return frozenset()


def param_names_for(name: str, operators: frozenset[Operator]) -> set[str]:
    """Nombres de parámetro de query que generan los operadores de un campo."""
    params: set[str] = set()
    if Operator.EQ in operators:
        params.add(name)
    for operator, suffix in _PARAM_SUFFIX.items():
        if operator in operators:
            params.add(f"{name}{suffix}")
    return params
