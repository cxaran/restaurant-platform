"""Storefront plano: heros, destacados, footer y tema — edición directa.

Sin revisiones ni ciclo draft→published: guardar es publicar y el único gate
es ``is_active``. La portada del sitio es una composición FIJA en código
(hero(s) → franja destacada → menú → footer); aquí vive solo el CONTENIDO
configurable. Los contratos de validación (Pydantic ``extra="forbid"``) están
en ``app/storefront/templates.py`` — el administrador jamás escribe HTML/CSS.
"""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
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
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base

SINGLETON_ID = 1

HERO_TEMPLATES = ("split", "background", "card", "showcase", "minimal")
HERO_HEIGHTS = ("compact", "regular", "tall")
HERO_ALIGNMENTS = ("left", "center")
HERO_OVERLAYS = ("none", "soft", "strong")
HERO_IMAGE_POSITIONS = ("left", "right")
HERO_BUTTON_VARIANTS = ("solid", "outline")
HERO_TRANSITIONS = ("slide", "fade")
SECTION_COLOR_SCHEMES = ("surface", "surface_muted", "brand", "brand_inverse", "dark")

HIGHLIGHT_SURFACES = ("global", "home", "login", "register", "cart", "checkout", "account")
HIGHLIGHT_ANIMATIONS = ("none", "fade_in", "slide_down", "rise", "pulse", "shimmer", "marquee")
HIGHLIGHT_SCHEMES = ("brand", "soft", "accent", "success")

FOOTER_TEMPLATES = ("barra", "columnas", "centrado")
FOOTER_SCHEMES = ("dark", "soft", "brand")


def _in_clause(column: str, values: tuple[str, ...]) -> str:
    quoted = ", ".join(f"'{value}'" for value in values)
    return f"{column} IN ({quoted})"


