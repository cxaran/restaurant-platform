"""Endpoints públicos del sitio (sin sesión, sin permisos).

Exponen SOLO lo que el visitante necesita: identidad del negocio, teléfonos
públicos, estado abierto/cerrado y políticas visibles (envío gratis, mínimo de
compra). Nada interno se proyecta aquí. Respuestas cacheables: cambian sólo
cuando el administrador edita la configuración.
"""

import uuid
from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, Response, status
from sqlmodel import select

from backend.app.api.resource_actions import api_error, serialize_many
from backend.app.core.database import SessionDep
from backend.app.models.business import BusinessPhone
from backend.app.schemas.business import (
    PublicBusinessPhone,
    PublicBusinessRead,
    PublicDaySlot,
)
from backend.app.schemas.catalog import PublicMenuCategory
from backend.app.services.business_service import (
    business_timezone,
    effective_schedule_for_date,
    get_business_profile,
    get_business_settings,
    is_open_at,
)
from backend.app.services.catalog_service import build_public_menu
from backend.app.services.file_service import get_active_file

router = APIRouter(prefix="/public", tags=["public"])

# Únicos perfiles de archivo servibles sin sesión: imágenes de catálogo/marca y
# favicon. Documentos (comprobantes, facturas, evidencias) JAMÁS salen por aquí.
_PUBLIC_FILE_KINDS = {"image", "favicon"}


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


@router.get("/menu", response_model=list[PublicMenuCategory])
def read_public_menu(session: SessionDep, response: Response) -> list[PublicMenuCategory]:
    """Menú público: catálogo REAL vigente (§58.3: se publica al instante)."""
    response.headers["Cache-Control"] = "public, max-age=60"
    return [PublicMenuCategory.model_validate(category) for category in build_public_menu(session)]


@router.get("/files/{file_id}")
def read_public_file(file_id: uuid.UUID, session: SessionDep) -> Response:
    """Entrega pública de imágenes referidas por contenido público (menú, marca).

    Sólo perfiles ``image``/``favicon``; cualquier otro tipo de archivo se
    comporta como inexistente. El binario es inmutable por id: cache largo.
    """
    stored = get_active_file(session, file_id)
    if stored is None or stored.kind not in _PUBLIC_FILE_KINDS:
        api_error(status.HTTP_404_NOT_FOUND, "archivo_no_encontrado", "Archivo no encontrado")

    filename_ascii = stored.original_filename.encode("ascii", "ignore").decode() or "archivo"
    return Response(
        content=stored.file_content,
        media_type=stored.mime_type,
        headers={
            "Content-Disposition": (
                f"inline; filename=\"{filename_ascii}\"; "
                f"filename*=UTF-8''{quote(stored.original_filename)}"
            ),
            "Cache-Control": "public, max-age=86400, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )
