"""Concurrencia REAL contra PostgreSQL: dos sesiones/transacciones en paralelo.

Estos tests demuestran que los locks (`FOR UPDATE`) y los índices únicos
parciales convierten cada carrera en UN ganador + UN conflicto controlado —
nunca doble reserva, doble cupo, doble entrega ni doble devolución.

Sólo corren con ``TEST_POSTGRES_URL`` apuntando a una base cuyo nombre termine
en ``_test`` (mismo guardarraíl que ``test_query_postgres``). El esquema se
crea con ``Base.metadata`` (+ extensión PostGIS y la secuencia de folios).

Ejemplo::

    TEST_POSTGRES_URL="postgresql+psycopg2://platform:platform@127.0.0.1:55433/concurrency_test" \
        python -m unittest backend.tests.test_concurrency_pg
"""

import os
import threading
import unittest
import uuid
from decimal import Decimal
from urllib.parse import urlparse

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

from pydantic import SecretStr  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.exc import IntegrityError  # noqa: E402
from sqlmodel import Session  # noqa: E402

from backend.app.auth.security import get_password_hash  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.catalog import Product, ProductCategory  # noqa: E402
from backend.app.models.orders import Order, OrderDelivery, OrderLine  # noqa: E402
from backend.app.models.payments import PaymentMethodConfig  # noqa: E402
from backend.app.models.profiles import StaffProfile  # noqa: E402
from backend.app.models.user import User  # noqa: E402
from backend.app.services.credit_service import (  # noqa: E402
    CreditRuleError,
    manual_adjustment,
    reserve_order_redemptions,
)
from backend.app.services.delivery_service import (  # noqa: E402
    DeliveryRuleError,
    take_delivery,
)
from backend.app.services.finance_service import (  # noqa: E402
    FinanceRuleError,
    RefundAllocationInput,
    create_refund,
)
from backend.app.services.order_service import OrderIdentity, create_order  # noqa: E402
from backend.app.services.payment_service import create_payment, mark_paid  # noqa: E402
from backend.app.services.pricing_service import (  # noqa: E402
    CartLineInput,
    PricingError,
    price_cart,
)

_URL = os.environ.get("TEST_POSTGRES_URL", "")


def _url_is_safe(url: str) -> bool:
    if not url:
        return False
    name = urlparse(url).path.lstrip("/")
    return name.endswith("_test")


