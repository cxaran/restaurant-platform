"""Tests de la etapa 4d: rutas de pedidos (checkout, captura, panel)."""

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
from backend.app.models.business import BusinessSettings  # noqa: E402
from backend.app.models.catalog import Product, ProductCategory  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402

CUSTOMER_ID = uuid.uuid4()
STAFF_ID = uuid.uuid4()


def _user(user_id: uuid.UUID, *permissions: str) -> SessionUser:
    return SessionUser(
        id=user_id,
        name="Tester",
        last_name="Apellido",
        email="tester@example.com",
        permissions=set(permissions),
    )


class _As:
    def __init__(self, user_id: uuid.UUID, *permissions: str) -> None:
        self.user = _user(user_id, *permissions)

    def __enter__(self) -> None:
        app.dependency_overrides[get_current_user] = lambda: self.user

    def __exit__(self, *exc: object) -> None:
        app.dependency_overrides.pop(get_current_user, None)


class OrderRoutesTest(unittest.TestCase):
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
            session.add(BusinessSettings(id=1, allow_pickup=True))
            category = ProductCategory(name="Boneless")
            session.add(category)
            session.flush()
            self.product_id = uuid.uuid4()
            session.add(
                Product(
                    id=self.product_id,
                    category_id=category.id,
                    name="Orden de boneless",
                    money_price_amount=Decimal("230"),
                    credits_awarded_per_unit=20,
                )
            )
            session.commit()

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def _checkout_payload(self, **overrides) -> dict:
        payload = {
            "fulfillment_type": "pickup",
            "lines": [{"product_id": str(self.product_id), "quantity": 1}],
            "customer_name": "María López",
            "customer_phone": "8332147789",
        }
        payload.update(overrides)
        return payload

    def test_openapi_exposes_order_routes(self) -> None:
        paths = self.client.get("/api/openapi.json").json()["paths"]
        for path in (
            "/api/v1/orders",
            "/api/v1/orders/mine",
            "/api/v1/orders/capture",
            "/api/v1/orders/{order_id}/transition",
            "/api/v1/orders/{order_id}/shipping",
            "/api/v1/orders/{order_id}/adjustments",
        ):
            self.assertIn(path, paths)

    def test_routes_require_authentication(self) -> None:
        self.assertEqual(self.client.post("/api/v1/orders", json={}).status_code, 401)
        self.assertEqual(self.client.get("/api/v1/orders/mine").status_code, 401)
        self.assertEqual(self.client.get("/api/v1/orders").status_code, 401)

    def test_checkout_pickup_happy_path_and_ownership(self) -> None:
        with _As(CUSTOMER_ID):
            response = self.client.post("/api/v1/orders", json=self._checkout_payload())
        self.assertEqual(response.status_code, 201, response.text)
        body = response.json()
        self.assertEqual(body["public_code"], "ORD-000001")
        self.assertEqual(body["status"], "submitted")
        self.assertEqual(body["status_label"], "Pedido recibido")
        self.assertEqual(body["items_subtotal_amount"], "230.00")
        self.assertEqual(body["credits_earned_total_snapshot"], 20)

        with _As(CUSTOMER_ID):
            mine = self.client.get("/api/v1/orders/mine").json()
        self.assertEqual(len(mine), 1)

        # Otro usuario no ve pedidos ajenos (propiedad del registro).
        with _As(uuid.uuid4()):
            other = self.client.get("/api/v1/orders/mine").json()
            detail = self.client.get(f"/api/v1/orders/mine/{body['id']}")
        self.assertEqual(other, [])
        self.assertEqual(detail.status_code, 404)

    def test_quantities_must_be_strict_positive_integers(self) -> None:
        """H1 vía HTTP: 0.5, "1", true, 0 y negativos → 422 de validación."""
        for bad in (0.5, "1", True, 0, -1, "1.0", 1.5):
            payload = self._checkout_payload(
                lines=[{"product_id": str(self.product_id), "quantity": bad}]
            )
            with _As(CUSTOMER_ID):
                response = self.client.post("/api/v1/orders", json=payload)
            self.assertEqual(response.status_code, 422, f"quantity={bad!r}")

    def test_checkout_credits_on_non_redeemable_product_rejected(self) -> None:
        payload = self._checkout_payload(
            purchase_mode="credits",
            lines=[{
                "product_id": str(self.product_id),
                "quantity": 1,
                "purchase_mode": "credits",
            }],
        )
        with _As(CUSTOMER_ID):
            response = self.client.post("/api/v1/orders", json=payload)
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["code"], "producto_no_canjeable")

    def test_checkout_mixed_purchase_modes_rejected(self) -> None:
        """Pedido íntegro (§1.3): una línea credits en pedido money → 422."""
        payload = self._checkout_payload(
            lines=[
                {"product_id": str(self.product_id), "quantity": 1},
                {
                    "product_id": str(self.product_id),
                    "quantity": 1,
                    "purchase_mode": "credits",
                },
            ]
        )
        with _As(CUSTOMER_ID):
            response = self.client.post("/api/v1/orders", json=payload)
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["code"], "modo_compra_mixto")

    def test_checkout_credits_with_delivery_rejected(self) -> None:
        """Pedido de canje jamás lleva envío a domicilio."""
        payload = self._checkout_payload(
            purchase_mode="credits",
            fulfillment_type="delivery",
            lines=[{
                "product_id": str(self.product_id),
                "quantity": 1,
                "purchase_mode": "credits",
            }],
        )
        with _As(CUSTOMER_ID):
            response = self.client.post("/api/v1/orders", json=payload)
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["code"], "canje_sin_envio")

    def test_checkout_money_order_exposes_purchase_mode(self) -> None:
        with _As(CUSTOMER_ID):
            response = self.client.post("/api/v1/orders", json=self._checkout_payload())
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()["purchase_mode"], "money")

    def test_capture_requires_permission(self) -> None:
        payload = {
            "source": "counter",
            "fulfillment_type": "counter",
            "lines": [{"product_id": str(self.product_id), "quantity": 1}],
        }
        with _As(STAFF_ID):
            self.assertEqual(
                self.client.post("/api/v1/orders/capture", json=payload).status_code, 403
            )
        with _As(STAFF_ID, "orders:capture"):
            response = self.client.post("/api/v1/orders/capture", json=payload)
        self.assertEqual(response.status_code, 201, response.text)
        body = response.json()
        self.assertIsNone(body["customer_user_id"])
        self.assertEqual(body["created_by"], str(STAFF_ID))

    def test_approve_requires_extra_permission_and_freezes_total(self) -> None:
        payload = {
            "source": "counter",
            "fulfillment_type": "counter",
            "lines": [{"product_id": str(self.product_id), "quantity": 1}],
        }
        with _As(STAFF_ID, "orders:capture"):
            order = self.client.post("/api/v1/orders/capture", json=payload).json()

        url = f"/api/v1/orders/{order['id']}/transition"
        with _As(STAFF_ID, "orders:read", "orders:transition"):
            self.client.post(url, json={"new_status": "pending_approval"})
            denied = self.client.post(url, json={"new_status": "approved"})
        self.assertEqual(denied.status_code, 403)

        with _As(STAFF_ID, "orders:transition", "orders:approve"):
            approved = self.client.post(url, json={"new_status": "approved"})
        self.assertEqual(approved.status_code, 200, approved.text)
        self.assertEqual(approved.json()["total_money_amount"], "230.00")

    def test_delivery_flow_shipping_review_then_manual_finalize(self) -> None:
        payload = self._checkout_payload(
            fulfillment_type="delivery",
            delivery={"street": "Calle Ejemplo 123", "neighborhood": "Anáhuac"},
        )
        with _As(CUSTOMER_ID):
            response = self.client.post("/api/v1/orders", json=payload)
        self.assertEqual(response.status_code, 201, response.text)
        body = response.json()
        # Sin zonas configuradas: costo NO definido, pendiente de revisión (§17.2).
        self.assertTrue(body["shipping_pending_review"])
        self.assertIsNone(body["shipping_amount"])

        url = f"/api/v1/orders/{body['id']}/shipping"
        with _As(STAFF_ID, "orders:adjust_shipping", "orders:transition", "orders:approve"):
            no_reason = self.client.put(url, json={"final_amount": "35.00"})
            self.assertEqual(no_reason.status_code, 422)
            self.assertEqual(no_reason.json()["code"], "motivo_requerido")

            fixed = self.client.put(
                url, json={"final_amount": "35.00", "reason": "Fuera de zona cercana"}
            )
            self.assertEqual(fixed.status_code, 200, fixed.text)
            shipping = fixed.json()["shipping"]
            self.assertEqual(shipping["final_amount"], "35.00")
            self.assertEqual(shipping["calculation_source"], "employee_manual_override")
            self.assertEqual(shipping["calculation_status"], "finalized")

            transition_url = f"/api/v1/orders/{body['id']}/transition"
            self.client.post(transition_url, json={"new_status": "pending_approval"})
            approved = self.client.post(transition_url, json={"new_status": "approved"})
        self.assertEqual(approved.status_code, 200, approved.text)
        self.assertEqual(approved.json()["total_money_amount"], "265.00")  # 230 + 35


if __name__ == "__main__":
    unittest.main()
