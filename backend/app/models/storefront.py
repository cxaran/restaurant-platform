"""Storefront: composición visual versionada del sitio público (§29–§57).

El administrador configura contenido/orden/estilos permitidos; NUNCA HTML/CSS/
JS libre (§24 del módulo): cada sección referencia una plantilla REGISTRADA EN
CÓDIGO (``app/storefront/templates``) y sus configs JSONB se validan contra el
contrato de esa plantilla. El sitio público sólo carga revisiones PUBLICADAS;
los borradores jamás se exponen (§47).
"""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base

REVISION_STATUSES = ("draft", "scheduled", "published", "archived")
SINGLETON_ID = 1


def _in_clause(column: str, values: tuple[str, ...]) -> str:
    quoted = ", ".join(f"'{value}'" for value in values)
    return f"{column} IN ({quoted})"


class StorefrontSettings(Base):
    """Singleton (§45): tema/layout activos + metadatos globales del sitio (§45.1)."""

    __tablename__ = "storefront_settings"
    __table_args__ = (CheckConstraint("id = 1", name="storefront_settings_singleton"),)

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, default=SINGLETON_ID)
    active_theme_revision_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("storefront_theme_revisions.id", ondelete="RESTRICT"),
        nullable=True,
    )
    active_layout_revision_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("storefront_layout_revisions.id", ondelete="RESTRICT"),
        nullable=True,
    )
    storefront_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    maintenance_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    site_title: Mapped[Optional[str]] = mapped_column(
        String(120),
        nullable=True,
        comment="Título del sitio; si falta se usa business_profile.trade_name (§45.1).",
    )
    site_description: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    favicon_file_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("stored_files.id", ondelete="RESTRICT"), nullable=True
    )
    social_image_file_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("stored_files.id", ondelete="RESTRICT"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class StorefrontThemeRevision(Base):
    """Tokens de tema versionados (§39): presets NEUTROS, jamás CSS libre."""

    __tablename__ = "storefront_theme_revisions"
    __table_args__ = (
        CheckConstraint(
            _in_clause("status", REVISION_STATUSES), name="storefront_theme_revisions_status"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="draft")
    theme_name: Mapped[str] = mapped_column(String(120), nullable=False)
    tokens_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("user.id", ondelete="RESTRICT"), nullable=True
    )
    published_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("user.id", ondelete="RESTRICT"), nullable=True
    )
    published_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class StorefrontLayoutRevision(Base):
    """Header/footer versionados (§44) sobre plantillas fijas."""

    __tablename__ = "storefront_layout_revisions"
    __table_args__ = (
        CheckConstraint(
            _in_clause("status", REVISION_STATUSES), name="storefront_layout_revisions_status"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="draft")
    header_template_key: Mapped[str] = mapped_column(String(120), nullable=False)
    header_config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    footer_template_key: Mapped[str] = mapped_column(String(120), nullable=False)
    footer_config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("user.id", ondelete="RESTRICT"), nullable=True
    )
    published_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("user.id", ondelete="RESTRICT"), nullable=True
    )
    published_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class StorefrontPage(Base):
    """Página lógica estable (§41); las de sistema no se eliminan."""

    __tablename__ = "storefront_pages"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    page_key: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    slug: Mapped[str] = mapped_column(String(180), nullable=False, unique=True)
    page_type: Mapped[str] = mapped_column(String(40), nullable=False)
    is_system_page: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    published_revision_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    revisions: Mapped[list["StorefrontPageRevision"]] = relationship(
        back_populates="page", cascade="all, delete-orphan"
    )


class StorefrontPageRevision(Base):
    """Borradores y versiones publicadas de una página (§41)."""

    __tablename__ = "storefront_page_revisions"
    __table_args__ = (
        CheckConstraint(
            _in_clause("status", REVISION_STATUSES), name="storefront_page_revisions_status"
        ),
        Index("ix_storefront_page_revisions_page", "page_id", "revision_number"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    page_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("storefront_pages.id", ondelete="CASCADE"),
        nullable=False,
    )
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="draft")
    page_title: Mapped[Optional[str]] = mapped_column(String(180), nullable=True)
    meta_description: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    og_image_file_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("stored_files.id", ondelete="RESTRICT"), nullable=True
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("user.id", ondelete="RESTRICT"), nullable=True
    )
    published_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("user.id", ondelete="RESTRICT"), nullable=True
    )
    published_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    scheduled_publish_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    scheduled_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Cuándo se PROGRAMÓ (regla de supersesión §1.9: una publicación posterior la cancela).",
    )
    schedule_cancelled_reason: Mapped[Optional[str]] = mapped_column(
        String(200),
        nullable=True,
        comment="Razón legible cuando la programación se canceló automáticamente.",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    page: Mapped["StorefrontPage"] = relationship(back_populates="revisions")
    sections: Mapped[list["StorefrontPageSection"]] = relationship(
        back_populates="revision", cascade="all, delete-orphan"
    )


class StorefrontPageSection(Base):
    """Instancia de plantilla dentro de una revisión (§42)."""

    __tablename__ = "storefront_page_sections"
    __table_args__ = (
        Index("ix_storefront_page_sections_revision", "page_revision_id", "sort_order"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    page_revision_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("storefront_page_revisions.id", ondelete="CASCADE"),
        nullable=False,
    )
    template_key: Mapped[str] = mapped_column(String(120), nullable=False)
    template_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    section_name: Mapped[Optional[str]] = mapped_column(String(180), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    visible_from: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    visible_until: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    content_config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    style_config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    data_binding_config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    behavior_config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    revision: Mapped["StorefrontPageRevision"] = relationship(back_populates="sections")
    media: Mapped[list["StorefrontSectionMedia"]] = relationship(
        back_populates="section", cascade="all, delete-orphan"
    )


class StorefrontSectionMedia(Base):
    """Imágenes por slot de la sección (§43): desktop/móvil + punto focal."""

    __tablename__ = "storefront_section_media"
    __table_args__ = (
        Index("uq_storefront_section_media_slot", "section_id", "slot_key", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    section_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("storefront_page_sections.id", ondelete="CASCADE"),
        nullable=False,
    )
    slot_key: Mapped[str] = mapped_column(String(80), nullable=False)
    desktop_file_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("stored_files.id", ondelete="RESTRICT"), nullable=True
    )
    mobile_file_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("stored_files.id", ondelete="RESTRICT"), nullable=True
    )
    alt_text: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    focal_point_x: Mapped[Optional[float]] = mapped_column(nullable=True)
    focal_point_y: Mapped[Optional[float]] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    section: Mapped["StorefrontPageSection"] = relationship(back_populates="media")
