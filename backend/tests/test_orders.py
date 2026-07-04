"""Tests de la etapa 4c: creación de pedidos y máquina de estados."""

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

from pydantic import SecretStr  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

from backend.app.auth.security import get_password_hash  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.orders import (  # noqa: E402
    Order,
    OrderAdjustment,
    OrderLine,
    OrderShipping,
    OrderStatusHistory,
)
from backend.app.models.user import User  # noqa: E402
from backend.app.services.order_service import (  # noqa: E402
    ORDER_TRANSITIONS,
    OrderIdentity,
    OrderRuleError,
    create_order,
    public_status,
    transition_order,
)
from backend.app.services.pricing_service import PricedOrder  # noqa: E402


def _engine():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return engine


def _priced(subtotal: str = "230") -> PricedOrder:
    line = OrderLine(
        product_name_snapshot="Orden de boneless",
        quantity=1,
        purchase_mode="money",
        money_unit_price_snapshot=Decimal(subtotal),
        money_line_total_amount=Decimal(subtotal),
        credits_awarded_per_unit_snapshot=20,
        credits_earned_total_snapshot=20,
    )
    return PricedOrder(
        lines=[line],
        items_subtotal_amount=Decimal(subtotal),
        credits_earned_total=20,
        credits_redeemed_total=0,
    )


class OrderServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = _engine()
        with Session(self.engine) as session:
            user = User(
                name="Ana", last_name="Cruz", email="ana@example.com",
                hashed_password=get_password_hash(SecretStr("x")), token="t",
            )
            session.add(user)
            session.commit()
            self.user_id = user.id

    def _session(self) -> Session:
        return Session(self.engine)

    # ------------------------------------------------------------------
    # Creación e identidad por canal
    # ------------------------------------------------------------------

    def test_online_requires_customer(self) -> None:
        with self._session() as session:
            with self.assertRaises(OrderRuleError) as ctx:
                create_order(
                    session, _priced(),
                    OrderIdentity(source="online", fulfillment_type="pickup",
                                  customer_name="Ana", customer_phone="833"),
                )
        self.assertEqual(ctx.exception.code, "cliente_requerido")

    def test_staff_channel_requires_employee(self) -> None:
        with self._session() as session:
            with self.assertRaises(OrderRuleError) as ctx:
                create_order(
                    session, _priced(),
                    OrderIdentity(source="counter", fulfillment_type="counter"),
                )
        self.assertEqual(ctx.exception.code, "empleado_requerido")

    def test_pickup_requires_contact_snapshot(self) -> None:
        # Regla por canal: PICKUP exige contacto a nivel pedido; en DELIVERY el
        # contacto obligatorio vive en order_deliveries (lo valida la composición).
        with self._session() as session:
            with self.assertRaises(OrderRuleError) as ctx:
                create_order(
                    session, _priced(),
                    OrderIdentity(
                        source="online", fulfillment_type="pickup",
                        customer_user_id=self.user_id,
                    ),
                )
        self.assertEqual(ctx.exception.code, "datos_contacto_requeridos")

    def test_counter_without_customer_earns_zero_credits(self) -> None:
        # Regla dura: sin customer_user_id no se ganan créditos (snapshots en 0).
        with self._session() as session:
            order = create_order(
                session, _priced(),
                OrderIdentity(
                    source="counter", fulfillment_type="counter",
                    created_by=self.user_id,
                ),
            )
            session.commit()
            self.assertEqual(order.credits_earned_total_snapshot, 0)
            self.assertEqual(order.lines[0].credits_earned_total_snapshot, 0)

    def test_counter_sale_without_customer_is_valid(self) -> None:
        with self._session() as session:
            order = create_order(
                session, _priced(),
                OrderIdentity(
                    source="counter", fulfillment_type="counter",
                    created_by=self.user_id,
                ),
            )
            session.commit()
            self.assertIsNone(order.customer_user_id)
            self.assertEqual(order.created_by, self.user_id)
            self.assertEqual(order.public_code, "ORD-000001")
            self.assertEqual(order.items_subtotal_amount, Decimal("230"))

            history = session.exec(select(OrderStatusHistory)).all()
            self.assertEqual(len(history), 1)
            self.assertIsNone(history[0].previous_status)
            self.assertEqual(history[0].new_status, "submitted")

    def test_order_numbers_are_consecutive(self) -> None:
        with self._session() as session:
            identity = OrderIdentity(
                source="counter", fulfillment_type="counter", created_by=self.user_id
            )
            first = create_order(session, _priced(), identity)
            second = create_order(session, _priced(), identity)
            session.commit()
            self.assertEqual(second.order_number, first.order_number + 1)
            self.assertTrue(second.public_code.endswith(f"{second.order_number:06d}"))

    # ------------------------------------------------------------------
    # Máquina de estados
    # ------------------------------------------------------------------

    def _make_order(self, session: Session, *, fulfillment: str = "counter") -> Order:
        return create_order(
            session, _priced(),
            OrderIdentity(
                source="counter", fulfillment_type=fulfillment,
                created_by=self.user_id, customer_name="Ana", customer_phone="833",
            ),
        )

    def test_invalid_transition_rejected(self) -> None:
        with self._session() as session:
            order = self._make_order(session)
            with self.assertRaises(OrderRuleError) as ctx:
                transition_order(session, order, "preparing", actor_id=self.user_id)
        self.assertEqual(ctx.exception.code, "transicion_invalida")

    def test_terminal_states_have_no_exits(self) -> None:
        self.assertEqual(ORDER_TRANSITIONS["completed"], ())
        self.assertEqual(ORDER_TRANSITIONS["cancelled"], ())

    def test_approval_freezes_totals_with_adjustments(self) -> None:
        with self._session() as session:
            order = self._make_order(session)
            session.add_all(
                [
                    OrderAdjustment(
                        order_id=order.id, adjustment_type="discount",
                        direction="discount", amount=Decimal("30"),
                        reason="Cliente frecuente", authorized_by=self.user_id,
                    ),
                    OrderAdjustment(
                        order_id=order.id, adjustment_type="manual_fee",
                        direction="charge", amount=Decimal("10"),
                        reason="Empaque especial", authorized_by=self.user_id,
                    ),
                ]
            )
            session.flush()
            session.refresh(order)

            transition_order(session, order, "pending_approval", actor_id=self.user_id)
            transition_order(session, order, "approved", actor_id=self.user_id)
            session.commit()

            self.assertEqual(order.total_money_amount, Decimal("210"))  # 230+10-30
            self.assertEqual(order.discount_total_amount, Decimal("30"))
            self.assertIsNotNone(order.approved_at)
            self.assertEqual(order.approved_by, self.user_id)

    def test_delivery_cannot_be_approved_without_final_shipping(self) -> None:
        with self._session() as session:
            order = self._make_order(session, fulfillment="delivery")
            session.add(
                OrderShipping(
                    order_id=order.id, calculation_status="pending_review",
                    calculation_source="polygon_auto",
                )
            )
            session.flush()
            session.refresh(order)
            transition_order(session, order, "pending_approval", actor_id=self.user_id)
            with self.assertRaises(OrderRuleError) as ctx:
                transition_order(session, order, "approved", actor_id=self.user_id)
        self.assertEqual(ctx.exception.code, "envio_no_definido")

    def test_delivery_approval_includes_final_shipping_in_total(self) -> None:
        with self._session() as session:
            order = self._make_order(session, fulfillment="delivery")
            session.add(
                OrderShipping(
                    order_id=order.id, calculation_status="finalized",
                    calculation_source="polygon_auto", final_amount=Decimal("30"),
                )
            )
            session.flush()
            session.refresh(order)
            transition_order(session, order, "pending_approval", actor_id=self.user_id)
            transition_order(session, order, "approved", actor_id=self.user_id)
            session.commit()
            self.assertEqual(order.shipping_total_amount, Decimal("30"))
            self.assertEqual(order.total_money_amount, Decimal("260"))

    def test_out_for_delivery_only_for_delivery_orders(self) -> None:
        with self._session() as session:
            order = self._make_order(session)  # counter
            transition_order(session, order, "pending_approval", actor_id=self.user_id)
            transition_order(session, order, "approved", actor_id=self.user_id)
            transition_order(session, order, "preparing", actor_id=self.user_id)
            transition_order(session, order, "ready", actor_id=self.user_id)
            with self.assertRaises(OrderRuleError):
                transition_order(session, order, "out_for_delivery", actor_id=self.user_id)

    def test_cancellation_records_reason_and_history(self) -> None:
        with self._session() as session:
            order = self._make_order(session)
            transition_order(
                session, order, "cancelled", actor_id=self.user_id,
                reason_code="customer_cancelled",
                customer_visible_note="Cancelado a petición del cliente.",
            )
            session.commit()
            self.assertIsNotNone(order.cancelled_at)
            self.assertEqual(order.cancelled_by, self.user_id)
            last = session.exec(
                select(OrderStatusHistory).order_by(
                    OrderStatusHistory.changed_at.desc()  # pyright: ignore[reportAttributeAccessIssue]
                )
            ).first()
            assert last is not None
            self.assertEqual(last.reason_code, "customer_cancelled")

    def test_full_counter_flow_reaches_completed(self) -> None:
        with self._session() as session:
            order = self._make_order(session)
            for step in ("pending_approval", "approved", "completed"):
                transition_order(session, order, step, actor_id=self.user_id)
            session.commit()
            self.assertEqual(order.status, "completed")
            self.assertIsNotNone(order.completed_at)
            history = session.exec(select(OrderStatusHistory)).all()
            self.assertEqual(len(history), 4)  # submitted + 3 transiciones

    def test_public_status_mapping(self) -> None:
        self.assertEqual(public_status("pending_payment_verification"), "Pedido recibido")
        self.assertEqual(public_status("approved"), "Confirmado")
        self.assertEqual(public_status("out_for_delivery"), "En camino")
        self.assertEqual(public_status("completed"), "Entregado")


if __name__ == "__main__":
    unittest.main()
