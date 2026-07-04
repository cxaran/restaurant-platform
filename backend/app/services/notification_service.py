"""Notificaciones persistentes: campana in-app + correo, siempre AMBOS medios.

Las filas se crean DENTRO de la transacción del evento que las dispara (pedido
web nuevo, transición de estado, difusión del admin): o se persiste todo o
nada. El correo es una COLA sobre la misma fila (``email_status='pending'``):

- ``kick_email_dispatch()`` — hilo best-effort post-commit (patrón de
  ``order_notifications``): en despliegues sin worker Taskiq los correos salen
  igual, sin bloquear el request.
- ``notifications.tick`` (Taskiq, por minuto) — red de seguridad que despacha
  lo que un hilo dejó pendiente. ``FOR UPDATE SKIP LOCKED`` evita dobles.

El transporte real es ``send_system_email`` (environment/SMTP/Resend desde
system_settings); un fallo marca ``failed`` con resumen SEGURO y jamás revienta.
"""

import asyncio
import logging
import threading
import uuid
from typing import Literal, Optional

from sqlmodel import Session, select

from backend.app.models.notification import Notification
from backend.app.models.orders import Order
from backend.app.models.user import RoleAccess, User, UserRole
from backend.app.security.groups.notifications import NotificationPermissions
from backend.app.utils.utc_now import utc_now

logger = logging.getLogger("backend.notifications")

EMAIL_BATCH_SIZE = 50

# Estados que el CLIENTE quiere saber (los pending_* internos son ruido).
_STATUS_MESSAGES: dict[str, tuple[str, str]] = {
    "approved": (
        "Pedido {code} confirmado",
        "Confirmamos tu pedido y ya está en la fila de preparación.",
    ),
    "preparing": (
        "Tu pedido {code} se está preparando",
        "La cocina ya trabaja en tu pedido.",
    ),
    "ready": (
        "Tu pedido {code} está listo",
        "Tu pedido está listo. ¡Te esperamos para entregártelo!",
    ),
    "out_for_delivery": (
        "Tu pedido {code} va en camino",
        "Tu pedido salió del restaurante y va en camino a tu dirección.",
    ),
    "completed": (
        "Pedido {code} entregado",
        "¡Gracias! Tu pedido quedó entregado. Tus créditos ganados ya están en tu cuenta.",
    ),
    "cancelled": (
        "Pedido {code} cancelado",
        "Tu pedido fue cancelado. Si tienes dudas, contáctanos.",
    ),
}


def create_notification(
    session: Session,
    *,
    user_id: uuid.UUID,
    kind: str,
    title: str,
    body: str,
    order_id: Optional[uuid.UUID] = None,
    email: bool = True,
) -> Notification:
    """Crea la fila (SIN commit): viaja en la transacción del evento."""
    row = Notification(
        user_id=user_id,
        kind=kind,
        title=title[:140],
        body=body[:500],
        order_id=order_id,
        email_status="pending" if email else "skipped",
    )
    session.add(row)
    return row


def notify_order_status(session: Session, order: Order, new_status: str) -> None:
    """Cliente: cambio de estado de SU pedido (campana + correo)."""
    if order.customer_user_id is None:
        return
    message = _STATUS_MESSAGES.get(new_status)
    if message is None:
        return
    title, body = message
    create_notification(
        session,
        user_id=order.customer_user_id,
        kind="order_status",
        title=title.format(code=order.public_code),
        body=f"{body} Sigue el estado en «Mis pedidos».",
        order_id=order.id,
    )


def order_alert_recipients(session: Session) -> list[User]:
    """Usuarios ACTIVOS cuyo rol otorga ``notifications:order_alerts``."""
    permission = NotificationPermissions.ORDER_ALERTS.permission
    rows = session.exec(
        select(User)
        .join(UserRole, UserRole.user_id == User.id)  # pyright: ignore[reportArgumentType]
        .join(RoleAccess, RoleAccess.role_id == UserRole.role_id)  # pyright: ignore[reportArgumentType]
        .where(
            RoleAccess.access == permission,
            RoleAccess.is_active == True,  # noqa: E712
            User.is_active == True,  # noqa: E712
        )
        .distinct()
    ).all()
    return list(rows)


