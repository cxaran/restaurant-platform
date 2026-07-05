"""Servicio del storefront plano: heros, destacados, footer y tema.

Sin revisiones ni publicación: los mutadores del router guardan directo y el
sitio público lee lo activo. Aquí viven la creación perezosa de singletons,
la derivación de tokens del tema y los payloads públicos con datos REALES
del negocio/catálogo (producto del showcase, teléfonos, horario) — nunca
texto manual duplicado.
"""

import uuid
from datetime import datetime as _dt
from typing import Optional

from sqlmodel import Session, select

from backend.app.models.business import BusinessPhone
from backend.app.models.catalog import Product
from backend.app.models.storefront import (
    SINGLETON_ID,
    StorefrontFooter,
    StorefrontHero,
    StorefrontHighlight,
    StorefrontSettings,
)
from backend.app.services.business_service import (
    business_timezone,
    effective_schedule_for_date,
    get_business_profile,
    is_open_at,
)
from backend.app.storefront.presets import DEFAULT_PRESET, THEME_PRESETS, build_tokens
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


def get_footer_settings(session: Session) -> StorefrontFooter:
    row = session.get(StorefrontFooter, SINGLETON_ID)
    if row is None:
        row = StorefrontFooter(id=SINGLETON_ID)
        session.add(row)
        session.flush()
    return row


def theme_tokens(settings_row: StorefrontSettings) -> dict:
    """Tokens derivados de preset + acento; un preset desconocido (dato legado)
    cae al preset por defecto en vez de romper el sitio."""
    preset = settings_row.theme_preset
    if preset not in THEME_PRESETS:
        preset = DEFAULT_PRESET
    return build_tokens(preset, accent=settings_row.theme_accent)


def list_heros(session: Session, *, only_active: bool = False) -> list[StorefrontHero]:
    stmt = select(StorefrontHero).order_by(
        StorefrontHero.sort_order,  # pyright: ignore[reportArgumentType]
        StorefrontHero.created_at,  # pyright: ignore[reportArgumentType]
    )
    if only_active:
        stmt = stmt.where(StorefrontHero.is_active == True)  # noqa: E712
    return list(session.exec(stmt).all())


def list_highlights(
    session: Session, *, surface: Optional[str] = None, only_active: bool = False
) -> list[StorefrontHighlight]:
    stmt = select(StorefrontHighlight).order_by(
        StorefrontHighlight.surface,  # pyright: ignore[reportArgumentType]
        StorefrontHighlight.sort_order,  # pyright: ignore[reportArgumentType]
        StorefrontHighlight.created_at,  # pyright: ignore[reportArgumentType]
    )
    if surface is not None:
        stmt = stmt.where(StorefrontHighlight.surface == surface)
    if only_active:
        stmt = stmt.where(StorefrontHighlight.is_active == True)  # noqa: E712
    rows = list(session.exec(stmt).all())
    if not only_active:
        return rows
    # Ventana temporal (opcional) filtrada al servir — sin scheduler.
    now = utc_now()
    visible = []
    for row in rows:
        if row.starts_at and now < row.starts_at.replace(tzinfo=None):
            continue
        if row.ends_at and now >= row.ends_at.replace(tzinfo=None):
            continue
        visible.append(row)
    return visible


# ---------------------------------------------------------------------------
# Payloads públicos
# ---------------------------------------------------------------------------

def _hero_product_payload(session: Session, hero: StorefrontHero) -> Optional[dict]:
    """Binding real del showcase: precio y disponibilidad del catálogo vivo."""
    if hero.product_id is None:
        return None
    product = session.get(Product, hero.product_id)
    if product is None or not product.is_active:
        return None
    return {
        "id": str(product.id),
        "name": product.name,
        "money_price_amount": (
            str(product.money_price_amount)
            if product.money_price_amount is not None
            else None
        ),
        "credit_redemption_price": product.credit_redemption_price,
        "is_available": product.is_available,
    }


def hero_public_payload(session: Session, hero: StorefrontHero) -> dict:
    return {
        "id": str(hero.id),
        "template": hero.template,
        "eyebrow": hero.eyebrow,
        "title": hero.title,
        "title_accent": hero.title_accent,
        "description": hero.description,
        "primary_cta": hero.primary_cta,
        "secondary_cta": hero.secondary_cta,
        "product": _hero_product_payload(session, hero),
        "image": {
            "desktop_file_id": str(hero.desktop_file_id) if hero.desktop_file_id else None,
            "mobile_file_id": str(hero.mobile_file_id) if hero.mobile_file_id else None,
            "alt_text": hero.image_alt,
            "focal_x": hero.focal_x,
            "focal_y": hero.focal_y,
        },
        "height": hero.height,
        "alignment": hero.alignment,
        "color_scheme": hero.color_scheme,
        "button_variant": hero.button_variant,
        "overlay": hero.overlay,
        "image_position": hero.image_position,
        "image_frame": hero.image_frame,
    }


