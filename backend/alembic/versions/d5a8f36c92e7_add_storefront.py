"""Etapa 9 del dominio restaurante: storefront versionado.

Las 7 tablas del módulo (§54): settings singleton con metadatos del sitio,
tema y layout versionados, páginas lógicas con revisiones borrador/publicada,
secciones por plantilla (configs JSONB validadas en código) y media por slot.

Seed: páginas de sistema (§41), tema inicial desde el preset NEUTRO por
defecto (§58.4 — ningún preset de marca), layout publicado y settings.

Revision ID: d5a8f36c92e7
Revises: c9f4a58e17d2
Create Date: 2026-07-03
"""
import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

# revision identifiers, used by Alembic.
revision: str = "d5a8f36c92e7"
down_revision: Union[str, Sequence[str], None] = "c9f4a58e17d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_STATUS_CHECK = "status IN ('draft', 'scheduled', 'published', 'archived')"

_SYSTEM_PAGES = (
    ("home", "/", "storefront_home"),
    ("menu", "/menu", "catalog"),
    ("cart", "/cart", "cart"),
    ("checkout", "/checkout", "checkout"),
    ("orders", "/orders", "orders"),
    ("account", "/account", "account"),
    ("credits", "/credits", "loyalty"),
)


def _audit_columns() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    ]


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "storefront_theme_revisions",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("theme_name", sa.String(length=120), nullable=False),
        sa.Column("tokens_json", sa.JSON(), nullable=False),
        sa.Column("created_by", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("published_by", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        *_audit_columns(),
        sa.CheckConstraint(_STATUS_CHECK, name="storefront_theme_revisions_status"),
        sa.ForeignKeyConstraint(["created_by"], ["user.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["published_by"], ["user.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_storefront_theme_revisions")),
    )

    op.create_table(
        "storefront_layout_revisions",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("header_template_key", sa.String(length=120), nullable=False),
        sa.Column("header_config", sa.JSON(), nullable=False),
        sa.Column("footer_template_key", sa.String(length=120), nullable=False),
        sa.Column("footer_config", sa.JSON(), nullable=False),
        sa.Column("created_by", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("published_by", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        *_audit_columns(),
        sa.CheckConstraint(_STATUS_CHECK, name="storefront_layout_revisions_status"),
        sa.ForeignKeyConstraint(["created_by"], ["user.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["published_by"], ["user.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_storefront_layout_revisions")),
    )

    op.create_table(
        "storefront_settings",
        sa.Column("id", sa.SmallInteger(), nullable=False),
        sa.Column("active_theme_revision_id", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("active_layout_revision_id", PG_UUID(as_uuid=True), nullable=True),
        sa.Column(
            "storefront_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column("maintenance_message", sa.Text(), nullable=True),
        sa.Column("site_title", sa.String(length=120), nullable=True),
        sa.Column("site_description", sa.String(length=300), nullable=True),
        sa.Column("favicon_file_id", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("social_image_file_id", PG_UUID(as_uuid=True), nullable=True),
        *_audit_columns(),
        sa.CheckConstraint("id = 1", name="storefront_settings_singleton"),
        sa.ForeignKeyConstraint(
            ["active_theme_revision_id"], ["storefront_theme_revisions.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["active_layout_revision_id"], ["storefront_layout_revisions.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(["favicon_file_id"], ["stored_files.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["social_image_file_id"], ["stored_files.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_storefront_settings")),
    )

    op.create_table(
        "storefront_pages",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("page_key", sa.String(length=80), nullable=False),
        sa.Column("slug", sa.String(length=180), nullable=False),
        sa.Column("page_type", sa.String(length=40), nullable=False),
        sa.Column(
            "is_system_page", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("published_revision_id", PG_UUID(as_uuid=True), nullable=True),
        *_audit_columns(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_storefront_pages")),
        sa.UniqueConstraint("page_key", name=op.f("uq_storefront_pages_page_key")),
        sa.UniqueConstraint("slug", name=op.f("uq_storefront_pages_slug")),
    )

    op.create_table(
        "storefront_page_revisions",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("page_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("revision_number", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("page_title", sa.String(length=180), nullable=True),
        sa.Column("meta_description", sa.String(length=300), nullable=True),
        sa.Column("og_image_file_id", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("created_by", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("published_by", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("scheduled_publish_at", sa.DateTime(timezone=True), nullable=True),
        *_audit_columns(),
        sa.CheckConstraint(_STATUS_CHECK, name="storefront_page_revisions_status"),
        sa.ForeignKeyConstraint(
            ["page_id"], ["storefront_pages.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["og_image_file_id"], ["stored_files.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by"], ["user.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["published_by"], ["user.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_storefront_page_revisions")),
    )
    op.create_index(
        "ix_storefront_page_revisions_page", "storefront_page_revisions",
        ["page_id", "revision_number"],
    )

    op.create_table(
        "storefront_page_sections",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("page_revision_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("template_key", sa.String(length=120), nullable=False),
        sa.Column("template_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("section_name", sa.String(length=180), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_visible", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("visible_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("visible_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("content_config", sa.JSON(), nullable=False),
        sa.Column("style_config", sa.JSON(), nullable=False),
        sa.Column("data_binding_config", sa.JSON(), nullable=False),
        sa.Column("behavior_config", sa.JSON(), nullable=False),
        *_audit_columns(),
        sa.ForeignKeyConstraint(
            ["page_revision_id"], ["storefront_page_revisions.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_storefront_page_sections")),
    )
    op.create_index(
        "ix_storefront_page_sections_revision", "storefront_page_sections",
        ["page_revision_id", "sort_order"],
    )

    op.create_table(
        "storefront_section_media",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("section_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("slot_key", sa.String(length=80), nullable=False),
        sa.Column("desktop_file_id", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("mobile_file_id", PG_UUID(as_uuid=True), nullable=True),
        sa.Column("alt_text", sa.String(length=255), nullable=True),
        sa.Column("focal_point_x", sa.Float(), nullable=True),
        sa.Column("focal_point_y", sa.Float(), nullable=True),
        *_audit_columns(),
        sa.ForeignKeyConstraint(
            ["section_id"], ["storefront_page_sections.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["desktop_file_id"], ["stored_files.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["mobile_file_id"], ["stored_files.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_storefront_section_media")),
    )
    op.create_index(
        "uq_storefront_section_media_slot", "storefront_section_media",
        ["section_id", "slot_key"], unique=True,
    )

    # ------------------------------------------------------------------
    # Seed idempotente (§2.4 del plan): páginas de sistema, tema NEUTRO,
    # layout por defecto y settings.
    # ------------------------------------------------------------------
    from backend.app.storefront.presets import DEFAULT_PRESET, build_tokens

    bind = op.get_bind()
    for page_key, slug, page_type in _SYSTEM_PAGES:
        bind.execute(
            sa.text(
                "INSERT INTO storefront_pages (id, page_key, slug, page_type, is_system_page) "
                "VALUES (gen_random_uuid(), :key, :slug, :type, true) "
                "ON CONFLICT (page_key) DO NOTHING"
            ),
            {"key": page_key, "slug": slug, "type": page_type},
        )

    bind.execute(
        sa.text(
            "INSERT INTO storefront_theme_revisions "
            "(id, version_number, status, theme_name, tokens_json, published_at) "
            "SELECT gen_random_uuid(), 1, 'published', :name, :tokens, now() "
            "WHERE NOT EXISTS (SELECT 1 FROM storefront_theme_revisions)"
        ),
        {"name": DEFAULT_PRESET, "tokens": json.dumps(build_tokens(DEFAULT_PRESET))},
    )
    bind.execute(
        sa.text(
            "INSERT INTO storefront_layout_revisions "
            "(id, version_number, status, header_template_key, header_config, "
            " footer_template_key, footer_config, published_at) "
            "SELECT gen_random_uuid(), 1, 'published', 'storefront.header.default', '{}', "
            "'storefront.footer.default', '{}', now() "
            "WHERE NOT EXISTS (SELECT 1 FROM storefront_layout_revisions)"
        )
    )
    bind.execute(
        sa.text(
            "INSERT INTO storefront_settings "
            "(id, active_theme_revision_id, active_layout_revision_id) "
            "SELECT 1, "
            "(SELECT id FROM storefront_theme_revisions ORDER BY created_at LIMIT 1), "
            "(SELECT id FROM storefront_layout_revisions ORDER BY created_at LIMIT 1) "
            "ON CONFLICT (id) DO NOTHING"
        )
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("uq_storefront_section_media_slot", table_name="storefront_section_media")
    op.drop_table("storefront_section_media")
    op.drop_index(
        "ix_storefront_page_sections_revision", table_name="storefront_page_sections"
    )
    op.drop_table("storefront_page_sections")
    op.drop_index("ix_storefront_page_revisions_page", table_name="storefront_page_revisions")
    op.drop_table("storefront_page_revisions")
    op.drop_table("storefront_pages")
    op.drop_table("storefront_settings")
    op.drop_table("storefront_layout_revisions")
    op.drop_table("storefront_theme_revisions")
