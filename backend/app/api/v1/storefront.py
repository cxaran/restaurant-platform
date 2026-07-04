"""Editor del sitio (§46–§48) y página pública del storefront.

Editar borradores no otorga publicar (§52); el sitio público sólo carga
revisiones publicadas (§47) y los borradores se previsualizan con permiso.
"""

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Response, status
from pydantic import Field
from sqlmodel import select

from backend.app.api.resource_actions import api_error, commit_or_conflict, get_or_404
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.models.storefront import (
    StorefrontPage,
    StorefrontPageRevision,
    StorefrontPageSection,
    StorefrontSectionMedia,
    StorefrontThemeRevision,
)
from backend.app.schemas.base import ApiPatchSchema, ApiReadSchema, ApiWriteSchema
from backend.app.security.groups.storefront import StorefrontPermissions
from backend.app.services.config_audit import record_config_change
from backend.app.services.file_service import get_active_file
from backend.app.services.storefront_service import (
    StorefrontRuleError,
    active_layout,
    get_or_create_draft,
    get_page,
    get_storefront_settings,
    list_pages,
    public_page_payload,
    publish_layout,
    publish_revision,
    serialize_section_media,
    templates_catalog,
)
from backend.app.storefront.presets import DEFAULT_PRESET, THEME_PRESETS, build_tokens
from backend.app.storefront.templates import TemplateValidationError, validate_section_configs
from backend.app.utils.utc_now import utc_now

router = APIRouter(tags=["storefront"])

_PAGE_NOT_FOUND = "Página no encontrada"
_SECTION_NOT_FOUND = "Sección no encontrada"

# entity_id determinístico para auditar el singleton (hex con letras a propósito;
# ver business_service.SINGLETON_AUDIT_ID).
_SETTINGS_AUDIT_ID = uuid.UUID("00000000-0000-4000-a000-5706ef2e7001")


# ---------------------------------------------------------------------------
# Schemas locales del editor
# ---------------------------------------------------------------------------

class SectionInput(ApiWriteSchema):
    template_key: str
    template_version: int = 1
    section_name: Optional[str] = Field(default=None, max_length=180)
    sort_order: int = 0
    is_visible: bool = True
    visible_from: Optional[datetime] = None
    visible_until: Optional[datetime] = None
    content_config: dict = Field(default_factory=dict)
    style_config: dict = Field(default_factory=dict)
    data_binding_config: dict = Field(default_factory=dict)
    behavior_config: dict = Field(default_factory=dict)


class SectionRead(ApiReadSchema):
    id: uuid.UUID
    template_key: str
    template_version: int
    section_name: Optional[str] = None
    sort_order: int
    is_visible: bool
    visible_from: Optional[datetime] = None
    visible_until: Optional[datetime] = None
    content_config: dict
    style_config: dict
    data_binding_config: dict
    behavior_config: dict


class RevisionRead(ApiReadSchema):
    id: uuid.UUID
    revision_number: int
    status: str
    page_title: Optional[str] = None
    meta_description: Optional[str] = None
    sections: list[SectionRead] = Field(default_factory=list)


class RevisionMetaUpdate(ApiPatchSchema):
    page_title: Optional[str] = Field(default=None, max_length=180)
    meta_description: Optional[str] = Field(default=None, max_length=300)
    og_image_file_id: Optional[uuid.UUID] = None


class ThemeCreate(ApiWriteSchema):
    preset: str = DEFAULT_PRESET
    accent: Optional[str] = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    theme_name: Optional[str] = Field(default=None, max_length=120)


class SiteMetadataUpdate(ApiPatchSchema):
    site_title: Optional[str] = Field(default=None, max_length=120)
    site_description: Optional[str] = Field(default=None, max_length=300)
    favicon_file_id: Optional[uuid.UUID] = None
    social_image_file_id: Optional[uuid.UUID] = None
    storefront_enabled: Optional[bool] = None
    maintenance_message: Optional[str] = None


