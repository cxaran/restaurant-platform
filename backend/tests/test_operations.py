"""Etapa 7 RC — operación: expiración de pedidos, notificaciones y reportes."""

import os
import unittest
import uuid
from datetime import timedelta
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
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.credits import CreditLedgerEntry, CreditRedemption  # noqa: E402
from backend.app.models.orders import Order, OrderLine  # noqa: E402
from backend.app.models.user import User  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402
from backend.app.services import order_notifications  # noqa: E402
from backend.app.services.order_service import (  # noqa: E402
    EXPIRE_SUBMITTED_AFTER_MINUTES,
    expire_abandoned_submitted,
)
from backend.app.utils.utc_now import utc_now  # noqa: E402


def _engine():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return engine


def _add_user(session: Session, email: str) -> uuid.UUID:
    from pydantic import SecretStr

    from backend.app.auth.security import get_password_hash

    user = User(
        name="Test", last_name="Op", email=email,
        hashed_password=get_password_hash(SecretStr("x")), token="t",
    )
    session.add(user)
    session.flush()
    return user.id


def _order(
    session: Session,
    *,
    number: int,
    customer_id: uuid.UUID,
    status: str = "submitted",
    payment_status: str = "unpaid",
    minutes_ago: int = 0,
    credits_redeemed: int = 0,
) -> Order:
    order = Order(
        order_number=number,
        public_code=f"ORD-{number:06d}",
        source="online",
        fulfillment_type="pickup",
        purchase_mode="credits" if credits_redeemed else "money",
        status=status,
        payment_status=payment_status,
        customer_user_id=customer_id,
        customer_name_snapshot="Cliente",
        customer_phone_snapshot="8330000000",
        customer_email_snapshot="cliente@example.com",
        items_subtotal_amount=Decimal("0") if credits_redeemed else Decimal("100"),
        credits_redeemed_total=credits_redeemed,
        submitted_at=utc_now() - timedelta(minutes=minutes_ago),
    )
    session.add(order)
    session.flush()
    session.add(
        OrderLine(
            order_id=order.id,
            product_name_snapshot="Producto",
            quantity=1,
            purchase_mode="credits" if credits_redeemed else "money",
            money_unit_price_snapshot=Decimal("0") if credits_redeemed else Decimal("100"),
            money_line_total_amount=Decimal("0") if credits_redeemed else Decimal("100"),
            credit_redemption_price_per_unit_snapshot=credits_redeemed or None,
            credits_redeemed_total=credits_redeemed,
        )
    )
    session.flush()
    return order


class ExpireSubmittedTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = _engine()

    def test_expires_only_stale_unpaid_web_orders(self) -> None:
        with Session(self.engine) as session:
            customer = _add_user(session, "c@example.com")
            stale = _order(
                session, number=1, customer_id=customer,
                minutes_ago=EXPIRE_SUBMITTED_AFTER_MINUTES + 1,
            )
            fresh = _order(session, number=2, customer_id=customer, minutes_ago=5)
            session.commit()

            self.assertEqual(expire_abandoned_submitted(session), 1)
            session.commit()
            session.refresh(stale)
            session.refresh(fresh)
            self.assertEqual(stale.status, "cancelled")
            self.assertEqual(fresh.status, "submitted")

            # Bitácora con reason_code=expired y sin reembolso automático.
            from backend.app.models.orders import OrderStatusHistory

            history = session.exec(
                select(OrderStatusHistory).where(
                    OrderStatusHistory.order_id == stale.id,
                    OrderStatusHistory.new_status == "cancelled",
                )
            ).one()
            self.assertEqual(history.reason_code, "expired")

    def test_expiration_releases_reserved_credits(self) -> None:
        with Session(self.engine) as session:
            customer = _add_user(session, "c2@example.com")
            staff = _add_user(session, "s2@example.com")
            from backend.app.services.credit_service import (
                balance,
                manual_adjustment,
                reserve_order_redemptions,
            )

            manual_adjustment(
                session, user_id=customer, delta=50,
                description="saldo", created_by=staff,
            )
            order = _order(
                session, number=3, customer_id=customer,
                minutes_ago=EXPIRE_SUBMITTED_AFTER_MINUTES + 5, credits_redeemed=50,
            )
            reserve_order_redemptions(session, order)
            session.commit()
            self.assertEqual(balance(session, customer), 0)

            self.assertEqual(expire_abandoned_submitted(session), 1)
            session.commit()
            # La reserva se libera: el saldo regresa íntegro.
            self.assertEqual(balance(session, customer), 50)
            redemption = session.exec(select(CreditRedemption)).one()
            self.assertEqual(redemption.status, "released")

    def test_paid_submitted_orders_are_left_for_humans(self) -> None:
        with Session(self.engine) as session:
            customer = _add_user(session, "c3@example.com")
            paid = _order(
                session, number=4, customer_id=customer,
                minutes_ago=EXPIRE_SUBMITTED_AFTER_MINUTES + 5,
                payment_status="paid",
            )
            session.commit()
            self.assertEqual(expire_abandoned_submitted(session), 0)
            session.refresh(paid)
            self.assertEqual(paid.status, "submitted")


