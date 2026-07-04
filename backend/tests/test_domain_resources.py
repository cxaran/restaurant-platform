"""Tests de la Etapa 7 RC: recursos del dominio restaurante en el registry.

Por cada recurso nuevo del catálogo contract-driven se verifica el smoke de
capability (GET /api/v1/resources/{name}: estructura con permiso, 404 sin él) y
un listado real vía su endpoint con búsqueda ``q`` o un filtro declarado
(patrón SQLite + overrides de ``test_order_routes``). Además se cubre que
``navigation_modules`` se proyecta por permisos.
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

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402
from sqlmodel import Session  # noqa: E402

from backend.app.auth.auth_dependencies import get_current_user  # noqa: E402
from backend.app.core.database import get_db  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.catalog import (  # noqa: E402
    ModifierGroup,
    Product,
    ProductCategory,
)
from backend.app.models.finances import FinancialCategory  # noqa: E402
from backend.app.models.shipping import DeliveryZone  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402

USER_ID = uuid.uuid4()


def _user(*permissions: str) -> SessionUser:
    return SessionUser(
        id=USER_ID,
        name="Tester",
        last_name="Apellido",
        email="tester@example.com",
        permissions=set(permissions),
    )


class _As:
    def __init__(self, *permissions: str) -> None:
        self.user = _user(*permissions)

    def __enter__(self) -> None:
        app.dependency_overrides[get_current_user] = lambda: self.user

    def __exit__(self, *exc: object) -> None:
        app.dependency_overrides.pop(get_current_user, None)


# (recurso, permiso de lectura) del dominio registrado en esta etapa.
DOMAIN_RESOURCES = (
    ("product_categories", "catalog:read"),
    ("products", "catalog:read"),
    ("modifier_groups", "catalog:read"),
    ("delivery_zones", "shipping:read"),
    ("finance_categories", "finances:read"),
)


class DomainResourcesTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(self.engine)

        def override_db():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)

        with Session(self.engine) as session:
            category = ProductCategory(name="Boneless", sort_order=10)
            session.add(category)
            other = ProductCategory(name="Bebidas", sort_order=20, is_active=False)
            session.add(other)
            session.flush()
            self.category_id = category.id
            self.other_category_id = other.id
            session.add(
                Product(
                    category_id=category.id,
                    name="Orden de boneless",
                    money_price_amount=Decimal("230"),
                    sort_order=10,
                )
            )
            session.add(
                Product(
                    category_id=other.id,
                    name="Refresco",
                    money_price_amount=Decimal("35"),
                    sort_order=10,
                    is_active=False,
                )
            )
            session.add(ModifierGroup(name="Salsas", sort_order=10))
            # En SQLite la columna de geometría es un BLOB inerte (ver test_shipping).
            session.add(
                DeliveryZone(
                    code="centro",
                    name="Centro",
                    coverage_geometry=b"placeholder",
                    priority=10,
                )
            )
            session.add(
                DeliveryZone(
                    code="norte",
                    name="Norte lejano",
                    coverage_geometry=b"placeholder",
                    priority=0,
                    is_active=False,
                )
            )
            session.add(FinancialCategory(direction="income", name="Ventas web"))
            session.add(FinancialCategory(direction="expense", name="Insumos"))
            session.commit()

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    # --- Smoke de capabilities: estructura con permiso, 404 sin permiso ---

    def test_capability_visible_with_read_permission(self) -> None:
        for name, permission in DOMAIN_RESOURCES:
            with self.subTest(resource=name), _As(permission):
                response = self.client.get(f"/api/v1/resources/{name}")
                self.assertEqual(response.status_code, 200, response.text)
                capability = response.json()
                self.assertEqual(capability["view"], "table")
                self.assertTrue(capability["list"]["fields"], name)
                self.assertEqual(
                    capability["item_reference"],
                    {"field": "id", "placeholder": "id", "type": "uuid"},
                )
                self.assertEqual(capability["detail"]["method"], "GET")

    def test_capability_hidden_without_permission_is_404(self) -> None:
        for name, _permission in DOMAIN_RESOURCES:
            with self.subTest(resource=name), _As("users:read"):
                self.assertEqual(
                    self.client.get(f"/api/v1/resources/{name}").status_code, 404
                )

    # --- Listados reales con q o filtro declarado (contrato OffsetPage) ---

    def _page(self, url: str, *permissions: str) -> dict:
        with _As(*permissions):
            response = self.client.get(url)
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertIn("items", body)
        self.assertIn("pagination", body)
        return body

    def test_categories_list_search_and_filter(self) -> None:
        page = self._page("/api/v1/catalog/categories?q=bone", "catalog:read")
        self.assertEqual([item["name"] for item in page["items"]], ["Boneless"])
        actives = self._page("/api/v1/catalog/categories?is_active=true", "catalog:read")
        self.assertEqual([i["name"] for i in actives["items"]], ["Boneless"])

    def test_products_list_scoped_by_category_filter(self) -> None:
        page = self._page(
            f"/api/v1/catalog/products?category_id={self.category_id}", "catalog:read"
        )
        self.assertEqual([item["name"] for item in page["items"]], ["Orden de boneless"])
        # Sin filtro de estado la lista es completa; con is_active=false, la inactiva.
        inactive = self._page("/api/v1/catalog/products?is_active=false", "catalog:read")
        self.assertEqual([i["name"] for i in inactive["items"]], ["Refresco"])

    def test_modifier_groups_list_search(self) -> None:
        page = self._page("/api/v1/catalog/modifier-groups?q=sal", "catalog:read")
        self.assertEqual([item["name"] for item in page["items"]], ["Salsas"])

    def test_delivery_zones_list_filter_and_default_order(self) -> None:
        page = self._page("/api/v1/shipping/zones", "shipping:read")
        # Orden por prioridad MAYOR primero (default del plan).
        self.assertEqual([item["code"] for item in page["items"]], ["centro", "norte"])
        actives = self._page("/api/v1/shipping/zones?is_active=true", "shipping:read")
        self.assertEqual([i["code"] for i in actives["items"]], ["centro"])

    def test_finance_categories_list_filter_by_direction(self) -> None:
        page = self._page(
            "/api/v1/finances/categories?direction=income", "finances:read"
        )
        self.assertEqual([item["name"] for item in page["items"]], ["Ventas web"])

    def test_list_endpoints_require_their_permission(self) -> None:
        with _As("users:read"):
            self.assertEqual(
                self.client.get("/api/v1/catalog/categories").status_code, 403
            )
            self.assertEqual(self.client.get("/api/v1/shipping/zones").status_code, 403)
            self.assertEqual(
                self.client.get("/api/v1/finances/categories").status_code, 403
            )

    # --- Detalle individual (precarga del formulario genérico) ---

    def test_category_detail_roundtrip(self) -> None:
        with _As("catalog:read"):
            response = self.client.get(
                f"/api/v1/catalog/categories/{self.category_id}"
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["name"], "Boneless")

    # --- Navegación de módulos especializados (parte B) ---

    def test_navigation_modules_projected_by_permissions(self) -> None:
        with _As("deliveries:self_assign", "tickets:print"):
            body = self.client.get("/api/v1/resources").json()
        self.assertEqual(
            [m["name"] for m in body["navigation_modules"]], ["reparto", "tickets"]
        )
        self.assertEqual(body["resources"], [])

    def test_navigation_modules_empty_without_permissions(self) -> None:
        with _As("users:read"):
            body = self.client.get("/api/v1/resources").json()
        self.assertEqual(body["navigation_modules"], [])


if __name__ == "__main__":
    unittest.main()
