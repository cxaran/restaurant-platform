"""Tests de la etapa 3: geometría GeoJSON, selección de tarifa y cotización.

``resolve_zone``/``ST_Covers`` requieren PostGIS y se verifican contra el stack
de desarrollo; aquí se prueba todo lo demás (validación de polígonos, tarifa
por prioridad y mínimo, umbral de envío gratis, camino sin ubicación y rutas).
"""

import os
import unittest
import uuid
from decimal import Decimal


DEV_ENV = {
    "ENVIRONMENT": "local",
    "SECRET_KEY": "test-secret-key",
    "ACCESS_TOKEN_EXPIRE_MINUTES": "30",
    "EMAIL_TOKEN_EXPIRE_MINUTES": "30",
    "TRYS_BEFORE_LOCK": "5",
    "REDIS_HOST": "redis",
    "REDIS_PORT": "6379",
    "REDIS_DB": "0",
    "SMTP_HOST": "mailpit",
    "SMTP_PORT": "1025",
    "SMTP_USER": "test@example.com",
    "SMTP_PASSWORD": "test-password",
    "SMTP_FROM_EMAIL": "test@example.com",
    "SMTP_FROM_NAME": "Restaurant Platform Test",
    "SMTP_TLS": "false",
    "SMTP_SSL": "false",
    "SMTP_USE_CREDENTIALS": "false",
    "POSTGRES_USER": "platform",
    "POSTGRES_PASSWORD": "platform",
    "POSTGRES_SERVER": "postgres",
    "POSTGRES_PORT": "5432",
    "POSTGRES_DB": "restaurant_platform",
}

os.environ.update(DEV_ENV)

from unittest import mock  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

from backend.app.auth.auth_dependencies import get_current_user  # noqa: E402
from backend.app.core.database import get_db  # noqa: E402
from backend.app.core.settings import settings  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.business import BusinessSettings  # noqa: E402
from backend.app.models.orders import OrderShipping  # noqa: E402
from backend.app.models.shipping import DeliveryZone, ShippingRateRule  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402
from backend.app.services.shipping_service import (  # noqa: E402
    quote_shipping,
    select_rate,
)
from backend.app.utils.geo import (  # noqa: E402
    GeometryValidationError,
    multipolygon_geojson_to_ewkt,
)

SQUARE = {
    "type": "Polygon",
    "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
}
BOWTIE = {  # anillos que se cruzan: inválido
    "type": "Polygon",
    "coordinates": [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]],
}


def _sqlite_engine():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return engine


def _zone(**kwargs) -> DeliveryZone:
    # En SQLite la columna de geometría es BLOB inerte: basta un placeholder.
    return DeliveryZone(
        code=kwargs.pop("code", f"z-{uuid.uuid4().hex[:8]}"),
        name=kwargs.pop("name", "Zona"),
        coverage_geometry=b"placeholder",
        **kwargs,
    )


class GeometryValidationTest(unittest.TestCase):
    def test_polygon_is_promoted_to_multipolygon_ewkt(self) -> None:
        ewkt = multipolygon_geojson_to_ewkt(SQUARE)
        self.assertTrue(ewkt.startswith("SRID=4326;MULTIPOLYGON"))

    def test_multipolygon_is_accepted(self) -> None:
        multi = {"type": "MultiPolygon", "coordinates": [SQUARE["coordinates"]]}
        ewkt = multipolygon_geojson_to_ewkt(multi)
        self.assertIn("MULTIPOLYGON", ewkt)

    def test_invalid_geometry_is_rejected(self) -> None:
        with self.assertRaises(GeometryValidationError) as ctx:
            multipolygon_geojson_to_ewkt(BOWTIE)
        self.assertEqual(ctx.exception.code, "geometria_invalida")

    def test_wrong_type_is_rejected(self) -> None:
        with self.assertRaises(GeometryValidationError) as ctx:
            multipolygon_geojson_to_ewkt({"type": "Point", "coordinates": [0, 0]})
        self.assertEqual(ctx.exception.code, "geometria_tipo_invalido")

    def test_garbage_is_rejected(self) -> None:
        with self.assertRaises(GeometryValidationError):
            multipolygon_geojson_to_ewkt({"tipo": "cuadrado"})


class RateSelectionTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = _sqlite_engine()

    def test_priority_and_minimum_order(self) -> None:
        with Session(self.engine) as session:
            zone = _zone()
            session.add(zone)
            session.flush()
            base = ShippingRateRule(
                delivery_zone_id=zone.id, name="Base", base_fee=Decimal("45"), priority=0
            )
            promo = ShippingRateRule(
                delivery_zone_id=zone.id,
                name="Promo compra grande",
                base_fee=Decimal("20"),
                minimum_order_amount=Decimal("300"),
                priority=10,
            )
            inactive = ShippingRateRule(
                delivery_zone_id=zone.id,
                name="Vieja",
                base_fee=Decimal("5"),
                priority=99,
                is_active=False,
            )
            session.add_all([base, promo, inactive])
            session.commit()
            session.refresh(zone)

            # Subtotal chico: la promo no aplica (mínimo), la inactiva jamás.
            chosen = select_rate(zone, Decimal("100"))
            assert chosen is not None
            self.assertEqual(chosen.name, "Base")

            # Subtotal grande: gana la promo por prioridad.
            chosen = select_rate(zone, Decimal("400"))
            assert chosen is not None
            self.assertEqual(chosen.name, "Promo compra grande")

    def test_no_applicable_rate_returns_none(self) -> None:
        with Session(self.engine) as session:
            zone = _zone()
            session.add(zone)
            session.commit()
            session.refresh(zone)
            self.assertIsNone(select_rate(zone, Decimal("100")))


