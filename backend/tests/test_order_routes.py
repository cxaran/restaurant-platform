"""Tests de la etapa 4d: rutas de pedidos (checkout, captura, panel)."""

import os
import unittest
import uuid
from datetime import datetime, timedelta
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
from backend.app.models.shipping import DeliveryZone, ShippingRateRule  # noqa: E402
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
        # El checkout ahora aplica rate limiting (§1.14); en unitarios se apaga
        # (la política real se prueba con Redis en integración).
        from backend.app.core.settings import settings

        self._previous_rate_limit = settings.rate_limit_enabled
        settings.rate_limit_enabled = False
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
        from backend.app.core.settings import settings

        settings.rate_limit_enabled = self._previous_rate_limit
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

    def test_online_orders_require_open_hours_switch(self) -> None:
        """Switch opt-in: cerrado según horario ⇒ el checkout web se rechaza;
        apagado (default) el horario es sólo informativo."""
        from datetime import time as dtime

        from backend.app.models.business import BusinessWeeklyHours

        # Default apagado: sin horarios configurados el checkout procede igual.
        with _As(CUSTOMER_ID):
            ok = self.client.post("/api/v1/orders", json=self._checkout_payload())
        self.assertEqual(ok.status_code, 201, ok.text)

        with Session(self.engine) as session:
            row = session.get(BusinessSettings, 1)
            assert row is not None
            row.online_orders_require_open_hours = True
            session.commit()

        # Encendido y sin horario configurado = cerrado ⇒ 409 negocio_cerrado.
        with _As(CUSTOMER_ID):
            closed = self.client.post("/api/v1/orders", json=self._checkout_payload())
        self.assertEqual(closed.status_code, 409, closed.text)
        self.assertEqual(closed.json()["code"], "negocio_cerrado")

        # Con un horario que cubre todo el día, el checkout vuelve a proceder.
        with Session(self.engine) as session:
            for day in range(7):
                session.add(
                    BusinessWeeklyHours(
                        day_of_week=day, slot_number=1,
                        opens_at=dtime(0, 0), closes_at=dtime(23, 59),
                    )
                )
            session.commit()
        with _As(CUSTOMER_ID):
            open_again = self.client.post("/api/v1/orders", json=self._checkout_payload())
        self.assertEqual(open_again.status_code, 201, open_again.text)

    def test_internal_list_paginates_searches_and_counts(self) -> None:
        """Tablero interno: envelope paginado, búsqueda (folio/cliente/dirección
        vía entrega) y conteos por estado con los mismos filtros."""
        with _As(CUSTOMER_ID):
            for name in ("María López", "Jorge Salas", "Ana Cruz"):
                response = self.client.post(
                    "/api/v1/orders",
                    json=self._checkout_payload(customer_name=name),
                )
                self.assertEqual(response.status_code, 201, response.text)

        with _As(uuid.uuid4(), "orders:read"):
            page = self.client.get("/api/v1/orders?limit=2&offset=0").json()
            self.assertEqual(len(page["items"]), 2)
            self.assertEqual(page["pagination"]["total"], 3)
            self.assertTrue(page["pagination"]["has_next"])

            rest = self.client.get("/api/v1/orders?limit=2&offset=2").json()
            self.assertEqual(len(rest["items"]), 1)
            self.assertFalse(rest["pagination"]["has_next"])

            # Búsqueda por nombre de cliente y por folio.
            by_name = self.client.get("/api/v1/orders?q=jorge").json()
            self.assertEqual(by_name["pagination"]["total"], 1)
            self.assertEqual(by_name["items"][0]["customer_name_snapshot"], "Jorge Salas")
            by_code = self.client.get(
                f"/api/v1/orders?q={by_name['items'][0]['public_code']}"
            ).json()
            self.assertEqual(by_code["pagination"]["total"], 1)

            # Filtro por estado (coma-separado) y rango de fechas.
            submitted = self.client.get("/api/v1/orders?status=submitted,approved").json()
            self.assertEqual(submitted["pagination"]["total"], 3)
            past = self.client.get("/api/v1/orders?created_to=2000-01-01T00:00:00").json()
            self.assertEqual(past["pagination"]["total"], 0)

            counts = self.client.get("/api/v1/orders/status-counts").json()
            self.assertEqual(counts, {"submitted": 3})
            counts_q = self.client.get("/api/v1/orders/status-counts?q=ana").json()
            self.assertEqual(counts_q, {"submitted": 1})

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
            # El monto manual no proviene de una tarifa: sin tiempo estimado.
            self.assertIsNone(shipping["estimated_minutes"])

            transition_url = f"/api/v1/orders/{body['id']}/transition"
            self.client.post(transition_url, json={"new_status": "pending_approval"})
            approved = self.client.post(transition_url, json={"new_status": "approved"})
        self.assertEqual(approved.status_code, 200, approved.text)
        self.assertEqual(approved.json()["total_money_amount"], "265.00")  # 230 + 35

    def test_delivery_rate_finalize_snapshots_estimated_minutes_and_eta(self) -> None:
        """Finalizar con una tarifa CONGELA su tiempo estimado en el pedido y,
        una vez aprobado, el cliente recibe la hora estimada de entrega."""
        # Zona + tarifa con tiempo estimado (25 min). En SQLite la geometría es
        # un BLOB inerte: basta un placeholder (no se ejecuta ST_Covers aquí).
        with Session(self.engine) as session:
            zone = DeliveryZone(
                code="z-rc", name="Zona RC", coverage_geometry=b"placeholder"
            )
            session.add(zone)
            session.flush()
            rate = ShippingRateRule(
                delivery_zone_id=zone.id,
                name="Estándar",
                base_fee=Decimal("40"),
                estimated_minutes=25,
            )
            session.add(rate)
            session.commit()
            rate_id = str(rate.id)

        payload = self._checkout_payload(
            fulfillment_type="delivery",
            delivery={"street": "Calle Ejemplo 123", "neighborhood": "Anáhuac"},
        )
        with _As(CUSTOMER_ID):
            created = self.client.post("/api/v1/orders", json=payload)
        self.assertEqual(created.status_code, 201, created.text)
        order_id = created.json()["id"]

        url = f"/api/v1/orders/{order_id}/shipping"
        transition_url = f"/api/v1/orders/{order_id}/transition"
        with _As(STAFF_ID, "orders:adjust_shipping", "orders:transition", "orders:approve"):
            finalized = self.client.put(url, json={"shipping_rate_rule_id": rate_id})
            self.assertEqual(finalized.status_code, 200, finalized.text)
            shipping = finalized.json()["shipping"]
            # El tiempo estimado de la tarifa quedó CONGELADO en el envío.
            self.assertEqual(shipping["estimated_minutes"], 25)
            self.assertEqual(shipping["calculation_source"], "employee_selected_rate")

            self.client.post(transition_url, json={"new_status": "pending_approval"})
            approved = self.client.post(transition_url, json={"new_status": "approved"})
        self.assertEqual(approved.status_code, 200, approved.text)
        approved_at = approved.json()["approved_at"]
        self.assertIsNotNone(approved_at)

        # El cliente ve el tiempo estimado y la hora estimada = approved_at + 25.
        with _As(CUSTOMER_ID):
            mine = self.client.get(f"/api/v1/orders/mine/{order_id}")
        self.assertEqual(mine.status_code, 200, mine.text)
        body = mine.json()
        self.assertEqual(body["shipping_estimated_minutes"], 25)
        self.assertIsNotNone(body["estimated_delivery_at"])
        delta = datetime.fromisoformat(body["estimated_delivery_at"]) - datetime.fromisoformat(
            approved_at
        )
        self.assertEqual(delta, timedelta(minutes=25))


if __name__ == "__main__":
    unittest.main()
