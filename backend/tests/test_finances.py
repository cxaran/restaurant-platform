"""Tests de la etapa 7: ingreso único por pago, gastos/void, reembolsos y resumen."""

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

from fastapi.testclient import TestClient  # noqa: E402
from pydantic import SecretStr  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

from backend.app.auth.security import get_password_hash  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.finances import FinancialEntry  # noqa: E402
from backend.app.models.orders import Order, OrderLine  # noqa: E402
from backend.app.models.payments import Payment, PaymentMethodConfig  # noqa: E402
from backend.app.models.user import User  # noqa: E402
from backend.app.services.finance_service import (  # noqa: E402
    FinanceRuleError,
    RefundAllocationInput,
    business_summary,
    create_refund,
    record_manual_entry,
    record_payment_income,
    void_entry,
)
from backend.app.services.order_service import OrderRuleError, transition_order  # noqa: E402
from backend.app.services.payment_service import (  # noqa: E402
    collection_instruction,
    create_payment,
    mark_paid,
)
from backend.app.utils.utc_now import utc_now  # noqa: E402


def _engine():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return engine


class FinanceServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = _engine()
        with Session(self.engine) as session:
            user = User(
                name="Antonio", last_name="M", email="admin@example.com",
                hashed_password=get_password_hash(SecretStr("x")), token="t",
            )
            session.add(user)
            session.flush()
            self.user_id = user.id

            method = PaymentMethodConfig(
                code="cash_counter", display_name="Efectivo en mostrador",
                allows_cash_change=True,
            )
            session.add(method)
            session.flush()
            self.method_id = method.id

            order = Order(
                order_number=1, public_code="ORD-000001",
                source="counter", fulfillment_type="counter",
                status="approved", payment_status="unpaid",
                created_by=user.id,
                items_subtotal_amount=Decimal("200"),
                total_money_amount=Decimal("200"),
            )
            session.add(order)
            session.flush()
            self.order_id = order.id
            line = OrderLine(
                order_id=order.id, product_name_snapshot="Orden de boneless",
                quantity=2, purchase_mode="money",
                money_unit_price_snapshot=Decimal("100"),
                money_line_total_amount=Decimal("200"),
                credits_awarded_per_unit_snapshot=10,
                credits_earned_total_snapshot=20,
            )
            session.add(line)
            session.flush()
            self.line_id = line.id
            session.commit()

    def _paid_payment(self, session: Session) -> tuple[Order, Payment]:
        order = session.get(Order, self.order_id)
        method = session.get(PaymentMethodConfig, self.method_id)
        assert order is not None and method is not None
        payment = create_payment(
            session, order, method, expected_amount=Decimal("200")
        )
        mark_paid(session, order, payment, actor_id=self.user_id)
        session.commit()
        return order, payment

    def test_mark_paid_records_single_income(self) -> None:
        with Session(self.engine) as session:
            order, payment = self._paid_payment(session)

            entries = session.exec(select(FinancialEntry)).all()
            self.assertEqual(len(entries), 1)
            entry = entries[0]
            self.assertEqual(entry.entry_type, "payment_income")
            self.assertEqual(entry.amount, Decimal("200"))
            self.assertEqual(entry.source_type, "system")

            # Idempotencia (§21.4): repetir no duplica el ingreso.
            record_payment_income(session, order, payment)
            session.commit()
            self.assertEqual(len(session.exec(select(FinancialEntry)).all()), 1)

    def test_manual_expense_and_void_with_history(self) -> None:
        with Session(self.engine) as session:
            entry = record_manual_entry(
                session, direction="expense", entry_type="expense",
                amount=Decimal("980"), occurred_at=utc_now(),
                registered_by=self.user_id, description="Compra de pollo",
            )
            session.commit()

            void_entry(session, entry, actor_id=self.user_id, reason="Duplicado")
            session.commit()
            self.assertEqual(entry.status, "voided")
            self.assertEqual(entry.void_reason, "Duplicado")

            with self.assertRaises(FinanceRuleError):
                void_entry(session, entry, actor_id=self.user_id, reason="otra vez")

    def test_system_income_cannot_be_voided_manually(self) -> None:
        with Session(self.engine) as session:
            self._paid_payment(session)
            entry = session.exec(select(FinancialEntry)).one()
            with self.assertRaises(FinanceRuleError) as ctx:
                void_entry(session, entry, actor_id=self.user_id, reason="x")
            self.assertEqual(ctx.exception.code, "movimiento_de_sistema")

    def test_partial_refund_flow(self) -> None:
        with Session(self.engine) as session:
            order, payment = self._paid_payment(session)

            refund = create_refund(
                session, order, payment,
                amount=Decimal("100"), reason="Producto en mal estado",
                processed_by=self.user_id,
                allocations=[
                    RefundAllocationInput(
                        order_line_id=self.line_id,
                        refunded_quantity=1,
                        money_refunded_amount=Decimal("100"),
                    )
                ],
            )
            session.commit()
            session.refresh(payment)

            self.assertEqual(refund.status, "processed")
            self.assertEqual(payment.status, "partially_refunded")

            entries = session.exec(select(FinancialEntry)).all()
            refund_entries = [e for e in entries if e.entry_type == "refund"]
            self.assertEqual(len(refund_entries), 1)
            self.assertEqual(refund_entries[0].amount, Decimal("100"))
            # El reembolso referencia el ingreso original.
            income = next(e for e in entries if e.entry_type == "payment_income")
            self.assertEqual(refund_entries[0].reversal_of_entry_id, income.id)

            # Exceder lo cobrado se rechaza.
            with self.assertRaises(FinanceRuleError) as ctx:
                create_refund(
                    session, order, payment,
                    amount=Decimal("150"), reason="x",
                    processed_by=self.user_id, allocations=[],
                )
            self.assertEqual(ctx.exception.code, "reembolso_excede_pago")

    def test_refund_caps_accumulate_per_line(self) -> None:
        """H3: 1+1 unidades ok; la tercera falla; el dinero acumula por línea."""
        with Session(self.engine) as session:
            order, payment = self._paid_payment(session)

            for _ in range(2):
                create_refund(
                    session, order, payment,
                    amount=Decimal("50"), reason="Parcial",
                    processed_by=self.user_id,
                    allocations=[
                        RefundAllocationInput(
                            order_line_id=self.line_id,
                            refunded_quantity=1,
                            money_refunded_amount=Decimal("50"),
                        )
                    ],
                )
                session.commit()

            with self.assertRaises(FinanceRuleError) as ctx:
                create_refund(
                    session, order, payment,
                    amount=Decimal("10"), reason="Tercero",
                    processed_by=self.user_id,
                    allocations=[
                        RefundAllocationInput(
                            order_line_id=self.line_id,
                            refunded_quantity=1,
                            money_refunded_amount=Decimal("10"),
                        )
                    ],
                )
            self.assertEqual(ctx.exception.code, "reembolso_excede_linea")
            session.rollback()

            # Dinero por encima del remanente histórico (200 − 100 = 100)
            # también se rechaza aunque queden unidades... pero aquí ya no
            # quedan: verificamos el código de dinero con una línea fresca.

    def test_refund_money_cap_per_line(self) -> None:
        with Session(self.engine) as session:
            order, payment = self._paid_payment(session)
            with self.assertRaises(FinanceRuleError) as ctx:
                create_refund(
                    session, order, payment,
                    amount=Decimal("200"), reason="Excede línea",
                    processed_by=self.user_id,
                    allocations=[
                        RefundAllocationInput(
                            order_line_id=self.line_id,
                            refunded_quantity=1,
                            money_refunded_amount=Decimal("201"),
                        )
                    ],
                )
            self.assertEqual(ctx.exception.code, "reembolso_excede_dinero_linea")

    def test_cancel_with_paid_payment_requires_acknowledgement(self) -> None:
        """H5: cancelar no reembolsa; el cobro existente exige reconocimiento."""
        with Session(self.engine) as session:
            order, _payment = self._paid_payment(session)

            with self.assertRaises(OrderRuleError) as ctx:
                transition_order(
                    session, order, "cancelled", actor_id=self.user_id,
                    reason_code="store_cancelled",
                )
            self.assertEqual(ctx.exception.code, "pago_registrado")
            session.rollback()

            order = session.get(Order, self.order_id)
            assert order is not None
            transition_order(
                session, order, "cancelled", actor_id=self.user_id,
                reason_code="store_cancelled", acknowledge_paid_payments=True,
            )
            session.commit()
            self.assertEqual(order.status, "cancelled")
            # El hecho queda en la bitácora para conciliación posterior.
            from backend.app.models.orders import OrderStatusHistory

            note = session.exec(
                select(OrderStatusHistory).where(
                    OrderStatusHistory.new_status == "cancelled"
                )
            ).one().internal_note
            self.assertIn("requiere resolución de reembolso", note or "")

    def test_approval_recomputes_payment_status(self) -> None:
        """H4: si el total congelado supera lo cobrado, deja de ser «paid»."""
        with Session(self.engine) as session:
            user = session.get(User, self.user_id)
            method = session.get(PaymentMethodConfig, self.method_id)
            assert user is not None and method is not None
            order = Order(
                order_number=77, public_code="ORD-000077",
                source="counter", fulfillment_type="counter",
                status="pending_approval", payment_status="unpaid",
                created_by=user.id,
                items_subtotal_amount=Decimal("200"),
            )
            session.add(order)
            session.flush()
            payment = create_payment(session, order, method, expected_amount=Decimal("200"))
            mark_paid(session, order, payment, actor_id=user.id)
            self.assertEqual(order.payment_status, "paid")

            # Un cargo autorizado sube el total al congelar en la aprobación.
            from backend.app.models.orders import OrderAdjustment

            session.add(
                OrderAdjustment(
                    order_id=order.id, adjustment_type="manual_fee", direction="charge",
                    amount=Decimal("50"), reason="Empaque especial",
                    authorized_by=user.id,
                )
            )
            session.flush()
            session.refresh(order)
            transition_order(session, order, "approved", actor_id=user.id)
            session.commit()
            self.assertEqual(order.total_money_amount, Decimal("250"))
            self.assertEqual(order.payment_status, "pending")  # ya NO «paid»

    def test_collection_instruction_never_says_cash_for_transfer(self) -> None:
        """H9: transferencia pendiente → «no cobrar», jamás «cobrar efectivo»."""
        with Session(self.engine) as session:
            order = session.get(Order, self.order_id)
            assert order is not None
            transfer = PaymentMethodConfig(
                code="bank_transfer", display_name="Transferencia bancaria",
                requires_manual_verification=True,
            )
            session.add(transfer)
            session.flush()
            create_payment(session, order, transfer, expected_amount=Decimal("200"))
            session.flush()

            instruction = collection_instruction(session, order)
            self.assertFalse(instruction.must_collect)
            self.assertFalse(instruction.label.startswith("Cobrar"))
            self.assertIn("no cobrar", instruction.label.lower())

    def test_business_summary_formula(self) -> None:
        with Session(self.engine) as session:
            order, payment = self._paid_payment(session)  # +200 ingreso
            record_manual_entry(
                session, direction="expense", entry_type="expense",
                amount=Decimal("80"), occurred_at=utc_now(),
                registered_by=self.user_id,
            )
            create_refund(
                session, order, payment, amount=Decimal("50"), reason="Parcial",
                processed_by=self.user_id, allocations=[],
            )
            voided = record_manual_entry(
                session, direction="expense", entry_type="expense",
                amount=Decimal("999"), occurred_at=utc_now(),
                registered_by=self.user_id,
            )
            void_entry(session, voided, actor_id=self.user_id, reason="error")
            session.commit()

            now = utc_now()
            summary = business_summary(
                session,
                date_from=now - timedelta(days=1),
                date_to=now + timedelta(days=1),
            )
        self.assertEqual(summary.income_total, Decimal("200"))
        self.assertEqual(summary.expense_total, Decimal("80"))  # anulado NO cuenta
        self.assertEqual(summary.refund_total, Decimal("50"))
        self.assertEqual(summary.net_result, Decimal("70"))  # 200 - 80 - 50


class FinanceRoutesTest(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_openapi_exposes_finance_routes(self) -> None:
        paths = self.client.get("/api/openapi.json").json()["paths"]
        for path in (
            "/api/v1/finances/entries",
            "/api/v1/finances/entries/{entry_id}/void",
            "/api/v1/finances/categories",
            "/api/v1/finances/summary",
            "/api/v1/payments/{payment_id}/refunds",
        ):
            self.assertIn(path, paths)

    def test_finance_routes_require_authentication(self) -> None:
        self.assertEqual(self.client.get("/api/v1/finances/entries").status_code, 401)


if __name__ == "__main__":
    unittest.main()
