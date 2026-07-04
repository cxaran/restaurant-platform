"""Editor plano del sitio + payload público.

Guardar es publicar: no hay borradores, revisiones ni programación. Cada
mutación se valida contra los contratos de ``app/storefront/templates.py``
(CTAs controlados, claves desconocidas rechazadas) y queda auditada con
NOMBRES de campos (nunca valores). El sitio público lee lo activo.
"""

import uuid
from typing import Literal, Optional

from fastapi import APIRouter, Response, status
from pydantic import Field

from backend.app.api.resource_actions import api_error, commit_or_conflict, get_or_404
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.models.catalog import Product
from backend.app.models.storefront import (
    StorefrontHero,
    StorefrontHighlight,
)
from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema
from backend.app.schemas.storefront_public import (
    PublicHighlight,
    PublicStorefrontSite,
)
from backend.app.security.groups.storefront import StorefrontPermissions
from backend.app.services.config_audit import record_config_change
from backend.app.services.file_service import get_active_file
from backend.app.services.storefront_service import (
    StorefrontRuleError,
    get_footer_settings,
    get_storefront_settings,
    highlight_public_payload,
    list_heros,
    list_highlights,
    resort_heros,
    site_public_payload,
    theme_tokens,
)
from backend.app.storefront.presets import DEFAULT_PRESET, THEME_PRESETS
from backend.app.storefront.templates import (
    HeroWrite,
    HighlightSurface,
    HighlightWrite,
    SocialLink,
    TemplateValidationError,
    validate_ctas,
)
from backend.app.utils.utc_now import utc_now

router = APIRouter(tags=["storefront"])

_HERO_NOT_FOUND = "Hero no encontrado"
_HIGHLIGHT_NOT_FOUND = "Destacado no encontrado"

# entity_id determinístico para auditar singletons (hex con letras a propósito;
# ver business_service.SINGLETON_AUDIT_ID).
_SETTINGS_AUDIT_ID = uuid.UUID("00000000-0000-4000-a000-5706ef2e7001")
_FOOTER_AUDIT_ID = uuid.UUID("00000000-0000-4000-a000-5706ef2e7002")


# ---------------------------------------------------------------------------
# Schemas de lectura del editor
# ---------------------------------------------------------------------------

class HeroRead(ApiReadSchema):
    id: uuid.UUID
    is_active: bool
    sort_order: int
    template: str
    eyebrow: Optional[str] = None
    title: str
    title_accent: Optional[str] = None
    description: Optional[str] = None
    primary_cta: Optional[dict] = None
    secondary_cta: Optional[dict] = None
    product_id: Optional[uuid.UUID] = None
    desktop_file_id: Optional[uuid.UUID] = None
    mobile_file_id: Optional[uuid.UUID] = None
    image_alt: Optional[str] = None
    focal_x: Optional[float] = None
    focal_y: Optional[float] = None
    height: str
    alignment: str
    color_scheme: str
    button_variant: str
    overlay: str
    image_position: str


class HighlightRead(ApiReadSchema):
    id: uuid.UUID
    surface: str
    is_active: bool
    sort_order: int
    icon: Optional[str] = None
    eyebrow: Optional[str] = None
    title: str
    subtitle: Optional[str] = None
    cta: Optional[dict] = None
    animation: str
    color_scheme: str
    starts_at: Optional[str] = None
    ends_at: Optional[str] = None


class FooterRead(ApiReadSchema):
    template: str
    show_slogan: bool
    show_phones: bool
    show_schedule: bool
    show_links: bool
    note: Optional[str] = None
    color_scheme: str
    social_links: list[dict] = Field(default_factory=list)


class SettingsRead(ApiReadSchema):
    storefront_enabled: bool
    maintenance_message: Optional[str] = None
    site_title: Optional[str] = None
    site_description: Optional[str] = None
    favicon_file_id: Optional[uuid.UUID] = None
    social_image_file_id: Optional[uuid.UUID] = None
    theme_preset: str
    theme_accent: Optional[str] = None
    hero_autoplay: bool
    hero_interval_seconds: int
    hero_transition: str
    hero_show_arrows: bool
    hero_show_dots: bool


class ThemePresetRead(ApiReadSchema):
    name: str
    tokens: dict
    is_default: bool


class StorefrontConfig(ApiReadSchema):
    """Config completa del editor en UNA llamada (las 4 pestañas)."""

    settings: SettingsRead
    footer: FooterRead
    heros: list[HeroRead] = Field(default_factory=list)
    highlights: list[HighlightRead] = Field(default_factory=list)
    theme_presets: list[ThemePresetRead] = Field(default_factory=list)
    active_theme_tokens: dict = Field(default_factory=dict)


def _highlight_read(row: StorefrontHighlight) -> HighlightRead:
    return HighlightRead(
        id=row.id,
        surface=row.surface,
        is_active=row.is_active,
        sort_order=row.sort_order,
        icon=row.icon,
        eyebrow=row.eyebrow,
        title=row.title,
        subtitle=row.subtitle,
        cta=row.cta,
        animation=row.animation,
        color_scheme=row.color_scheme,
        starts_at=row.starts_at.isoformat() if row.starts_at else None,
        ends_at=row.ends_at.isoformat() if row.ends_at else None,
    )


# ---------------------------------------------------------------------------
# Editor: lectura
# ---------------------------------------------------------------------------

@router.get("/storefront/config", response_model=StorefrontConfig)
def read_config(
    session: SessionDep, _: StorefrontPermissions.READ.requiere
) -> StorefrontConfig:
    settings_row = get_storefront_settings(session)
    footer = get_footer_settings(session)
    session.commit()
    return StorefrontConfig(
        settings=SettingsRead.model_validate(settings_row, from_attributes=True),
        footer=FooterRead.model_validate(footer, from_attributes=True),
        heros=[
            HeroRead.model_validate(hero, from_attributes=True)
            for hero in list_heros(session)
        ],
        highlights=[_highlight_read(row) for row in list_highlights(session)],
        theme_presets=[
            ThemePresetRead(name=name, tokens=tokens, is_default=name == DEFAULT_PRESET)
            for name, tokens in THEME_PRESETS.items()
        ],
        active_theme_tokens=theme_tokens(settings_row),
    )


# ---------------------------------------------------------------------------
# Heros
# ---------------------------------------------------------------------------

def _validate_hero_semantics(session: SessionDep, payload: HeroWrite) -> None:
    try:
        validate_ctas(payload)
    except TemplateValidationError as exc:
        api_error(status.HTTP_422_UNPROCESSABLE_ENTITY, exc.code, exc.message)
    for file_id in (payload.desktop_file_id, payload.mobile_file_id):
        if file_id is not None:
            stored = get_active_file(session, file_id)
            if stored is None or stored.kind != "image":
                api_error(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    "archivo_invalido",
                    "La imagen del hero debe ser una imagen activa del banco.",
                )
    if payload.product_id is not None:
        product = session.get(Product, payload.product_id)
        if product is None or not product.is_active:
            api_error(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "producto_invalido",
                "El producto vinculado no existe o está inactivo.",
            )


@router.post(
    "/storefront/heros", response_model=HeroRead, status_code=status.HTTP_201_CREATED
)
def create_hero(
    payload: HeroWrite,
    session: SessionDep,
    current_user: CurrentUser,
    _: StorefrontPermissions.EDIT.requiere,
) -> HeroRead:
    _validate_hero_semantics(session, payload)
    hero = StorefrontHero(**payload.model_dump(mode="json"))
    session.add(hero)
    session.flush()  # asigna el id antes de auditar
    record_config_change(
        session, actor_user_id=current_user.id, entity_type="storefront_hero",
        entity_id=hero.id, action="create", changed_fields=sorted(payload.model_dump()),
    )
    commit_or_conflict(session, "No fue posible crear el hero.")
    session.refresh(hero)
    return HeroRead.model_validate(hero, from_attributes=True)


@router.put("/storefront/heros/{hero_id}", response_model=HeroRead)
def update_hero(
    hero_id: uuid.UUID,
    payload: HeroWrite,
    session: SessionDep,
    current_user: CurrentUser,
    _: StorefrontPermissions.EDIT.requiere,
) -> HeroRead:
    hero = get_or_404(session, StorefrontHero, hero_id, _HERO_NOT_FOUND)
    _validate_hero_semantics(session, payload)
    for field, value in payload.model_dump(mode="json").items():
        setattr(hero, field, value)
    hero.updated_at = utc_now()
    session.add(hero)
    record_config_change(
        session, actor_user_id=current_user.id, entity_type="storefront_hero",
        entity_id=hero.id, action="update", changed_fields=sorted(payload.model_dump()),
    )
    commit_or_conflict(session, "No fue posible guardar el hero.")
    session.refresh(hero)
    return HeroRead.model_validate(hero, from_attributes=True)


@router.delete("/storefront/heros/{hero_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_hero(
    hero_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: StorefrontPermissions.EDIT.requiere,
) -> None:
    hero = get_or_404(session, StorefrontHero, hero_id, _HERO_NOT_FOUND)
    session.delete(hero)
    record_config_change(
        session, actor_user_id=current_user.id, entity_type="storefront_hero",
        entity_id=hero_id, action="delete", changed_fields=[],
    )
    commit_or_conflict(session, "No fue posible eliminar el hero.")


