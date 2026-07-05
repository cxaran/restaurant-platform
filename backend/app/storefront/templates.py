"""Contratos del storefront REGISTRADOS EN CÓDIGO.

Mismo espíritu que el catálogo de permisos: el administrador nunca crea
plantillas ni escribe HTML/CSS/JS; elige una plantilla (hero) o llena un
formulario (destacado/footer/tema) y TODO se valida contra estos modelos
Pydantic ``extra="forbid"`` — las claves desconocidas se rechazan y los CTA
usan tipos de enlace CONTROLADOS (jamás javascript:/data:/HTML embebido).

Los colores referencian TOKENS del tema, nunca hex libres (la única
excepción es el acento del tema, un hex validado por patrón).
"""

from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class _Config(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class TemplateValidationError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


# ---------------------------------------------------------------------------
# CTA con tipos de enlace controlados
# ---------------------------------------------------------------------------

class Cta(_Config):
    label: str = Field(min_length=1, max_length=60)
    link_type: Literal[
        "internal_route", "anchor", "product", "category",
        "credits_page", "menu_page", "whatsapp", "phone", "external_https",
    ]
    target: Optional[str] = Field(default=None, max_length=300)

    @field_validator("target")
    @classmethod
    def _safe_target(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        lowered = value.lower()
        if any(lowered.startswith(bad) for bad in ("javascript:", "data:", "vbscript:")):
            raise ValueError("Enlace no permitido.")
        return value

    def validate_by_type(self) -> None:
        if self.link_type == "external_https":
            if not (self.target or "").lower().startswith("https://"):
                raise ValueError("Los enlaces externos deben ser https://.")
        if self.link_type in ("internal_route", "anchor", "product", "category") and not self.target:
            raise ValueError(f"El enlace tipo {self.link_type} requiere target.")


def validate_ctas(value: object) -> None:
    """Alias público de la validación semántica recursiva de CTAs."""
    _validate_ctas_recursive(value)


def _validate_ctas_recursive(value: object) -> None:
    """Valida semánticamente TODOS los Cta anidados en un modelo (generalizado)."""
    if isinstance(value, Cta):
        try:
            value.validate_by_type()
        except ValueError as exc:
            raise TemplateValidationError("enlace_invalido", str(exc))
        return
    if isinstance(value, BaseModel):
        for name in type(value).model_fields:
            _validate_ctas_recursive(getattr(value, name))
        return
    if isinstance(value, (list, tuple)):
        for item in value:
            _validate_ctas_recursive(item)


# Esquemas de color por sección: referencias a tokens del tema.
ColorScheme = Literal["surface", "surface_muted", "brand", "brand_inverse", "dark"]


# ---------------------------------------------------------------------------
# Heros: la pieza de marca. `template` ES la plantilla.
# ---------------------------------------------------------------------------

HeroTemplate = Literal["split", "background", "card", "showcase", "minimal"]


class HeroWrite(_Config):
    """Contrato completo de un hero (create/replace)."""

    template: HeroTemplate = "split"
    is_active: bool = True
    sort_order: int = Field(default=0, ge=0, le=10_000)
    eyebrow: Optional[str] = Field(default=None, max_length=60)
    title: str = Field(min_length=1, max_length=120)
    title_accent: Optional[str] = Field(default=None, max_length=60)
    description: Optional[str] = Field(default=None, max_length=300)
    primary_cta: Optional[Cta] = None
    secondary_cta: Optional[Cta] = None
    product_id: Optional[UUID] = None
    desktop_file_id: Optional[UUID] = None
    mobile_file_id: Optional[UUID] = None
    image_alt: Optional[str] = Field(default=None, max_length=255)
    focal_x: Optional[float] = Field(default=None, ge=0, le=1)
    focal_y: Optional[float] = Field(default=None, ge=0, le=1)
    height: Literal["compact", "regular", "tall"] = "regular"
    alignment: Literal["left", "center"] = "left"
    color_scheme: ColorScheme = "surface"
    button_variant: Literal["solid", "outline"] = "solid"
    overlay: Literal["none", "soft", "strong"] = "soft"
    image_position: Literal["left", "right"] = "right"

    @model_validator(mode="after")
    def _semantic_rules(self) -> "HeroWrite":
        # El fragmento resaltado debe existir TAL CUAL dentro del título.
        if self.title_accent and self.title_accent not in self.title:
            raise ValueError("title_accent debe ser una subcadena exacta del título.")
        # El showcase existe para vincular un producto real (precio/stock vivos).
        if self.template == "showcase" and self.product_id is None:
            raise ValueError("La plantilla «showcase» requiere elegir un producto.")
        return self


def validate_hero(payload: dict) -> HeroWrite:
    """Valida el contrato del hero y sus CTAs; errores con código estable."""
    try:
        hero = HeroWrite.model_validate(payload)
    except TemplateValidationError:
        raise
    except Exception as exc:
        raise TemplateValidationError("configuracion_invalida", str(exc))
    _validate_ctas_recursive(hero)
    return hero


# ---------------------------------------------------------------------------
# Destacados por superficie
# ---------------------------------------------------------------------------

HighlightSurface = Literal[
    "global", "home", "login", "register", "cart", "checkout", "account"
]
HighlightAnimation = Literal[
    "none", "fade_in", "slide_down", "rise", "pulse", "shimmer", "marquee"
]
HighlightScheme = Literal["brand", "soft", "accent", "success"]


class HighlightWrite(_Config):
    surface: HighlightSurface
    is_active: bool = True
    sort_order: int = Field(default=0, ge=0, le=10_000)
    icon: Optional[str] = Field(default=None, max_length=16)
    eyebrow: Optional[str] = Field(default=None, max_length=60)
    title: str = Field(min_length=1, max_length=140)
    subtitle: Optional[str] = Field(default=None, max_length=200)
    cta: Optional[Cta] = None
    animation: HighlightAnimation = "fade_in"
    color_scheme: HighlightScheme = "brand"
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None

    @model_validator(mode="after")
    def _window_is_coherent(self) -> "HighlightWrite":
        if self.starts_at and self.ends_at and self.ends_at <= self.starts_at:
            raise ValueError("La ventana temporal debe terminar después de empezar.")
        return self


def validate_highlight(payload: dict) -> HighlightWrite:
    try:
        highlight = HighlightWrite.model_validate(payload)
    except TemplateValidationError:
        raise
    except Exception as exc:
        raise TemplateValidationError("configuracion_invalida", str(exc))
    _validate_ctas_recursive(highlight)
    return highlight


# ---------------------------------------------------------------------------
# Footer: plantilla + toggles + redes sociales
# ---------------------------------------------------------------------------

SocialNetwork = Literal["facebook", "instagram", "tiktok", "whatsapp", "youtube", "x"]


class SocialLink(_Config):
    network: SocialNetwork
    url: str = Field(min_length=1, max_length=300)

    @field_validator("url")
    @classmethod
    def _https_only(cls, value: str) -> str:
        if not value.lower().startswith("https://"):
            raise ValueError("Las redes sociales requieren enlaces https://.")
        return value


class FooterWrite(_Config):
    """Contrato completo del footer (el PATCH usa un espejo all-optional)."""

    template: Literal["barra", "columnas", "centrado"] = "barra"
    show_slogan: bool = True
    show_phones: bool = True
    show_schedule: bool = True
    show_links: bool = True
    note: Optional[str] = Field(default=None, max_length=200)
    color_scheme: Literal["dark", "soft", "brand"] = "dark"
    social_links: list[SocialLink] = Field(default_factory=list, max_length=6)


def validate_footer(payload: dict) -> FooterWrite:
    try:
        return FooterWrite.model_validate(payload)
    except Exception as exc:
        raise TemplateValidationError("configuracion_invalida", str(exc))