def _revision_read(revision: StorefrontPageRevision) -> RevisionRead:
    return RevisionRead(
        id=revision.id,
        revision_number=revision.revision_number,
        status=revision.status,
        page_title=revision.page_title,
        meta_description=revision.meta_description,
        sections=[
            SectionRead.model_validate(section, from_attributes=True)
            for section in sorted(revision.sections, key=lambda s: s.sort_order)
        ],
    )


def _page_or_404(session: SessionDep, page_key: str) -> StorefrontPage:
    page = get_page(session, page_key)
    if page is None:
        api_error(status.HTTP_404_NOT_FOUND, "pagina_no_encontrada", _PAGE_NOT_FOUND)
    return page


# ---------------------------------------------------------------------------
# Editor (panel)
# ---------------------------------------------------------------------------

@router.get("/storefront/templates")
def list_templates(_: StorefrontPermissions.READ_DRAFT.requiere) -> list[dict]:
    return templates_catalog()


@router.get("/storefront/pages")
def list_storefront_pages(
    session: SessionDep, _: StorefrontPermissions.READ_DRAFT.requiere
) -> list[dict]:
    """Listado real de páginas con su estado de publicación y borrador (§41)."""
    return list_pages(session)


class SectionMediaUpsert(ApiWriteSchema):
    """Media por slot (§43): imágenes verificadas del banco de archivos."""

    desktop_file_id: Optional[uuid.UUID] = None
    mobile_file_id: Optional[uuid.UUID] = None
    alt_text: Optional[str] = Field(default=None, max_length=255)
    focal_point_x: Optional[float] = Field(default=None, ge=0, le=1)
    focal_point_y: Optional[float] = Field(default=None, ge=0, le=1)


def _draft_section_or_error(session: SessionDep, section_id: uuid.UUID) -> StorefrontPageSection:
    section = get_or_404(session, StorefrontPageSection, section_id, _SECTION_NOT_FOUND)
    if section.revision.status != "draft":
        api_error(
            status.HTTP_409_CONFLICT, "revision_publicada",
            "La media se edita en el borrador; publica una nueva versión (§48).",
        )
    return section


@router.put("/storefront/sections/{section_id}/media/{slot_key}")
def upsert_section_media(
    section_id: uuid.UUID,
    slot_key: str,
    payload: SectionMediaUpsert,
    session: SessionDep,
    _: StorefrontPermissions.MANAGE_MEDIA.requiere,
) -> dict:
    if not slot_key.replace("_", "").replace("-", "").isalnum() or len(slot_key) > 80:
        api_error(status.HTTP_422_UNPROCESSABLE_ENTITY, "slot_invalido", "Slot no válido.")
    if payload.desktop_file_id is None and payload.mobile_file_id is None:
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "imagen_requerida",
            "Indica al menos la imagen de escritorio o la de móvil.",
        )
    section = _draft_section_or_error(session, section_id)
    for file_id in (payload.desktop_file_id, payload.mobile_file_id):
        if file_id is not None:
            stored = get_active_file(session, file_id)
            if stored is None or stored.kind != "image":
                api_error(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    "archivo_invalido",
                    "La media de sección debe ser una imagen activa del banco.",
                )
    media = session.exec(
        select(StorefrontSectionMedia).where(
            StorefrontSectionMedia.section_id == section.id,
            StorefrontSectionMedia.slot_key == slot_key,
        )
    ).first()
    if media is None:
        media = StorefrontSectionMedia(section_id=section.id, slot_key=slot_key)
    for field, value in payload.model_dump().items():
        setattr(media, field, value)
    media.updated_at = utc_now()
    session.add(media)
    commit_or_conflict(session, "No fue posible guardar la media de la sección.")
    session.refresh(section)
    return serialize_section_media(section)


@router.delete(
    "/storefront/sections/{section_id}/media/{slot_key}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_section_media(
    section_id: uuid.UUID,
    slot_key: str,
    session: SessionDep,
    _: StorefrontPermissions.MANAGE_MEDIA.requiere,
) -> None:
    section = _draft_section_or_error(session, section_id)
    media = session.exec(
        select(StorefrontSectionMedia).where(
            StorefrontSectionMedia.section_id == section.id,
            StorefrontSectionMedia.slot_key == slot_key,
        )
    ).first()
    if media is None:
        api_error(status.HTTP_404_NOT_FOUND, "media_no_encontrada", "Slot sin media.")
    session.delete(media)
    commit_or_conflict(session, "No fue posible quitar la media.")