class HerosSortRequest(ApiWriteSchema):
    """Reorden ATÓMICO: el set completo de heros en una sola llamada."""

    hero_ids: list[uuid.UUID] = Field(min_length=1)


@router.post("/storefront/heros/sort")
def sort_heros(
    payload: HerosSortRequest,
    session: SessionDep,
    current_user: CurrentUser,
    _: StorefrontPermissions.EDIT.requiere,
) -> list[dict]:
    try:
        ordered = resort_heros(session, payload.hero_ids)
    except StorefrontRuleError as exc:
        api_error(status.HTTP_422_UNPROCESSABLE_ENTITY, exc.code, exc.message)
    record_config_change(
        session, actor_user_id=current_user.id, entity_type="storefront_hero",
        entity_id=_SETTINGS_AUDIT_ID, action="sort", changed_fields=["sort_order"],
    )
    commit_or_conflict(session, "No fue posible reordenar los heros.")
    return [{"id": str(hero.id), "sort_order": hero.sort_order} for hero in ordered]


# ---------------------------------------------------------------------------
# Destacados
# ---------------------------------------------------------------------------

def _validate_highlight_semantics(payload: HighlightWrite) -> None:
    try:
        validate_ctas(payload)
    except TemplateValidationError as exc:
        api_error(status.HTTP_422_UNPROCESSABLE_ENTITY, exc.code, exc.message)


@router.post(
    "/storefront/highlights",
    response_model=HighlightRead,
    status_code=status.HTTP_201_CREATED,
)
def create_highlight(
    payload: HighlightWrite,
    session: SessionDep,
    current_user: CurrentUser,
    _: StorefrontPermissions.EDIT.requiere,
) -> HighlightRead:
    _validate_highlight_semantics(payload)
    row = StorefrontHighlight(**payload.model_dump(mode="json", exclude={"starts_at", "ends_at"}),
                              starts_at=payload.starts_at, ends_at=payload.ends_at)
    session.add(row)
    session.flush()  # asigna el id antes de auditar
    record_config_change(
        session, actor_user_id=current_user.id, entity_type="storefront_highlight",
        entity_id=row.id, action="create", changed_fields=sorted(payload.model_dump()),
    )
    commit_or_conflict(session, "No fue posible crear el destacado.")
    session.refresh(row)
    return _highlight_read(row)


@router.put("/storefront/highlights/{highlight_id}", response_model=HighlightRead)
def update_highlight(
    highlight_id: uuid.UUID,
    payload: HighlightWrite,
    session: SessionDep,
    current_user: CurrentUser,
    _: StorefrontPermissions.EDIT.requiere,
) -> HighlightRead:
    row = get_or_404(session, StorefrontHighlight, highlight_id, _HIGHLIGHT_NOT_FOUND)
    _validate_highlight_semantics(payload)
    data = payload.model_dump(mode="json", exclude={"starts_at", "ends_at"})
    for field, value in data.items():
        setattr(row, field, value)
    row.starts_at = payload.starts_at
    row.ends_at = payload.ends_at
    row.updated_at = utc_now()
    session.add(row)
    record_config_change(
        session, actor_user_id=current_user.id, entity_type="storefront_highlight",
        entity_id=row.id, action="update", changed_fields=sorted(payload.model_dump()),
    )
    commit_or_conflict(session, "No fue posible guardar el destacado.")
    session.refresh(row)
    return _highlight_read(row)


@router.delete(
    "/storefront/highlights/{highlight_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_highlight(
    highlight_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: StorefrontPermissions.EDIT.requiere,
) -> None:
    row = get_or_404(session, StorefrontHighlight, highlight_id, _HIGHLIGHT_NOT_FOUND)
    session.delete(row)
    record_config_change(
        session, actor_user_id=current_user.id, entity_type="storefront_highlight",
        entity_id=highlight_id, action="delete", changed_fields=[],
    )
    commit_or_conflict(session, "No fue posible eliminar el destacado.")


# ---------------------------------------------------------------------------
# Footer (singleton)
# ---------------------------------------------------------------------------

class FooterPatch(ApiPatchSchema):
    template: Optional[Literal["barra", "columnas", "centrado"]] = None
    show_slogan: Optional[bool] = None
    show_phones: Optional[bool] = None
    show_schedule: Optional[bool] = None
    show_links: Optional[bool] = None
    note: Optional[str] = Field(default=None, max_length=200)
    color_scheme: Optional[Literal["dark", "soft", "brand"]] = None
    social_links: Optional[list[SocialLink]] = Field(default=None, max_length=6)


