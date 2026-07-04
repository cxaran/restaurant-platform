"""Tests de la API de perfiles (§8.2/§8.4): búsqueda de clientes y reparto."""

import os
import unittest
import uuid


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

from backend.app.auth.auth_dependencies import get_current_user  # noqa: E402
from backend.app.auth.security import get_password_hash  # noqa: E402
from backend.app.core.database import get_db  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.user import User  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402

ADMIN_ID = uuid.uuid4()
COURIER_ID = uuid.uuid4()
CUSTOMER_ID = uuid.uuid4()


class _As:
    def __init__(self, user_id: uuid.UUID, *permissions: str) -> None:
        self.user = SessionUser(
            id=user_id, name="Tester", last_name="A",
            email=f"{user_id.hex[:8]}@example.com", permissions=set(permissions),
        )

    def __enter__(self) -> None:
        app.dependency_overrides[get_current_user] = lambda: self.user

    def __exit__(self, *exc: object) -> None:
        app.dependency_overrides.pop(get_current_user, None)


class ProfileRoutesTest(unittest.TestCase):
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
            for user_id, email in (
                (ADMIN_ID, "admin@example.com"),
                (COURIER_ID, "courier@example.com"),
                (CUSTOMER_ID, "maria@example.com"),
            ):
                session.add(
                    User(
                        id=user_id, name="U", last_name="X", email=email,
                        hashed_password=get_password_hash(SecretStr("x")), token="t",
                    )
                )
            session.commit()

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def test_openapi_and_auth(self) -> None:
        paths = self.client.get("/api/openapi.json").json()["paths"]
        for path in (
            "/api/v1/profiles/me",
            "/api/v1/profiles/customers",
            "/api/v1/profiles/customers/{user_id}",
            "/api/v1/profiles/staff",
            "/api/v1/profiles/staff/{user_id}",
            "/api/v1/profiles/staff/me/availability",
        ):
            self.assertIn(path, paths)
        self.assertEqual(self.client.get("/api/v1/profiles/me").status_code, 401)

    def test_customer_search_requires_permission_and_finds_by_phone(self) -> None:
        with _As(ADMIN_ID, "profiles:manage_customers"):
            created = self.client.put(
                f"/api/v1/profiles/customers/{CUSTOMER_ID}",
                json={"full_name": "María López", "phone": "833-214-7789"},
            )
        self.assertEqual(created.status_code, 200, created.text)
        self.assertEqual(created.json()["phone_normalized"], "8332147789")

        with _As(ADMIN_ID):
            self.assertEqual(
                self.client.get("/api/v1/profiles/customers?phone=2147").status_code, 403
            )
        with _As(ADMIN_ID, "profiles:read"):
            found = self.client.get("/api/v1/profiles/customers?phone=2147").json()
            empty = self.client.get("/api/v1/profiles/customers?phone=99999").json()
            missing = self.client.get("/api/v1/profiles/customers")
        self.assertEqual([r["full_name"] for r in found], ["María López"])
        self.assertEqual(empty, [])
        self.assertEqual(missing.status_code, 422)

    def test_self_profile_never_exposes_internal_notes(self) -> None:
        with _As(ADMIN_ID, "profiles:manage_customers"):
            self.client.put(
                f"/api/v1/profiles/customers/{CUSTOMER_ID}",
                json={
                    "full_name": "María",
                    "phone": "8332147789",
                    "internal_notes": "Cliente frecuente; ver nota interna.",
                },
            )
        with _As(CUSTOMER_ID):
            body = self.client.get("/api/v1/profiles/me").json()
        self.assertNotIn("internal_notes", body)
        self.assertEqual(body["full_name"], "María")

    def test_staff_profile_can_deliver_and_availability(self) -> None:
        with _As(ADMIN_ID, "profiles:manage_staff"):
            created = self.client.put(
                f"/api/v1/profiles/staff/{COURIER_ID}",
                json={
                    "display_name": "Pedro R.",
                    "can_deliver": True,
                    "courier_public_note": "Moto roja",
                },
            )
        self.assertEqual(created.status_code, 200, created.text)
        self.assertTrue(created.json()["can_deliver"])
        self.assertFalse(created.json()["is_delivery_available"])

        # El propio repartidor se pone disponible.
        with _As(COURIER_ID):
            toggled = self.client.patch(
                "/api/v1/profiles/staff/me/availability",
                json={"is_delivery_available": True},
            )
        self.assertEqual(toggled.status_code, 200, toggled.text)
        self.assertTrue(toggled.json()["is_delivery_available"])

        # Sin capacidad de reparto → 403.
        with _As(CUSTOMER_ID):
            denied = self.client.patch(
                "/api/v1/profiles/staff/me/availability",
                json={"is_delivery_available": True},
            )
        self.assertEqual(denied.status_code, 403)

        # Quitar can_deliver apaga también la disponibilidad.
        with _As(ADMIN_ID, "profiles:manage_staff"):
            updated = self.client.put(
                f"/api/v1/profiles/staff/{COURIER_ID}",
                json={"display_name": "Pedro R.", "can_deliver": False},
            )
        self.assertFalse(updated.json()["is_delivery_available"])

    def test_upsert_rejects_unknown_user_and_bad_phone(self) -> None:
        with _As(ADMIN_ID, "profiles:manage_customers"):
            missing = self.client.put(
                f"/api/v1/profiles/customers/{uuid.uuid4()}",
                json={"full_name": "Nadie", "phone": "8330000000"},
            )
            bad_phone = self.client.put(
                f"/api/v1/profiles/customers/{CUSTOMER_ID}",
                json={"full_name": "María", "phone": "abc-def"},
            )
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(bad_phone.status_code, 422)


if __name__ == "__main__":
    unittest.main()
