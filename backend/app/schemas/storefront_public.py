"""Contrato TIPADO del storefront público.

``GET /public/storefront/site`` entrega en UNA llamada todo el contenido
configurable de la composición fija del sitio (meta, tema, carrusel, heros y
footer); ``GET /public/storefront/highlights`` entrega los destacados de una
superficie. El frontend genera sus tipos de aquí — sin espejos defensivos.
"""

from typing import Any, Optional

from pydantic import Field

from backend.app.schemas.base import ApiSchema


class PublicCta(ApiSchema):
    label: str
    link_type: str
    target: Optional[str] = None


class PublicHeroImage(ApiSchema):
    desktop_file_id: Optional[str] = None
    mobile_file_id: Optional[str] = None
    alt_text: Optional[str] = None
    focal_x: Optional[float] = None
    focal_y: Optional[float] = None


class PublicHeroProduct(ApiSchema):
    """Binding real del showcase: catálogo vivo, nunca precio manual."""

    id: str
    name: str
    money_price_amount: Optional[str] = None
    credit_redemption_price: Optional[int] = None
    is_available: bool = True


class PublicHero(ApiSchema):
    id: str
    template: str
    eyebrow: Optional[str] = None
    title: str
    title_accent: Optional[str] = None
    description: Optional[str] = None
    primary_cta: Optional[PublicCta] = None
    secondary_cta: Optional[PublicCta] = None
    product: Optional[PublicHeroProduct] = None
    image: PublicHeroImage = Field(default_factory=PublicHeroImage)
    height: str = "regular"
    alignment: str = "left"
    color_scheme: str = "surface"
    button_variant: str = "solid"
    overlay: str = "soft"
    image_position: str = "right"
    image_frame: bool = True


class PublicCarousel(ApiSchema):
    autoplay: bool = True
    interval_seconds: int = 6
    transition: str = "slide"
    show_arrows: bool = True
    show_dots: bool = True


class PublicFooterPhone(ApiSchema):
    label: Optional[str] = None
    phone: str
    phone_normalized: str
    is_whatsapp: bool = False


class PublicFooterSchedule(ApiSchema):
    is_open_now: bool = False
    today_slots: list[dict[str, Any]] = Field(default_factory=list)


class PublicSocialLink(ApiSchema):
    network: str
    url: str


class PublicFooter(ApiSchema):
    template: str = "barra"
    color_scheme: str = "dark"
    slogan: Optional[str] = None
    phones: list[PublicFooterPhone] = Field(default_factory=list)
    schedule: Optional[PublicFooterSchedule] = None
    show_links: bool = True
    address: Optional[str] = None
    social_links: list[PublicSocialLink] = Field(default_factory=list)


class PublicSiteMeta(ApiSchema):
    title: Optional[str] = None
    description: Optional[str] = None
    favicon_file_id: Optional[str] = None
    social_image_file_id: Optional[str] = None


class PublicSiteAuth(ApiSchema):
    """Texto del panel lateral de las páginas de acceso; None = usar el default del front."""

    headline: Optional[str] = None
    subcopy: Optional[str] = None


class PublicStorefrontSite(ApiSchema):
    enabled: bool = True
    maintenance_message: Optional[str] = None
    meta: PublicSiteMeta = Field(default_factory=PublicSiteMeta)
    auth: PublicSiteAuth = Field(default_factory=PublicSiteAuth)
    theme_tokens: dict[str, Any] = Field(default_factory=dict)
    carousel: PublicCarousel = Field(default_factory=PublicCarousel)
    heros: list[PublicHero] = Field(default_factory=list)
    footer: PublicFooter = Field(default_factory=PublicFooter)


class PublicHighlight(ApiSchema):
    id: str
    surface: str
    icon: Optional[str] = None
    eyebrow: Optional[str] = None
    title: str
    subtitle: Optional[str] = None
    cta: Optional[PublicCta] = None
    animation: str = "fade_in"
    color_scheme: str = "brand"