@router.patch("/storefront/footer", response_model=FooterRead)
def update_footer(
    payload: FooterPatch,
    session: SessionDep,
    current_user: CurrentUser,
    _: StorefrontPermissions.EDIT.requiere,
) -> FooterRead:
    footer = get_footer_settings(session)
    changes = payload.model_dump(exclude_unset=True, mode="json")
    for field, value in changes.items():
        setattr(footer, field, value)
    footer.updated_at = utc_now()
    session.add(footer)
    if changes:
        record_config_change(
            session, actor_user_id=current_user.id, entity_type="storefront_footer",
            entity_id=_FOOTER_AUDIT_ID, action="update",
            changed_fields=sorted(changes.keys()),
        )
    commit_or_conflict(session, "No fue posible guardar el footer.")
    session.refresh(footer)
    return FooterRead.model_validate(footer, from_attributes=True)


# ---------------------------------------------------------------------------
# Tema y metadatos (singleton settings)
# ---------------------------------------------------------------------------

class ThemePatch(ApiPatchSchema):
    theme_preset: Optional[str] = None
    theme_accent: Optional[str] = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")


@router.patch("/storefront/theme")
def update_theme(
    payload: ThemePatch,
    session: SessionDep,
    current_user: CurrentUser,
    _: StorefrontPermissions.MANAGE_THEME.requiere,
) -> dict:
    changes = payload.model_dump(exclude_unset=True)
    if "theme_preset" in changes and changes["theme_preset"] not in THEME_PRESETS:
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "preset_desconocido", "Preset no reconocido."
        )
    settings_row = get_storefront_settings(session)
    for field, value in changes.items():
        setattr(settings_row, field, value)
    settings_row.updated_at = utc_now()
    session.add(settings_row)
    if changes:
        record_config_change(
            session, actor_user_id=current_user.id, entity_type="storefront_settings",
            entity_id=_SETTINGS_AUDIT_ID, action="theme", changed_fields=sorted(changes),
        )
    commit_or_conflict(session, "No fue posible activar el tema.")
    session.refresh(settings_row)
    return {
        "theme_preset": settings_row.theme_preset,
        "theme_accent": settings_row.theme_accent,
        "tokens": theme_tokens(settings_row),
    }


class SettingsPatch(ApiPatchSchema):
    site_title: Optional[str] = Field(default=None, max_length=120)
    site_description: Optional[str] = Field(default=None, max_length=300)
    favicon_file_id: Optional[uuid.UUID] = None
    social_image_file_id: Optional[uuid.UUID] = None
    storefront_enabled: Optional[bool] = None
    maintenance_message: Optional[str] = None
    hero_autoplay: Optional[bool] = None
    hero_interval_seconds: Optional[int] = Field(default=None, ge=4, le=12)
    hero_transition: Optional[Literal["slide", "fade"]] = None
    hero_show_arrows: Optional[bool] = None
    hero_show_dots: Optional[bool] = None


@router.patch("/storefront/settings", response_model=SettingsRead)
def update_site_settings(
    payload: SettingsPatch,
    session: SessionDep,
    current_user: CurrentUser,
    _: StorefrontPermissions.MANAGE_THEME.requiere,
) -> SettingsRead:
    changes = payload.model_dump(exclude_unset=True)
    for field in ("favicon_file_id", "social_image_file_id"):
        file_id = changes.get(field)
        if file_id is not None:
            stored = get_active_file(session, file_id)
            allowed = ("favicon",) if field == "favicon_file_id" else ("image",)
            if stored is None or stored.kind not in allowed:
                api_error(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    "archivo_invalido",
                    f"El archivo de {field} no existe o no es del tipo correcto.",
                )
    settings_row = get_storefront_settings(session)
    for field, value in changes.items():
        setattr(settings_row, field, value)
    settings_row.updated_at = utc_now()
    session.add(settings_row)
    if changes:
        record_config_change(
            session, actor_user_id=current_user.id, entity_type="storefront_settings",
            entity_id=_SETTINGS_AUDIT_ID, action="update",
            changed_fields=sorted(changes.keys()),
        )
    commit_or_conflict(session, "No fue posible guardar los metadatos del sitio.")
    session.refresh(settings_row)
    return SettingsRead.model_validate(settings_row, from_attributes=True)


# ---------------------------------------------------------------------------
# Sitio público
# ---------------------------------------------------------------------------

@router.get("/public/storefront/site", response_model=PublicStorefrontSite)
def public_site(session: SessionDep, response: Response) -> dict:
    payload = site_public_payload(session)
    session.commit()  # persiste los singletons creados perezosamente
    response.headers["Cache-Control"] = "public, max-age=60"
    return payload


@router.get(
    "/public/storefront/highlights", response_model=list[PublicHighlight]
)
def public_highlights(
    surface: HighlightSurface, session: SessionDep, response: Response
) -> list[dict]:
    rows = list_highlights(session, surface=surface, only_active=True)
    response.headers["Cache-Control"] = "public, max-age=60"
    return [highlight_public_payload(row) for row in rows]
