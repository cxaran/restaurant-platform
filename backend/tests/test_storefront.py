"""Tests de la etapa 9: plantillas, publicación/rollback y sitio público."""

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
from sqlmodel import Session  # noqa: E402

from backend.app.core.database import get_db  # noqa: E402
from backend.app.main import app  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.business import BusinessSettings  # noqa: E402
from backend.app.models.catalog import Product, ProductCategory  # noqa: E402
from backend.app.models.storefront import StorefrontPage  # noqa: E402
from backend.app.services.storefront_service import (  # noqa: E402
    StorefrontRuleError,
    get_or_create_draft,
    public_page_payload,
    publish_revision,
)
from backend.app.models.storefront import StorefrontPageSection  # noqa: E402
from backend.app.storefront.presets import THEME_PRESETS, build_tokens  # noqa: E402
from backend.app.storefront.templates import (  # noqa: E402
    TemplateValidationError,
    validate_section_configs,
)


def _engine():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return engine


HERO_CONTENT = {
    "slides": [
        {
            "variant": "split",
            "title": "Sabor que te hace volver",
            "description": "Recién hecho todos los días.",
            "primary_cta": {"label": "Ver menú", "link_type": "menu_page"},
        }
    ]
}


class TemplateValidationTest(unittest.TestCase):
    def test_valid_hero_passes(self) -> None:
        validate_section_configs(
            "storefront.hero", 1,
            content=HERO_CONTENT, style={"height": "compact"},
            data_binding={}, behavior={"show_on_mobile": True},
        )

    def test_unknown_template_and_version(self) -> None:
        with self.assertRaises(TemplateValidationError) as ctx:
            validate_section_configs(
                "storefront.inventada", 1, content={}, style={}, data_binding={}, behavior={}
            )
        self.assertEqual(ctx.exception.code, "plantilla_desconocida")

        with self.assertRaises(TemplateValidationError) as ctx:
            validate_section_configs(
                "storefront.hero", 99, content=HERO_CONTENT, style={},
                data_binding={}, behavior={},
            )
        self.assertEqual(ctx.exception.code, "plantilla_version_incompatible")

    def test_unknown_keys_are_rejected(self) -> None:
        with self.assertRaises(TemplateValidationError) as ctx:
            validate_section_configs(
                "storefront.hero", 1,
                content={**HERO_CONTENT, "html": "<script>"},
                style={}, data_binding={}, behavior={},
            )
        self.assertEqual(ctx.exception.code, "configuracion_invalida")

    def test_dangerous_links_are_rejected(self) -> None:
        bad = {
            "slides": [
                {
                    "title": "X",
                    "primary_cta": {
                        "label": "Click",
                        "link_type": "external_https",
                        "target": "javascript:alert(1)",
                    },
                }
            ]
        }
        with self.assertRaises(TemplateValidationError):
            validate_section_configs(
                "storefront.hero", 1, content=bad, style={}, data_binding={}, behavior={}
            )

    def test_external_link_must_be_https(self) -> None:
        bad = {
            "slides": [
                {
                    "title": "X",
                    "primary_cta": {
                        "label": "Sitio",
                        "link_type": "external_https",
                        "target": "http://inseguro.com",
                    },
                }
            ]
        }
        with self.assertRaises(TemplateValidationError) as ctx:
            validate_section_configs(
                "storefront.hero", 1, content=bad, style={}, data_binding={}, behavior={}
            )
        self.assertEqual(ctx.exception.code, "enlace_invalido")

    def test_presets_are_brand_neutral(self) -> None:
        self.assertNotIn("tony", " ".join(THEME_PRESETS).lower())
        tokens = build_tokens("calido", accent="#123ABC")
        self.assertEqual(tokens["colors"]["accent"], "#123ABC")


class PublishFlowTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = _engine()
        with Session(self.engine) as session:
            session.add(BusinessSettings(id=1, free_shipping_global_from_amount=Decimal("350")))
            page = StorefrontPage(page_key="home", slug="/", page_type="storefront_home",
                                  is_system_page=True)
            session.add(page)
            category = ProductCategory(name="Boneless")
            session.add(category)
            session.flush()
            session.add(
                Product(
                    id=uuid.uuid4(), category_id=category.id, name="Orden de boneless",
                    money_price_amount=Decimal("230"), is_featured=True,
                    credits_awarded_per_unit=20,
                )
            )
            session.commit()
            self.page_id = page.id

    def test_draft_publish_edit_rollback_cycle(self) -> None:
        with Session(self.engine) as session:
            page = session.get(StorefrontPage, self.page_id)
            assert page is not None

            # v1: hero + productos destacados + barra de envío gratis.
            draft1 = get_or_create_draft(session, page, created_by=None)
            session.add_all(
                [
                    StorefrontPageSection(
                        page_revision_id=draft1.id, template_key="storefront.hero",
                        template_version=1, sort_order=10, content_config=HERO_CONTENT,
                    ),
                    StorefrontPageSection(
                        page_revision_id=draft1.id,
                        template_key="storefront.announcement.free_shipping",
                        template_version=1, sort_order=5,
                    ),
                    StorefrontPageSection(
                        page_revision_id=draft1.id,
                        template_key="storefront.catalog.featured_products",
                        template_version=1, sort_order=20,
                        data_binding_config={"source": "featured_products", "max_items": 4},
                    ),
                ]
            )
            session.flush()
            session.refresh(draft1)
            publish_revision(session, page, draft1, actor_id=None)
            session.commit()
            self.assertEqual(page.published_revision_id, draft1.id)

            payload = public_page_payload(session, "home")
            keys = [s["template_key"] for s in payload["sections"]]
            self.assertEqual(
                keys,
                [
                    "storefront.announcement.free_shipping",
                    "storefront.hero",
                    "storefront.catalog.featured_products",
                ],
            )
            # Data bindings REALES (§51): umbral de envío y catálogo vigente.
            self.assertEqual(
                payload["sections"][0]["data"]["free_shipping_from_amount"], "350.00"
            )
            products = payload["sections"][2]["data"]["products"]
            self.assertEqual(products[0]["name"], "Orden de boneless")

            # v2: el borrador CLONA la publicada; publicar archiva la anterior.
            draft2 = get_or_create_draft(session, page, created_by=None)
            self.assertEqual(draft2.revision_number, 2)
            self.assertEqual(len(draft2.sections), 3)  # clonadas
            for section in draft2.sections:
                if section.template_key == "storefront.hero":
                    session.delete(section)
            session.flush()
            session.refresh(draft2)
            publish_revision(session, page, draft2, actor_id=None)
            session.commit()
            session.refresh(draft1)
            self.assertEqual(draft1.status, "archived")
            self.assertEqual(
                len(public_page_payload(session, "home")["sections"]), 2
            )

            # Rollback (§48): re-publicar la v1 archivada, nada se sobrescribió.
            publish_revision(session, page, draft1, actor_id=None)
            session.commit()
            self.assertEqual(page.published_revision_id, draft1.id)
            self.assertEqual(
                len(public_page_payload(session, "home")["sections"]), 3
            )

    def test_publish_validates_all_sections(self) -> None:
        with Session(self.engine) as session:
            page = session.get(StorefrontPage, self.page_id)
            assert page is not None
            draft = get_or_create_draft(session, page, created_by=None)
            session.add(
                StorefrontPageSection(
                    page_revision_id=draft.id, template_key="storefront.hero",
                    template_version=1, sort_order=10,
                    content_config={"slides": []},  # inválido: min_length=1
                )
            )
            session.flush()
            session.refresh(draft)
            with self.assertRaises(StorefrontRuleError):
                publish_revision(session, page, draft, actor_id=None)

    def test_unpublished_page_is_not_public(self) -> None:
        with Session(self.engine) as session:
            with self.assertRaises(StorefrontRuleError) as ctx:
                public_page_payload(session, "home")
            self.assertEqual(ctx.exception.code, "pagina_no_publicada")


class StorefrontRoutesTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = _engine()

        def override_db():
            with Session(self.engine) as session:
                yield session

        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def test_openapi_exposes_storefront_routes(self) -> None:
        paths = self.client.get("/api/openapi.json").json()["paths"]
        for path in (
            "/api/v1/storefront/templates",
            "/api/v1/storefront/theme-presets",
            "/api/v1/storefront/pages/{page_key}/draft",
            "/api/v1/storefront/pages/{page_key}/publish",
            "/api/v1/public/storefront/{page_key}",
        ):
            self.assertIn(path, paths)

    def test_editor_requires_authentication_public_does_not(self) -> None:
        self.assertEqual(self.client.get("/api/v1/storefront/templates").status_code, 401)
        # Público: página inexistente/no publicada → 404, no 401.
        response = self.client.get("/api/v1/public/storefront/home")
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
