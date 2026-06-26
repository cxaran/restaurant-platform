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
)

from sqlalchemy import create_engine  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

from backend.app.models import Base  # noqa: E402
from backend.app.models.setup import PlatformSetup  # noqa: E402
from backend.app.models.user import Role, RoleAccess, User, UserRole  # noqa: E402
from backend.app.security.admin_survival import (  # noqa: E402
    AdminCoverageError,
    assert_admin_survival,
    effective_coverage,
    has_full_admin_coverage,
)
from backend.app.security.catalog import declared_permissions  # noqa: E402


class AdminSurvivalTest(unittest.TestCase):
    def _engine(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        return engine

    def _seed_admin(
        self,
        session: Session,
        *,
        email: str = "admin@example.com",
        permissions: set[str] | None = None,
        set_as_system_role: bool = True,
    ) -> tuple[User, Role]:
        permissions = permissions if permissions is not None else declared_permissions()
        role = Role(name=f"Admin {email}", is_active=True)
        session.add(role)
        session.flush()
        for permission in sorted(permissions):
            session.add(RoleAccess(role_id=role.id, access=permission, is_active=True))
        user = User(
            name="Admin",
            last_name="Platform",
            email=email,
            is_active=True,
            hashed_password="hash",
            token="token",
        )
        session.add(user)
        session.flush()
        session.add(UserRole(user_id=user.id, role_id=role.id))
        if set_as_system_role:
            session.add(PlatformSetup(id=1, status="completed", system_admin_role_id=role.id))
        session.flush()
        return user, role

    def test_effective_coverage_matches_active_grants(self) -> None:
        engine = self._engine()
        with Session(engine) as session:
            user, _ = self._seed_admin(session)
            self.assertEqual(effective_coverage(session, user.id), declared_permissions())

    def test_valid_install_survives(self) -> None:
        engine = self._engine()
        with Session(engine) as session:
            self._seed_admin(session)
            assert_admin_survival(session)  # no raise

    def test_deactivating_only_admin_user_breaks_survival(self) -> None:
        engine = self._engine()
        with Session(engine) as session:
            user, _ = self._seed_admin(session)
            user.is_active = False
            session.flush()
            with self.assertRaises(AdminCoverageError):
                assert_admin_survival(session)

    def test_deactivating_system_admin_role_breaks_survival(self) -> None:
        engine = self._engine()
        with Session(engine) as session:
            _, role = self._seed_admin(session)
            role.is_active = False
            session.flush()
            with self.assertRaises(AdminCoverageError):
                assert_admin_survival(session)

    def test_removing_a_permission_from_system_role_breaks_survival(self) -> None:
        engine = self._engine()
        with Session(engine) as session:
            _, role = self._seed_admin(session)
            # Eliminar un permiso del rol fundacional rompe su cobertura completa.
            row = session.exec(
                select(RoleAccess).where(RoleAccess.role_id == role.id)
            ).first()
            session.delete(row)
            session.flush()
            with self.assertRaises(AdminCoverageError):
                assert_admin_survival(session)

    def test_second_admin_preserves_survival_when_first_is_removed(self) -> None:
        engine = self._engine()
        with Session(engine) as session:
            # El segundo admin reutiliza el mismo rol fundacional como respaldo.
            first, role = self._seed_admin(session)
            second = User(
                name="Backup",
                last_name="Admin",
                email="backup@example.com",
                is_active=True,
                hashed_password="hash",
                token="token2",
            )
            session.add(second)
            session.flush()
            session.add(UserRole(user_id=second.id, role_id=role.id))
            session.flush()

            first.is_active = False
            session.flush()
            assert_admin_survival(session)  # backup admin sostiene la cobertura

    def test_has_full_admin_coverage_false_with_partial_user(self) -> None:
        engine = self._engine()
        with Session(engine) as session:
            self._seed_admin(
                session,
                permissions={"users:read"},
                set_as_system_role=False,
            )
            self.assertFalse(has_full_admin_coverage(session, declared_permissions()))


if __name__ == "__main__":
    unittest.main()
