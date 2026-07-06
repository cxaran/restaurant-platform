"""Endpoints públicos del sitio (sin sesión, sin permisos).

Exponen SOLO lo que el visitante necesita: identidad del negocio, teléfonos
públicos, estado abierto/cerrado y políticas visibles (envío gratis, mínimo de
compra). Nada interno se proyecta aquí. Respuestas cacheables: cambian sólo
cuando el administrador edita la configuración.
"""

import uuid
from datetime import datetime
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Query, Request, Response, status
from sqlmodel import select

from backend.app.api.resource_actions import api_error, serialize_many
from backend.app.core.database import SessionDep
from backend.app.models.business import BusinessPhone
from backend.app.schemas.business import (
    PublicBusinessPhone,
    PublicBusinessRead,
    PublicDaySlot,
    PublicLegalCoupon,
    PublicLegalTermsRead,
    PublicWeeklyDay,
    PublicWeeklySchedule,
)
from backend.app.schemas.catalog import PublicMenuCategory
from backend.app.schemas.system_settings import PublicAnalyticsConfig
from backend.app.schemas.shipping import (
    PublicShippingQuoteRequest,
    PublicShippingQuoteResult,
)
from backend.app.security.rate_limit import limit_public_quote
from backend.app.services.business_service import (
    business_timezone,
    effective_schedule_for_date,
    get_business_profile,
    get_business_settings,
    is_open_at,
    weekly_schedule_slots,
)
from backend.app.services.catalog_service import build_public_menu
from backend.app.services.discount_service import list_public_coupons
from backend.app.services.file_service import get_active_file
from backend.app.services.pwa_icon_service import IconRenderError, build_square_icon
from backend.app.services.shipping_service import quote_shipping
from backend.app.utils.utc_now import utc_now

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
        online_orders_require_open_hours=settings_row.online_orders_require_open_hours,
        today_slots=[
            PublicDaySlot(opens_at=opens, closes_at=closes) for opens, closes in today.slots
        ],
        phones=serialize_many(PublicBusinessPhone, phones),
        allow_online_orders=settings_row.allow_online_orders,
        allow_delivery=settings_row.allow_delivery,
        allow_pickup=settings_row.allow_pickup,
        credits_enabled=settings_row.credits_enabled,
        minimum_delivery_order_amount=settings_row.minimum_delivery_order_amount,
        free_shipping_global_from_amount=settings_row.free_shipping_global_from_amount,
    )


@router.get("/business/schedule", response_model=PublicWeeklySchedule)
def read_public_schedule(
    session: SessionDep, response: Response
) -> PublicWeeklySchedule:
    """Horario de atención SEMANAL (recurrente) para el sitio público: los 7 días
    con sus franjas, más el día de hoy y si está abierto ahora (para resaltar)."""
    profile = get_business_profile(session)
    tz = business_timezone(profile)
    now = datetime.now(tz)
    by_day = weekly_schedule_slots(session)

    response.headers["Cache-Control"] = "public, max-age=60"
    return PublicWeeklySchedule(
        timezone=profile.timezone,
        today_weekday=now.weekday(),
        is_open_now=is_open_at(session, now),
        days=[
            PublicWeeklyDay(
                day_of_week=day,
                slots=[
                    PublicDaySlot(opens_at=opens, closes_at=closes)
                    for opens, closes in by_day[day]
                ],
            )
            for day in range(7)
        ],
    )


@router.get("/legal/terms", response_model=PublicLegalTermsRead)
def read_public_legal_terms(
    session: SessionDep, response: Response
) -> PublicLegalTermsRead:
    """Datos para el documento legal autogenerado del sitio (/terminos).

    Reúne la identidad del negocio, sus teléfonos públicos, los cupones
    GENERALES vigentes (para generar sus cláusulas) y las secciones opcionales
    que el administrador edita en el perfil. Los códigos personales nunca se
    exponen aquí.
    """
    profile = get_business_profile(session)
    settings_row = get_business_settings(session)

    phones = session.exec(
        select(BusinessPhone)
        .where(BusinessPhone.is_public == True)  # noqa: E712
        .where(BusinessPhone.is_active == True)  # noqa: E712
        .order_by(
            BusinessPhone.sort_order,  # pyright: ignore[reportArgumentType]
            BusinessPhone.created_at,  # pyright: ignore[reportArgumentType]
        )
    ).all()

    coupons = [
        PublicLegalCoupon(
            code=coupon.code,
            name=coupon.name,
            description=coupon.description,
            discount_amount=coupon.discount_amount,
            minimum_order_amount=coupon.minimum_order_amount,
            valid_from=coupon.valid_from,
            valid_until=coupon.valid_until,
        )
        for coupon in list_public_coupons(session)
    ]

    # Config pública cacheable corto: cambia sólo al editar negocio o cupones.
    response.headers["Cache-Control"] = "public, max-age=60"
    return PublicLegalTermsRead(
        trade_name=profile.trade_name,
        legal_name=profile.legal_name,
        main_address=profile.main_address,
        email=profile.email,
        currency_code=profile.currency_code,
        phones=serialize_many(PublicBusinessPhone, phones),
        coupons=coupons,
        allow_delivery=settings_row.allow_delivery,
        allow_pickup=settings_row.allow_pickup,
        minimum_delivery_order_amount=settings_row.minimum_delivery_order_amount,
        free_shipping_global_from_amount=settings_row.free_shipping_global_from_amount,
        credits_enabled=settings_row.credits_enabled,
        terms_extra=profile.terms_extra,
        privacy_extra=profile.privacy_extra,
        generated_at=utc_now(),
    )


