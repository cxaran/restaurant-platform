"""Catálogo de plantillas del storefront REGISTRADO EN CÓDIGO (§33).

Mismo espíritu que el catálogo de permisos: el administrador nunca crea
plantillas; elige una y configura SOLO sus campos declarados. Cada config
(content/style/data_binding/behavior) es un modelo Pydantic ``extra="forbid"``:
las claves desconocidas se rechazan (§40) y los CTA usan tipos de enlace
CONTROLADOS (§50) — jamás javascript:/data:/HTML embebido.

Los colores de estilo referencian TOKENS del tema (§58.4), nunca hex libres.
"""

from dataclasses import dataclass
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class _Config(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class _Empty(_Config):
    pass


# ---------------------------------------------------------------------------
# CTA con tipos de enlace controlados (§50)
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


# Esquemas de color por sección: referencias a tokens del tema (§58.4).
ColorScheme = Literal["surface", "surface_muted", "brand", "brand_inverse", "dark"]


# ---------------------------------------------------------------------------
# Plantillas iniciales (§58.1: las del prototipo)
# ---------------------------------------------------------------------------

class AnnouncementBehavior(_Config):
    # §35.4: SOLO decide si se muestra; el texto es derivado del umbral de
    # envío gratis configurado — nunca texto rodante libre.
    show_free_shipping: bool = True
    show_service_note: bool = True


class HeroSlide(_Config):
    variant: Literal["split", "background", "minimal"] = "split"
    eyebrow: Optional[str] = Field(default=None, max_length=60)
    title: str = Field(min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=300)
    primary_cta: Optional[Cta] = None
    secondary_cta: Optional[Cta] = None
    is_active: bool = True


class HeroContent(_Config):
    # §34.1: varios heros activos rotan en carrusel; sin recurrencia semanal.
    slides: list[HeroSlide] = Field(min_length=1, max_length=8)


class HeroStyle(_Config):
    height: Literal["compact", "regular", "tall"] = "compact"
    content_alignment: Literal["left", "center"] = "left"
    color_scheme: ColorScheme = "surface"
    button_variant: Literal["solid", "outline"] = "solid"


class PromoBannerContent(_Config):
    title: str = Field(min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=300)
    cta: Optional[Cta] = None


class PromoBannerStyle(_Config):
    color_scheme: ColorScheme = "dark"


class FeaturedProductsContent(_Config):
    title: Optional[str] = Field(default=None, max_length=120)
    description: Optional[str] = Field(default=None, max_length=300)


class FeaturedProductsStyle(_Config):
    layout: Literal["horizontal_cards", "grid"] = "grid"
    color_scheme: ColorScheme = "surface"
    show_product_description: bool = True
    show_credits: bool = True


class FeaturedProductsBinding(_Config):
    # §36.2: fuente REAL del catálogo, nunca productos manuales.
    source: Literal["featured_products", "category", "credit_products", "newest"] = (
        "featured_products"
    )
    category_id: Optional[UUID] = None
    max_items: int = Field(default=4, ge=1, le=12)


class HoursContent(_Config):
    title: Optional[str] = Field(default=None, max_length=120)
    show_today: bool = True
    show_weekly: bool = True


class ContactContent(_Config):
    title: Optional[str] = Field(default=None, max_length=120)
    show_whatsapp: bool = True
    show_map_button: bool = False


class SectionBehavior(_Config):
    show_on_mobile: bool = True
    show_on_desktop: bool = True


@dataclass(frozen=True)
class TemplateDef:
    key: str
    version: int
    label: str
    content_model: type[BaseModel]
    style_model: type[BaseModel]
    data_binding_model: type[BaseModel]
    behavior_model: type[BaseModel]


TEMPLATES: dict[str, TemplateDef] = {
    template.key: template
    for template in (
        TemplateDef(
            key="storefront.announcement.free_shipping",
            version=1,
            label="Barra de envío gratis",
            content_model=_Empty,
            style_model=_Empty,
            data_binding_model=_Empty,
            behavior_model=AnnouncementBehavior,
        ),
        TemplateDef(
            key="storefront.hero",
            version=1,
            label="Hero de portada (con rotación)",
            content_model=HeroContent,
            style_model=HeroStyle,
            data_binding_model=_Empty,
            behavior_model=SectionBehavior,
        ),
        TemplateDef(
            key="storefront.banner.promo",
            version=1,
            label="Banner promocional",
            content_model=PromoBannerContent,
            style_model=PromoBannerStyle,
            data_binding_model=_Empty,
            behavior_model=SectionBehavior,
        ),
        TemplateDef(
            key="storefront.catalog.featured_products",
            version=1,
            label="Grilla de productos",
            content_model=FeaturedProductsContent,
            style_model=FeaturedProductsStyle,
            data_binding_model=FeaturedProductsBinding,
            behavior_model=SectionBehavior,
        ),
        TemplateDef(
            key="storefront.business.hours",
            version=1,
            label="Horarios del negocio",
            content_model=HoursContent,
            style_model=_Empty,
            data_binding_model=_Empty,
            behavior_model=SectionBehavior,
        ),
        TemplateDef(
            key="storefront.business.contact",
            version=1,
            label="Contacto",
            content_model=ContactContent,
            style_model=_Empty,
            data_binding_model=_Empty,
            behavior_model=SectionBehavior,
        ),
    )
}

HEADER_TEMPLATE_KEYS = ("storefront.header.default", "storefront.header.compact")
FOOTER_TEMPLATE_KEYS = ("storefront.footer.default", "storefront.footer.compact")


class TemplateValidationError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def validate_section_configs(
    template_key: str,
    template_version: int,
    *,
    content: dict,
    style: dict,
    data_binding: dict,
    behavior: dict,
) -> None:
    """Valida las cuatro configs contra el contrato de la plantilla (§40)."""
    template = TEMPLATES.get(template_key)
    if template is None:
        raise TemplateValidationError("plantilla_desconocida", "La plantilla no existe.")
    if template_version != template.version:
        raise TemplateValidationError(
            "plantilla_version_incompatible",
            f"La plantilla «{template_key}» va en la versión {template.version}.",
        )
    try:
        parsed_content = template.content_model.model_validate(content)
        template.style_model.model_validate(style)
        template.data_binding_model.model_validate(data_binding)
        template.behavior_model.model_validate(behavior)
    except TemplateValidationError:
        raise
    except Exception as exc:  # errores Pydantic → mensaje estable
        raise TemplateValidationError("configuracion_invalida", str(exc))

    # Validación semántica de CTAs (§50): target coherente con el tipo.
    for field_name in ("slides",):
        slides = getattr(parsed_content, field_name, None)
        if slides:
            for slide in slides:
                for cta in (slide.primary_cta, slide.secondary_cta):
                    if cta is not None:
                        try:
                            cta.validate_by_type()
                        except ValueError as exc:
                            raise TemplateValidationError("enlace_invalido", str(exc))
    cta = getattr(parsed_content, "cta", None)
    if cta is not None:
        try:
            cta.validate_by_type()
        except ValueError as exc:
            raise TemplateValidationError("enlace_invalido", str(exc))
