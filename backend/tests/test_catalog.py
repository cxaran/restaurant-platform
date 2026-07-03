"""Tests de la etapa 2: reorden atómico, coherencia de producto y menú público."""

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
from pydantic import ValidationError  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

from backend.app.core.database import get_db  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.catalog import (  # noqa: E402
    ModifierGroup,
    ModifierOption,
    Product,
    ProductCategory,
    ProductInclusion,
    ProductModifierGroup,
)
from backend.app.schemas.catalog import ProductCreate  # noqa: E402
from backend.app.services.catalog_service import (  # noqa: E402
    SortOrderError,
    apply_sort_order,
    build_public_menu,
)


def _sqlite_engine():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return engine


class _Row:
    def __init__(self) -> None:
        self.id = uuid.uuid4()
        self.sort_order = 0


class SortOrderTest(unittest.TestCase):
    def test_normalizes_positions_in_steps_of_ten(self) -> None:
        rows = [_Row(), _Row(), _Row()]
        ordered = [rows[2].id, rows[0].id, rows[1].id]
        apply_sort_order(rows, ordered)
        self.assertEqual(rows[2].sort_order, 10)
        self.assertEqual(rows[0].sort_order, 20)
        self.assertEqual(rows[1].sort_order, 30)

    def test_rejects_duplicates_unknown_and_missing(self) -> None:
        rows = [_Row(), _Row()]

        with self.assertRaises(SortOrderError) as ctx:
            apply_sort_order(rows, [rows[0].id, rows[0].id])
        self.assertEqual(ctx.exception.code, "ids_duplicados")

        with self.assertRaises(SortOrderError) as ctx:
            apply_sort_order(rows, [rows[0].id, uuid.uuid4()])
        self.assertEqual(ctx.exception.code, "ids_desconocidos")

        with self.assertRaises(SortOrderError) as ctx:
            apply_sort_order(rows, [rows[0].id])
        self.assertEqual(ctx.exception.code, "ids_faltantes")

    def test_rejection_applies_nothing(self) -> None:
        rows = [_Row(), _Row()]
        rows[0].sort_order = 99
        with self.assertRaises(SortOrderError):
            apply_sort_order(rows, [rows[0].id])
        self.assertEqual(rows[0].sort_order, 99)


class ProductCoherenceTest(unittest.TestCase):
    def _base(self) -> dict:
        return {"category_id": str(uuid.uuid4()), "name": "Producto"}

    def test_money_purchase_requires_price(self) -> None:
        with self.assertRaises(ValidationError):
            ProductCreate(**self._base(), is_money_purchase_available=True)

    def test_credits_only_product_is_valid(self) -> None:
        product = ProductCreate(
            **self._base(),
            is_money_purchase_available=False,
            credit_redemption_price=8,
        )
        self.assertIsNone(product.money_price_amount)

    def test_unsellable_product_is_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            ProductCreate(**self._base(), is_money_purchase_available=False)


class PublicMenuTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = _sqlite_engine()

    def _seed(self, session: Session) -> None:
        visible = ProductCategory(name="Boneless", sort_order=20)
        hidden = ProductCategory(name="Oculta", sort_order=10, is_active=False)
        empty = ProductCategory(name="Vacía", sort_order=30)
        session.add_all([visible, hidden, empty])
        session.flush()

        salsas = ModifierGroup(
            name="Salsas", selection_type="single", min_selections=1,
            max_selections=1, is_required=True,
        )
        session.add(salsas)
        session.flush()
        session.add_all(
            [
                ModifierOption(
                    modifier_group_id=salsas.id, name="BBQ",
                    price_adjustment=Decimal("0"), sort_order=20,
                ),
                ModifierOption(
                    modifier_group_id=salsas.id, name="Buffalo",
                    price_adjustment=Decimal("0"), sort_order=10,
                ),
                ModifierOption(
                    modifier_group_id=salsas.id, name="Agotada",
                    price_adjustment=Decimal("0"), sort_order=5, is_available=False,
                ),
            ]
        )

        orden = Product(
            category_id=visible.id, name="Orden de boneless",
            money_price_amount=Decimal("230"), credits_awarded_per_unit=20,
            sort_order=10,
        )
        agotado = Product(
            category_id=visible.id, name="Agotado hoy",
            money_price_amount=Decimal("100"), is_available=False, sort_order=20,
        )
        inactivo = Product(
            category_id=visible.id, name="Retirado",
            money_price_amount=Decimal("50"), is_active=False, sort_order=30,
        )
        canjeable = Product(
            category_id=visible.id, name="Dip ranch",
            money_price_amount=Decimal("15"), credit_redemption_price=50, sort_order=40,
        )
        session.add_all([orden, agotado, inactivo, canjeable])
        session.flush()

        session.add(ProductInclusion(product_id=orden.id, name="12 piezas", sort_order=10))
        session.add(
            ProductModifierGroup(
                product_id=orden.id, modifier_group_id=salsas.id,
                sort_order=10, max_selections_override=None,
            )
        )
        session.commit()

    def test_menu_only_exposes_active_available_in_order(self) -> None:
        with Session(self.engine) as session:
            self._seed(session)
            menu = build_public_menu(session)

        # Sólo la categoría visible con productos (la oculta y la vacía no salen).
        self.assertEqual([c["name"] for c in menu], ["Boneless"])
        products = menu[0]["products"]
        self.assertEqual(
            [p["name"] for p in products], ["Orden de boneless", "Dip ranch"]
        )

        orden = products[0]
        self.assertEqual(orden["credits_awarded_per_unit"], 20)
        self.assertEqual([i["name"] for i in orden["inclusions"]], ["12 piezas"])

        salsas = orden["modifier_groups"][0]
        self.assertTrue(salsas["is_required"])
        self.assertEqual(salsas["min_selections"], 1)
        # Opciones disponibles en su orden; la agotada no aparece.
        self.assertEqual([o["name"] for o in salsas["options"]], ["Buffalo", "BBQ"])

        canjeable = products[1]
        self.assertEqual(canjeable["credit_redemption_price"], 50)

    def test_override_takes_precedence(self) -> None:
        with Session(self.engine) as session:
            self._seed(session)
            link = session.exec(select(ProductModifierGroup)).first()
            assert link is not None
            link.min_selections_override = 0
            session.commit()
            menu = build_public_menu(session)
        salsas = menu[0]["products"][0]["modifier_groups"][0]
        self.assertEqual(salsas["min_selections"], 0)


class CatalogRoutesTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = _sqlite_engine()

        def override_db():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def test_openapi_exposes_catalog_routes(self) -> None:
        paths = self.client.get("/api/openapi.json").json()["paths"]
        self.assertIn("/api/v1/catalog/categories", paths)
        self.assertIn("/api/v1/catalog/categories/sort-order", paths)
        self.assertIn("/api/v1/catalog/products", paths)
        self.assertIn("/api/v1/catalog/modifier-groups", paths)
        self.assertIn("/api/v1/catalog/products/{product_id}/modifier-groups", paths)
        self.assertIn("/api/v1/public/menu", paths)
        self.assertIn("/api/v1/public/files/{file_id}", paths)

    def test_public_menu_needs_no_session(self) -> None:
        response = self.client.get("/api/v1/public/menu")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_admin_catalog_requires_authentication(self) -> None:
        self.assertEqual(self.client.get("/api/v1/catalog/categories").status_code, 401)
        self.assertEqual(
            self.client.post("/api/v1/catalog/categories", json={"name": "X"}).status_code,
            401,
        )

    def test_public_file_hides_non_public_kinds(self) -> None:
        # Un id inexistente y cualquier documento se comportan igual: 404.
        response = self.client.get(f"/api/v1/public/files/{uuid.uuid4()}")
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