class QuoteWithoutLocationTest(unittest.TestCase):
    def test_no_location_is_pending_review_without_geo_queries(self) -> None:
        engine = _sqlite_engine()
        with Session(engine) as session:
            quote = quote_shipping(session, subtotal=Decimal("100"))
        self.assertEqual(quote.status, "pending_review")
        self.assertIsNone(quote.amount)


class ShippingRoutesTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = _sqlite_engine()

        def override_db():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)
        self._previous_rate_limit = settings.rate_limit_enabled
        settings.rate_limit_enabled = False

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        settings.rate_limit_enabled = self._previous_rate_limit

    def test_openapi_exposes_shipping_routes(self) -> None:
        paths = self.client.get("/api/openapi.json").json()["paths"]
        self.assertIn("/api/v1/shipping/zones", paths)
        self.assertIn("/api/v1/shipping/zones/{zone_id}/rates", paths)
        self.assertIn("/api/v1/public/shipping-quote", paths)

    def test_admin_shipping_requires_authentication(self) -> None:
        self.assertEqual(self.client.get("/api/v1/shipping/zones").status_code, 401)

    def test_public_quote_without_location_is_pending_review(self) -> None:
        with Session(self.engine) as session:
            session.add(BusinessSettings(id=1))
            session.commit()
        response = self.client.post(
            "/api/v1/public/shipping-quote", json={"subtotal": "100.00"}
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "pending_review")
        self.assertIsNone(body["amount"])

    def test_public_quote_validates_subtotal(self) -> None:
        response = self.client.post(
            "/api/v1/public/shipping-quote", json={"subtotal": "-5"}
        )
        self.assertEqual(response.status_code, 422)


class _As:
    """Sesión simulada con permisos exactos (mismo patrón del resto de suites)."""

    def __init__(self, *permissions: str) -> None:
        self.user = SessionUser(
            id=uuid.uuid4(),
            name="Tester",
            last_name="Apellido",
            email="tester@example.com",
            permissions=set(permissions),
        )

    def __enter__(self) -> None:
        app.dependency_overrides[get_current_user] = lambda: self.user

    def __exit__(self, *exc: object) -> None:
        app.dependency_overrides.pop(get_current_user, None)


class ZoneDeletionTest(unittest.TestCase):
    """DELETE /shipping/zones/{id} elimina de verdad; con pedidos se rechaza."""

    def setUp(self) -> None:
        self.engine = _sqlite_engine()

        def override_db():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)
        # La geometría en SQLite es un BLOB inerte: la serialización GeoJSON de
        # la respuesta se neutraliza (el borrado es lo que se prueba aquí).
        self._geo = mock.patch(
            "backend.app.api.v1.shipping.wkb_to_geojson", return_value={}
        )
        self._geo.start()

        self.zone_id = uuid.uuid4()
        with Session(self.engine) as session:
            zone = _zone(name="Zona borrable")
            zone.id = self.zone_id
            zone.rates.append(
                ShippingRateRule(name="Base", base_fee=Decimal("30"), priority=0)
            )
            session.add(zone)
            session.commit()

    def tearDown(self) -> None:
        self._geo.stop()
        app.dependency_overrides.clear()

    def test_delete_zone_removes_zone_and_rates(self) -> None:
        with _As("shipping:manage"):
            response = self.client.delete(f"/api/v1/shipping/zones/{self.zone_id}")
        self.assertEqual(response.status_code, 200, response.text)
        with Session(self.engine) as session:
            self.assertIsNone(session.get(DeliveryZone, self.zone_id))
            # Las tarifas caen en cascada con la zona.
            self.assertEqual(
                session.exec(
                    select(ShippingRateRule).where(
                        ShippingRateRule.delivery_zone_id == self.zone_id
                    )
                ).all(),
                [],
            )

    def test_delete_zone_with_orders_keeps_order_snapshot(self) -> None:
        """El historial NO depende de la zona viva: snapshot y monto sobreviven.

        (La puesta a NULL de la referencia viva es DDL — ON DELETE SET NULL — y
        se valida contra PostgreSQL; SQLite no aplica FKs aquí.)
        """
        shipping_id = uuid.uuid4()
        with Session(self.engine) as session:
            session.add(
                OrderShipping(
                    id=shipping_id,
                    order_id=uuid.uuid4(),
                    delivery_zone_id=self.zone_id,
                    delivery_zone_name_snapshot="Zona borrable",
                    calculation_status="calculated",
                    calculation_source="polygon_auto",
                    final_amount=Decimal("30"),
                )
            )
            session.commit()
        with _As("shipping:manage"):
            response = self.client.delete(f"/api/v1/shipping/zones/{self.zone_id}")
        self.assertEqual(response.status_code, 200, response.text)
        with Session(self.engine) as session:
            self.assertIsNone(session.get(DeliveryZone, self.zone_id))
            shipping = session.get(OrderShipping, shipping_id)
            assert shipping is not None
            self.assertEqual(shipping.delivery_zone_name_snapshot, "Zona borrable")
            self.assertEqual(shipping.final_amount, Decimal("30"))

    def test_deactivation_still_available_via_patch(self) -> None:
        with _As("shipping:manage"):
            response = self.client.patch(
                f"/api/v1/shipping/zones/{self.zone_id}", json={"is_active": False}
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertFalse(response.json()["is_active"])

    def test_delete_requires_manage_permission(self) -> None:
        with _As("shipping:read"):
            response = self.client.delete(f"/api/v1/shipping/zones/{self.zone_id}")
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
