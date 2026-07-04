"""Storefront plano: reemplaza el sistema versionado por edición directa.

DESTRUCTIVA por diseño (decisión de producto): elimina páginas, revisiones,
secciones, media por slot, layouts y temas versionados. El contenido nuevo
(heros, destacados, footer, tema por preset) se captura desde el editor —
no hay mapeo automático del árbol de secciones anterior.

También remapea los permisos del grupo storefront en ``role_access``:
read_draft/preview → storefront:read; manage_media/manage_navigation/
publish/rollback → storefront:edit; edit y manage_theme se conservan.

Revision ID: 8f4c2d91ab37
Revises: d3a7c92f10b8
Create Date: 2026-07-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "8f4c2d91ab37"
down_revision: Union[str, Sequence[str], None] = "d3a7c92f10b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # --- 1) Adiós al sistema versionado (orden respetando FKs). ---
    op.drop_table("storefront_section_media")
    op.drop_table("storefront_page_sections")
    op.drop_table("storefront_page_revisions")
    op.drop_table("storefront_pages")
    op.drop_table("storefront_settings")  # FKs a theme/layout revisions
    op.drop_table("storefront_layout_revisions")
    op.drop_table("storefront_theme_revisions")

    # --- 2) Modelo plano nuevo. ---
    op.create_table(
        "storefront_settings",
        sa.Column("id", sa.SmallInteger(), nullable=False),
        sa.Column("storefront_enabled", sa.Boolean(), nullable=False),
        sa.Column("maintenance_message", sa.Text(), nullable=True),
        sa.Column(
            "site_title", sa.String(length=120), nullable=True,
            comment="Título del sitio; si falta se usa business_profile.trade_name.",
        ),
        sa.Column("site_description", sa.String(length=300), nullable=True),
        sa.Column("favicon_file_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("social_image_file_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("theme_preset", sa.String(length=40), nullable=False),
        sa.Column(
            "theme_accent", sa.String(length=7), nullable=True,
            comment="Hex #RRGGBB; None = acento del preset.",
        ),
        sa.Column("hero_autoplay", sa.Boolean(), nullable=False),
        sa.Column("hero_interval_seconds", sa.SmallInteger(), nullable=False),
        sa.Column("hero_transition", sa.String(length=10), nullable=False),
        sa.Column("hero_show_arrows", sa.Boolean(), nullable=False),
        sa.Column("hero_show_dots", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("id = 1", name="storefront_settings_singleton"),
        sa.CheckConstraint(
            "hero_interval_seconds BETWEEN 4 AND 12",
            name="storefront_settings_hero_interval",
        ),
        sa.CheckConstraint(
            "hero_transition IN ('slide', 'fade')",
            name="storefront_settings_hero_transition",
        ),
        sa.ForeignKeyConstraint(["favicon_file_id"], ["stored_files.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["social_image_file_id"], ["stored_files.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "storefront_heros",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("template", sa.String(length=20), nullable=False),
        sa.Column("eyebrow", sa.String(length=60), nullable=True),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column(
            "title_accent", sa.String(length=60), nullable=True,
            comment="Fragmento del título resaltado en color de marca (subcadena exacta).",
        ),
        sa.Column("description", sa.String(length=300), nullable=True),
        sa.Column("primary_cta", sa.JSON(), nullable=True),
        sa.Column("secondary_cta", sa.JSON(), nullable=True),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("desktop_file_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("mobile_file_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("image_alt", sa.String(length=255), nullable=True),
        sa.Column("focal_x", sa.Float(), nullable=True),
        sa.Column("focal_y", sa.Float(), nullable=True),
        sa.Column("height", sa.String(length=10), nullable=False),
        sa.Column("alignment", sa.String(length=10), nullable=False),
        sa.Column("color_scheme", sa.String(length=20), nullable=False),
        sa.Column("button_variant", sa.String(length=10), nullable=False),
        sa.Column("overlay", sa.String(length=10), nullable=False),
        sa.Column("image_position", sa.String(length=10), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "template IN ('split', 'background', 'card', 'showcase', 'minimal')",
            name="storefront_heros_template",
        ),
        sa.CheckConstraint(
            "height IN ('compact', 'regular', 'tall')", name="storefront_heros_height"
        ),
        sa.CheckConstraint(
            "alignment IN ('left', 'center')", name="storefront_heros_alignment"
        ),
        sa.CheckConstraint(
            "color_scheme IN ('surface', 'surface_muted', 'brand', 'brand_inverse', 'dark')",
            name="storefront_heros_color_scheme",
        ),
        sa.CheckConstraint(
            "button_variant IN ('solid', 'outline')",
            name="storefront_heros_button_variant",
        ),
        sa.CheckConstraint(
            "overlay IN ('none', 'soft', 'strong')", name="storefront_heros_overlay"
        ),
        sa.CheckConstraint(
            "image_position IN ('left', 'right')",
            name="storefront_heros_image_position",
        ),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["desktop_file_id"], ["stored_files.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["mobile_file_id"], ["stored_files.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_storefront_heros_active_order", "storefront_heros", ["is_active", "sort_order"]
    )

    op.create_table(
        "storefront_highlights",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("surface", sa.String(length=20), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column(
            "icon", sa.String(length=16), nullable=True,
            comment="Emoji o badge corto opcional; nunca markup.",
        ),
        sa.Column(
            "eyebrow", sa.String(length=60), nullable=True,
            comment="Antetítulo corto (p. ej. «Únete al club») para superficies tipo tarjeta.",
        ),
        sa.Column("title", sa.String(length=140), nullable=False),
        sa.Column("subtitle", sa.String(length=200), nullable=True),
        sa.Column("cta", sa.JSON(), nullable=True),
        sa.Column("animation", sa.String(length=20), nullable=False),
        sa.Column("color_scheme", sa.String(length=10), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "surface IN ('global', 'home', 'login', 'register', 'cart', 'checkout', 'account')",
            name="storefront_highlights_surface",
        ),
        sa.CheckConstraint(
            "animation IN ('none', 'fade_in', 'slide_down', 'rise', 'pulse', 'shimmer', 'marquee')",
            name="storefront_highlights_animation",
        ),
        sa.CheckConstraint(
            "color_scheme IN ('brand', 'soft', 'accent')",
            name="storefront_highlights_color_scheme",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_storefront_highlights_surface",
        "storefront_highlights",
        ["surface", "is_active", "sort_order"],
    )

    op.create_table(
        "storefront_footer",
        sa.Column("id", sa.SmallInteger(), nullable=False),
        sa.Column("template", sa.String(length=12), nullable=False),
        sa.Column("show_slogan", sa.Boolean(), nullable=False),
        sa.Column("show_phones", sa.Boolean(), nullable=False),
        sa.Column("show_schedule", sa.Boolean(), nullable=False),
        sa.Column(
            "show_links", sa.Boolean(), nullable=False,
            comment="Columnas de enlaces FIJOS del sitio (plantilla «columnas»).",
        ),
        sa.Column(
            "note", sa.String(length=200), nullable=True,
            comment="Sustituye al eslogan del negocio si se define.",
        ),
        sa.Column("color_scheme", sa.String(length=10), nullable=False),
        sa.Column("social_links", sa.JSON(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("id = 1", name="storefront_footer_singleton"),
        sa.CheckConstraint(
            "template IN ('barra', 'columnas', 'centrado')",
            name="storefront_footer_template",
        ),
        sa.CheckConstraint(
            "color_scheme IN ('dark', 'soft', 'brand')",
            name="storefront_footer_color_scheme",
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # --- 3) Remapeo de permisos en role_access (sin duplicados). ---
    op.execute(
        """
        INSERT INTO role_access (id, role_id, access, is_active, created_at)
        SELECT gen_random_uuid(), src.role_id, 'storefront:read', TRUE, now()
        FROM (
            SELECT DISTINCT role_id FROM role_access
            WHERE access IN ('storefront:read_draft', 'storefront:preview')
        ) AS src
        WHERE NOT EXISTS (
            SELECT 1 FROM role_access e
            WHERE e.role_id = src.role_id AND e.access = 'storefront:read'
        )
        """
    )
    op.execute(
        """
        INSERT INTO role_access (id, role_id, access, is_active, created_at)
        SELECT gen_random_uuid(), src.role_id, 'storefront:edit', TRUE, now()
        FROM (
            SELECT DISTINCT role_id FROM role_access
            WHERE access IN (
                'storefront:manage_media', 'storefront:manage_navigation',
                'storefront:publish', 'storefront:rollback'
            )
        ) AS src
        WHERE NOT EXISTS (
            SELECT 1 FROM role_access e
            WHERE e.role_id = src.role_id AND e.access = 'storefront:edit'
        )
        """
    )
    op.execute(
        """
        DELETE FROM role_access
        WHERE access IN (
            'storefront:read_draft', 'storefront:preview', 'storefront:manage_media',
            'storefront:manage_navigation', 'storefront:publish', 'storefront:rollback'
        )
        """
    )


def downgrade() -> None:
    """Downgrade schema: recrea el esquema versionado VACÍO (el contenido
    plano no se traduce hacia atrás)."""
    op.drop_table("storefront_footer")
    op.drop_index("ix_storefront_highlights_surface", table_name="storefront_highlights")
    op.drop_table("storefront_highlights")
    op.drop_index("ix_storefront_heros_active_order", table_name="storefront_heros")
    op.drop_table("storefront_heros")
    op.drop_table("storefront_settings")

    op.create_table(
        "storefront_theme_revisions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("theme_name", sa.String(length=120), nullable=False),
        sa.Column("tokens_json", sa.JSON(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("published_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('draft', 'scheduled', 'published', 'archived')",
            name="storefront_theme_revisions_status",
        ),
        sa.ForeignKeyConstraint(["created_by"], ["user.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["published_by"], ["user.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "storefront_layout_revisions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("header_template_key", sa.String(length=120), nullable=False),
        sa.Column("header_config", sa.JSON(), nullable=False),
        sa.Column("footer_template_key", sa.String(length=120), nullable=False),
        sa.Column("footer_config", sa.JSON(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("published_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('draft', 'scheduled', 'published', 'archived')",
            name="storefront_layout_revisions_status",
        ),
        sa.ForeignKeyConstraint(["created_by"], ["user.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["published_by"], ["user.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "storefront_settings",
        sa.Column("id", sa.SmallInteger(), nullable=False),
        sa.Column("active_theme_revision_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("active_layout_revision_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("storefront_enabled", sa.Boolean(), nullable=False),
        sa.Column("maintenance_message", sa.Text(), nullable=True),
        sa.Column("site_title", sa.String(length=120), nullable=True),
        sa.Column("site_description", sa.String(length=300), nullable=True),
        sa.Column("favicon_file_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("social_image_file_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "storefront_pages",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("page_key", sa.String(length=80), nullable=False),
        sa.Column("slug", sa.String(length=180), nullable=False),
        sa.Column("page_type", sa.String(length=40), nullable=False),
        sa.Column("is_system_page", sa.Boolean(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("published_revision_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("page_key"),
        sa.UniqueConstraint("slug"),
    )
    op.create_table(
        "storefront_page_revisions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("page_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("revision_number", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("page_title", sa.String(length=180), nullable=True),
        sa.Column("meta_description", sa.String(length=300), nullable=True),
        sa.Column("og_image_file_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("published_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("scheduled_publish_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("schedule_cancelled_reason", sa.String(length=200), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('draft', 'scheduled', 'published', 'archived')",
            name="storefront_page_revisions_status",
        ),
        sa.ForeignKeyConstraint(["page_id"], ["storefront_pages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["og_image_file_id"], ["stored_files.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by"], ["user.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["published_by"], ["user.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_storefront_page_revisions_page",
        "storefront_page_revisions",
        ["page_id", "revision_number"],
    )
    op.create_table(
        "storefront_page_sections",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("page_revision_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("template_key", sa.String(length=120), nullable=False),
        sa.Column("template_version", sa.Integer(), nullable=False),
        sa.Column("section_name", sa.String(length=180), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_visible", sa.Boolean(), nullable=False),
        sa.Column("visible_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("visible_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("content_config", sa.JSON(), nullable=False),
        sa.Column("style_config", sa.JSON(), nullable=False),
        sa.Column("data_binding_config", sa.JSON(), nullable=False),
        sa.Column("behavior_config", sa.JSON(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["page_revision_id"], ["storefront_page_revisions.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_storefront_page_sections_revision",
        "storefront_page_sections",
        ["page_revision_id", "sort_order"],
    )
    op.create_table(
        "storefront_section_media",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("section_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("slot_key", sa.String(length=80), nullable=False),
        sa.Column("desktop_file_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("mobile_file_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("alt_text", sa.String(length=255), nullable=True),
        sa.Column("focal_point_x", sa.Float(), nullable=True),
        sa.Column("focal_point_y", sa.Float(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["section_id"], ["storefront_page_sections.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["desktop_file_id"], ["stored_files.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["mobile_file_id"], ["stored_files.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_storefront_section_media_slot",
        "storefront_section_media",
        ["section_id", "slot_key"],
        unique=True,
    )

    # Permisos: best-effort hacia atrás (la granularidad vieja no es recuperable).
    op.execute(
        """
        UPDATE role_access SET access = 'storefront:read_draft'
        WHERE access = 'storefront:read'
        """
    )
