"""Contrato TIPADO del storefront público (Etapa 6 RC).

`GET /public/storefront/{page_key}` dejaba el payload como ``dict`` en
OpenAPI y el frontend mantenía un espejo defensivo. Estos schemas son el
contrato real: el frontend genera sus tipos de aquí y elimina el espejo.

Los cuatro bloques de configuración de una sección (content/style/behavior)
y los datos resueltos del binding son intrínsecamente por-plantilla: viajan
como objetos libres, pero su FORMA por plantilla se publica vía
``GET /storefront/templates`` (JSON Schema por key).
"""

from typing import Any, Optional
from uuid import UUID

from pydantic import Field

from backend.app.schemas.base import ApiSchema


class PublicSectionMediaSlot(ApiSchema):
    desktop_file_id: Optional[str] = None
    mobile_file_id: Optional[str] = None
    alt_text: Optional[str] = None
    focal_point_x: Optional[float] = None
    focal_point_y: Optional[float] = None


class PublicStorefrontSection(ApiSchema):
    template_key: str
    template_version: int
    sort_order: int
    content: dict[str, Any] = Field(default_factory=dict)
    style: dict[str, Any] = Field(default_factory=dict)
    behavior: dict[str, Any] = Field(default_factory=dict)
    data: Optional[dict[str, Any]] = None
    media: dict[str, PublicSectionMediaSlot] = Field(default_factory=dict)


class PublicStorefrontMeta(ApiSchema):
    title: Optional[str] = None
    description: Optional[str] = None
    og_image_file_id: Optional[UUID] = None
    favicon_file_id: Optional[UUID] = None


class PublicStorefrontLayout(ApiSchema):
    header: dict[str, Any] = Field(default_factory=dict)
    footer: dict[str, Any] = Field(default_factory=dict)


class PublicStorefrontPage(ApiSchema):
    page_key: str
    slug: str
    meta: PublicStorefrontMeta
    layout: Optional[PublicStorefrontLayout] = None
    sections: list[PublicStorefrontSection] = Field(default_factory=list)
    theme_tokens: Optional[dict[str, Any]] = None


class PreviewLinkResult(ApiSchema):
    """Enlace de preview firmado y temporal (§ Etapa 6.9 del spec RC)."""

    token: str
    url: str
    expires_at: str
    revision_number: int
