"""Endpoints públicos del sitio (sin sesión, sin permisos).

Exponen SOLO lo que el visitante necesita: identidad del negocio, teléfonos
públicos, estado abierto/cerrado y políticas visibles (envío gratis, mínimo de
compra). Nada interno se proyecta aquí. Respuestas cacheables: cambian sólo
cuando el administrador edita la configuración.
"""

import uuid
from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, Request, Response, status
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
)
from backend.app.schemas.catalog import PublicMenuCategory
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
)
from backend.app.services.catalog_service import build_public_menu
from backend.app.services.discount_service import list_public_coupons
from backend.app.services.file_service import get_active_file
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
