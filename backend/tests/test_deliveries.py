"""Tests de la etapa 6: autoasignación, entrega, visibilidad y resumen."""

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
from sqlmodel import Session  # noqa: E402

from backend.app.auth.security import get_password_hash  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.orders import Order, OrderDelivery, OrderShipping  # noqa: E402
from backend.app.models.profiles import StaffProfile  # noqa: E402
from backend.app.models.user import User  # noqa: E402
from backend.app.services.delivery_service import (  # noqa: E402
    DeliveryRuleError,
    assign_courier,
    available_deliveries,
    complete_delivery,
    courier_daily_summary,
    current_assignment,
    public_courier_info,
    set_tracking,
    start_delivery,
    take_delivery,
)


def _engine():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return engine


class DeliveryServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = _engine()
        with Session(self.engine) as session:
            self.courier_id = self._make_courier(session, "david@example.com", "David Torres")
            self.other_courier_id = self._make_courier(session, "luis@example.com", "Luis P")
            self.order_id, self.delivery_id = self._make_ready_order(session)
            session.commit()

    def _make_courier(self, session: Session, email: str, name: str) -> uuid.UUID:
        user = User(
            name=name.split()[0], last_name=name.split()[-1], email=email,
            hashed_password=get_password_hash(SecretStr("x")), token="t",
        )
        session.add(user)
        session.flush()
        session.add(
            StaffProfile(
                user_id=user.id, display_name=name,
                public_contact_phone="833 000 0000",
                can_deliver=True, is_delivery_available=True,
                courier_public_note="Moto roja",
            )
        )
        return user.id

    def _make_ready_order(self, session: Session) -> tuple[uuid.UUID, uuid.UUID]:
        order = Order(
            order_number=int(uuid.uuid4().int % 1_000_000),
            public_code=f"ORD-{uuid.uuid4().hex[:6]}",
            source="online",
            fulfillment_type="delivery",
            status="ready",
            payment_status="pending",
            customer_user_id=self.courier_id,  # cualquier usuario sirve de cliente
            customer_name_snapshot="Ana Cruz",
            customer_phone_snapshot="833",
            items_subtotal_amount=Decimal("230"),
            shipping_total_amount=Decimal("30"),
        )
        session.add(order)
        session.flush()
        delivery = OrderDelivery(
            order_id=order.id, recipient_name="Ana", recipient_phone="833",
            street="Av. Hidalgo 45", location_source="not_provided",
        )
        session.add(delivery)
        session.add(
            OrderShipping(
                order_id=order.id, calculation_status="finalized",
                calculation_source="polygon_auto", final_amount=Decimal("30"),
            )
        )
        session.flush()
        return order.id, delivery.id

    def test_take_delivery_and_queue(self) -> None:
        with Session(self.engine) as session:
            queue = available_deliveries(session)
            self.assertEqual(len(queue), 1)

            assignment = take_delivery(session, self.delivery_id, self.courier_id)
            session.commit()
            self.assertEqual(assignment.status, "accepted")
            self.assertEqual(assignment.assigned_by, self.courier_id)  # autoasignación
            self.assertEqual(assignment.courier_name_snapshot, "David Torres")

            # La cola queda vacía y el segundo repartidor no puede tomarlo.
            self.assertEqual(available_deliveries(session), [])
            with self.assertRaises(DeliveryRuleError) as ctx:
                take_delivery(session, self.delivery_id, self.other_courier_id)
            self.assertEqual(ctx.exception.code, "envio_ya_tomado")

    def test_unavailable_courier_cannot_take(self) -> None:
        with Session(self.engine) as session:
            profile = session.get(StaffProfile, self.courier_id)
            assert profile is not None
            profile.is_delivery_available = False
            session.flush()
            with self.assertRaises(DeliveryRuleError) as ctx:
                take_delivery(session, self.delivery_id, self.courier_id)
            self.assertEqual(ctx.exception.code, "repartidor_no_disponible")

    def test_manual_reassignment_keeps_single_current(self) -> None:
        with Session(self.engine) as session:
            first = take_delivery(session, self.delivery_id, self.courier_id)
            session.commit()
            second = assign_courier(
                session, self.delivery_id, self.other_courier_id,
                assigned_by=self.courier_id, reason="Cambio de turno",
            )
            session.commit()
            session.refresh(first)
            self.assertFalse(first.is_current)
            self.assertEqual(first.status, "reassigned")
            self.assertTrue(second.is_current)
            current = current_assignment(session, self.delivery_id)
            assert current is not None
            self.assertEqual(current.id, second.id)

    def test_full_flow_visibility_and_summary(self) -> None:
        with Session(self.engine) as session:
            assignment = take_delivery(session, self.delivery_id, self.courier_id)
            session.commit()
            order = session.get(Order, self.order_id)
            assert order is not None

            # Antes de salir: el cliente NO ve repartidor (§19.2).
            self.assertIsNone(public_courier_info(session, order))

            set_tracking(session, self.courier_id, enabled=True)
            start_delivery(session, assignment, actor_id=self.courier_id)
            session.commit()
            session.refresh(order)
            self.assertEqual(order.status, "out_for_delivery")

            info = public_courier_info(session, order)
            assert info is not None
            self.assertEqual(info["name"], "David Torres")
            self.assertEqual(info["public_phone"], "833 000 0000")
            self.assertEqual(info["public_note"], "Moto roja")

            complete_delivery(
                session, assignment, actor_id=self.courier_id,
                delivered_to_name="Ana Cruz",
            )
            session.commit()
            session.refresh(order)
            self.assertEqual(order.status, "completed")
            # Entregado: el repartidor desaparece de la vista del cliente.
            self.assertIsNone(public_courier_info(session, order))

            delivery = session.get(OrderDelivery, self.delivery_id)
            assert delivery is not None
            self.assertIsNotNone(delivery.delivered_at)
            self.assertEqual(delivery.delivered_to_name, "Ana Cruz")

            summary = courier_daily_summary(session, self.courier_id)
            self.assertEqual(summary.deliveries_completed, 1)
            self.assertEqual(summary.shipping_charged, Decimal("30"))

    def _add_payment(
        self,
        session: Session,
        *,
        allows_cash_change: bool,
        status: str,
        change_for: Decimal | None = None,
    ):
        from backend.app.models.payments import Payment, PaymentMethodConfig

        method = PaymentMethodConfig(
            code=f"m-{uuid.uuid4().hex[:6]}",
            display_name="Efectivo" if allows_cash_change else "Transferencia",
            allows_cash_change=allows_cash_change,
            requires_manual_verification=not allows_cash_change,
        )
        session.add(method)
        session.flush()
        payment = Payment(
            order_id=self.order_id,
            payment_method_config_id=method.id,
            payment_method_name_snapshot=method.display_name,
            status=status,
            expected_amount=Decimal("260"),
            change_requested_for_amount=change_for,
            change_amount=(change_for - Decimal("260")) if change_for else Decimal("0"),
        )
        session.add(payment)
        session.flush()
        return payment

    def test_cash_on_delivery_collected_atomically_on_completion(self) -> None:
        """Etapa 4: el efectivo pendiente queda PAGADO al marcar entregado (H9)."""
        with Session(self.engine) as session:
            payment = self._add_payment(
                session, allows_cash_change=True, status="pending",
                change_for=Decimal("500"),
            )
            assignment = take_delivery(session, self.delivery_id, self.courier_id)
            start_delivery(session, assignment, actor_id=self.courier_id)
            session.commit()

            # En camino: el cliente ve el cambio que lleva el repartidor.
            order = session.get(Order, self.order_id)
            assert order is not None
            info = public_courier_info(session, order)
            assert info is not None
            self.assertEqual(info["cash_change_amount"], Decimal("240"))

            complete_delivery(session, assignment, actor_id=self.courier_id)
            session.commit()
            session.refresh(payment)
            self.assertEqual(payment.status, "paid")
            self.assertEqual(payment.received_amount, Decimal("260"))
            session.refresh(order)
            self.assertEqual(order.status, "completed")

            summary = courier_daily_summary(session, self.courier_id)
            self.assertEqual(summary.cash_collected, Decimal("260"))

    def test_pending_transfer_never_paid_on_completion(self) -> None:
        """H9: una transferencia sin verificar NO se cobra al entregar."""
        with Session(self.engine) as session:
            payment = self._add_payment(
                session, allows_cash_change=False, status="pending_verification"
            )
            assignment = take_delivery(session, self.delivery_id, self.courier_id)
            start_delivery(session, assignment, actor_id=self.courier_id)
            complete_delivery(session, assignment, actor_id=self.courier_id)
            session.commit()
            session.refresh(payment)
            self.assertEqual(payment.status, "pending_verification")

    def test_employee_can_complete_on_behalf(self) -> None:
        """Operación sin conexión (§19.6): otro usuario marca la entrega."""
        with Session(self.engine) as session:
            assignment = take_delivery(session, self.delivery_id, self.courier_id)
            start_delivery(session, assignment, actor_id=self.courier_id)
            session.commit()
            complete_delivery(
                session, assignment, actor_id=self.other_courier_id,
                completion_note="Marcado por mostrador; repartidor sin señal.",
            )
            session.commit()
            order = session.get(Order, self.order_id)
            assert order is not None
            self.assertEqual(order.status, "completed")


class CourierRoutesTest(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_openapi_exposes_courier_routes(self) -> None:
        paths = self.client.get("/api/openapi.json").json()["paths"]
        for path in (
            "/api/v1/courier/available-orders",
            "/api/v1/courier/availability",
            "/api/v1/courier/deliveries/{order_delivery_id}/take",
            "/api/v1/courier/deliveries/{order_delivery_id}/complete",
            "/api/v1/courier/summary",
            "/api/v1/courier/tracking/location",
            "/api/v1/deliveries/{order_delivery_id}/assign",
        ):
            self.assertIn(path, paths)

    def test_courier_routes_require_authentication(self) -> None:
        self.assertEqual(self.client.get("/api/v1/courier/available-orders").status_code, 401)
        self.assertEqual(self.client.get("/api/v1/courier/summary").status_code, 401)


if __name__ == "__main__":
    unittest.main()
