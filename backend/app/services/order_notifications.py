"""Notificación G de pedidos (§1.13 GOALS): correo directo al negocio.

Las notificaciones al CLIENTE (recibido/estado) y las alertas de pedido web
nuevo al personal viven ahora en ``notification_service`` (campana + correo
persistentes). Aquí queda solo la G, que va al CORREO DEL NEGOCIO (no a un
usuario de la plataforma): cancelación con dinero cobrado y devolución
abierta.

Best-effort SIEMPRE: un fallo de correo jamás afecta la transacción del
pedido. El envío corre en un hilo aparte con su PROPIA sesión (el transporte
se resuelve en system_settings) — nada de esto simula envíos: en desarrollo
los captura Mailpit.
"""

import asyncio
import logging
import threading
import uuid
from typing import Optional

from backend.app.models.orders import Order

logger = logging.getLogger("backend.request")


def _send_in_background(*, subject: str, email_to: Optional[str], message: str) -> None:
    if not email_to:
        return

    def _runner() -> None:
        try:
            from sqlmodel import Session

            from backend.app.core.database import engine
            from backend.app.services.email_service import send_system_email

            with Session(engine) as session:
                asyncio.run(
                    send_system_email(
                        session, subject=subject, email_to=email_to, message=message
                    )
                )
        except Exception:  # noqa: BLE001 — best-effort explícito
            logger.warning("order_notification_failed subject=%s", subject)

    threading.Thread(target=_runner, name="order-notification", daemon=True).start()


def _dispatch_completed_ticket(order_id: uuid.UUID) -> None:
    """Hilo best-effort: compone el ticket PDF del pedido completado y lo envía
    por correo al cliente. Abre su PROPIA sesión (relee el pedido ya commiteado)
    y jamás lanza."""

    def _runner() -> None:
        try:
            from sqlmodel import Session

            from backend.app.core.database import engine
            from backend.app.services.business_service import (
                get_business_profile,
                get_business_settings,
            )
            from backend.app.services.email_service import send_system_email
            from backend.app.services.ticket_pdf_service import render_ticket_pdf
            from backend.app.services.ticket_service import build_ticket_payload

            with Session(engine) as session:
                order = session.get(Order, order_id)
                # Relee tras el commit: si ya no está completado o no hay correo
                # capturado (venta de mostrador sin datos), no se envía nada.
                if order is None or order.status != "completed":
                    return
                recipient = order.customer_email_snapshot
                if not recipient:
                    return
                payload = build_ticket_payload(session, order)
                settings_row = get_business_settings(session)
                profile = get_business_profile(session)
                # Logo (mismo que imprime la web): bytes desde el archivo activo.
                logo_bytes = None
                logo_id = (payload.get("business") or {}).get("logo_file_id")
                if logo_id:
                    from backend.app.services.file_service import get_active_file

                    stored = get_active_file(session, uuid.UUID(str(logo_id)))
                    if stored is not None:
                        logo_bytes = stored.file_content
                pdf = render_ticket_pdf(
                    payload,
                    paper_size=settings_row.ticket_paper_size,
                    currency_code=profile.currency_code,
                    tz_name=profile.timezone,
                    logo_bytes=logo_bytes,
                )
                filename = f"ticket-{order.public_code}.pdf"
                trade_name = (profile.trade_name or "").strip() or "tu pedido"
                asyncio.run(
                    send_system_email(
                        session,
                        subject=f"Ticket de tu pedido {order.public_code}",
                        email_to=recipient,
                        message=(
                            f"¡Gracias por tu compra en {trade_name}! Adjuntamos el "
                            f"ticket del pedido {order.public_code} en PDF."
                        ),
                        attachments=[(filename, pdf, "application/pdf")],
                    )
                )
        except Exception:  # noqa: BLE001 — best-effort explícito
            logger.warning("order_ticket_email_failed order_id=%s", order_id)

    threading.Thread(target=_runner, name="order-ticket-email", daemon=True).start()


def schedule_completed_order_ticket(session, order: Order) -> None:
    """Programa el envío del ticket PDF para CUANDO la transacción que completó
    el pedido se confirme (``after_commit``). Si hay rollback, no se envía; si no
    hay correo del cliente (registrado o capturado en POS), no hace nada.

    Se registra desde ``transition_order`` de forma centralizada: cubre TODAS las
    rutas de completado (panel, POS/mostrador, repartidor)."""
    if order.customer_email_snapshot is None:
        return
    from sqlalchemy import event

    order_id = order.id

    def _after_commit(_session) -> None:  # noqa: ANN001
        _dispatch_completed_ticket(order_id)

    # once=True: se autodesregistra tras el primer commit (el de esta transición).
    event.listen(session, "after_commit", _after_commit, once=True)


def notify_admin_unresolved_refund(session, order: Order) -> None:
    """G: cancelación con dinero cobrado y devolución abierta → responsable."""
    if order.cancellation_money_resolution not in ("refund_now", "refund_pending"):
        return
    from backend.app.services.business_service import get_business_profile

    profile = get_business_profile(session)
    _send_in_background(
        subject=f"Pedido {order.public_code} cancelado con cobro por devolver",
        email_to=profile.email,
        message=(
            f"El pedido {order.public_code} se canceló con pagos cobrados y la "
            "devolución sigue abierta "
            f"(resolución: {order.cancellation_money_resolution}).\n\n"
            "Revisa la cola «Cancelados con cobro» en el panel de pedidos y "
            "registra el reembolso correspondiente."
        ),
    )
