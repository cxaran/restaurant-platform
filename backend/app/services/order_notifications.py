"""Notificaciones priorizadas de pedidos (§1.13 GOALS): A, C y G.

A — Cliente: pedido recibido (checkout web).
C — Cliente: pedido listo (pickup) o en camino (delivery).
G — Administrador: pedido cancelado con pago cobrado sin reembolso resuelto.

Best-effort SIEMPRE: un fallo de correo jamás afecta la transacción del
pedido. El envío corre en un hilo aparte con su PROPIA sesión (el transporte
se resuelve en system_settings) — nada de esto simula envíos: en desarrollo
los captura Mailpit. Más notificaciones (reparto asignado, etc.) llegarán
cuando el ciclo de reparto esté estable — decisión explícita del roadmap.
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


def notify_order_received(order: Order) -> None:
    """A: confirmación al cliente al crear su pedido web."""
    _send_in_background(
        subject=f"Recibimos tu pedido {order.public_code}",
        email_to=order.customer_email_snapshot,
        message=(
            f"¡Gracias! Recibimos tu pedido {order.public_code} y lo estamos "
            "revisando. Te avisaremos cuando esté listo o en camino.\n\n"
            "Puedes seguirlo en la sección «Mis pedidos» del sitio."
        ),
    )


def notify_order_progress(order: Order, new_status: str) -> None:
    """C: listo (pickup/mostrador) o en camino (delivery)."""
    if new_status == "ready" and order.fulfillment_type != "delivery":
        subject = f"Tu pedido {order.public_code} está listo"
        body = "Tu pedido está listo. ¡Te esperamos para entregártelo!"
    elif new_status == "out_for_delivery":
        subject = f"Tu pedido {order.public_code} va en camino"
        body = "Tu pedido salió del restaurante y va en camino a tu dirección."
    else:
        return
    _send_in_background(
        subject=subject,
        email_to=order.customer_email_snapshot,
        message=f"{body}\n\nSigue el estado en «Mis pedidos».",
    )


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
