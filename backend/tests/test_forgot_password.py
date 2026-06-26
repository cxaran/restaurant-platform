import os
import unittest
from datetime import datetime
from unittest.mock import patch

from pydantic import SecretStr
from sqlalchemy import create_engine
from sqlmodel import Session


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
    "SMTP_FROM_NAME": "Platform Core Test",
    "SMTP_TLS": "false",
    "SMTP_SSL": "false",
    "SMTP_USE_CREDENTIALS": "false",
    "POSTGRES_USER": "platform",
    "POSTGRES_PASSWORD": "platform",
    "POSTGRES_SERVER": "postgres",
    "POSTGRES_PORT": "5432",
    "POSTGRES_DB": "platform_core",
}

os.environ.update(DEV_ENV)

from backend.app.auth import forgot_password  # noqa: E402
from backend.app.auth.security import get_password_hash, verify_password  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.user import User  # noqa: E402


class ForgotPasswordTest(unittest.TestCase):
    def _engine(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        return engine

    def test_get_password_reset_user_rejects_invalid_uuid_subject(self) -> None:
        engine = self._engine()
        with Session(engine) as session:
            with patch.object(forgot_password, "get_subject", return_value="not-a-uuid"):
                self.assertIsNone(forgot_password.get_password_reset_user(session, "token"))

    def test_reset_password_rotates_token_unlocks_user_and_deletes_reset_token(self) -> None:
        engine = self._engine()
        old_password = SecretStr("old-password-123")
        new_password = SecretStr("new-password-123")
        with Session(engine) as session:
            user = User(
                name="Admin",
                last_name="Platform",
                email="admin@example.com",
                is_active=True,
                hashed_password=get_password_hash(old_password),
                token="old-version",
                locked_until=datetime(2026, 1, 1),
            )
            session.add(user)
            session.commit()
            session.refresh(user)
            user_id = str(user.id)

            with (
                patch.object(forgot_password, "get_subject", return_value=user_id),
                patch.object(forgot_password, "generate_token", return_value="new-version"),
                patch.object(forgot_password, "delete_token_pair") as delete_token_pair,
            ):
                updated = forgot_password.reset_password(
                    session,
                    "admin@example.com",
                    "reset-token",
                    new_password,
                )

            self.assertIsNotNone(updated)
            self.assertEqual(updated.token, "new-version")
            self.assertIsNone(updated.locked_until)
            self.assertTrue(verify_password(new_password, updated.hashed_password))
            delete_token_pair.assert_called_once_with(
                forgot_password.PASSWORD_RESET_TOKEN_KEY, user_id, "reset-token"
            )


if __name__ == "__main__":
    unittest.main()
