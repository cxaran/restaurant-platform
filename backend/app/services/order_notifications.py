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
