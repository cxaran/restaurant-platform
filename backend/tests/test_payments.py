"""Tests de la etapa 5: pagos por método, POS en una transacción y tickets."""

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
from sqlmodel import Session, select  # noqa: E402

from backend.app.auth.auth_dependencies import get_current_user  # noqa: E402
from backend.app.core.database import get_db  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.business import BusinessSettings  # noqa: E402
from backend.app.models.catalog import Product, ProductCategory  # noqa: E402
from backend.app.models.payments import PaymentMethodConfig  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402

STAFF_ID = uuid.uuid4()


class _As:
    def __init__(self, *permissions: str) -> None:
        self.user = SessionUser(
            id=STAFF_ID,
            name="Karla",
            last_name="R",
            email="karla@example.com",
            permissions=set(permissions),
        )

    def __enter__(self) -> None:
        app.dependency_overrides[get_current_user] = lambda: self.user

    def __exit__(self, *exc: object) -> None:
        app.dependency_overrides.pop(get_current_user, None)


class PaymentsRoutesTest(unittest.TestCase):
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
            session.add(BusinessSettings(id=1))
            category = ProductCategory(name="Boneless")
            session.add(category)
            session.flush()
            self.product_id = uuid.uuid4()
            session.add(
                Product(
                    id=self.product_id,
                    category_id=category.id,
                    name="Medio litro de boneless",
                    money_price_amount=Decimal("100"),
                )
            )
            # Métodos (el seed real vive en la migración; aquí se siembra igual).
            session.add_all(
                [
                    PaymentMethodConfig(
                        code="cash_counter", display_name="Efectivo en mostrador",
                        available_online=False, allows_cash_change=True, sort_order=20,
                    ),
                    PaymentMethodConfig(
                        code="bank_transfer", display_name="Transferencia bancaria",
                        requires_manual_verification=True,
                        requires_transaction_reference=True,
                        requires_bank_name=True, sort_order=30,
                    ),
                ]
            )
            session.commit()

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def _pos_payload(self, **payment_overrides) -> dict:
        payment = {"method_code": "cash_counter"}
        payment.update(payment_overrides)
        return {
            "lines": [{"product_id": str(self.product_id), "quantity": 2}],
            "payment": payment,
        }

    def test_openapi_exposes_payment_routes(self) -> None:
        paths = self.client.get("/api/openapi.json").json()["paths"]
        for path in (
            "/api/v1/pos/sales",
            "/api/v1/payment-methods",
            "/api/v1/orders/{order_id}/payments",
            "/api/v1/payments/{payment_id}/verify",
            "/api/v1/orders/{order_id}/ticket",
            "/api/v1/orders/{order_id}/ticket-prints",
        ):
            self.assertIn(path, paths)

    def test_public_payment_methods_only_online(self) -> None:
        body = self.client.get("/api/v1/payment-methods").json()
        self.assertEqual([m["code"] for m in body], ["bank_transfer"])

    def test_pos_cash_sale_completes_in_one_call(self) -> None:
        payload = self._pos_payload(change_requested_for_amount="500")
        with _As("orders:capture", "payments:record"):
            response = self.client.post("/api/v1/pos/sales", json=payload)
        self.assertEqual(response.status_code, 201, response.text)
        body = response.json()
        self.assertEqual(body["order"]["status"], "completed")
        self.assertEqual(body["order"]["payment_status"], "paid")
        self.assertEqual(body["order"]["total_money_amount"], "200.00")
        self.assertEqual(body["payment"]["status"], "paid")
        self.assertEqual(body["payment"]["change_amount"], "300.00")  # 500 - 200

    def test_pos_payment_methods_lists_counter_methods(self) -> None:
        """El POS ve los métodos available_pos (el listado público los oculta)."""
        with _As("payments:record"):
            body = self.client.get("/api/v1/pos/payment-methods").json()
        self.assertEqual(
            sorted(m["code"] for m in body), ["bank_transfer", "cash_counter"]
        )
        # Sin permiso no hay listado (es información operativa interna).
        self.assertEqual(self.client.get("/api/v1/pos/payment-methods").status_code, 401)

    def test_pos_sale_records_declared_source(self) -> None:
        """La venta al momento puede originarse por teléfono/redes (1h)."""
        payload = self._pos_payload(change_requested_for_amount="500")
        payload["source"] = "phone"
        with _As("orders:capture", "payments:record"):
            response = self.client.post("/api/v1/pos/sales", json=payload)
        self.assertEqual(response.status_code, 201, response.text)
        body = response.json()
        self.assertEqual(body["order"]["source"], "phone")
        self.assertEqual(body["order"]["status"], "completed")

    def test_pos_rejects_credits_lines(self) -> None:
        """POS cobra dinero: el canje de créditos va por captura normal (§1.3)."""
        redeemable_id = uuid.uuid4()
        with Session(self.engine) as session:
            category_id = session.exec(select(Product.category_id)).first()
            session.add(
                Product(
                    id=redeemable_id,
                    category_id=category_id,
                    name="Dip canjeable",
                    money_price_amount=Decimal("15"),
                    credit_redemption_price=50,
                )
            )
            session.commit()
        payload = self._pos_payload()
        payload["lines"] = [
            {"product_id": str(redeemable_id), "quantity": 1, "purchase_mode": "credits"}
        ]
        with _As("orders:capture", "payments:record"):
            response = self.client.post("/api/v1/pos/sales", json=payload)
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["code"], "pos_solo_dinero")

    def test_pos_transfer_stays_pending_verification(self) -> None:
        payload = self._pos_payload(
            method_code="bank_transfer",
            transaction_reference="123456",
            bank_name="BBVA",
        )
        with _As("orders:capture", "payments:record"):
            response = self.client.post("/api/v1/pos/sales", json=payload)
        self.assertEqual(response.status_code, 201, response.text)
        body = response.json()
        # Aprobado pero NO completado: falta verificar el pago.
        self.assertEqual(body["order"]["status"], "approved")
        self.assertEqual(body["order"]["payment_status"], "pending_verification")
        self.assertEqual(body["payment"]["status"], "pending_verification")

        # Verificación: el pago pasa a paid y el estado del pedido se deriva.
        with _As("payments:verify"):
            verified = self.client.post(
                f"/api/v1/payments/{body['payment']['id']}/verify",
                json={"approve": True},
            )
        self.assertEqual(verified.status_code, 200, verified.text)
        self.assertEqual(verified.json()["status"], "paid")

        # H10: la venta de MOSTRADOR ya entregada se completa al verificar.
        with _As("orders:read"):
            order_after = self.client.get(
                f"/api/v1/orders/{body['order']['id']}"
            ).json()
        self.assertEqual(order_after["status"], "completed")

        with _As("payments:read"):
            payments = self.client.get(
                f"/api/v1/orders/{body['order']['id']}/payments"
            ).json()
        self.assertEqual(payments[0]["status"], "paid")

    def test_transfer_requires_reference_and_bank(self) -> None:
        payload = self._pos_payload(method_code="bank_transfer")
        with _As("orders:capture", "payments:record"):
            response = self.client.post("/api/v1/pos/sales", json=payload)
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["code"], "referencia_requerida")

    def test_insufficient_cash_bill_rejected(self) -> None:
        payload = self._pos_payload(change_requested_for_amount="150")
        with _As("orders:capture", "payments:record"):
            response = self.client.post("/api/v1/pos/sales", json=payload)
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["code"], "billete_insuficiente")

    def test_record_payment_rejected_when_order_already_paid(self) -> None:
        # Venta de mostrador en efectivo: queda completada y pagada al 100 %.
        with _As("orders:capture", "payments:record"):
            sale = self.client.post("/api/v1/pos/sales", json=self._pos_payload())
        self.assertEqual(sale.status_code, 201, sale.text)
        order_id = sale.json()["order"]["id"]
        # Registrar otro pago sobre un pedido ya cubierto se rechaza (409).
        with _As("payments:record"):
            resp = self.client.post(
                f"/api/v1/orders/{order_id}/payments",
                json={"method_code": "cash_counter"},
            )
        self.assertEqual(resp.status_code, 409, resp.text)
        self.assertEqual(resp.json()["code"], "pedido_ya_cubierto")

    def test_partial_payment_then_remainder_by_other_method(self) -> None:
        # Total 200. La transferencia se verifica por SOLO 150 → el pedido sigue
        # debiendo 50; el faltante se cobra por otro método (parte y parte).
        payload = self._pos_payload(
            method_code="bank_transfer", transaction_reference="A1", bank_name="BBVA",
        )
        with _As("orders:capture", "payments:record"):
            sale = self.client.post("/api/v1/pos/sales", json=payload)
        self.assertEqual(sale.status_code, 201, sale.text)
        body = sale.json()
        order_id = body["order"]["id"]
        with _As("payments:verify"):
            self.client.post(
                f"/api/v1/payments/{body['payment']['id']}/verify",
                json={"approve": True, "received_amount": "150"},
            )
        # Exceder el saldo pendiente (50) se rechaza.
        with _As("payments:record"):
            over = self.client.post(
                f"/api/v1/orders/{order_id}/payments",
                json={"method_code": "cash_counter", "expected_amount": "999"},
            )
        self.assertEqual(over.status_code, 422, over.text)
        self.assertEqual(over.json()["code"], "monto_excede_saldo")
        # Registrar el faltante correcto (50) en efectivo y confirmarlo.
        with _As("payments:record"):
            extra = self.client.post(
                f"/api/v1/orders/{order_id}/payments",
                json={"method_code": "cash_counter", "expected_amount": "50"},
            )
        self.assertEqual(extra.status_code, 201, extra.text)
        with _As("payments:verify"):
            confirmed = self.client.post(
                f"/api/v1/payments/{extra.json()['id']}/verify",
                json={"approve": True},
            )
        self.assertEqual(confirmed.status_code, 200, confirmed.text)
        with _As("orders:read"):
            order_after = self.client.get(f"/api/v1/orders/{order_id}").json()
        self.assertEqual(order_after["payment_status"], "paid")

    def test_ticket_payload_and_print_log(self) -> None:
        with _As("orders:capture", "payments:record"):
            sale = self.client.post("/api/v1/pos/sales", json=self._pos_payload()).json()
        order_id = sale["order"]["id"]

        with _As("tickets:print"):
            ticket = self.client.get(f"/api/v1/orders/{order_id}/ticket")
            self.assertEqual(ticket.status_code, 200, ticket.text)
            body = ticket.json()
            self.assertEqual(body["public_code"], sale["order"]["public_code"])
            self.assertEqual(body["business"]["trade_name"], "Mi Restaurante")
            self.assertEqual(body["totals"]["total"], "200.00")
            self.assertIsNone(body["totals"]["discount_code"])
            self.assertEqual(body["lines"][0]["name"], "Medio litro de boneless")
            self.assertEqual(body["payments"][0]["method"], "Efectivo en mostrador")
            # Efectivo de mostrador cobrado: el ticket refleja lo recibido.
            self.assertEqual(body["payments"][0]["received_amount"], "200.00")
            self.assertEqual(body["status_label"], "Entregado")

            # Bitácora legible: vacía antes, con la impresión después.
            empty = self.client.get(f"/api/v1/orders/{order_id}/ticket-prints")
            self.assertEqual(empty.status_code, 200, empty.text)
            self.assertEqual(empty.json(), [])

            printed = self.client.post(
                f"/api/v1/orders/{order_id}/ticket-prints",
                json={"print_type": "customer_receipt", "copy_number": 2},
            )
            self.assertEqual(printed.status_code, 201, printed.text)
            self.assertEqual(printed.json()["print_type"], "customer_receipt")

            logs = self.client.get(f"/api/v1/orders/{order_id}/ticket-prints").json()
            self.assertEqual(len(logs), 1)
            self.assertEqual(logs[0]["copy_number"], 2)
            self.assertEqual(logs[0]["printed_by"], str(STAFF_ID))

    def test_ticket_business_header_is_frozen_snapshot(self) -> None:
        """§20: reimprimir tras un rebranding muestra el negocio del momento."""
        from backend.app.models.business import BusinessProfile

        with _As("orders:capture", "payments:record"):
            sale = self.client.post("/api/v1/pos/sales", json=self._pos_payload()).json()
        order_id = sale["order"]["id"]

        with Session(self.engine) as session:
            profile = session.exec(select(BusinessProfile)).one()
            profile.trade_name = "Nombre Nuevo S.A."
            session.add(profile)
            session.commit()

        with _As("tickets:print"):
            body = self.client.get(f"/api/v1/orders/{order_id}/ticket").json()
        self.assertEqual(body["business"]["trade_name"], "Mi Restaurante")

    def test_pos_requires_both_permissions(self) -> None:
        with _As("orders:capture"):
            self.assertEqual(
                self.client.post("/api/v1/pos/sales", json=self._pos_payload()).status_code,
                403,
            )
        self.assertEqual(
            self.client.post("/api/v1/pos/sales", json=self._pos_payload()).status_code, 401
        )


if __name__ == "__main__":
    unittest.main()
