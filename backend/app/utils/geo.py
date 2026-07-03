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
