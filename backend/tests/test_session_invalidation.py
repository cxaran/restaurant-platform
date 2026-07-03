import os
import unittest

os.environ.update(
    {
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
)

from sqlalchemy import create_engine  # noqa: E402
from sqlmodel import Session  # noqa: E402

from backend.app.models import Base  # noqa: E402
from backend.app.models.user import Role, User, UserRole  # noqa: E402
from backend.app.security.session_invalidation import (  # noqa: E402
    invalidate_role_members_sessions,
    invalidate_user_sessions,
)


def _make_user(session: Session, email: str) -> User:
    user = User(
        name="User",
        last_name="Test",
        email=email,
        is_active=True,
        hashed_password="hash",
        token="initial-token",
    )
    session.add(user)
    session.flush()
    return user


class SessionInvalidationTest(unittest.TestCase):
    def _engine(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        return engine

    def test_user_token_rotates(self) -> None:
        engine = self._engine()
        with Session(engine) as session:
            user = _make_user(session, "u@example.com")
            previous = user.token
            actor = _make_user(session, "actor@example.com")
            invalidate_user_sessions(user, actor_id=actor.id)
            self.assertNotEqual(user.token, previous)
            self.assertIsNotNone(user.token)
            self.assertEqual(user.updated_by, actor.id)

    def test_role_members_tokens_rotate_only_for_active_members(self) -> None:
        engine = self._engine()
        with Session(engine) as session:
            role = Role(name="Editor", is_active=True)
            session.add(role)
            session.flush()

            member = _make_user(session, "member@example.com")
            inactive = _make_user(session, "inactive@example.com")
            inactive.is_active = False
            outsider = _make_user(session, "outsider@example.com")
            session.add(UserRole(user_id=member.id, role_id=role.id))
            session.add(UserRole(user_id=inactive.id, role_id=role.id))
            session.flush()

            member_before = member.token
            outsider_before = outsider.token

            affected = invalidate_role_members_sessions(session, role.id)

            self.assertEqual([u.id for u in affected], [member.id])
            self.assertNotEqual(member.token, member_before)
            self.assertEqual(outsider.token, outsider_before)

    def test_no_internal_commit(self) -> None:
        engine = self._engine()
        with Session(engine) as session:
            user = _make_user(session, "rollback@example.com")
            session.commit()
            previous = user.token
            invalidate_user_sessions(user)
            session.rollback()
            session.refresh(user)
            # Sin commit interno: el rollback del llamador descarta la rotación.
            self.assertEqual(user.token, previous)


if __name__ == "__main__":
    unittest.main()
