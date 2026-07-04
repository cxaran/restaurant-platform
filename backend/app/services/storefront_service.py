"""Servicio del storefront (§41–§48): borradores, publicación y sitio público.

El sitio público SOLO carga revisiones publicadas (§47). Publicar valida TODO
el árbol de secciones contra las plantillas, archiva la revisión publicada
anterior (jamás se sobrescribe, §48) y actualiza el puntero de la página; el
rollback es simplemente publicar de nuevo una revisión anterior.
"""

import uuid
from typing import Optional

from sqlmodel import Session, select

from backend.app.models.business import BusinessPhone
from backend.app.models.catalog import Product, ProductCategory
from backend.app.models.storefront import (
    SINGLETON_ID,
    StorefrontLayoutRevision,
    StorefrontPage,
    StorefrontPageRevision,
    StorefrontPageSection,
    StorefrontSectionMedia,
    StorefrontSettings,
)
from backend.app.services.business_service import (
    business_timezone,
    effective_schedule_for_date,
    get_business_profile,
    get_business_settings,
    is_open_at,
)
from backend.app.storefront.templates import (
    TEMPLATES,
    TemplateValidationError,
    validate_section_configs,
)
from backend.app.utils.utc_now import utc_now


class StorefrontRuleError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def get_storefront_settings(session: Session) -> StorefrontSettings:
    row = session.get(StorefrontSettings, SINGLETON_ID)
    if row is None:
        row = StorefrontSettings(id=SINGLETON_ID)
        session.add(row)
        session.flush()
    return row


def get_page(session: Session, page_key: str) -> Optional[StorefrontPage]:
    return session.exec(
        select(StorefrontPage).where(StorefrontPage.page_key == page_key)
    ).first()


def get_or_create_draft(
    session: Session, page: StorefrontPage, *, created_by: Optional[uuid.UUID]
) -> StorefrontPageRevision:
    """Borrador vigente de la página; si no hay, se CLONA la publicada (§46)."""
    draft = session.exec(
        select(StorefrontPageRevision).where(
            StorefrontPageRevision.page_id == page.id,
            StorefrontPageRevision.status == "draft",
        )
    ).first()
    if draft is not None:
        return draft

    last_number = session.exec(
        select(StorefrontPageRevision.revision_number)
        .where(StorefrontPageRevision.page_id == page.id)
        .order_by(StorefrontPageRevision.revision_number.desc())  # pyright: ignore[reportAttributeAccessIssue]
    ).first()
    draft = StorefrontPageRevision(
        page_id=page.id,
        revision_number=int(last_number or 0) + 1,
        status="draft",
        created_by=created_by,
    )
    session.add(draft)
    session.flush()

    published = (
        session.get(StorefrontPageRevision, page.published_revision_id)
        if page.published_revision_id
        else None
    )
    if published is not None:
        draft.page_title = published.page_title
        draft.meta_description = published.meta_description
        draft.og_image_file_id = published.og_image_file_id
        for section in sorted(published.sections, key=lambda s: s.sort_order):
            clone = StorefrontPageSection(
                page_revision_id=draft.id,
                template_key=section.template_key,
                template_version=section.template_version,
                section_name=section.section_name,
                sort_order=section.sort_order,
                is_visible=section.is_visible,
                visible_from=section.visible_from,
                visible_until=section.visible_until,
                content_config=section.content_config,
                style_config=section.style_config,
                data_binding_config=section.data_binding_config,
                behavior_config=section.behavior_config,
            )
            session.add(clone)
            session.flush()
            # La media por slot también se CLONA: el borrador hereda las
            # imágenes publicadas y las reemplaza sin tocar lo vivo.
            for media in section.media:
                session.add(
                    StorefrontSectionMedia(
                        section_id=clone.id,
                        slot_key=media.slot_key,
                        desktop_file_id=media.desktop_file_id,
                        mobile_file_id=media.mobile_file_id,
                        alt_text=media.alt_text,
                        focal_point_x=media.focal_point_x,
                        focal_point_y=media.focal_point_y,
                    )
                )
        session.flush()
    return draft


def validate_revision(revision: StorefrontPageRevision) -> None:
    """Valida TODAS las secciones antes de publicar (§48)."""
    positions: set[int] = set()
    for section in revision.sections:
        if section.sort_order in positions:
            raise StorefrontRuleError(
                "orden_duplicado", "Hay dos secciones con la misma posición."
            )
        positions.add(section.sort_order)
        try:
            validate_section_configs(
                section.template_key,
                section.template_version,
                content=section.content_config,
                style=section.style_config,
                data_binding=section.data_binding_config,
                behavior=section.behavior_config,
            )
        except TemplateValidationError as exc:
            raise StorefrontRuleError(exc.code, exc.message)


