"""Conversión GeoJSON ⇄ geometrías PostGIS (SRID 4326).

La API habla GeoJSON exclusivamente: puntos como ``{"type": "Point",
"coordinates": [lon, lat]}``. Hacia la base se genera EWKT (que GeoAlchemy2
acepta directo en columnas ``Geometry``); desde la base se decodifica el WKB
con shapely. Nunca se acepta WKT/WKB crudo del cliente.
"""

from typing import Optional

from geoalchemy2 import WKBElement
from shapely import wkb as shapely_wkb
from shapely.geometry import Point

SRID = 4326


def point_to_ewkt(longitude: float, latitude: float) -> str:
    """EWKT de un punto (lon, lat) en SRID 4326."""
    return f"SRID={SRID};POINT({longitude} {latitude})"


def wkb_point_to_lonlat(element: Optional[WKBElement]) -> Optional[tuple[float, float]]:
    """(lon, lat) de una columna ``Geometry(POINT)``; ``None`` si no hay punto."""
    if element is None:
        return None
    geometry = shapely_wkb.loads(bytes(element.data))
    if not isinstance(geometry, Point):
        return None
    return (geometry.x, geometry.y)


class GeometryValidationError(ValueError):
    """GeoJSON rechazado: tipo no permitido o geometría inválida."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def multipolygon_geojson_to_ewkt(geojson: dict) -> str:
    """Valida un GeoJSON ``Polygon``/``MultiPolygon`` y regresa su EWKT 4326.

    Un ``Polygon`` se promueve a ``MultiPolygon`` (la columna es MultiPolygon).
    Geometrías vacías, autointersecadas o de otro tipo se rechazan.
    """
    from shapely.geometry import MultiPolygon, Polygon, shape

    try:
        geometry = shape(geojson)
    except Exception:
        raise GeometryValidationError("geometria_invalida", "GeoJSON no reconocible.")

    if isinstance(geometry, Polygon):
        geometry = MultiPolygon([geometry])
    if not isinstance(geometry, MultiPolygon):
        raise GeometryValidationError(
            "geometria_tipo_invalido",
            "La cobertura debe ser un Polygon o MultiPolygon GeoJSON.",
        )
    if geometry.is_empty or not geometry.is_valid:
        raise GeometryValidationError(
            "geometria_invalida",
            "La cobertura es inválida (vacía o con anillos que se cruzan).",
        )
    return f"SRID={SRID};{geometry.wkt}"


def wkb_to_geojson(element: Optional[WKBElement]) -> Optional[dict]:
    """GeoJSON (dict) de cualquier columna ``Geometry``; ``None`` si es NULL."""
    from shapely.geometry import mapping

    if element is None:
        return None
    return mapping(shapely_wkb.loads(bytes(element.data)))