class OrderNotificationsTest(unittest.TestCase):
    def _order_stub(self, **overrides) -> Order:
        defaults = dict(
            order_number=1,
            public_code="ORD-000001",
            source="online",
            fulfillment_type="pickup",
            purchase_mode="money",
            status="submitted",
            payment_status="unpaid",
            customer_email_snapshot="cliente@example.com",
            items_subtotal_amount=Decimal("100"),
        )
        defaults.update(overrides)
        return Order(**defaults)

    def test_notify_received_and_progress(self) -> None:
        sent: list[dict] = []
        with mock.patch.object(
            order_notifications, "_send_in_background",
            side_effect=lambda **kw: sent.append(kw),
        ):
            order_notifications.notify_order_received(self._order_stub())
            order_notifications.notify_order_progress(self._order_stub(), "ready")
            order_notifications.notify_order_progress(
                self._order_stub(fulfillment_type="delivery"), "out_for_delivery"
            )
            # «ready» de un delivery NO notifica (avisa hasta salir en camino).
            order_notifications.notify_order_progress(
                self._order_stub(fulfillment_type="delivery"), "ready"
            )
        self.assertEqual(len(sent), 3)
        self.assertIn("Recibimos tu pedido", sent[0]["subject"])
        self.assertIn("está listo", sent[1]["subject"])
        self.assertIn("en camino", sent[2]["subject"])
        for item in sent:
            self.assertEqual(item["email_to"], "cliente@example.com")

    def test_notify_admin_only_for_open_resolutions(self) -> None:
        engine = _engine()
        sent: list[dict] = []
        with Session(engine) as session:
            with mock.patch.object(
                order_notifications, "_send_in_background",
                side_effect=lambda **kw: sent.append(kw),
            ):
                order_notifications.notify_admin_unresolved_refund(
                    session,
                    self._order_stub(cancellation_money_resolution="refund_pending"),
                )
                order_notifications.notify_admin_unresolved_refund(
                    session,
                    self._order_stub(
                        cancellation_money_resolution="retain",
                        cancellation_resolution_note="fraude",
                    ),
                )
        self.assertEqual(len(sent), 1)
        self.assertIn("cancelado con cobro", sent[0]["subject"])


class ReportsRoutesTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = _engine()

        def override_db():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def _as(self, *permissions: str) -> None:
        app.dependency_overrides[get_current_user] = lambda: SessionUser(
            id=uuid.uuid4(), name="T", last_name="T", email="t@example.com",
            permissions=set(permissions),
        )

    def test_reports_require_permission(self) -> None:
        self._as()
        self.assertEqual(self.client.get("/api/v1/reports/sales-by-hour").status_code, 403)
        self.assertEqual(self.client.get("/api/v1/reports/top-products").status_code, 403)

    def test_reports_from_completed_snapshots(self) -> None:
        with Session(self.engine) as session:
            customer = _add_user(session, "r@example.com")
            order = _order(session, number=9, customer_id=customer, status="completed")
            order.total_money_amount = Decimal("100")
            order.completed_at = utc_now()
            session.add(order)
            # Pedido cancelado: JAMÁS cuenta en ventas.
            _order(session, number=10, customer_id=customer, status="cancelled")
            session.commit()

        self._as("finances:read")
        by_hour = self.client.get("/api/v1/reports/sales-by-hour").json()
        self.assertEqual(sum(i["orders_count"] for i in by_hour["items"]), 1)
        self.assertEqual(
            sum(Decimal(i["money_total"]) for i in by_hour["items"]), Decimal("100")
        )

        top = self.client.get("/api/v1/reports/top-products").json()
        self.assertEqual(len(top["items"]), 1)
        self.assertEqual(top["items"][0]["product_name"], "Producto")
        self.assertEqual(top["items"][0]["units"], 1)


class CheckoutRateLimitBucketsTest(unittest.TestCase):
    def test_checkout_and_quote_buckets_declared(self) -> None:
        from backend.app.security.rate_limit import _policies

        policies = _policies()
        for bucket in (
            "checkout_ip",
            "checkout_identity",
            "discount_quote_ip",
            "discount_quote_identity",
        ):
            self.assertIn(bucket, policies)
            self.assertGreater(policies[bucket].limit, 0)


if __name__ == "__main__":
    unittest.main()