class SectionsSortRequest(ApiWriteSchema):
    """Reorden ATÓMICO (§49): el set completo de secciones del borrador."""

    section_ids: list[uuid.UUID] = Field(min_length=1)


@router.post("/storefront/pages/{page_key}/draft/sections/sort")
def sort_draft_sections(
    page_key: str,
    payload: SectionsSortRequest,
    session: SessionDep,
    current_user: CurrentUser,
    _: StorefrontPermissions.EDIT.requiere,
) -> list[dict]:
    page = _page_or_404(session, page_key)
    draft = get_or_create_draft(session, page, created_by=current_user.id)
    existing = {section.id: section for section in draft.sections}
    if set(payload.section_ids) != set(existing) or len(payload.section_ids) != len(existing):
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "orden_incompleto",
            "El reorden debe incluir exactamente todas las secciones del borrador.",
        )
    now = utc_now()
    for position, section_id in enumerate(payload.section_ids, start=1):
        section = existing[section_id]
        section.sort_order = position * 10
        section.updated_at = now
        session.add(section)
    commit_or_conflict(session, "No fue posible reordenar las secciones.")
    session.refresh(draft)
    return [
        {"id": str(section.id), "sort_order": section.sort_order}
        for section in sorted(draft.sections, key=lambda s: s.sort_order)
    ]


class LayoutPublishRequest(ApiWriteSchema):
    """Header/footer (§44): contratos validados en código, versionados."""

    header_config: dict = Field(default_factory=dict)
    footer_config: dict = Field(default_factory=dict)


@router.get("/storefront/layout")
def read_layout(
    session: SessionDep, _: StorefrontPermissions.READ_DRAFT.requiere
) -> dict:
    layout = active_layout(session)
    if layout is None:
        return {"version_number": None, "header_config": {}, "footer_config": {}}
    return {
        "version_number": layout.version_number,
        "header_config": layout.header_config,
        "footer_config": layout.footer_config,
    }


@router.put("/storefront/layout")
def update_layout(
    payload: LayoutPublishRequest,
    session: SessionDep,
    current_user: CurrentUser,
    _: StorefrontPermissions.MANAGE_NAVIGATION.requiere,
) -> dict:
    try:
        revision = publish_layout(
            session,
            header_config=payload.header_config,
            footer_config=payload.footer_config,
            actor_id=current_user.id,
        )
    except StorefrontRuleError as exc:
        api_error(status.HTTP_422_UNPROCESSABLE_ENTITY, exc.code, exc.message)
    record_config_change(
        session, actor_user_id=current_user.id, entity_type="storefront_layout_revisions",
        entity_id=revision.id, action="publish",
        changed_fields=["header_config", "footer_config"],
    )
    commit_or_conflict(session, "No fue posible publicar el layout.")
    return {
        "version_number": revision.version_number,
        "header_config": revision.header_config,
        "footer_config": revision.footer_config,
    }


@router.get("/storefront/theme-presets")
def list_theme_presets(_: StorefrontPermissions.MANAGE_THEME.requiere) -> list[dict]:
    return [
        {"name": name, "tokens": tokens, "is_default": name == DEFAULT_PRESET}
        for name, tokens in THEME_PRESETS.items()
    ]


