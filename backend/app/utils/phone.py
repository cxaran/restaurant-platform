"""Normalización de teléfonos: sólo dígitos, para búsqueda y enlaces."""


def normalize_phone(value: str) -> str:
    """Deja únicamente dígitos (quita espacios, guiones, paréntesis y el signo +)."""
    return "".join(ch for ch in value if ch.isdigit())