@router.get("/site/analytics", response_model=PublicAnalyticsConfig)
def read_public_analytics_config(
    session: SessionDep, response: Response
) -> PublicAnalyticsConfig:
    """Config pública de analítica (GA4) para el sitio.

    Apagada (o sin ID de medición) devuelve solo ``enabled: false``: el frontend
    no carga ningún script. El ID de medición de GA4 es un identificador público
    por diseño de Google; ningún secreto viaja por aquí.
    """
    from backend.app.services.system_settings_service import get_system_settings

    row = get_system_settings(session)
    enabled = row.analytics_enabled and bool(row.analytics_ga4_measurement_id)
    response.headers["Cache-Control"] = "public, max-age=60"
    if not enabled:
        return PublicAnalyticsConfig(enabled=False)
    return PublicAnalyticsConfig(
        enabled=True,
        measurement_id=row.analytics_ga4_measurement_id,
        require_consent=row.analytics_require_consent,
        debug_mode=row.analytics_debug_mode,
    )


@router.get("/menu", response_model=list[PublicMenuCategory])
def read_public_menu(session: SessionDep, response: Response) -> list[PublicMenuCategory]:
    """Menú público: catálogo REAL vigente (§58.3: se publica al instante)."""
    response.headers["Cache-Control"] = "public, max-age=60"
    return [PublicMenuCategory.model_validate(category) for category in build_public_menu(session)]


@router.post("/shipping-quote", response_model=PublicShippingQuoteResult)
def quote_public_shipping(
    payload: PublicShippingQuoteRequest,
    request: Request,
    session: SessionDep,
) -> PublicShippingQuoteResult:
    """Cotización ESTIMADA de envío para el carrito (§17.2).

    Sin ubicación → ``pending_review``: el pedido puede recibirse igual y el
    costo se valida manualmente. El costo final por pedido se decide en
    ``order_shipping`` al capturar/aprobar (etapa 4), nunca aquí.
    """
    limit_public_quote(request)
    longitude, latitude = (None, None)
    if payload.location is not None:
        longitude, latitude = payload.location.coordinates
    quote = quote_shipping(
        session, subtotal=payload.subtotal, longitude=longitude, latitude=latitude
    )
    return PublicShippingQuoteResult(
        status=quote.status,
        zone_name=quote.zone_name,
        amount=quote.amount,
        is_free_shipping=quote.is_free_shipping,
        estimated_minutes=quote.estimated_minutes,
    )


@router.get("/files/{file_id}")
@router.head("/files/{file_id}")
def read_public_file(file_id: uuid.UUID, session: SessionDep, request: Request) -> Response:
    """Entrega pública de imágenes referidas por contenido público (menú, marca).

    Sólo perfiles ``image``/``favicon``; cualquier otro tipo de archivo se
    comporta como inexistente. El binario es inmutable por id: cache largo.
    Acepta HEAD (FastAPI no lo deriva del GET): el frontend verifica así el
    content-type antes de referenciar el archivo como favicon/logo.
    """
    stored = get_active_file(session, file_id)
    if stored is None or stored.kind not in _PUBLIC_FILE_KINDS:
        api_error(status.HTTP_404_NOT_FOUND, "archivo_no_encontrado", "Archivo no encontrado")

    filename_ascii = stored.original_filename.encode("ascii", "ignore").decode() or "archivo"
    # HEAD: mismos headers sin cuerpo (h11 exige no enviar body en HEAD).
    return Response(
        content=b"" if request.method == "HEAD" else stored.file_content,
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


@router.get("/business/pwa-icon")
def read_pwa_icon(
    session: SessionDep,
    size: int = Query(default=512, ge=48, le=1024),
    bg: str = Query(default="transparent", max_length=16),
    padding: float = Query(default=0.0, ge=0.0, le=0.45),
    v: Optional[str] = Query(default=None, max_length=64),  # cache-buster del manifest
) -> Response:
    """Ícono CUADRADO de la PWA derivado del logo del negocio, generado al vuelo.

    Centra el logo (sin deformar) en un lienzo cuadrado con márgenes
    transparentes (o el color ``bg``) y lo escala a ``size``. ``padding`` reserva
    la zona segura del ícono adaptable de Android (maskable). 404 si no hay logo
    o no es una imagen legible → el manifest cae al ícono placeholder.
    """
    profile = get_business_profile(session)
    if profile.logo_file_id is None:
        api_error(status.HTTP_404_NOT_FOUND, "sin_logo", "El negocio no tiene logo.")
    stored = get_active_file(session, profile.logo_file_id)
    if stored is None or stored.kind not in _PUBLIC_FILE_KINDS:
        api_error(status.HTTP_404_NOT_FOUND, "archivo_no_encontrado", "Logo no encontrado")
    try:
        png = build_square_icon(
            stored.file_content, size=size, background=bg, padding=padding
        )
    except IconRenderError:
        api_error(
            status.HTTP_404_NOT_FOUND, "logo_no_renderizable", "El logo no es una imagen válida."
        )
    return Response(
        content=png,
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=86400",
            "X-Content-Type-Options": "nosniff",
        },
    )