def publish_revision(
    session: Session,
    page: StorefrontPage,
    revision: StorefrontPageRevision,
    *,
    actor_id: Optional[uuid.UUID],
) -> StorefrontPageRevision:
    """Publica (o re-publica: rollback §48). La anterior se archiva, no se pierde."""
    if revision.page_id != page.id:
        raise StorefrontRuleError("revision_ajena", "La revisión no pertenece a la página.")
    if revision.status not in ("draft", "archived"):
        raise StorefrontRuleError(
            "revision_no_publicable", "Sólo un borrador o una versión anterior se publican."
        )
    validate_revision(revision)

    now = utc_now()
    if page.published_revision_id and page.published_revision_id != revision.id:
        previous = session.get(StorefrontPageRevision, page.published_revision_id)
        if previous is not None:
            previous.status = "archived"
            previous.updated_at = now
            session.add(previous)

    revision.status = "published"
    revision.published_by = actor_id
    revision.published_at = now
    revision.updated_at = now
    session.add(revision)
    page.published_revision_id = revision.id
    page.updated_at = now
    session.add(page)
    session.flush()
    return revision


# ---------------------------------------------------------------------------
# Sitio público: SOLO revisiones publicadas + data bindings reales (§51)
# ---------------------------------------------------------------------------

def public_page_payload(session: Session, page_key: str) -> dict:
    page = get_page(session, page_key)
    if page is None or not page.is_active or page.published_revision_id is None:
        raise StorefrontRuleError("pagina_no_publicada", "La página no está publicada.")
    revision = session.get(StorefrontPageRevision, page.published_revision_id)
    if revision is None:
        raise StorefrontRuleError("pagina_no_publicada", "La página no está publicada.")

    profile = get_business_profile(session)
    settings_row = get_storefront_settings(session)
    now = utc_now()

    sections = []
    for section in sorted(revision.sections, key=lambda s: s.sort_order):
        if not section.is_visible:
            continue
        if section.visible_from and now < section.visible_from.replace(tzinfo=None):
            continue
        if section.visible_until and now >= section.visible_until.replace(tzinfo=None):
            continue
        sections.append(
            {
                "template_key": section.template_key,
                "template_version": section.template_version,
                "sort_order": section.sort_order,
                "content": section.content_config,
                "style": section.style_config,
                "behavior": section.behavior_config,
                "data": _resolve_binding(session, section),
                "media": serialize_section_media(section),
            }
        )

    # Metadatos del head con la cadena de resolución del §45.1.
    layout = active_layout(session)
    return {
        "page_key": page.page_key,
        "slug": page.slug,
        "meta": {
            "title": revision.page_title or settings_row.site_title or profile.trade_name,
            "description": revision.meta_description or settings_row.site_description,
            "og_image_file_id": revision.og_image_file_id or settings_row.social_image_file_id,
            "favicon_file_id": settings_row.favicon_file_id,
        },
        "layout": (
            {
                "header": layout.header_config,
                "footer": layout.footer_config,
            }
            if layout is not None
            else None
        ),
        "sections": sections,
    }


def serialize_section_media(section: StorefrontPageSection) -> dict:
    """Media por slot (§43): sólo IDs públicos; el archivo se sirve aparte."""
    return {
        media.slot_key: {
            "desktop_file_id": str(media.desktop_file_id) if media.desktop_file_id else None,
            "mobile_file_id": str(media.mobile_file_id) if media.mobile_file_id else None,
            "alt_text": media.alt_text,
            "focal_point_x": media.focal_point_x,
            "focal_point_y": media.focal_point_y,
        }
        for media in section.media
    }


def list_pages(session: Session) -> list[dict]:
    """Listado real de páginas (§41) — sin listas sembradas en el frontend."""
    pages = session.exec(
        select(StorefrontPage).order_by(StorefrontPage.page_key)  # pyright: ignore[reportArgumentType]
    ).all()
    result = []
    for page in pages:
        published = (
            session.get(StorefrontPageRevision, page.published_revision_id)
            if page.published_revision_id
            else None
        )
        draft = session.exec(
            select(StorefrontPageRevision).where(
                StorefrontPageRevision.page_id == page.id,
                StorefrontPageRevision.status == "draft",
            )
        ).first()
        result.append(
            {
                "page_key": page.page_key,
                "slug": page.slug,
                "page_type": page.page_type,
                "is_system_page": page.is_system_page,
                "is_active": page.is_active,
                "published_revision_number": published.revision_number if published else None,
                "published_at": (
                    published.published_at.isoformat()
                    if published and published.published_at
                    else None
                ),
                "has_draft": draft is not None,
                "draft_revision_number": draft.revision_number if draft else None,
            }
        )
    return result


def active_layout(session: Session) -> Optional[StorefrontLayoutRevision]:
    settings_row = get_storefront_settings(session)
    if settings_row.active_layout_revision_id is None:
        return None
    return session.get(StorefrontLayoutRevision, settings_row.active_layout_revision_id)


