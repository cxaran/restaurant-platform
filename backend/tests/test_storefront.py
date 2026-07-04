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
from sqlmodel import Session, select  # noqa: E402

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


class Phase1Test(unittest.TestCase):
    """Fase 1 restante: páginas, media por slot, reorder atómico, layout, schemas."""

    def setUp(self) -> None:
        self.engine = _engine()

        def override_db():
            with Session(self.engine) as session:
                yield session

        from backend.app.auth.auth_dependencies import get_current_user
        from backend.app.core.database import get_db
        from backend.app.schemas.user import SessionUser

        app.dependency_overrides[get_db] = override_db
        self._user = SessionUser(
            id=uuid.uuid4(), name="Ed", last_name="Itor", email="ed@example.com",
            permissions={
                "storefront:read_draft", "storefront:edit", "storefront:manage_media",
                "storefront:publish", "storefront:preview", "storefront:manage_navigation",
            },
        )
        app.dependency_overrides[get_current_user] = lambda: self._user
        self.client = TestClient(app)

        with Session(self.engine) as session:
            session.add(StorefrontPage(page_key="home", slug="/", page_type="storefront_home",
                                       is_system_page=True))
            from backend.app.models.stored_file import StoredFile

            self.image_id = uuid.uuid4()
            session.add(
                StoredFile(
                    id=self.image_id, kind="image", mime_type="image/png",
                    original_filename="hero.png", byte_size=10,
                    sha256="a" * 64, file_content=b"x",
                )
            )
            session.commit()

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def test_pages_listing_media_reorder_and_layout(self) -> None:
        # Listado real de páginas (sin listas sembradas en frontend).
        pages = self.client.get("/api/v1/storefront/pages").json()
        self.assertEqual([p["page_key"] for p in pages], ["home"])
        self.assertFalse(pages[0]["has_draft"])

        # Borrador con dos secciones.
        for key, order in (("storefront.hero", 20), ("storefront.banner.credits", 10)):
            content = (
                HERO_CONTENT if key == "storefront.hero" else {"title": "Gana créditos"}
            )
            created = self.client.post(
                "/api/v1/storefront/pages/home/draft/sections",
                json={"template_key": key, "sort_order": order, "content_config": content},
            )
            self.assertEqual(created.status_code, 201, created.text)
        draft = self.client.get("/api/v1/storefront/pages/home/draft").json()
        ids = [s["id"] for s in draft["sections"]]  # ordenados por sort_order

        # Reorden ATÓMICO: set incompleto → 422; completo → posiciones nuevas.
        bad = self.client.post(
            "/api/v1/storefront/pages/home/draft/sections/sort",
            json={"section_ids": [ids[0]]},
        )
        self.assertEqual(bad.status_code, 422)
        ok = self.client.post(
            "/api/v1/storefront/pages/home/draft/sections/sort",
            json={"section_ids": [ids[1], ids[0]]},
        )
        self.assertEqual(ok.status_code, 200, ok.text)
        self.assertEqual([s["id"] for s in ok.json()], [ids[1], ids[0]])

        # Media por slot: sólo imágenes activas; queda en preview y se clona.
        hero_id = ids[1]  # el hero quedó primero tras el reorden
        media = self.client.put(
            f"/api/v1/storefront/sections/{hero_id}/media/main",
            json={"desktop_file_id": str(self.image_id), "alt_text": "Boneless"},
        )
        self.assertEqual(media.status_code, 200, media.text)
        self.assertEqual(media.json()["main"]["desktop_file_id"], str(self.image_id))
        preview = self.client.get("/api/v1/storefront/pages/home/preview").json()
        hero_preview = next(s for s in preview["sections"] if s["template_key"] == "storefront.hero")
        self.assertIn("main", hero_preview["media"])

        # Publicar → payload público incluye media y el binding del banner delivery.
        published = self.client.post("/api/v1/storefront/pages/home/publish")
        self.assertEqual(published.status_code, 200, published.text)
        with Session(self.engine) as session:
            from backend.app.models.business import BusinessSettings

            session.add(BusinessSettings(id=1))
            session.commit()
        public = self.client.get("/api/v1/public/storefront/home").json()
        hero_public = next(s for s in public["sections"] if s["template_key"] == "storefront.hero")
        self.assertEqual(hero_public["media"]["main"]["desktop_file_id"], str(self.image_id))

        # El siguiente borrador CLONA la media publicada.
        cloned = self.client.get("/api/v1/storefront/pages/home/draft").json()
        self.assertEqual(cloned["revision_number"], 2)
        cloned_hero = next(
            s for s in self.client.get("/api/v1/storefront/pages/home/preview").json()["sections"]
            if s["template_key"] == "storefront.hero"
        )
        self.assertIn("main", cloned_hero["media"])

        # Layout: CTA peligroso rechazado; válido publica y sale en público.
        bad_layout = self.client.put(
            "/api/v1/storefront/layout",
            json={"header_config": {"nav_links": [
                {"label": "X", "link_type": "external_https", "target": "javascript:alert(1)"}
            ]}},
        )
        self.assertEqual(bad_layout.status_code, 422)
        good_layout = self.client.put(
            "/api/v1/storefront/layout",
            json={
                "header_config": {"nav_links": [{"label": "Menú", "link_type": "menu_page"}]},
                "footer_config": {"note": "Hecho en casa"},
            },
        )
        self.assertEqual(good_layout.status_code, 200, good_layout.text)
        public2 = self.client.get("/api/v1/public/storefront/home").json()
        self.assertEqual(
            public2["layout"]["header"]["nav_links"][0]["label"], "Menú"
        )

    def test_templates_expose_json_schema_and_new_templates(self) -> None:
        templates = self.client.get("/api/v1/storefront/templates").json()
        keys = {t["key"] for t in templates}
        for expected in (
            "storefront.catalog.categories",
            "storefront.banner.credits",
            "storefront.banner.delivery",
        ):
            self.assertIn(expected, keys)
        hero = next(t for t in templates if t["key"] == "storefront.hero")
        self.assertIn("properties", hero["content_schema"])
        self.assertIn("slides", hero["content_schema"]["properties"])


class ScheduledPublishTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = _engine()
        with Session(self.engine) as session:
            session.add(StorefrontPage(page_key="home", slug="/", page_type="storefront_home"))
            session.commit()

    def test_schedule_validates_and_tick_publishes_due(self) -> None:
        from datetime import timedelta

        from backend.app.services.storefront_service import (
            get_or_create_draft,
            publish_due_scheduled,
            schedule_draft,
        )
        from backend.app.utils.utc_now import utc_now

        with Session(self.engine) as session:
            page = session.exec(select(StorefrontPage)).one()
            draft = get_or_create_draft(session, page, created_by=None)
            session.add(
                StorefrontPageSection(
                    page_revision_id=draft.id, template_key="storefront.hero",
                    template_version=1, sort_order=10, content_config=HERO_CONTENT,
                )
            )
            session.flush()
            session.refresh(draft)

            # Fecha pasada -> rechazada; futura -> queda scheduled.
            with self.assertRaises(StorefrontRuleError):
                schedule_draft(session, page, publish_at=utc_now() - timedelta(minutes=1),
                               actor_id=None)
            scheduled = schedule_draft(
                session, page, publish_at=utc_now() + timedelta(minutes=5), actor_id=None
            )
            session.commit()
            self.assertEqual(scheduled.status, "scheduled")

            # Aún no vence: el tick no publica nada.
            self.assertEqual(publish_due_scheduled(session), 0)

            # Vencida: el tick la publica y el puntero de la página apunta a ella.
            scheduled.scheduled_publish_at = utc_now() - timedelta(seconds=1)
            session.add(scheduled)
            session.flush()
            self.assertEqual(publish_due_scheduled(session), 1)
            session.commit()
            session.refresh(page)
            self.assertEqual(page.published_revision_id, scheduled.id)
            self.assertEqual(scheduled.status, "published")


class LayoutSchemaExposureTest(unittest.TestCase):
    def test_layout_endpoint_exposes_contract_schemas(self) -> None:
        engine = _engine()

        def override_db():
            with Session(engine) as session:
                yield session

        from backend.app.auth.auth_dependencies import get_current_user
        from backend.app.core.database import get_db
        from backend.app.schemas.user import SessionUser

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = lambda: SessionUser(
            id=uuid.uuid4(), name="A", last_name="B", email="a@b.mx",
            permissions={"storefront:read_draft"},
        )
        try:
            client = TestClient(app)
            body = client.get("/api/v1/storefront/layout").json()
            self.assertIn("nav_links", body["header_schema"]["properties"])
            self.assertIn("note", body["footer_schema"]["properties"])
        finally:
            app.dependency_overrides.clear()
