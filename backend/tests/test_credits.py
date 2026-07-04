"""Tests de la etapa 8: ledger, reserva/consumo/liberación y reversos."""

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
from pydantic import SecretStr  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

from backend.app.auth.security import get_password_hash  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.credits import CreditLedgerEntry, CreditRedemption  # noqa: E402
from backend.app.models.orders import Order, OrderLine  # noqa: E402
from backend.app.models.user import User  # noqa: E402
from backend.app.services.credit_service import (  # noqa: E402
    CreditRuleError,
    balance,
    manual_adjustment,
    on_order_cancelled,
    on_order_completed,
    on_refund_allocation,
    reserve_order_redemptions,
    totals,
)


def _engine():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return engine


class CreditServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = _engine()
        with Session(self.engine) as session:
            user = User(
                name="María", last_name="López", email="maria@example.com",
                hashed_password=get_password_hash(SecretStr("x")), token="t",
            )
            session.add(user)
            session.flush()
            self.user_id = user.id
            session.commit()

    def _order_with_lines(
        self, session: Session, *, credits_line: bool = True, money_line: bool = True
    ) -> Order:
        order = Order(
            order_number=int(uuid.uuid4().int % 1_000_000),
            public_code=f"ORD-{uuid.uuid4().hex[:6]}",
            source="online", fulfillment_type="pickup",
            status="submitted", payment_status="unpaid",
            customer_user_id=self.user_id,
            customer_name_snapshot="María", customer_phone_snapshot="833",
        )
        session.add(order)
        session.flush()
        if money_line:
            session.add(
                OrderLine(
                    order_id=order.id, product_name_snapshot="Orden de boneless",
                    quantity=Decimal("1"), purchase_mode="money",
                    money_unit_price_snapshot=Decimal("230"),
                    money_line_total_amount=Decimal("230"),
                    credits_awarded_per_unit_snapshot=20,
                    credits_earned_total_snapshot=20,
                )
            )
        if credits_line:
            session.add(
                OrderLine(
                    order_id=order.id, product_name_snapshot="Dip ranch",
                    quantity=Decimal("1"), purchase_mode="credits",
                    credit_redemption_price_per_unit_snapshot=50,
                    credits_redeemed_total=50,
                )
            )
        session.flush()
        session.refresh(order)
        return order

    def test_balance_is_ledger_sum(self) -> None:
        with Session(self.engine) as session:
            self.assertEqual(balance(session, self.user_id), 0)
            manual_adjustment(
                session, user_id=self.user_id, delta=80,
                description="Cortesía inicial", created_by=self.user_id,
            )
            session.commit()
            self.assertEqual(balance(session, self.user_id), 80)

    def test_reserve_requires_sufficient_balance(self) -> None:
        with Session(self.engine) as session:
            order = self._order_with_lines(session)
            with self.assertRaises(CreditRuleError) as ctx:
                reserve_order_redemptions(session, order)
            self.assertEqual(ctx.exception.code, "saldo_insuficiente")

    def test_full_cycle_reserve_complete_earn(self) -> None:
        with Session(self.engine) as session:
            manual_adjustment(
                session, user_id=self.user_id, delta=80,
                description="Saldo inicial", created_by=self.user_id,
            )
            order = self._order_with_lines(session)
            reserved = reserve_order_redemptions(session, order)
            session.commit()
            self.assertEqual(reserved, 50)
            self.assertEqual(balance(session, self.user_id), 30)  # 80 - 50

            redemption = session.exec(select(CreditRedemption)).one()
            self.assertEqual(redemption.status, "reserved")

            on_order_completed(session, order, actor_id=None)
            session.commit()
            session.refresh(redemption)
            self.assertEqual(redemption.status, "consumed")
            # Completar acredita lo ganado por la línea monetaria: 30 + 20 = 50.
            self.assertEqual(balance(session, self.user_id), 50)

            data = totals(session, self.user_id)
            self.assertEqual(data.available, 50)
            self.assertEqual(data.earned, 20)
            self.assertEqual(data.redeemed, 50)

    def test_cancel_releases_reservation(self) -> None:
        with Session(self.engine) as session:
            manual_adjustment(
                session, user_id=self.user_id, delta=50,
                description="Saldo", created_by=self.user_id,
            )
            order = self._order_with_lines(session, money_line=False)
            reserve_order_redemptions(session, order)
            session.commit()
            self.assertEqual(balance(session, self.user_id), 0)

            on_order_cancelled(session, order, actor_id=None)
            session.commit()
            self.assertEqual(balance(session, self.user_id), 50)  # liberado
            redemption = session.exec(select(CreditRedemption)).one()
            self.assertEqual(redemption.status, "released")

    def test_refund_reverses_earned_credits(self) -> None:
        with Session(self.engine) as session:
            order = self._order_with_lines(session, credits_line=False)
            on_order_completed(session, order, actor_id=None)  # earn +20
            session.commit()
            self.assertEqual(balance(session, self.user_id), 20)

            line = session.exec(select(OrderLine)).one()
            on_refund_allocation(
                session, order, order_line_id=line.id,
                credits_earned_reversed=20, credits_refunded=0, actor_id=None,
            )
            session.commit()
            self.assertEqual(balance(session, self.user_id), 0)
            types = {e.entry_type for e in session.exec(select(CreditLedgerEntry)).all()}
            self.assertIn("earn_reversal", types)

    def test_manual_adjustment_cannot_go_negative(self) -> None:
        with Session(self.engine) as session:
            with self.assertRaises(CreditRuleError) as ctx:
                manual_adjustment(
                    session, user_id=self.user_id, delta=-10,
                    description="x", created_by=self.user_id,
                )
            self.assertEqual(ctx.exception.code, "saldo_insuficiente")


class CreditRoutesTest(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_openapi_exposes_credit_routes(self) -> None:
        paths = self.client.get("/api/openapi.json").json()["paths"]
        for path in (
            "/api/v1/credits/me",
            "/api/v1/credits/me/movements",
            "/api/v1/credits/users/{user_id}",
            "/api/v1/credits/adjustments",
        ):
            self.assertIn(path, paths)

    def test_credit_routes_require_authentication(self) -> None:
        self.assertEqual(self.client.get("/api/v1/credits/me").status_code, 401)


if __name__ == "__main__":
    unittest.main()