@router.post("/storefront/theme", status_code=status.HTTP_201_CREATED)
def create_and_activate_theme(
    payload: ThemeCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: StorefrontPermissions.MANAGE_THEME.requiere,
) -> dict:
    if payload.preset not in THEME_PRESETS:
        api_error(status.HTTP_422_UNPROCESSABLE_ENTITY, "preset_desconocido", "Preset no reconocido.")
    last = session.exec(
        select(StorefrontThemeRevision.version_number).order_by(
            StorefrontThemeRevision.version_number.desc()  # pyright: ignore[reportAttributeAccessIssue]
        )
    ).first()
    theme = StorefrontThemeRevision(
        version_number=int(last or 0) + 1,
        status="published",
        theme_name=payload.theme_name or payload.preset,
        tokens_json=build_tokens(payload.preset, accent=payload.accent),
        created_by=current_user.id,
        published_by=current_user.id,
        published_at=utc_now(),
    )
    session.add(theme)
    session.flush()
    settings_row = get_storefront_settings(session)
    settings_row.active_theme_revision_id = theme.id
    settings_row.updated_at = utc_now()
    session.add(settings_row)
    record_config_change(
        session, actor_user_id=current_user.id, entity_type="storefront_theme_revisions",
        entity_id=theme.id, action="publish", changed_fields=["tokens_json"],
    )
    commit_or_conflict(session, "No fue posible activar el tema.")
    return {"id": str(theme.id), "theme_name": theme.theme_name, "tokens": theme.tokens_json}


@router.patch("/storefront/settings")
def update_site_metadata(
    payload: SiteMetadataUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: StorefrontPermissions.MANAGE_THEME.requiere,
) -> dict:
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
    return {"updated": sorted(changes.keys())}


@router.get("/storefront/pages/{page_key}/draft", response_model=RevisionRead)
def read_draft(
    page_key: str,
    session: SessionDep,
    current_user: CurrentUser,
    _: StorefrontPermissions.READ_DRAFT.requiere,
) -> RevisionRead:
    page = _page_or_404(session, page_key)
    draft = get_or_create_draft(session, page, created_by=current_user.id)
    commit_or_conflict(session, "No fue posible preparar el borrador.")
    session.refresh(draft)
    return _revision_read(draft)


