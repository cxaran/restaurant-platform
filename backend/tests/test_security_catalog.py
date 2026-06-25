import os
import unittest


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

from backend.app.security.catalog import SECURITY_GROUPS  # noqa: E402
from backend.app.security.groups.permissions import PermissionPermissions  # noqa: E402
from backend.app.security.groups.roles import RolePermissions  # noqa: E402
from backend.app.security.groups.users import UserPermissions  # noqa: E402
from backend.app.security.security_control import SecurityControl  # noqa: E402


class SecurityCatalogTest(unittest.TestCase):
    def test_catalog_exposes_expected_groups(self) -> None:
        self.assertEqual(
            SECURITY_GROUPS,
            [UserPermissions, RolePermissions, PermissionPermissions],
        )

    def test_catalog_exposes_expected_permissions(self) -> None:
        permissions = [permission.permission for group in SECURITY_GROUPS for permission in group]

        self.assertEqual(
            permissions,
            [
                "users:read",
                "users:create",
                "users:update",
                "users:delete",
                "users:manage_roles",
                "users:revoke_sessions",
                "roles:read",
                "roles:create",
                "roles:update",
                "roles:delete",
                "roles:manage_permissions",
                "permissions:read",
            ],
        )

    def test_catalog_permissions_are_unique(self) -> None:
        permissions = [permission.permission for group in SECURITY_GROUPS for permission in group]

        self.assertEqual(len(permissions), len(set(permissions)))

    def test_permission_members_expose_control_and_description(self) -> None:
        permission = UserPermissions.READ

        self.assertIsInstance(permission.access, SecurityControl)
        self.assertEqual(permission.permission, "users:read")
        self.assertEqual(permission.description, "Listar usuarios")
        self.assertTrue(callable(permission.check))
        self.assertIsNotNone(permission.requiere)


if __name__ == "__main__":
    unittest.main()