class StorefrontSettings(Base):
    """Singleton: metadatos del sitio, tema (preset + acento) y carrusel."""

    __tablename__ = "storefront_settings"
    __table_args__ = (
        CheckConstraint("id = 1", name="storefront_settings_singleton"),
        CheckConstraint(
            "hero_interval_seconds BETWEEN 4 AND 12",
            name="storefront_settings_hero_interval",
        ),
        CheckConstraint(
            _in_clause("hero_transition", HERO_TRANSITIONS),
            name="storefront_settings_hero_transition",
        ),
    )

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, default=SINGLETON_ID)
    storefront_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    maintenance_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    site_title: Mapped[Optional[str]] = mapped_column(
        String(120),
        nullable=True,
        comment="Título del sitio; si falta se usa business_profile.trade_name.",
    )
    site_description: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    # Texto del panel lateral de las páginas de acceso (login/registro/…); si falta
    # el frontend usa su copy por defecto. Texto libre, sin CHECK.
    auth_headline: Mapped[Optional[str]] = mapped_column(
        String(120),
        nullable=True,
        comment="Titular del panel lateral de acceso; admite un salto de línea (\\n).",
    )
    auth_subcopy: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    favicon_file_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("stored_files.id", ondelete="RESTRICT"), nullable=True
    )
    social_image_file_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("stored_files.id", ondelete="RESTRICT"), nullable=True
    )
    # Tema: preset neutro + acento opcional; los tokens se derivan al servir
    # (app/storefront/presets.py), jamás CSS libre almacenado.
    theme_preset: Mapped[str] = mapped_column(String(40), nullable=False, default="calido")
    theme_accent: Mapped[Optional[str]] = mapped_column(
        String(7), nullable=True, comment="Hex #RRGGBB; None = acento del preset."
    )
    # Comportamiento del carrusel de heros (global, no por hero).
    hero_autoplay: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    hero_interval_seconds: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=6
    )
    hero_transition: Mapped[str] = mapped_column(String(10), nullable=False, default="slide")
    hero_show_arrows: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    hero_show_dots: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class StorefrontHero(Base):
    """Un hero de portada; los activos rotan en carrusel por ``sort_order``.

    ``template`` decide el renderer (split/background/card/showcase/minimal);
    los CTAs son JSON validado contra el contrato ``Cta`` (enlaces controlados)
    y ``product_id`` vincula el showcase a un producto REAL del catálogo —
    precio y disponibilidad se resuelven al servir, nunca texto manual.
    """

    __tablename__ = "storefront_heros"
    __table_args__ = (
        CheckConstraint(_in_clause("template", HERO_TEMPLATES), name="storefront_heros_template"),
        CheckConstraint(_in_clause("height", HERO_HEIGHTS), name="storefront_heros_height"),
        CheckConstraint(
            _in_clause("alignment", HERO_ALIGNMENTS), name="storefront_heros_alignment"
        ),
        CheckConstraint(
            _in_clause("color_scheme", SECTION_COLOR_SCHEMES),
            name="storefront_heros_color_scheme",
        ),
        CheckConstraint(
            _in_clause("button_variant", HERO_BUTTON_VARIANTS),
            name="storefront_heros_button_variant",
        ),
        CheckConstraint(_in_clause("overlay", HERO_OVERLAYS), name="storefront_heros_overlay"),
        CheckConstraint(
            _in_clause("image_position", HERO_IMAGE_POSITIONS),
            name="storefront_heros_image_position",
        ),
        Index("ix_storefront_heros_active_order", "is_active", "sort_order"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    template: Mapped[str] = mapped_column(String(20), nullable=False, default="split")
    eyebrow: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    title_accent: Mapped[Optional[str]] = mapped_column(
        String(60),
        nullable=True,
        comment="Fragmento del título resaltado en color de marca (subcadena exacta).",
    )
    description: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    primary_cta: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    secondary_cta: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    product_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("products.id", ondelete="SET NULL"), nullable=True
    )
    desktop_file_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("stored_files.id", ondelete="RESTRICT"), nullable=True
    )
    mobile_file_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("stored_files.id", ondelete="RESTRICT"), nullable=True
    )
    image_alt: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    focal_x: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    focal_y: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    height: Mapped[str] = mapped_column(String(10), nullable=False, default="regular")
    alignment: Mapped[str] = mapped_column(String(10), nullable=False, default="left")
    color_scheme: Mapped[str] = mapped_column(String(20), nullable=False, default="surface")
    button_variant: Mapped[str] = mapped_column(String(10), nullable=False, default="solid")
    overlay: Mapped[str] = mapped_column(String(10), nullable=False, default="soft")
    image_position: Mapped[str] = mapped_column(String(10), nullable=False, default="right")
    # Solo plantilla split: recuadro redondeado + sombra detrás de la imagen. False = la
    # imagen se muestra sin ningún efecto extra.
    image_frame: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class StorefrontHighlight(Base):
    """Texto destacable por superficie con slot de tamaño FIJO en el frontend.

    El admin elige mensaje, animación (solo transform/opacity) y color de
    token; el diseño decide espacio y posición — «visible pero sin robar
    layout» es garantía estructural, no una promesa. Ventana temporal opcional
    filtrada al servir (sin scheduler).
    """

    __tablename__ = "storefront_highlights"
    __table_args__ = (
        CheckConstraint(
            _in_clause("surface", HIGHLIGHT_SURFACES), name="storefront_highlights_surface"
        ),
        CheckConstraint(
            _in_clause("animation", HIGHLIGHT_ANIMATIONS),
            name="storefront_highlights_animation",
        ),
        CheckConstraint(
            _in_clause("color_scheme", HIGHLIGHT_SCHEMES),
            name="storefront_highlights_color_scheme",
        ),
        Index("ix_storefront_highlights_surface", "surface", "is_active", "sort_order"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    surface: Mapped[str] = mapped_column(String(20), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    icon: Mapped[Optional[str]] = mapped_column(
        String(16), nullable=True, comment="Emoji o badge corto opcional; nunca markup."
    )
    eyebrow: Mapped[Optional[str]] = mapped_column(
        String(60),
        nullable=True,
        comment="Antetítulo corto (p. ej. «Únete al club») para superficies tipo tarjeta.",
    )
    title: Mapped[str] = mapped_column(String(140), nullable=False)
    subtitle: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    cta: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    animation: Mapped[str] = mapped_column(String(20), nullable=False, default="fade_in")
    color_scheme: Mapped[str] = mapped_column(String(10), nullable=False, default="brand")
    starts_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ends_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class StorefrontFooter(Base):
    """Singleton del footer: plantilla + toggles + redes sociales.

    El eslogan y los teléfonos viven en el perfil del negocio — aquí solo se
    decide SI se muestran. Lo único propio son las redes (``social_links``:
    lista {network, url https} validada por contrato) y la nota opcional.
    """

    __tablename__ = "storefront_footer"
    __table_args__ = (
        CheckConstraint("id = 1", name="storefront_footer_singleton"),
        CheckConstraint(
            _in_clause("template", FOOTER_TEMPLATES), name="storefront_footer_template"
        ),
        CheckConstraint(
            _in_clause("color_scheme", FOOTER_SCHEMES), name="storefront_footer_color_scheme"
        ),
    )

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, default=SINGLETON_ID)
    template: Mapped[str] = mapped_column(String(12), nullable=False, default="barra")
    show_slogan: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    show_phones: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    show_schedule: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    show_links: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        comment="Columnas de enlaces FIJOS del sitio (plantilla «columnas»).",
    )
    note: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True, comment="Sustituye al eslogan del negocio si se define."
    )
    color_scheme: Mapped[str] = mapped_column(String(10), nullable=False, default="dark")
    social_links: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
