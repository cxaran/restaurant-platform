"""Tipos de columna geoespaciales portables entre PostgreSQL y los tests.

Los tests unitarios crean el metadata completo sobre SQLite en memoria; el tipo
``Geometry`` de GeoAlchemy2 exigiría SpatiaLite ahí. Estos decoradores entregan
el tipo PostGIS real sólo bajo PostgreSQL (único dialecto de producción; las
migraciones declaran ``Geometry`` a mano) y un BLOB neutro en el resto, donde
las columnas no se consultan espacialmente.
"""

from geoalchemy2 import Geometry
from sqlalchemy import LargeBinary, TypeDecorator


class PointGeometry(TypeDecorator):
    """``geometry(Point, 4326)`` en PostgreSQL; binario inerte en otros dialectos."""

    impl = LargeBinary
    cache_ok = True

    def load_dialect_impl(self, dialect):  # type: ignore[override]
        if dialect.name == "postgresql":
            return dialect.type_descriptor(
                Geometry(geometry_type="POINT", srid=4326, spatial_index=False)
            )
        return dialect.type_descriptor(LargeBinary())


class MultiPolygonGeometry(TypeDecorator):
    """``geometry(MultiPolygon, 4326)`` en PostgreSQL; binario inerte en el resto."""

    impl = LargeBinary
    cache_ok = True

    def load_dialect_impl(self, dialect):  # type: ignore[override]
        if dialect.name == "postgresql":
            return dialect.type_descriptor(
                Geometry(geometry_type="MULTIPOLYGON", srid=4326, spatial_index=False)
            )
        return dialect.type_descriptor(LargeBinary())
