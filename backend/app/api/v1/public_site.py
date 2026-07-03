"""Endpoints públicos del sitio (sin sesión, sin permisos).

Exponen SOLO lo que el visitante necesita: identidad del negocio, teléfonos
públicos, estado abierto/cerrado y políticas visibles (envío gratis, mínimo de
compra). Nada interno se proyecta aquí. Respuestas cacheables: cambian sólo
cuando el administrador edita la configuración.
"""

from datetime import datetime

from fastapi import APIRouter, Response
from sqlmodel import select

from backend.app.api.resource_actions import serialize_many
from backend.app.core.database import SessionDep
from backend.app.models.business import BusinessPhone
from backend.app.schemas.business import (
    PublicBusinessPhone,
    PublicBusinessRead,
    PublicDaySlot,
)
from backend.app.services.business_service import (
    business_timezone,
    effective_schedule_for_date,
    get_business_profile,
    get_business_settings,
    is_open_at,
)

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/business", response_model=PublicBusinessRead)
def read_public_business(session: SessionDep, response: Response) -> PublicBusinessRead:
    profile = get_business_profile(session)
    settings_row = get_business_settings(session)
    tz = business_timezone(profile)
    now = datetime.now(tz)

    phones = session.exec(
        select(BusinessPhone)
        .where(BusinessPhone.is_public == True)  # noqa: E712
        .where(BusinessPhone.is_active == True)  # noqa: E712
        .order_by(
            BusinessPhone.sort_order,  # pyright: ignore[reportArgumentType]
            BusinessPhone.created_at,  # pyright: ignore[reportArgumentType]
        )
    ).all()

    today = effective_schedule_for_date(session, now.date())

    # Config pública: cache corto compartido; se sirve igual a todos los visitantes.
    response.headers["Cache-Control"] = "public, max-age=60"
    return PublicBusinessRead(
        trade_name=profile.trade_name,
        slogan=profile.slogan,
        logo_file_id=profile.logo_file_id,
        currency_code=profile.currency_code,
        timezone=profile.timezone,
        is_accepting_orders=profile.is_accepting_orders,
        is_open_now=is_open_at(session, now),
        today_slots=[
            PublicDaySlot(opens_at=opens, closes_at=closes) for opens, closes in today.slots
        ],
        phones=serialize_many(PublicBusinessPhone, phones),
        allow_online_orders=settings_row.allow_online_orders,
        allow_delivery=settings_row.allow_delivery,
        allow_pickup=settings_row.allow_pickup,
        minimum_delivery_order_amount=settings_row.minimum_delivery_order_amount,
        free_shipping_global_from_amount=settings_row.free_shipping_global_from_amount,
    )