def highlight_public_payload(row: StorefrontHighlight) -> dict:
    return {
        "id": str(row.id),
        "surface": row.surface,
        "icon": row.icon,
        "eyebrow": row.eyebrow,
        "title": row.title,
        "subtitle": row.subtitle,
        "cta": row.cta,
        "animation": row.animation,
        "color_scheme": row.color_scheme,
    }


def footer_public_payload(session: Session) -> dict:
    footer = get_footer_settings(session)
    profile = get_business_profile(session)

    slogan = None
    if footer.show_slogan:
        slogan = footer.note or (profile.slogan if profile else None)

    phones: list[dict] = []
    if footer.show_phones:
        rows = session.exec(
            select(BusinessPhone).where(
                BusinessPhone.is_public == True,  # noqa: E712
                BusinessPhone.is_active == True,  # noqa: E712
            )
        ).all()
        phones = [
            {
                "label": phone.label,
                "phone": phone.phone,
                "phone_normalized": phone.phone_normalized,
                "is_whatsapp": phone.is_whatsapp,
            }
            for phone in rows
        ]

    schedule = None
    if footer.show_schedule and profile is not None:
        tz = business_timezone(profile)
        local_now = _dt.now(tz)
        day = effective_schedule_for_date(session, local_now.date())
        schedule = {
            "is_open_now": is_open_at(session, local_now),
            "today_slots": [
                {"opens_at": str(opens), "closes_at": str(closes)}
                for opens, closes in day.slots
            ],
        }

    return {
        "template": footer.template,
        "color_scheme": footer.color_scheme,
        "slogan": slogan,
        "phones": phones,
        "schedule": schedule,
        "show_links": footer.show_links,
        "address": profile.main_address if profile else None,
        "social_links": list(footer.social_links or []),
    }


def site_public_payload(session: Session) -> dict:
    """Payload ÚNICO del sitio público: metadatos, tema, carrusel, heros y
    footer. La portada es composición fija — este payload es su contenido."""
    settings_row = get_storefront_settings(session)
    profile = get_business_profile(session)
    heros = [
        hero_public_payload(session, hero)
        for hero in list_heros(session, only_active=True)
    ]
    return {
        "enabled": settings_row.storefront_enabled,
        "maintenance_message": settings_row.maintenance_message,
        "meta": {
            "title": settings_row.site_title or (profile.trade_name if profile else None),
            "description": settings_row.site_description,
            "favicon_file_id": (
                str(settings_row.favicon_file_id) if settings_row.favicon_file_id else None
            ),
            "social_image_file_id": (
                str(settings_row.social_image_file_id)
                if settings_row.social_image_file_id
                else None
            ),
        },
        "auth": {
            "headline": settings_row.auth_headline,
            "subcopy": settings_row.auth_subcopy,
        },
        "theme_tokens": theme_tokens(settings_row),
        "carousel": {
            "autoplay": settings_row.hero_autoplay,
            "interval_seconds": settings_row.hero_interval_seconds,
            "transition": settings_row.hero_transition,
            "show_arrows": settings_row.hero_show_arrows,
            "show_dots": settings_row.hero_show_dots,
        },
        "heros": heros,
        "footer": footer_public_payload(session),
    }


def resort_heros(session: Session, hero_ids: list[uuid.UUID]) -> list[StorefrontHero]:
    """Reorden ATÓMICO: el set completo de heros, en una sola transacción."""
    heros = {hero.id: hero for hero in list_heros(session)}
    if set(hero_ids) != set(heros) or len(hero_ids) != len(heros):
        raise StorefrontRuleError(
            "orden_incompleto",
            "El reorden debe incluir exactamente todos los heros.",
        )
    now = utc_now()
    for position, hero_id in enumerate(hero_ids, start=1):
        hero = heros[hero_id]
        hero.sort_order = position * 10
        hero.updated_at = now
        session.add(hero)
    session.flush()
    return sorted(heros.values(), key=lambda hero: hero.sort_order)