@unittest.skipUnless(
    _url_is_safe(_URL),
    "requiere TEST_POSTGRES_URL hacia una base *_test (concurrencia real)",
)
class ConcurrencyPgTest(unittest.TestCase):
    """Cada test lanza DOS hilos con sesiones propias y una barrera de salida."""

    engine = None  # type: ignore[assignment]

    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(_URL)
        with cls.engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        Base.metadata.drop_all(cls.engine)
        Base.metadata.create_all(cls.engine)
        with cls.engine.begin() as conn:
            conn.execute(text("CREATE SEQUENCE IF NOT EXISTS orders_order_number_seq"))

    @classmethod
    def tearDownClass(cls) -> None:
        if cls.engine is not None:
            cls.engine.dispose()

    def setUp(self) -> None:
        # Base limpia por test (drop/create es caro; truncar alcanza).
        with self.engine.begin() as conn:
            tables = ", ".join(
                f'"{t.name}"' for t in reversed(Base.metadata.sorted_tables)
            )
            conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
            conn.execute(text("ALTER SEQUENCE orders_order_number_seq RESTART WITH 1"))

        with Session(self.engine) as session:
            self.staff_id = self._add_user(session, "staff@example.com")
            self.customer_id = self._add_user(session, "cliente@example.com")
            category = ProductCategory(name="Boneless")
            session.add(category)
            session.flush()
            self.category_id = category.id
            session.commit()

    @staticmethod
    def _add_user(session: Session, email: str) -> uuid.UUID:
        user = User(
            name="Test",
            last_name="Concurrencia",
            email=email,
            hashed_password=get_password_hash(SecretStr("x")),
            token="t",
        )
        session.add(user)
        session.flush()
        return user.id

    def _run_pair(self, worker) -> list:
        """Ejecuta `worker(idx)` en dos hilos alineados por barrera; devuelve
        [(resultado | excepción), ...] en orden de índice."""
        barrier = threading.Barrier(2)
        results: list = [None, None]

        def call(idx: int) -> None:
            barrier.wait()
            try:
                results[idx] = ("ok", worker(idx))
            except Exception as exc:  # noqa: BLE001 — la excepción ES el resultado
                results[idx] = ("error", exc)

        threads = [threading.Thread(target=call, args=(i,)) for i in (0, 1)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)
        return results

    @staticmethod
    def _split(results) -> tuple[list, list]:
        oks = [payload for kind, payload in results if kind == "ok"]
        errors = [payload for kind, payload in results if kind == "error"]
        return oks, errors

    # ------------------------------------------------------------------
    # 1. Reserva de créditos: el saldo jamás se gasta dos veces.
    # ------------------------------------------------------------------
    def test_concurrent_credit_reservations_single_winner(self) -> None:
        with Session(self.engine) as session:
            product = Product(
                category_id=self.category_id,
                name="Dip canjeable",
                money_price_amount=Decimal("15"),
                credit_redemption_price=50,
            )
            session.add(product)
            session.flush()
            product_id = product.id
            manual_adjustment(
                session,
                user_id=self.customer_id,
                delta=50,
                description="Saldo inicial",
                created_by=self.staff_id,
            )
            session.commit()

        def worker(_: int):
            with Session(self.engine) as session:
                priced = price_cart(
                    session,
                    [CartLineInput(product_id=product_id, quantity=1, purchase_mode="credits")],
                )
                order = create_order(
                    session,
                    priced,
                    OrderIdentity(
                        source="online",
                        fulfillment_type="pickup",
                        customer_user_id=self.customer_id,
                        customer_name="Cliente",
                        customer_phone="8330000000",
                    ),
                )
                reserve_order_redemptions(session, order)
                session.commit()
                return order.id

        oks, errors = self._split(self._run_pair(worker))
        self.assertEqual(len(oks), 1, f"exactamente un canje debe ganar: {errors}")
        self.assertEqual(len(errors), 1)
        self.assertIsInstance(errors[0], CreditRuleError)
        self.assertEqual(errors[0].code, "saldo_insuficiente")

    # ------------------------------------------------------------------
    # 2. Límite diario: dos checkouts no pueden rebasar el cupo juntos.
    # ------------------------------------------------------------------
    def test_concurrent_daily_limit_single_winner(self) -> None:
        with Session(self.engine) as session:
            product = Product(
                category_id=self.category_id,
                name="Edición limitada",
                money_price_amount=Decimal("100"),
                daily_unit_limit=1,
            )
            session.add(product)
            session.flush()
            product_id = product.id
            session.commit()

        def worker(_: int):
            with Session(self.engine) as session:
                priced = price_cart(
                    session,
                    [CartLineInput(product_id=product_id, quantity=1, purchase_mode="money")],
                )
                order = create_order(
                    session,
                    priced,
                    OrderIdentity(
                        source="online",
                        fulfillment_type="pickup",
                        customer_user_id=self.customer_id,
                        customer_name="Cliente",
                        customer_phone="8330000000",
                    ),
                )
                session.commit()
                return order.id

        oks, errors = self._split(self._run_pair(worker))
        self.assertEqual(len(oks), 1, f"el cupo diario se duplicó: {errors}")
        self.assertEqual(len(errors), 1)
        self.assertIsInstance(errors[0], PricingError)
        self.assertEqual(errors[0].code, "producto_agotado_hoy")

    # ------------------------------------------------------------------
    # 3. Tomar entrega: el primero gana; el segundo recibe conflicto.
    # ------------------------------------------------------------------
    def test_concurrent_take_delivery_single_winner(self) -> None:
        with Session(self.engine) as session:
            courier_a = self._add_user(session, "rep1@example.com")
            courier_b = self._add_user(session, "rep2@example.com")
            for index, courier_id in enumerate((courier_a, courier_b)):
                session.add(
                    StaffProfile(
                        user_id=courier_id,
                        display_name=f"Repartidor {index + 1}",
                        can_deliver=True,
                        is_delivery_available=True,
                    )
                )
            order = Order(
                order_number=901,
                public_code="ORD-000901",
                source="online",
                fulfillment_type="delivery",
                purchase_mode="money",
                status="ready",
                payment_status="unpaid",
                customer_user_id=self.customer_id,
                items_subtotal_amount=Decimal("100"),
            )
            session.add(order)
            session.flush()
            delivery = OrderDelivery(
                order_id=order.id,
                recipient_name="Cliente",
                recipient_phone="8330000000",
                street="Calle 1",
                location_source="not_provided",
            )
            session.add(delivery)
            session.flush()
            delivery_id = delivery.id
            session.commit()
        couriers = (courier_a, courier_b)

        def worker(idx: int):
            with Session(self.engine) as session:
                assignment = take_delivery(session, delivery_id, couriers[idx])
                session.commit()
                return assignment.id

        oks, errors = self._split(self._run_pair(worker))
        self.assertEqual(len(oks), 1, f"la entrega se asignó dos veces: {errors}")
        self.assertEqual(len(errors), 1)
        self.assertIsInstance(errors[0], (DeliveryRuleError, IntegrityError))

    # ------------------------------------------------------------------
    # 4. Reembolso de la misma línea: el acumulado por línea aguanta la carrera.
    # ------------------------------------------------------------------
    def test_concurrent_refunds_same_line_capped(self) -> None:
        with Session(self.engine) as session:
            method = PaymentMethodConfig(
                code="cash_counter",
                display_name="Efectivo",
                allows_cash_change=True,
            )
            session.add(method)
            order = Order(
                order_number=902,
                public_code="ORD-000902",
                source="counter",
                fulfillment_type="counter",
                purchase_mode="money",
                status="approved",
                payment_status="unpaid",
                created_by=self.staff_id,
                items_subtotal_amount=Decimal("200"),
                total_money_amount=Decimal("200"),
            )
            session.add(order)
            session.flush()
            line = OrderLine(
                order_id=order.id,
                product_name_snapshot="Orden de boneless",
                quantity=2,
                purchase_mode="money",
                money_unit_price_snapshot=Decimal("100"),
                money_line_total_amount=Decimal("200"),
            )
            session.add(line)
            session.flush()
            payment = create_payment(session, order, method, expected_amount=Decimal("200"))
            mark_paid(session, order, payment, actor_id=self.staff_id)
            session.commit()
            order_id, payment_id, line_id = order.id, payment.id, line.id

        def worker(_: int):
            from backend.app.models.payments import Payment

            with Session(self.engine) as session:
                order = session.get(Order, order_id)
                payment = session.get(Payment, payment_id)
                assert order is not None and payment is not None
                refund = create_refund(
                    session,
                    order,
                    payment,
                    amount=Decimal("100"),
                    reason="Devolución parcial",
                    processed_by=self.staff_id,
                    allocations=[
                        RefundAllocationInput(
                            order_line_id=line_id,
                            refunded_quantity=2,
                            money_refunded_amount=Decimal("100"),
                        )
                    ],
                )
                session.commit()
                return refund.id

        # Cada hilo intenta devolver las 2 unidades: sólo uno puede (2 ≤ 2);
        # el otro debe chocar con el acumulado por línea (H3) bajo lock.
        oks, errors = self._split(self._run_pair(worker))
        self.assertEqual(len(oks), 1, f"la línea se devolvió dos veces: {errors}")
        self.assertEqual(len(errors), 1)
        self.assertIsInstance(errors[0], FinanceRuleError)
        self.assertEqual(errors[0].code, "reembolso_excede_linea")


if __name__ == "__main__":
    unittest.main()