@router.patch("/storefront/pages/{page_key}/draft", response_model=RevisionRead)
def update_draft_meta(
    page_key: str,
    payload: RevisionMetaUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: StorefrontPermissions.EDIT.requiere,
) -> RevisionRead:
    page = _page_or_404(session, page_key)
    draft = get_or_create_draft(session, page, created_by=current_user.id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(draft, field, value)
    draft.updated_at = utc_now()
    session.add(draft)
    commit_or_conflict(session, "No fue posible guardar el borrador.")
    session.refresh(draft)
    return _revision_read(draft)


@router.post(
    "/storefront/pages/{page_key}/draft/sections",
    response_model=RevisionRead,
    status_code=status.HTTP_201_CREATED,
)
def add_section(
    page_key: str,
    payload: SectionInput,
    session: SessionDep,
    current_user: CurrentUser,
    _: StorefrontPermissions.EDIT.requiere,
) -> RevisionRead:
    page = _page_or_404(session, page_key)
    draft = get_or_create_draft(session, page, created_by=current_user.id)
    try:
        validate_section_configs(
            payload.template_key, payload.template_version,
            content=payload.content_config, style=payload.style_config,
            data_binding=payload.data_binding_config, behavior=payload.behavior_config,
        )
    except TemplateValidationError as exc:
        api_error(status.HTTP_422_UNPROCESSABLE_ENTITY, exc.code, exc.message)
    section = StorefrontPageSection(page_revision_id=draft.id, **payload.model_dump())
    session.add(section)
    commit_or_conflict(session, "No fue posible agregar la sección.")
    session.refresh(draft)
    return _revision_read(draft)


@router.put("/storefront/sections/{section_id}", response_model=SectionRead)
def update_section(
    section_id: uuid.UUID,
    payload: SectionInput,
    session: SessionDep,
    _: StorefrontPermissions.EDIT.requiere,
) -> SectionRead:
    section = get_or_404(session, StorefrontPageSection, section_id, _SECTION_NOT_FOUND)
    revision = section.revision
    if revision.status != "draft":
        api_error(
            status.HTTP_409_CONFLICT, "revision_publicada",
            "Sólo los borradores se editan; publica una nueva versión (§48).",
        )
    try:
        validate_section_configs(
            payload.template_key, payload.template_version,
            content=payload.content_config, style=payload.style_config,
            data_binding=payload.data_binding_config, behavior=payload.behavior_config,
        )
    except TemplateValidationError as exc:
        api_error(status.HTTP_422_UNPROCESSABLE_ENTITY, exc.code, exc.message)
    for field, value in payload.model_dump().items():
        setattr(section, field, value)
    section.updated_at = utc_now()
    session.add(section)
    commit_or_conflict(session, "No fue posible guardar la sección.")
    session.refresh(section)
    return SectionRead.model_validate(section, from_attributes=True)


@router.delete("/storefront/sections/{section_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_section(
    section_id: uuid.UUID,
    session: SessionDep,
    _: StorefrontPermissions.EDIT.requiere,
) -> None:
    section = get_or_404(session, StorefrontPageSection, section_id, _SECTION_NOT_FOUND)
    if section.revision.status != "draft":
        api_error(status.HTTP_409_CONFLICT, "revision_publicada", "Sólo los borradores se editan.")
    session.delete(section)
    commit_or_conflict(session, "No fue posible quitar la sección.")


@router.post("/storefront/pages/{page_key}/publish", response_model=RevisionRead)
def publish_page(
    page_key: str,
    session: SessionDep,
    current_user: CurrentUser,
    _: StorefrontPermissions.PUBLISH.requiere,
    revision_id: Optional[uuid.UUID] = None,
) -> RevisionRead:
    """Publica el borrador; con ``revision_id`` re-publica una versión (rollback §48,
    que además requiere el permiso correspondiente)."""
    page = _page_or_404(session, page_key)
    if revision_id is not None:
        if not current_user.access_control(StorefrontPermissions.ROLLBACK.permission):
            api_error(status.HTTP_403_FORBIDDEN, "forbidden", "Se requiere permiso de rollback.")
        revision = get_or_404(
            session, StorefrontPageRevision, revision_id, "Revisión no encontrada"
        )
    else:
        revision = get_or_create_draft(session, page, created_by=current_user.id)
    try:
        publish_revision(session, page, revision, actor_id=current_user.id)
    except StorefrontRuleError as exc:
        api_error(status.HTTP_422_UNPROCESSABLE_ENTITY, exc.code, exc.message)
    record_config_change(
        session, actor_user_id=current_user.id, entity_type="storefront_pages",
        entity_id=page.id, action="publish", changed_fields=["published_revision_id"],
    )
    commit_or_conflict(session, "No fue posible publicar la página.")
    session.refresh(revision)
    return _revision_read(revision)


@router.get("/storefront/pages/{page_key}/preview")
def preview_draft(
    page_key: str,
    session: SessionDep,
    current_user: CurrentUser,
    _: StorefrontPermissions.PREVIEW.requiere,
) -> dict:
    """Previsualización del BORRADOR (§47): nunca visible sin permiso."""
    page = _page_or_404(session, page_key)
    draft = get_or_create_draft(session, page, created_by=current_user.id)
    session.commit()
    return {
        "page_key": page.page_key,
        "revision_number": draft.revision_number,
        "sections": [
            {
                **SectionRead.model_validate(s, from_attributes=True).model_dump(),
                "media": serialize_section_media(s),
            }
            for s in sorted(draft.sections, key=lambda s: s.sort_order)
        ],
    }


# ---------------------------------------------------------------------------
# Sitio público (sólo publicado, §47)
# ---------------------------------------------------------------------------

@router.get("/public/storefront/{page_key}")
def public_storefront_page(page_key: str, session: SessionDep, response: Response) -> dict:
    settings_row = get_storefront_settings(session)
    if not settings_row.storefront_enabled:
        api_error(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "sitio_en_mantenimiento",
            settings_row.maintenance_message or "El sitio está en mantenimiento.",
        )
    try:
        payload = public_page_payload(session, page_key)
    except StorefrontRuleError as exc:
        api_error(status.HTTP_404_NOT_FOUND, exc.code, exc.message)

    theme = (
        session.get(StorefrontThemeRevision, settings_row.active_theme_revision_id)
        if settings_row.active_theme_revision_id
        else None
    )
    payload["theme_tokens"] = theme.tokens_json if theme else None
    response.headers["Cache-Control"] = "public, max-age=60"
    return payload
