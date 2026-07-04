"""CRUD administrativo de métodos de pago (§18.1): permisos, alta, listado,
PATCH parcial, código duplicado/inmutable, activación y auditoría de cambios.

Sin DELETE por diseño (desactivar preserva los pagos históricos, FK RESTRICT).
"""

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
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

from backend.app.auth.auth_dependencies import get_current_user  # noqa: E402
from backend.app.core.database import get_db  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.audit_event import AuditEvent  # noqa: E402
from backend.app.models.payments import PaymentMethodConfig  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402

STAFF_ID = uuid.uuid4()

_VALID = {
    "code": "transferencia_bbva",
    "display_name": "Transferencia BBVA",
    "instructions": "Envía el comprobante por WhatsApp.",
    "available_online": True,
    "available_pos": True,
    "requires_manual_verification": True,
    "requires_transaction_reference": True,
    "requires_bank_name": True,
    "requires_payment_proof": True,
    "allows_cash_change": False,
    "sort_order": 5,
}


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


class PaymentMethodConfigTest(unittest.TestCase):
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

    def tearDown(self) -> None:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)

    def _create(self, **overrides):
        body = {**_VALID, **overrides}
        with _As("payments:manage_methods"):
            return self.client.post("/api/v1/payment-method-configs", json=body)

    # --- Permisos ---------------------------------------------------------

    def test_requires_manage_methods_permission(self) -> None:
        # payments:read no basta para administrar métodos.
        with _As("payments:read"):
            created = self.client.post("/api/v1/payment-method-configs", json=_VALID)
            listed = self.client.get("/api/v1/payment-method-configs")
        self.assertEqual(created.status_code, 403)
        self.assertEqual(listed.status_code, 403)

    # --- Alta + listado + auditoría --------------------------------------

    def test_create_lists_and_audits(self) -> None:
        created = self._create()
        self.assertEqual(created.status_code, 201, created.text)
        payload = created.json()
        self.assertEqual(payload["code"], "transferencia_bbva")
        self.assertTrue(payload["requires_manual_verification"])

        with _As("payments:manage_methods"):
            listed = self.client.get("/api/v1/payment-method-configs")
        self.assertEqual(listed.status_code, 200)
        codes = [item["code"] for item in listed.json()["items"]]
        self.assertIn("transferencia_bbva", codes)

        # La auditoría registra SOLO nombres de campos, jamás valores.
        with Session(self.engine) as session:
            events = session.exec(
                select(AuditEvent).where(AuditEvent.entity_type == "payment_methods")
            ).all()
        self.assertTrue(any(event.action == "create" for event in events))
        create_event = next(event for event in events if event.action == "create")
        self.assertIn("code", create_event.changed_fields["fields"])
        self.assertNotIn("transferencia_bbva", create_event.changed_fields["fields"])

    def test_invalid_code_pattern_rejected(self) -> None:
        created = self._create(code="Transf BBVA")  # espacios y mayúsculas
        self.assertEqual(created.status_code, 422)

    def test_duplicate_code_conflict(self) -> None:
        first = self._create()
        self.assertEqual(first.status_code, 201)
        duplicate = self._create(display_name="Otro nombre")
        self.assertEqual(duplicate.status_code, 409)

    # --- PATCH parcial ----------------------------------------------------

    def test_patch_updates_and_audits(self) -> None:
        created = self._create()
        method_id = created.json()["id"]
        with _As("payments:manage_methods"):
            patched = self.client.patch(
                f"/api/v1/payment-method-configs/{method_id}",
                json={"display_name": "Transferencia BBVA MX", "sort_order": 9},
            )
        self.assertEqual(patched.status_code, 200, patched.text)
        self.assertEqual(patched.json()["display_name"], "Transferencia BBVA MX")
        self.assertEqual(patched.json()["sort_order"], 9)

        with Session(self.engine) as session:
            events = session.exec(
                select(AuditEvent).where(
                    AuditEvent.entity_type == "payment_methods",
                    AuditEvent.action == "update",
                )
            ).all()
        self.assertEqual(len(events), 1)
        self.assertEqual(
            events[0].changed_fields["fields"], ["display_name", "sort_order"]
        )

    def test_code_is_immutable_on_patch(self) -> None:
        created = self._create()
        method_id = created.json()["id"]
        # El schema PATCH no declara `code` y prohíbe extras (extra="forbid").
        with _As("payments:manage_methods"):
            patched = self.client.patch(
                f"/api/v1/payment-method-configs/{method_id}",
                json={"code": "otro_codigo"},
            )
        self.assertEqual(patched.status_code, 422)
        with Session(self.engine) as session:
            method = session.get(PaymentMethodConfig, uuid.UUID(method_id))
            self.assertEqual(method.code, "transferencia_bbva")

    # --- Activación / desactivación --------------------------------------

    def test_deactivate_hides_from_public_and_reactivate_restores(self) -> None:
        created = self._create(available_online=True)
        method_id = created.json()["id"]

        def public_codes() -> list[str]:
            response = self.client.get("/api/v1/payment-methods")
            return [item["code"] for item in response.json()]

        # Sin sesión el listado público es abierto; el método activo aparece.
        self.assertIn("transferencia_bbva", public_codes())

        with _As("payments:manage_methods"):
            off = self.client.patch(
                f"/api/v1/payment-method-configs/{method_id}",
                json={"is_active": False},
            )
        self.assertEqual(off.status_code, 200)
        self.assertNotIn("transferencia_bbva", public_codes())

        with _As("payments:manage_methods"):
            on = self.client.patch(
                f"/api/v1/payment-method-configs/{method_id}",
                json={"is_active": True},
            )
        self.assertEqual(on.status_code, 200)
        self.assertIn("transferencia_bbva", public_codes())


if __name__ == "__main__":
    unittest.main()
