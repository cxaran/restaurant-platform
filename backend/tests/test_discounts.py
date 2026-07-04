"""Tests de la Etapa 5 RC: códigos de descuento fijo web-only."""

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
from sqlalchemy.exc import IntegrityError  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

from backend.app.auth.auth_dependencies import get_current_user  # noqa: E402
from backend.app.core.database import get_db  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.business import BusinessSettings  # noqa: E402
from backend.app.models.catalog import Product, ProductCategory  # noqa: E402
from backend.app.models.discounts import DiscountCode, DiscountCodeRedemption  # noqa: E402
from backend.app.models.orders import Order, OrderAdjustment  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402
from backend.app.services.discount_service import (  # noqa: E402
    DiscountRuleError,
    normalize_code,
    quote_discount,
    release_order_redemption,
    revalidate_reserved_redemption,
)
from backend.app.utils.utc_now import utc_now  # noqa: E402

CUSTOMER_ID = uuid.uuid4()
OTHER_CUSTOMER_ID = uuid.uuid4()
STAFF_ID = uuid.uuid4()
ADMIN_ID = uuid.uuid4()


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


class DiscountCodesTest(unittest.TestCase):
    def setUp(self) -> None:
        # El checkout aplica rate limiting (§1.14); en unitarios se apaga.
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
            self.redeemable_id = uuid.uuid4()
            session.add(
                Product(
                    id=self.redeemable_id,
                    category_id=category.id,
                    name="Postre de canje",
                    is_money_purchase_available=False,
                    credit_redemption_price=50,
                )
            )
            session.commit()

    def tearDown(self) -> None:
        from backend.app.core.settings import settings

        settings.rate_limit_enabled = self._previous_rate_limit
        app.dependency_overrides.clear()

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _code_payload(self, **overrides) -> dict:
        payload = {
            "name": "Promo de verano",
            "code": "VERANO100",
            "discount_amount": "100",
            "minimum_order_amount": "200",
        }
        payload.update(overrides)
        return payload

    def _create_code(self, **overrides) -> dict:
        with _As(ADMIN_ID, "discount_codes:manage"):
            response = self.client.post(
                "/api/v1/discount-codes", json=self._code_payload(**overrides)
            )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def _quote(self, code: str, *, user_id=CUSTOMER_ID, lines=None):
        payload = {
            "discount_code": code,
            "lines": lines or [{"product_id": str(self.product_id), "quantity": 1}],
        }
        with _As(user_id):
            return self.client.post("/api/v1/discount-codes/quote", json=payload)

    def _checkout(self, *, user_id=CUSTOMER_ID, **overrides):
        payload = {
            "fulfillment_type": "pickup",
            "lines": [{"product_id": str(self.product_id), "quantity": 1}],
            "customer_name": "María López",
            "customer_phone": "8332147789",
        }
        payload.update(overrides)
        with _As(user_id):
            return self.client.post("/api/v1/orders", json=payload)

    def _transition(self, order_id: str, new_status: str, **extra):
        with _As(
            STAFF_ID, "orders:read", "orders:transition", "orders:approve", "orders:cancel"
        ):
            return self.client.post(
                f"/api/v1/orders/{order_id}/transition",
                json={"new_status": new_status, **extra},
            )

    def _redemption(self, session: Session, order_id) -> DiscountCodeRedemption:
        redemption = session.exec(
            select(DiscountCodeRedemption).where(
                DiscountCodeRedemption.order_id == uuid.UUID(str(order_id))
            )
        ).first()
        self.assertIsNotNone(redemption)
        return redemption

    # ------------------------------------------------------------------
    # Rutas y permisos
    # ------------------------------------------------------------------

    def test_openapi_exposes_discount_routes(self) -> None:
        paths = self.client.get("/api/openapi.json").json()["paths"]
        for path in (
            "/api/v1/discount-codes",
            "/api/v1/discount-codes/quote",
            "/api/v1/discount-codes/{code_id}",
            "/api/v1/discount-codes/{code_id}/redemptions",
        ):
            self.assertIn(path, paths)

    def test_quote_requires_session(self) -> None:
        response = self.client.post(
            "/api/v1/discount-codes/quote",
            json={
                "discount_code": "X",
                "lines": [{"product_id": str(self.product_id), "quantity": 1}],
            },
        )
        self.assertEqual(response.status_code, 401)

    def test_create_requires_manage_permission(self) -> None:
        with _As(ADMIN_ID):
            denied = self.client.post("/api/v1/discount-codes", json=self._code_payload())
        self.assertEqual(denied.status_code, 403)
        with _As(ADMIN_ID, "discount_codes:read"):
            still_denied = self.client.post(
                "/api/v1/discount-codes", json=self._code_payload()
            )
        self.assertEqual(still_denied.status_code, 403)

    def test_list_requires_read_permission(self) -> None:
        with _As(ADMIN_ID):
            denied = self.client.get("/api/v1/discount-codes")
        self.assertEqual(denied.status_code, 403)
        self._create_code()
        with _As(ADMIN_ID, "discount_codes:read"):
            listed = self.client.get("/api/v1/discount-codes")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.json()), 1)
        self.assertEqual(listed.json()[0]["code"], "VERANO100")

    # ------------------------------------------------------------------
    # Administración: unicidad y coherencia
    # ------------------------------------------------------------------

    def test_duplicate_code_is_case_insensitive(self) -> None:
        self._create_code()
        with _As(ADMIN_ID, "discount_codes:manage"):
            duplicated = self.client.post(
                "/api/v1/discount-codes", json=self._code_payload(code="verano100")
            )
        self.assertEqual(duplicated.status_code, 409)
        self.assertEqual(duplicated.json()["code"], "codigo_duplicado")

    def test_create_rejects_incoherent_dates(self) -> None:
        with _As(ADMIN_ID, "discount_codes:manage"):
            response = self.client.post(
                "/api/v1/discount-codes",
                json=self._code_payload(
                    valid_from="2030-01-02T00:00:00Z", valid_until="2030-01-01T00:00:00Z"
                ),
            )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["code"], "vigencia_invalida")

    def test_create_rejects_discount_above_minimum(self) -> None:
        with _As(ADMIN_ID, "discount_codes:manage"):
            response = self.client.post(
                "/api/v1/discount-codes",
                json=self._code_payload(discount_amount="300", minimum_order_amount="200"),
            )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["code"], "descuento_mayor_al_minimo")

    # ------------------------------------------------------------------
    # Cotización
    # ------------------------------------------------------------------

    def test_quote_is_case_insensitive(self) -> None:
        self._create_code(code="VERANO100")
        self.assertEqual(normalize_code("  VERANO100 "), "verano100")
        response = self._quote("verano100")
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertTrue(body["valid"])
        self.assertEqual(body["code"], "VERANO100")
        self.assertEqual(Decimal(body["discount_amount"]), Decimal("100"))
        self.assertEqual(Decimal(body["eligible_subtotal"]), Decimal("230"))

    def test_quote_inactive_or_missing_is_not_found(self) -> None:
        self._create_code(is_active=False)
        for code in ("VERANO100", "NOEXISTE"):
            response = self._quote(code)
            self.assertEqual(response.status_code, 422)
            # Mismo error para inexistente e inactivo: no revela existencia.
            self.assertEqual(response.json()["code"], "codigo_no_encontrado")

    def test_quote_outside_validity_window(self) -> None:
        self._create_code(code="FUTURO", valid_from="2030-01-01T00:00:00Z")
        self._create_code(code="PASADO", valid_until="2020-01-01T00:00:00Z")
        for code in ("FUTURO", "PASADO"):
            response = self._quote(code)
            self.assertEqual(response.status_code, 422)
            self.assertEqual(response.json()["code"], "codigo_no_vigente")

    def test_minimum_counts_only_products_and_modifiers(self) -> None:
        # Mínimo 250 > subtotal 230: el envío de un delivery NO suma al elegible.
        self._create_code(discount_amount="100", minimum_order_amount="250")
        quoted = self._quote("VERANO100")
        self.assertEqual(quoted.status_code, 422)
        self.assertEqual(quoted.json()["code"], "compra_minima_no_alcanzada")
        self.assertIn("250", quoted.json()["message"])

        # Vía checkout delivery tampoco: el subtotal elegible ignora el envío.
        response = self._checkout(
            fulfillment_type="delivery",
            delivery={"street": "Calle Ejemplo 123"},
            discount_code="VERANO100",
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["code"], "compra_minima_no_alcanzada")

    def test_credits_cart_is_never_applicable(self) -> None:
        self._create_code()
        credit_lines = [
            {
                "product_id": str(self.redeemable_id),
                "quantity": 1,
                "purchase_mode": "credits",
            }
        ]
        quoted = self._quote("VERANO100", lines=credit_lines)
        self.assertEqual(quoted.status_code, 422)
        self.assertEqual(quoted.json()["code"], "codigo_no_aplicable")

        response = self._checkout(
            purchase_mode="credits", lines=credit_lines, discount_code="VERANO100"
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["code"], "codigo_no_aplicable")

    def test_personal_code_only_for_its_target(self) -> None:
        self._create_code(target_customer_user_id=str(CUSTOMER_ID))
        ajeno = self._quote("VERANO100", user_id=OTHER_CUSTOMER_ID)
        self.assertEqual(ajeno.status_code, 422)
        self.assertEqual(ajeno.json()["code"], "codigo_personal_ajeno")

        propio = self._quote("VERANO100", user_id=CUSTOMER_ID)
        self.assertEqual(propio.status_code, 200, propio.text)
        self.assertTrue(propio.json()["valid"])

    def test_discount_never_exceeds_eligible_subtotal(self) -> None:
        # min(X, elegible): con descuento == mínimo == subtotal el resultado es
        # exactamente el subtotal — jamás un subtotal negativo.
        self._create_code(
            code="TODO", discount_amount="200", minimum_order_amount="200"
        )
        with Session(self.engine) as session:
            outcome = quote_discount(
                session,
                code="todo",
                customer_user_id=CUSTOMER_ID,
                purchase_mode="money",
                source="online",
                eligible_subtotal=Decimal("200"),
            )
        self.assertEqual(outcome.discount_amount, Decimal("200"))
        self.assertGreaterEqual(outcome.eligible_subtotal - outcome.discount_amount, 0)

    # ------------------------------------------------------------------
    # Checkout y ciclo de la redención
    # ------------------------------------------------------------------

    def test_checkout_with_code_reserves_and_links_adjustment(self) -> None:
        self._create_code()
        response = self._checkout(discount_code="verano100")
        self.assertEqual(response.status_code, 201, response.text)
        order_id = response.json()["id"]

        with Session(self.engine) as session:
            redemption = self._redemption(session, order_id)
            self.assertEqual(redemption.status, "reserved")
            self.assertEqual(redemption.code_snapshot, "VERANO100")
            self.assertEqual(redemption.name_snapshot, "Promo de verano")
            self.assertEqual(redemption.discount_amount_snapshot, Decimal("100"))
            self.assertEqual(redemption.minimum_order_amount_snapshot, Decimal("200"))
            self.assertEqual(redemption.customer_user_id, CUSTOMER_ID)

            adjustment = session.exec(
                select(OrderAdjustment).where(
                    OrderAdjustment.discount_code_redemption_id == redemption.id
                )
            ).first()
            self.assertIsNotNone(adjustment)
            self.assertEqual(adjustment.adjustment_type, "discount_code")
            self.assertEqual(adjustment.direction, "discount")
            self.assertEqual(adjustment.amount, Decimal("100"))
            self.assertEqual(adjustment.reason, "Código VERANO100")

            order = session.get(Order, uuid.UUID(order_id))
            self.assertEqual(order.discount_total_amount, Decimal("100"))

    def test_general_code_once_per_user(self) -> None:
        self._create_code()
        first = self._checkout(discount_code="VERANO100")
        self.assertEqual(first.status_code, 201, first.text)

        second = self._checkout(discount_code="VERANO100")
        self.assertEqual(second.status_code, 422)
        self.assertEqual(second.json()["code"], "codigo_ya_usado")

        # Otro usuario sí puede usar el código general.
        other = self._checkout(user_id=OTHER_CUSTOMER_ID, discount_code="VERANO100")
        self.assertEqual(other.status_code, 201, other.text)

    def test_one_active_redemption_per_order_enforced_by_index(self) -> None:
        code = self._create_code()
        other_code = self._create_code(code="OTRO", name="Otro código")
        response = self._checkout(discount_code="VERANO100")
        order_id = uuid.UUID(response.json()["id"])

        with Session(self.engine) as session:
            session.add(
                DiscountCodeRedemption(
                    discount_code_id=uuid.UUID(other_code["id"]),
                    order_id=order_id,
                    customer_user_id=CUSTOMER_ID,
                    code_snapshot="OTRO",
                    name_snapshot="Otro código",
                    discount_amount_snapshot=Decimal("100"),
                    minimum_order_amount_snapshot=Decimal("200"),
                    status="reserved",
                    reserved_at=utc_now(),
                )
            )
            with self.assertRaises(IntegrityError):
                session.flush()
        self.assertTrue(code)  # el primer código sigue reservado para el pedido

    def test_completed_consumes_redemption(self) -> None:
        self._create_code()
        order_id = self._checkout(discount_code="VERANO100").json()["id"]
        self.assertEqual(self._transition(order_id, "approved").status_code, 200)
        self.assertEqual(self._transition(order_id, "completed").status_code, 200)

        with Session(self.engine) as session:
            redemption = self._redemption(session, order_id)
            self.assertEqual(redemption.status, "consumed")
            self.assertIsNotNone(redemption.consumed_at)
            # El ajuste permanece: el descuento fue real.
            adjustment = session.exec(
                select(OrderAdjustment).where(
                    OrderAdjustment.discount_code_redemption_id == redemption.id
                )
            ).first()
            self.assertIsNotNone(adjustment)
            order = session.get(Order, uuid.UUID(order_id))
            # Total congelado al aprobar: 230 − 100.
            self.assertEqual(order.total_money_amount, Decimal("130"))

    def test_cancelled_releases_redemption_and_removes_adjustment(self) -> None:
        self._create_code()
        order_id = self._checkout(discount_code="VERANO100").json()["id"]
        cancelled = self._transition(order_id, "cancelled")
        self.assertEqual(cancelled.status_code, 200, cancelled.text)

        with Session(self.engine) as session:
            redemption = self._redemption(session, order_id)
            self.assertEqual(redemption.status, "released")
            self.assertEqual(redemption.release_reason, "cancelled")
            self.assertIsNotNone(redemption.released_at)
            adjustment = session.exec(
                select(OrderAdjustment).where(
                    OrderAdjustment.discount_code_redemption_id == redemption.id
                )
            ).first()
            self.assertIsNone(adjustment)
            order = session.get(Order, uuid.UUID(order_id))
            self.assertEqual(order.discount_total_amount, Decimal("0"))

        # El cupo se libera: el mismo usuario puede volver a usar el código.
        retry = self._checkout(discount_code="VERANO100")
        self.assertEqual(retry.status_code, 201, retry.text)

    def test_consumed_redemption_is_never_released(self) -> None:
        self._create_code()
        order_id = self._checkout(discount_code="VERANO100").json()["id"]
        self._transition(order_id, "approved")
        self._transition(order_id, "completed")

        with Session(self.engine) as session:
            order = session.get(Order, uuid.UUID(order_id))
            # Un reembolso posterior a completed JAMÁS reactiva ni libera.
            release_order_redemption(session, order, reason="refund")
            session.commit()

        with Session(self.engine) as session:
            redemption = self._redemption(session, order_id)
            self.assertEqual(redemption.status, "consumed")
            self.assertIsNone(redemption.released_at)
            adjustment = session.exec(
                select(OrderAdjustment).where(
                    OrderAdjustment.discount_code_redemption_id == redemption.id
                )
            ).first()
            self.assertIsNotNone(adjustment)

    def test_editing_code_keeps_existing_snapshots(self) -> None:
        created = self._create_code()
        order_id = self._checkout(discount_code="VERANO100").json()["id"]

        with _As(ADMIN_ID, "discount_codes:manage"):
            patched = self.client.patch(
                f"/api/v1/discount-codes/{created['id']}",
                json={
                    "name": "Promo renovada",
                    "code": "INVIERNO50",
                    "discount_amount": "50",
                    "minimum_order_amount": "120",
                },
            )
        self.assertEqual(patched.status_code, 200, patched.text)
        self.assertEqual(patched.json()["code"], "INVIERNO50")

        with Session(self.engine) as session:
            redemption = self._redemption(session, order_id)
            self.assertEqual(redemption.code_snapshot, "VERANO100")
            self.assertEqual(redemption.name_snapshot, "Promo de verano")
            self.assertEqual(redemption.discount_amount_snapshot, Decimal("100"))
            self.assertEqual(redemption.minimum_order_amount_snapshot, Decimal("200"))

    def test_revalidate_releases_when_below_snapshot_minimum(self) -> None:
        self._create_code()
        order_id = self._checkout(discount_code="VERANO100").json()["id"]

        with Session(self.engine) as session:
            order = session.get(Order, uuid.UUID(order_id))
            # El pedido cae bajo el mínimo del SNAPSHOT (200) antes de aprobar.
            order.items_subtotal_amount = Decimal("150")
            session.add(order)
            session.flush()
            revalidate_reserved_redemption(session, order)
            session.commit()

        with Session(self.engine) as session:
            redemption = self._redemption(session, order_id)
            self.assertEqual(redemption.status, "released")
            self.assertEqual(redemption.release_reason, "minimum_not_met")
            adjustment = session.exec(
                select(OrderAdjustment).where(
                    OrderAdjustment.discount_code_redemption_id == redemption.id
                )
            ).first()
            self.assertIsNone(adjustment)
            order = session.get(Order, uuid.UUID(order_id))
            self.assertEqual(order.discount_total_amount, Decimal("0"))

    def test_revalidate_uses_snapshot_not_current_definition(self) -> None:
        created = self._create_code()
        order_id = self._checkout(discount_code="VERANO100").json()["id"]
        # La definición vigente ahora exige 500, pero el snapshot quedó en 200:
        # con subtotal 230 la reserva sobrevive.
        with _As(ADMIN_ID, "discount_codes:manage"):
            self.client.patch(
                f"/api/v1/discount-codes/{created['id']}",
                json={"discount_amount": "100", "minimum_order_amount": "500"},
            )
        with Session(self.engine) as session:
            order = session.get(Order, uuid.UUID(order_id))
            revalidate_reserved_redemption(session, order)
            session.commit()
        with Session(self.engine) as session:
            self.assertEqual(self._redemption(session, order_id).status, "reserved")

    def test_capture_never_accepts_discount_code(self) -> None:
        self._create_code()
        payload = {
            "source": "counter",
            "fulfillment_type": "counter",
            "lines": [{"product_id": str(self.product_id), "quantity": 1}],
            "discount_code": "VERANO100",
        }
        with _As(STAFF_ID, "orders:capture"):
            response = self.client.post("/api/v1/orders/capture", json=payload)
        # extra="forbid": el panel/POS jamás aplica códigos.
        self.assertEqual(response.status_code, 422)

    def test_redemptions_listing_shows_snapshots_and_public_code(self) -> None:
        created = self._create_code()
        order = self._checkout(discount_code="VERANO100").json()
        with _As(ADMIN_ID, "discount_codes:read"):
            response = self.client.get(
                f"/api/v1/discount-codes/{created['id']}/redemptions"
            )
        self.assertEqual(response.status_code, 200, response.text)
        items = response.json()
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["order_public_code"], order["public_code"])
        self.assertEqual(items[0]["code_snapshot"], "VERANO100")
        self.assertEqual(items[0]["status"], "reserved")
        self.assertEqual(Decimal(items[0]["discount_amount_snapshot"]), Decimal("100"))

    def test_quote_error_is_stable_for_used_code(self) -> None:
        self._create_code()
        self._checkout(discount_code="VERANO100")
        quoted = self._quote("VERANO100")
        self.assertEqual(quoted.status_code, 422)
        self.assertEqual(quoted.json()["code"], "codigo_ya_usado")

    def test_service_error_carries_stable_code(self) -> None:
        with Session(self.engine) as session:
            with self.assertRaises(DiscountRuleError) as ctx:
                quote_discount(
                    session,
                    code="nada",
                    customer_user_id=CUSTOMER_ID,
                    purchase_mode="money",
                    source="online",
                    eligible_subtotal=Decimal("500"),
                )
        self.assertEqual(ctx.exception.code, "codigo_no_encontrado")


if __name__ == "__main__":
    unittest.main()