def publish_layout(
    session: Session,
    *,
    header_config: dict,
    footer_config: dict,
    actor_id: Optional[uuid.UUID],
) -> StorefrontLayoutRevision:
    """Nueva revisión de layout publicada (§44); la anterior queda archivada."""
    from backend.app.storefront.templates import validate_layout_configs

    try:
        validate_layout_configs(header=header_config, footer=footer_config)
    except TemplateValidationError as exc:
        raise StorefrontRuleError(exc.code, exc.message)

    now = utc_now()
    previous = active_layout(session)
    last_number = session.exec(
        select(StorefrontLayoutRevision.version_number).order_by(
            StorefrontLayoutRevision.version_number.desc()  # pyright: ignore[reportAttributeAccessIssue]
        )
    ).first()
    revision = StorefrontLayoutRevision(
        version_number=int(last_number or 0) + 1,
        status="published",
        header_template_key="storefront.header.default",
        header_config=header_config,
        footer_template_key="storefront.footer.default",
        footer_config=footer_config,
        created_by=actor_id,
        published_by=actor_id,
        published_at=now,
    )
    session.add(revision)
    session.flush()
    if previous is not None:
        previous.status = "archived"
        previous.updated_at = now
        session.add(previous)
    settings_row = get_storefront_settings(session)
    settings_row.active_layout_revision_id = revision.id
    settings_row.updated_at = now
    session.add(settings_row)
    session.flush()
    return revision


def _resolve_binding(session: Session, section: StorefrontPageSection) -> Optional[dict]:
    """Datos dinámicos por plantilla (§51): catálogo/negocio reales, jamás texto manual."""
    key = section.template_key
    if key == "storefront.announcement.free_shipping":
        settings_row = get_business_settings(session)
        return {
            "free_shipping_from_amount": (
                str(settings_row.free_shipping_global_from_amount)
                if settings_row.free_shipping_global_from_amount is not None
                else None
            )
        }
    if key == "storefront.catalog.featured_products":
        binding = section.data_binding_config or {}
        source = binding.get("source", "featured_products")
        max_items = int(binding.get("max_items", 4))
        stmt = select(Product).where(
            Product.is_active == True,  # noqa: E712
            Product.is_available == True,  # noqa: E712
        )
        if source == "featured_products":
            stmt = stmt.where(Product.is_featured == True)  # noqa: E712
        elif source == "credit_products":
            stmt = stmt.where(Product.credit_redemption_price.is_not(None))  # pyright: ignore[reportAttributeAccessIssue]
        elif source == "category" and binding.get("category_id"):
            stmt = stmt.where(Product.category_id == uuid.UUID(str(binding["category_id"])))
        elif source == "newest":
            stmt = stmt.order_by(Product.created_at.desc())  # pyright: ignore[reportAttributeAccessIssue]
        products = session.exec(stmt.limit(max_items)).all()
        return {
            "products": [
                {
                    "id": str(product.id),
                    "name": product.name,
                    "description": product.description,
                    "money_price_amount": (
                        str(product.money_price_amount)
                        if product.money_price_amount is not None
                        else None
                    ),
                    "credits_awarded_per_unit": product.credits_awarded_per_unit,
                    "credit_redemption_price": product.credit_redemption_price,
                }
                for product in products
            ]
        }
    if key == "storefront.catalog.categories":
        binding = section.data_binding_config or {}
        max_items = int(binding.get("max_items", 8))
        categories = session.exec(
            select(ProductCategory)
            .where(ProductCategory.is_active == True)  # noqa: E712
            .order_by(ProductCategory.sort_order)  # pyright: ignore[reportArgumentType]
            .limit(max_items)
        ).all()
        return {
            "categories": [
                {
                    "id": str(category.id),
                    "name": category.name,
                    "description": category.description,
                }
                for category in categories
            ]
        }
    if key == "storefront.banner.delivery":
        settings_row = get_business_settings(session)
        return {
            "delivery_enabled": settings_row.allow_delivery,
            "free_shipping_from_amount": (
                str(settings_row.free_shipping_global_from_amount)
                if settings_row.free_shipping_global_from_amount is not None
                else None
            ),
        }
    if key == "storefront.business.hours":
        profile = get_business_profile(session)
        tz = business_timezone(profile)
        from datetime import datetime as _dt

        local_now = _dt.now(tz)
        schedule = effective_schedule_for_date(session, local_now.date())
        return {
            "is_open_now": is_open_at(session, local_now),
            "today_slots": [
                {"opens_at": str(opens), "closes_at": str(closes)}
                for opens, closes in schedule.slots
            ],
        }
    if key == "storefront.business.contact":
        phones = session.exec(
            select(BusinessPhone).where(
                BusinessPhone.is_public == True,  # noqa: E712
                BusinessPhone.is_active == True,  # noqa: E712
            )
        ).all()
        return {
            "phones": [
                {
                    "label": phone.label,
                    "phone": phone.phone,
                    "phone_normalized": phone.phone_normalized,
                    "is_whatsapp": phone.is_whatsapp,
                }
                for phone in phones
            ]
        }
    return None


def templates_catalog() -> list[dict]:
    """Catálogo de plantillas con su JSON Schema (§46): el editor del frontend
    genera formularios desde estos contratos, sin duplicarlos a mano."""
    return [
        {
            "key": template.key,
            "version": template.version,
            "label": template.label,
            "content_schema": template.content_model.model_json_schema(),
            "style_schema": template.style_model.model_json_schema(),
            "data_binding_schema": template.data_binding_model.model_json_schema(),
            "behavior_schema": template.behavior_model.model_json_schema(),
        }
        for template in TEMPLATES.values()
    ]