def notify_new_web_order(session: Session, order: Order) -> int:
    """Personal/admins con ORDER_ALERTS: pedido web nuevo sin atender."""
    recipients = order_alert_recipients(session)
    for user in recipients:
        create_notification(
            session,
            user_id=user.id,
            kind="order_new",
            title=f"Pedido web nuevo {order.public_code}",
            body=(
                f"Se registró el pedido {order.public_code} desde el sitio y aún "
                "no ha sido atendido. Revísalo en el panel de pedidos."
            ),
            order_id=order.id,
        )
    return len(recipients)


Audience = Literal["all", "customers", "staff"]


def broadcast(
    session: Session,
    *,
    title: str,
    body: str,
    audience: Audience = "all",
) -> int:
    """Difusión del administrador (promoción/aviso) a la audiencia elegida.

    ``customers`` = usuarios activos SIN rol asignado (los clientes de la
    plataforma no tienen roles); ``staff`` = con algún rol. Crea UNA fila por
    usuario (campana + correo). SIN commit: el router decide la transacción.
    """
    staff_ids = select(UserRole.user_id)
    stmt = select(User).where(User.is_active == True)  # noqa: E712
    if audience == "customers":
        stmt = stmt.where(User.id.not_in(staff_ids))  # pyright: ignore[reportAttributeAccessIssue]
    elif audience == "staff":
        stmt = stmt.where(User.id.in_(staff_ids))  # pyright: ignore[reportAttributeAccessIssue]
    users = session.exec(stmt).all()
    for user in users:
        create_notification(
            session, user_id=user.id, kind="promo", title=title, body=body
        )
    return len(users)


# ---------------------------------------------------------------------------
# Despacho de correos (cola sobre email_status)
# ---------------------------------------------------------------------------

async def dispatch_pending_emails(session: Session, *, limit: int = EMAIL_BATCH_SIZE) -> int:
    """Envía los correos pendientes y marca sent/failed. Devuelve enviados.

    Toma las filas con ``FOR UPDATE SKIP LOCKED`` (en PostgreSQL): el hilo
    best-effort y el tick Taskiq pueden correr a la vez sin duplicar correos.
    """
    from backend.app.services.email_service import send_system_email

    stmt = (
        select(Notification)
        .where(Notification.email_status == "pending")
        .order_by(Notification.created_at)  # pyright: ignore[reportArgumentType]
        .limit(limit)
    )
    if session.get_bind().dialect.name == "postgresql":
        stmt = stmt.with_for_update(skip_locked=True)
    rows = session.exec(stmt).all()

    sent = 0
    for row in rows:
        user = session.get(User, row.user_id)
        if user is None or not user.is_active or not user.email:
            row.email_status = "skipped"
            session.add(row)
            continue
        outcome = await send_system_email(
            session,
            subject=row.title,
            email_to=user.email,
            message=row.body,
        )
        if outcome.sent:
            row.email_status = "sent"
            row.email_error = None
            sent += 1
        else:
            row.email_status = "failed"
            row.email_error = (outcome.error_summary or outcome.error_code or "error")[:200]
        session.add(row)
    session.flush()
    return sent


def kick_email_dispatch() -> None:
    """Hilo best-effort post-commit (jamás afecta la transacción del evento)."""

    def _runner() -> None:
        try:
            from backend.app.core.database import engine

            with Session(engine) as session:
                asyncio.run(dispatch_pending_emails(session))
                session.commit()
        except Exception:  # noqa: BLE001 — best-effort explícito
            logger.warning("notification_email_dispatch_failed")

    threading.Thread(target=_runner, name="notification-emails", daemon=True).start()


def unread_count(session: Session, user_id: uuid.UUID) -> int:
    rows = session.exec(
        select(Notification.id).where(
            Notification.user_id == user_id,
            Notification.read_at.is_(None),  # pyright: ignore[reportAttributeAccessIssue]
        )
    ).all()
    return len(rows)


def mark_all_read(session: Session, user_id: uuid.UUID) -> int:
    rows = session.exec(
        select(Notification).where(
            Notification.user_id == user_id,
            Notification.read_at.is_(None),  # pyright: ignore[reportAttributeAccessIssue]
        )
    ).all()
    now = utc_now()
    for row in rows:
        row.read_at = now
        session.add(row)
    session.flush()
    return len(rows)
