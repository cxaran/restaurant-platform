"""Tests del storefront plano: contratos, CRUD del editor y sitio público."""

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
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

from backend.app.core.database import get_db  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.audit_event import AuditEvent  # noqa: E402
from backend.app.models.business import BusinessPhone, BusinessProfile  # noqa: E402
from backend.app.models.catalog import Product, ProductCategory  # noqa: E402
from backend.app.models.storefront import (  # noqa: E402
    StorefrontHero,
    StorefrontHighlight,
)
from backend.app.services.storefront_service import (  # noqa: E402
    get_footer_settings,
    get_storefront_settings,
    list_highlights,
    site_public_payload,
)
from backend.app.storefront.presets import THEME_PRESETS, build_tokens  # noqa: E402
from backend.app.storefront.templates import (  # noqa: E402
    TemplateValidationError,
    validate_footer,
    validate_hero,
    validate_highlight,
)
from backend.app.utils.utc_now import utc_now  # noqa: E402


def _engine():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return engine


HERO_PAYLOAD = {
    "template": "split",
    "title": "Sabor que enamora",
    "title_accent": "enamora",
    "description": "Recién hecho todos los días.",
    "primary_cta": {"label": "Ver menú", "link_type": "menu_page"},
}


class ContractValidationTest(unittest.TestCase):
    def test_valid_hero_passes(self) -> None:
        hero = validate_hero(HERO_PAYLOAD)
        self.assertEqual(hero.template, "split")

    def test_unknown_keys_are_rejected(self) -> None:
        with self.assertRaises(TemplateValidationError) as ctx:
            validate_hero({**HERO_PAYLOAD, "html": "<script>"})
        self.assertEqual(ctx.exception.code, "configuracion_invalida")

    def test_title_accent_must_be_substring(self) -> None:
        with self.assertRaises(TemplateValidationError):
            validate_hero({**HERO_PAYLOAD, "title_accent": "no-está"})

    def test_showcase_requires_product(self) -> None:
        with self.assertRaises(TemplateValidationError):
            validate_hero({**HERO_PAYLOAD, "template": "showcase"})
        validate_hero(
            {**HERO_PAYLOAD, "template": "showcase", "product_id": str(uuid.uuid4())}
        )

    def test_dangerous_links_are_rejected(self) -> None:
        bad = {
            **HERO_PAYLOAD,
            "primary_cta": {
                "label": "Click",
                "link_type": "external_https",
                "target": "javascript:alert(1)",
            },
        }
        with self.assertRaises(TemplateValidationError):
            validate_hero(bad)

    def test_external_link_must_be_https(self) -> None:
        bad = {
            **HERO_PAYLOAD,
            "secondary_cta": {
                "label": "Sitio",
                "link_type": "external_https",
                "target": "http://inseguro.com",
            },
        }
        with self.assertRaises(TemplateValidationError) as ctx:
            validate_hero(bad)
        self.assertEqual(ctx.exception.code, "enlace_invalido")

    def test_highlight_window_and_cta(self) -> None:
        validate_highlight({"surface": "cart", "title": "Te faltan $85"})
        with self.assertRaises(TemplateValidationError):
            validate_highlight(
                {
                    "surface": "cart",
                    "title": "X",
                    "starts_at": "2026-01-02T00:00:00",
                    "ends_at": "2026-01-01T00:00:00",
                }
            )
        with self.assertRaises(TemplateValidationError):
            validate_highlight({"surface": "orbita", "title": "X"})

    def test_footer_social_links_https_only(self) -> None:
        validate_footer(
            {"social_links": [{"network": "instagram", "url": "https://instagram.com/x"}]}
        )
        with self.assertRaises(TemplateValidationError):
            validate_footer(
                {"social_links": [{"network": "instagram", "url": "http://inseguro"}]}
            )
        with self.assertRaises(TemplateValidationError):
            validate_footer({"social_links": [{"network": "myspace", "url": "https://x"}]})

    def test_presets_are_brand_neutral(self) -> None:
        self.assertNotIn("tony", " ".join(THEME_PRESETS).lower())
        tokens = build_tokens("calido", accent="#123ABC")
        self.assertEqual(tokens["colors"]["accent"], "#123ABC")


class PublicSitePayloadTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = _engine()
        with Session(self.engine) as session:
            session.add(
                BusinessProfile(
                    id=1, trade_name="Tony Tony", slogan="El sabor que enamora",
                    timezone="America/Mexico_City",
                    main_address="Blvd. V. Carranza 1200, Saltillo",
                )
            )
            session.add(
                BusinessPhone(
                    label="Pedidos", phone="55 1234 5678", phone_normalized="+525512345678",
                    is_whatsapp=True, is_public=True, is_active=True,
                )
            )
            category = ProductCategory(name="Hamburguesas")
            session.add(category)
            session.flush()
            self.product_id = uuid.uuid4()
            session.add(
                Product(
                    id=self.product_id, category_id=category.id, name="Hamburguesa Tony",
                    money_price_amount=Decimal("129"), is_featured=True,
                    credits_awarded_per_unit=10,
                )
            )
            session.commit()

    def test_site_payload_contains_theme_carousel_heros_footer(self) -> None:
        with Session(self.engine) as session:
            settings_row = get_storefront_settings(session)
            settings_row.theme_preset = "fresco"
            settings_row.theme_accent = "#123ABC"
            settings_row.hero_interval_seconds = 8
            session.add(settings_row)
            session.add_all(
                [
                    StorefrontHero(
                        template="split", title="Sabor que enamora",
                        title_accent="enamora", sort_order=20,
                    ),
                    StorefrontHero(
                        template="showcase", title="La favorita",
                        product_id=self.product_id, sort_order=10,
                    ),
                    StorefrontHero(template="minimal", title="Oculto", is_active=False),
                ]
            )
            session.commit()

            payload = site_public_payload(session)

            self.assertTrue(payload["enabled"])
            # Tema derivado del preset + acento (nunca CSS libre).
            self.assertEqual(payload["theme_tokens"]["colors"]["accent"], "#123ABC")
            self.assertEqual(
                payload["theme_tokens"]["colors"]["brand_primary"],
                THEME_PRESETS["fresco"]["colors"]["brand_primary"],
            )
            self.assertEqual(payload["carousel"]["interval_seconds"], 8)
            # Solo activos, en orden; el showcase resuelve el producto REAL.
            self.assertEqual(
                [hero["title"] for hero in payload["heros"]],
                ["La favorita", "Sabor que enamora"],
            )
            showcase = payload["heros"][0]
            self.assertEqual(showcase["product"]["name"], "Hamburguesa Tony")
            self.assertEqual(showcase["product"]["money_price_amount"], "129.00")
            # Footer con datos reales del negocio (Turno 11: dirección incluida).
            footer = payload["footer"]
            self.assertEqual(footer["slogan"], "El sabor que enamora")
            self.assertEqual(footer["phones"][0]["is_whatsapp"], True)
            self.assertIsNotNone(footer["schedule"])
            self.assertTrue(footer["show_links"])
            self.assertEqual(footer["address"], "Blvd. V. Carranza 1200, Saltillo")

    def test_footer_toggles_hide_business_data(self) -> None:
        with Session(self.engine) as session:
            footer = get_footer_settings(session)
            footer.show_slogan = False
            footer.show_phones = False
            footer.show_schedule = False
            footer.social_links = [
                {"network": "instagram", "url": "https://instagram.com/tony"}
            ]
            session.add(footer)
            session.commit()

            payload = site_public_payload(session)["footer"]
            self.assertIsNone(payload["slogan"])
            self.assertEqual(payload["phones"], [])
            self.assertIsNone(payload["schedule"])
            self.assertEqual(payload["social_links"][0]["network"], "instagram")

    def test_footer_note_overrides_slogan(self) -> None:
        with Session(self.engine) as session:
            footer = get_footer_settings(session)
            footer.note = "Hecho en casa desde 1990"
            session.add(footer)
            session.commit()
            self.assertEqual(
                site_public_payload(session)["footer"]["slogan"],
                "Hecho en casa desde 1990",
            )

    def test_highlights_filter_by_surface_window_and_active(self) -> None:
        from datetime import timedelta

        with Session(self.engine) as session:
            now = utc_now()
            session.add_all(
                [
                    StorefrontHighlight(surface="cart", title="Vigente"),
                    StorefrontHighlight(surface="cart", title="Apagado", is_active=False),
                    StorefrontHighlight(
                        surface="cart", title="Futuro", starts_at=now + timedelta(days=1)
                    ),
                    StorefrontHighlight(
                        surface="cart", title="Expirado", ends_at=now - timedelta(days=1)
                    ),
                    StorefrontHighlight(surface="login", title="Otra superficie"),
                ]
            )
            session.commit()
            visible = list_highlights(session, surface="cart", only_active=True)
            self.assertEqual([row.title for row in visible], ["Vigente"])


class EditorRoutesTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = _engine()

        def override_db():
            with Session(self.engine) as session:
                yield session

        from backend.app.auth.auth_dependencies import get_current_user
        from backend.app.schemas.user import SessionUser

        app.dependency_overrides[get_db] = override_db
        self._user = SessionUser(
            id=uuid.uuid4(), name="Ed", last_name="Itor", email="ed@example.com",
            permissions={"storefront:read", "storefront:edit", "storefront:manage_theme"},
        )
        app.dependency_overrides[get_current_user] = lambda: self._user
        self.client = TestClient(app)

        with Session(self.engine) as session:
            session.add(BusinessProfile(id=1, trade_name="Tony Tony"))
            session.commit()

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def test_openapi_exposes_new_routes_and_drops_versioned_ones(self) -> None:
        paths = self.client.get("/api/openapi.json").json()["paths"]
        for path in (
            "/api/v1/storefront/config",
            "/api/v1/storefront/heros",
            "/api/v1/storefront/highlights",
            "/api/v1/storefront/footer",
            "/api/v1/storefront/theme",
            "/api/v1/storefront/settings",
            "/api/v1/public/storefront/site",
            "/api/v1/public/storefront/highlights",
        ):
            self.assertIn(path, paths)
        # El ciclo versionado desapareció del contrato.
        for gone in (
            "/api/v1/storefront/pages/{page_key}/draft",
            "/api/v1/storefront/pages/{page_key}/publish",
            "/api/v1/storefront/pages/{page_key}/schedule",
            "/api/v1/storefront/templates",
            "/api/v1/public/storefront/{page_key}",
        ):
            self.assertNotIn(gone, paths)

    def test_editor_requires_authentication_public_does_not(self) -> None:
        app.dependency_overrides.pop(
            __import__(
                "backend.app.auth.auth_dependencies", fromlist=["get_current_user"]
            ).get_current_user,
            None,
        )
        self.assertEqual(self.client.get("/api/v1/storefront/config").status_code, 401)
        self.assertEqual(
            self.client.get("/api/v1/public/storefront/site").status_code, 200
        )

    def test_hero_crud_sort_and_public_site(self) -> None:
        created = self.client.post("/api/v1/storefront/heros", json=HERO_PAYLOAD)
        self.assertEqual(created.status_code, 201, created.text)
        hero_id = created.json()["id"]

        second = self.client.post(
            "/api/v1/storefront/heros",
            json={"template": "minimal", "title": "Abrimos hasta las 11", "sort_order": 5},
        )
        self.assertEqual(second.status_code, 201, second.text)
        second_id = second.json()["id"]

        # CTA peligroso rechazado con código estable.
        bad = self.client.post(
            "/api/v1/storefront/heros",
            json={
                **HERO_PAYLOAD,
                "primary_cta": {
                    "label": "X", "link_type": "external_https",
                    "target": "javascript:alert(1)",
                },
            },
        )
        self.assertEqual(bad.status_code, 422)

        # Reorden atómico: incompleto → 422; completo → posiciones nuevas.
        incomplete = self.client.post(
            "/api/v1/storefront/heros/sort", json={"hero_ids": [hero_id]}
        )
        self.assertEqual(incomplete.status_code, 422)
        ok = self.client.post(
            "/api/v1/storefront/heros/sort", json={"hero_ids": [hero_id, second_id]}
        )
        self.assertEqual(ok.status_code, 200, ok.text)
        self.assertEqual([item["id"] for item in ok.json()], [hero_id, second_id])

        # Actualizar y apagar el segundo: el público solo ve el primero.
        updated = self.client.put(
            f"/api/v1/storefront/heros/{second_id}",
            json={"template": "minimal", "title": "Abrimos hasta las 11", "is_active": False},
        )
        self.assertEqual(updated.status_code, 200, updated.text)

        site = self.client.get("/api/v1/public/storefront/site").json()
        self.assertEqual([hero["id"] for hero in site["heros"]], [hero_id])
        self.assertEqual(site["heros"][0]["title_accent"], "enamora")

        # Config del editor: ambas filas visibles con su estado real.
        config = self.client.get("/api/v1/storefront/config").json()
        self.assertEqual(len(config["heros"]), 2)
        self.assertEqual(len(config["theme_presets"]), len(THEME_PRESETS))

        gone = self.client.delete(f"/api/v1/storefront/heros/{second_id}")
        self.assertEqual(gone.status_code, 204)

    def test_highlight_crud_and_public_by_surface(self) -> None:
        created = self.client.post(
            "/api/v1/storefront/highlights",
            json={
                "surface": "cart", "title": "Te faltan $85 para envío gratis",
                "subtitle": "Agrega algo más", "animation": "shimmer",
                "color_scheme": "accent", "icon": "💸", "eyebrow": "Envío gratis",
            },
        )
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(created.json()["eyebrow"], "Envío gratis")
        row_id = created.json()["id"]

        public = self.client.get(
            "/api/v1/public/storefront/highlights", params={"surface": "cart"}
        ).json()
        self.assertEqual([item["id"] for item in public], [row_id])
        self.assertEqual(public[0]["animation"], "shimmer")

        empty = self.client.get(
            "/api/v1/public/storefront/highlights", params={"surface": "login"}
        ).json()
        self.assertEqual(empty, [])

        # Superficie inventada → 422 del contrato, no 500.
        invalid = self.client.get(
            "/api/v1/public/storefront/highlights", params={"surface": "orbita"}
        )
        self.assertEqual(invalid.status_code, 422)

        gone = self.client.delete(f"/api/v1/storefront/highlights/{row_id}")
        self.assertEqual(gone.status_code, 204)

    def test_footer_theme_settings_patches_and_audit(self) -> None:
        footer = self.client.patch(
            "/api/v1/storefront/footer",
            json={
                "template": "columnas",
                "color_scheme": "brand",
                "show_links": False,
                "social_links": [
                    {"network": "instagram", "url": "https://instagram.com/tony"}
                ],
            },
        )
        self.assertEqual(footer.status_code, 200, footer.text)
        self.assertEqual(footer.json()["template"], "columnas")
        self.assertEqual(footer.json()["color_scheme"], "brand")
        self.assertFalse(footer.json()["show_links"])

        bad_social = self.client.patch(
            "/api/v1/storefront/footer",
            json={"social_links": [{"network": "instagram", "url": "http://x"}]},
        )
        self.assertEqual(bad_social.status_code, 422)

        theme = self.client.patch(
            "/api/v1/storefront/theme",
            json={"theme_preset": "oscuro", "theme_accent": "#22C55E"},
        )
        self.assertEqual(theme.status_code, 200, theme.text)
        self.assertEqual(theme.json()["tokens"]["colors"]["accent"], "#22C55E")
        self.assertEqual(
            self.client.patch(
                "/api/v1/storefront/theme", json={"theme_preset": "inventado"}
            ).status_code,
            422,
        )

        settings_patch = self.client.patch(
            "/api/v1/storefront/settings",
            json={"hero_autoplay": False, "hero_interval_seconds": 9, "site_title": "Tony"},
        )
        self.assertEqual(settings_patch.status_code, 200, settings_patch.text)

        site = self.client.get("/api/v1/public/storefront/site").json()
        self.assertEqual(site["carousel"]["autoplay"], False)
        self.assertEqual(site["carousel"]["interval_seconds"], 9)
        self.assertEqual(site["meta"]["title"], "Tony")
        self.assertEqual(site["footer"]["social_links"][0]["network"], "instagram")

        # Auditoría con NOMBRES de campos (nunca valores).
        with Session(self.engine) as session:
            events = session.exec(
                select(AuditEvent).where(AuditEvent.entity_type == "storefront_settings")
            ).all()
            self.assertGreaterEqual(len(events), 2)

    def test_maintenance_mode_is_reported_not_erased(self) -> None:
        patched = self.client.patch(
            "/api/v1/storefront/settings",
            json={"storefront_enabled": False, "maintenance_message": "Volvemos pronto"},
        )
        self.assertEqual(patched.status_code, 200, patched.text)
        site = self.client.get("/api/v1/public/storefront/site").json()
        self.assertFalse(site["enabled"])
        self.assertEqual(site["maintenance_message"], "Volvemos pronto")

    def test_edit_permission_is_required(self) -> None:
        from backend.app.auth.auth_dependencies import get_current_user
        from backend.app.schemas.user import SessionUser

        app.dependency_overrides[get_current_user] = lambda: SessionUser(
            id=uuid.uuid4(), name="A", last_name="B", email="a@b.mx",
            permissions={"storefront:read"},
        )
        denied = self.client.post("/api/v1/storefront/heros", json=HERO_PAYLOAD)
        self.assertEqual(denied.status_code, 403)
        denied_theme = self.client.patch(
            "/api/v1/storefront/theme", json={"theme_preset": "fresco"}
        )
        self.assertEqual(denied_theme.status_code, 403)


if __name__ == "__main__":
    unittest.main()
