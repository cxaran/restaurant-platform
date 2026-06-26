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

from fastapi.testclient import TestClient  # noqa: E402

from backend.app.auth.auth_dependencies import get_current_user  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.resources.registry import ROLES, USERS  # noqa: E402
from backend.app.schemas.user import SessionUser  # noqa: E402


client = TestClient(app)


def session_user(*permissions: str) -> SessionUser:
    return SessionUser(
        id=uuid.uuid4(),
        name="Tester",
        last_name="Apellido",
        email="tester@example.com",
        permissions=set(permissions),
    )


class _As:
    def __init__(self, *permissions: str) -> None:
        self.permissions = permissions

    def __enter__(self) -> None:
        app.dependency_overrides[get_current_user] = lambda: session_user(*self.permissions)

    def __exit__(self, *exc: object) -> None:
        app.dependency_overrides.pop(get_current_user, None)


class ResourceFiltersTest(unittest.TestCase):
    def _capability(self, resource: str, *permissions: str) -> dict:
        with _As(*permissions):
            response = client.get(f"/api/v1/resources/{resource}")
        self.assertEqual(response.status_code, 200)
        return response.json()

    def test_users_publishes_only_is_active_filter(self) -> None:
        filters = self._capability("users", "users:read")["list"]["filters"]
        self.assertEqual([f["field"] for f in filters], ["is_active"])

    def test_roles_publishes_only_is_active_filter(self) -> None:
        filters = self._capability("roles", "roles:read")["list"]["filters"]
        self.assertEqual([f["field"] for f in filters], ["is_active"])

    def test_filter_shape_is_complete(self) -> None:
        flt = self._capability("users", "users:read")["list"]["filters"][0]
        self.assertEqual(flt["parameter"], "is_active")
        self.assertEqual(flt["operator"], "eq")
        self.assertEqual(flt["label"], "Estado")
        self.assertEqual(flt["type"], "boolean")
        self.assertEqual(flt["widget"], "select")
        self.assertEqual(
            flt["options"],
            [
                {"value": "true", "label": "Activos"},
                {"value": "false", "label": "Inactivos"},
            ],
        )

    def test_options_have_explicit_labels(self) -> None:
        flt = self._capability("roles", "roles:read")["list"]["filters"][0]
        for option in flt["options"]:
            self.assertTrue(option["label"].strip())
            self.assertTrue(option["value"])

    def test_email_is_not_a_filter(self) -> None:
        filters = self._capability("users", "users:read")["list"]["filters"]
        self.assertNotIn("email", [f["field"] for f in filters])

    def test_parameter_exists_in_query_schema(self) -> None:
        users = self._capability("users", "users:read")["list"]
        roles = self._capability("roles", "roles:read")["list"]
        for parameter in (f["parameter"] for f in users["filters"]):
            self.assertIn(parameter, USERS.Query.model_fields)
        for parameter in (f["parameter"] for f in roles["filters"]):
            self.assertIn(parameter, ROLES.Query.model_fields)

    def test_filter_operator_is_within_field_operators(self) -> None:
        cap = self._capability("users", "users:read")["list"]
        field_ops = {field["name"]: field["filter_operators"] for field in cap["fields"]}
        for flt in cap["filters"]:
            self.assertIn(flt["operator"], field_ops[flt["field"]])

    def test_visible_as_filter_absent_from_payload(self) -> None:
        blob = self._capability("users", "users:read")
        self.assertNotIn("visible_as_filter", str(blob))

    def test_permission_filtering_preserved(self) -> None:
        with _As("users:read"):
            names = [r["name"] for r in client.get("/api/v1/resources").json()]
        self.assertEqual(names, ["users"])


class FiltersOpenApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.openapi = client.get("/api/openapi.json").json()

    def test_filter_schemas_present(self) -> None:
        schemas = self.openapi["components"]["schemas"]
        self.assertIn("ResourceFilterCapability", schemas)
        self.assertIn("ResourceFilterOption", schemas)

    def test_widget_type_includes_select(self) -> None:
        widget = self.openapi["components"]["schemas"]["WidgetType"]
        self.assertIn("select", widget["enum"])

    def test_visible_as_filter_absent_from_openapi(self) -> None:
        field_schema = self.openapi["components"]["schemas"]["ResourceFieldCapability"]
        self.assertNotIn("visible_as_filter", field_schema["properties"])


if __name__ == "__main__":
    unittest.main()
