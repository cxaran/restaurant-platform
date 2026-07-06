"""Notificaciones persistentes: campana + correo, hooks de pedidos y difusión."""

import asyncio
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

from unittest.mock import patch  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

from backend.app.core.database import get_db  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.catalog import Product, ProductCategory  # noqa: E402
from backend.app.models.notification import Notification  # noqa: E402
from backend.app.models.user import Role, RoleAccess, User, UserRole  # noqa: E402
from backend.app.services.email_service import EmailOutcome  # noqa: E402
from backend.app.services.notification_service import (  # noqa: E402
    broadcast,
    dispatch_pending_emails,
    notify_new_web_order,
)
from backend.app.services.order_service import (  # noqa: E402
    OrderIdentity,
    create_order,
    transition_order,
)
from backend.app.services.pricing_service import CartLineInput, price_cart  # noqa: E402


def _engine():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return engine


def _make_user(session: Session, email: str, *, active: bool = True) -> User:
    user = User(
        name="U", last_name="Ser", email=email, hashed_password="x", is_active=active
    )
    session.add(user)
    session.flush()
    return user


def _grant(session: Session, user: User, permission: str) -> None:
    role = Role(name=f"rol-{uuid.uuid4().hex[:6]}", description="t")
    session.add(role)
    session.flush()
    session.add(RoleAccess(role_id=role.id, access=permission, is_active=True))
    session.add(UserRole(user_id=user.id, role_id=role.id))
    session.flush()


def _make_web_order(session: Session, customer: User):
    category = ProductCategory(name=f"Cat {uuid.uuid4().hex[:6]}")
    session.add(category)
    session.flush()
    product = Product(
        category_id=category.id, name="Boneless", money_price_amount=Decimal("230"),
        credits_awarded_per_unit=10,
    )
    session.add(product)
    session.flush()
    priced = price_cart(
        session, [CartLineInput(product_id=product.id, quantity=1, purchase_mode="money")]
    )
    order = create_order(
        session,
        priced,
        OrderIdentity(
            source="online", fulfillment_type="pickup", customer_user_id=customer.id,
            customer_name="Cliente", customer_phone="5511111111",
            customer_email=customer.email,
        ),
    )
    session.flush()
    return order


class OrderFlowNotificationsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = _engine()

    def test_new_web_order_alerts_only_users_with_permission(self) -> None:
        with Session(self.engine) as session:
            customer = _make_user(session, "cliente@example.com")
            cocina = _make_user(session, "cocina@example.com")
            admin = _make_user(session, "admin@example.com")
            apagado = _make_user(session, "apagado@example.com", active=False)
            sin_permiso = _make_user(session, "cajero@example.com")
            _grant(session, cocina, "notifications:order_alerts")
            _grant(session, admin, "notifications:order_alerts")
            _grant(session, apagado, "notifications:order_alerts")
            _grant(session, sin_permiso, "orders:read")

            order = _make_web_order(session, customer)
            created = notify_new_web_order(session, order)
            session.commit()

            self.assertEqual(created, 2)  # cocina + admin; jamás inactivos/sin permiso
            rows = session.exec(
                select(Notification).where(Notification.kind == "order_new")
            ).all()
            self.assertEqual(
                sorted(row.user_id for row in rows), sorted([cocina.id, admin.id])
            )
            self.assertTrue(all(row.email_status == "pending" for row in rows))
            self.assertTrue(all(row.order_id == order.id for row in rows))

    def test_transition_notifies_customer_in_same_transaction(self) -> None:
        with Session(self.engine) as session:
            customer = _make_user(session, "cliente@example.com")
            order = _make_web_order(session, customer)
            transition_order(session, order, "pending_approval", actor_id=None)
            transition_order(session, order, "approved", actor_id=None)
            transition_order(session, order, "preparing", actor_id=None)
            session.commit()

            rows = session.exec(
                select(Notification).where(Notification.user_id == customer.id)
            ).all()
            titles = sorted(row.title for row in rows)
            # pending_approval es ruido interno: NO notifica; approved y preparing sí.
            self.assertEqual(len(rows), 2)
            self.assertTrue(any("confirmado" in title for title in titles))
            self.assertTrue(any("preparando" in title for title in titles))
            self.assertTrue(all(row.kind == "order_status" for row in rows))

    def test_pos_order_without_customer_user_notifies_nobody(self) -> None:
        with Session(self.engine) as session:
            cashier = _make_user(session, "cajero-pos@example.com")
            category = ProductCategory(name="Cat")
            session.add(category)
            session.flush()
            product = Product(
                category_id=category.id, name="Dip", money_price_amount=Decimal("15"),
            )
            session.add(product)
            session.flush()
            priced = price_cart(
                session,
                [CartLineInput(product_id=product.id, quantity=1, purchase_mode="money")],
            )
            order = create_order(
                session, priced,
                OrderIdentity(
                    source="counter", fulfillment_type="counter", created_by=cashier.id
                ),
            )
            transition_order(session, order, "pending_approval", actor_id=None)
            transition_order(session, order, "approved", actor_id=None)
            session.commit()
            self.assertEqual(session.exec(select(Notification)).all(), [])

    def test_counter_sale_with_customer_notifies_nobody(self) -> None:
        # Venta de mostrador CON cliente registrado: el cliente está presente y
        # se lleva su ticket; ninguna transición (aprobado/entregado) le genera
        # campana ni correo. El corte es central en notify_order_status.
        with Session(self.engine) as session:
            cashier = _make_user(session, "cajero2-pos@example.com")
            customer = _make_user(session, "cliente-mostrador@example.com")
            category = ProductCategory(name="Cat")
            session.add(category)
            session.flush()
            product = Product(
                category_id=category.id, name="Dip", money_price_amount=Decimal("15"),
            )
            session.add(product)
            session.flush()
            priced = price_cart(
                session,
                [CartLineInput(product_id=product.id, quantity=1, purchase_mode="money")],
            )
            order = create_order(
                session, priced,
                OrderIdentity(
                    source="counter", fulfillment_type="counter",
                    customer_user_id=customer.id, created_by=cashier.id,
                ),
            )
            transition_order(session, order, "pending_approval", actor_id=None)
            transition_order(session, order, "approved", actor_id=None)
            transition_order(session, order, "completed", actor_id=None)
            session.commit()
            self.assertEqual(session.exec(select(Notification)).all(), [])


class EmailDispatchTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = _engine()

    def test_dispatch_marks_sent_failed_and_skipped(self) -> None:
        with Session(self.engine) as session:
            ok_user = _make_user(session, "ok@example.com")
            bad_user = _make_user(session, "bad@example.com")
            gone_user = _make_user(session, "gone@example.com")
            broadcast(session, title="Promo", body="2x1 en boneless", audience="all")
            # El usuario se desactiva DESPUÉS de encolarse su correo: el
            # despacho lo salta (skipped) en vez de escribirle.
            gone_user.is_active = False
            session.add(gone_user)
            session.commit()

            async def fake_send(_session, *, subject, email_to, message):  # noqa: ANN001
                if email_to == "bad@example.com":
                    return EmailOutcome(sent=False, error_code="send_failed", error_summary="boom")
                return EmailOutcome(sent=True)

            with patch(
                "backend.app.services.email_service.send_system_email", new=fake_send
            ):
                sent = asyncio.run(dispatch_pending_emails(session))
            session.commit()

            self.assertEqual(sent, 1)  # solo ok_user (bad falla, gone inactivo)
            by_user = {
                row.user_id: row for row in session.exec(select(Notification)).all()
            }
            self.assertEqual(by_user[ok_user.id].email_status, "sent")
            self.assertEqual(by_user[bad_user.id].email_status, "failed")
            self.assertEqual(by_user[bad_user.id].email_error, "boom")
            self.assertEqual(by_user[gone_user.id].email_status, "skipped")


class NotificationRoutesTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = _engine()

        def override_db():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)

        with Session(self.engine) as session:
            self.user_id = _make_user(session, "yo@example.com").id
            other = _make_user(session, "otro@example.com")
            session.add_all(
                [
                    Notification(
                        user_id=self.user_id, kind="promo", title="Hola", body="Promo",
                    ),
                    Notification(
                        user_id=self.user_id, kind="promo", title="Dos", body="Promo",
                    ),
                    Notification(
                        user_id=other.id, kind="promo", title="Ajena", body="Promo",
                    ),
                ]
            )
            session.commit()

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def _as(self, *permissions: str) -> None:
        from backend.app.auth.auth_dependencies import get_current_user
        from backend.app.schemas.user import SessionUser

        app.dependency_overrides[get_current_user] = lambda: SessionUser(
            id=self.user_id, name="Yo", last_name="Mismo", email="yo@example.com",
            permissions=set(permissions),
        )

    def test_me_lists_only_own_and_counts_unread(self) -> None:
        self._as()
        body = self.client.get("/api/v1/notifications/me").json()
        self.assertEqual(body["unread_count"], 2)
        self.assertEqual(len(body["items"]), 2)
        self.assertTrue(all(item["title"] != "Ajena" for item in body["items"]))

        marked = self.client.post("/api/v1/notifications/me/read-all").json()
        self.assertEqual(marked["marked"], 2)
        self.assertEqual(
            self.client.get("/api/v1/notifications/me").json()["unread_count"], 0
        )

    def test_unread_only_hides_dismissed(self) -> None:
        # La campana pide unread_only=true: descartar (marcar leída) una saca la
        # notificación de la lista, aunque el histórico siga en la base.
        self._as()
        before = self.client.get("/api/v1/notifications/me?unread_only=true").json()
        self.assertEqual(len(before["items"]), 2)
        target = before["items"][0]["id"]

        self.client.post(f"/api/v1/notifications/{target}/read")
        after = self.client.get("/api/v1/notifications/me?unread_only=true").json()
        self.assertEqual(len(after["items"]), 1)
        self.assertTrue(all(item["id"] != target for item in after["items"]))
        self.assertEqual(after["unread_count"], 1)
        # Sin el filtro, la descartada sigue presente (histórico intacto).
        full = self.client.get("/api/v1/notifications/me").json()
        self.assertEqual(len(full["items"]), 2)

    def test_read_single_is_own_only(self) -> None:
        self._as()
        mine = self.client.get("/api/v1/notifications/me").json()["items"][0]
        done = self.client.post(f"/api/v1/notifications/{mine['id']}/read")
        self.assertEqual(done.status_code, 200, done.text)
        self.assertIsNotNone(done.json()["read_at"])

        with Session(self.engine) as session:
            ajena = session.exec(
                select(Notification).where(Notification.title == "Ajena")
            ).one()
        # 404 uniforme: la notificación de otro usuario "no existe".
        self.assertEqual(
            self.client.post(f"/api/v1/notifications/{ajena.id}/read").status_code, 404
        )

    def test_broadcast_requires_permission_and_targets_audience(self) -> None:
        self._as()
        denied = self.client.post(
            "/api/v1/notifications/broadcast",
            json={"title": "Promo", "body": "2x1 hoy"},
        )
        self.assertEqual(denied.status_code, 403)

        with Session(self.engine) as session:
            staff = _make_user(session, "staff@example.com")
            _grant(session, staff, "orders:read")
            session.commit()

        self._as("notifications:send")
        sent = self.client.post(
            "/api/v1/notifications/broadcast",
            json={"title": "Promo", "body": "2x1 hoy", "audience": "customers"},
        )
        self.assertEqual(sent.status_code, 201, sent.text)
        # yo + otro son clientes (sin rol); staff queda fuera de "customers".
        self.assertEqual(sent.json()["created"], 2)

        everyone = self.client.post(
            "/api/v1/notifications/broadcast",
            json={"title": "Aviso", "body": "Nuevo horario", "audience": "all"},
        )
        self.assertEqual(everyone.json()["created"], 3)

    def test_openapi_exposes_notification_routes(self) -> None:
        paths = self.client.get("/api/openapi.json").json()["paths"]
        for path in (
            "/api/v1/notifications/me",
            "/api/v1/notifications/me/read-all",
            "/api/v1/notifications/broadcast",
        ):
            self.assertIn(path, paths)


if __name__ == "__main__":
    unittest.main()
