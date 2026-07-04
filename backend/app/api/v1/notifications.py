"""Notificaciones: campana propia (/me) y difusión del administrador.

Las propias son recurso PROPIO: cualquier usuario autenticado lee y marca las
suyas — jamás las de otro. La difusión exige ``notifications:send`` y queda
auditada con NOMBRES de campos (nunca el contenido).
"""

import uuid
from typing import Literal, Optional

from fastapi import APIRouter, Query, status
from pydantic import Field
from sqlmodel import select

from backend.app.api.resource_actions import api_error, commit_or_conflict
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.models.notification import Notification
from backend.app.schemas.base import ApiReadSchema, ApiWriteSchema
from backend.app.security.groups.notifications import NotificationPermissions
from backend.app.services.config_audit import record_config_change
from backend.app.services.notification_service import (
    broadcast,
    kick_email_dispatch,
    mark_all_read,
    unread_count,
)
from backend.app.utils.utc_now import utc_now

router = APIRouter(prefix="/notifications", tags=["notifications"])

_BROADCAST_AUDIT_ID = uuid.UUID("00000000-0000-4000-a000-5706ef2e7003")


class NotificationRead(ApiReadSchema):
    id: uuid.UUID
    kind: str
    title: str
    body: str
    order_id: Optional[uuid.UUID] = None
    read_at: Optional[str] = None
    created_at: str


class MyNotifications(ApiReadSchema):
    unread_count: int
    items: list[NotificationRead] = Field(default_factory=list)


def _read(row: Notification) -> NotificationRead:
    return NotificationRead(
        id=row.id,
        kind=row.kind,
        title=row.title,
        body=row.body,
        order_id=row.order_id,
        read_at=row.read_at.isoformat() if row.read_at else None,
        created_at=row.created_at.isoformat() if row.created_at else utc_now().isoformat(),
    )


@router.get("/me", response_model=MyNotifications)
def my_notifications(
    session: SessionDep,
    current_user: CurrentUser,
    limit: int = Query(default=30, ge=1, le=100),
) -> MyNotifications:
    rows = session.exec(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())  # pyright: ignore[reportAttributeAccessIssue]
        .limit(limit)
    ).all()
    return MyNotifications(
        unread_count=unread_count(session, current_user.id),
        items=[_read(row) for row in rows],
    )


@router.post("/me/read-all")
def read_all_my_notifications(
    session: SessionDep, current_user: CurrentUser
) -> dict:
    marked = mark_all_read(session, current_user.id)
    commit_or_conflict(session, "No fue posible marcar las notificaciones.")
    return {"marked": marked}


@router.post("/{notification_id}/read", response_model=NotificationRead)
def read_notification(
    notification_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> NotificationRead:
    row = session.get(Notification, notification_id)
    # 404 uniforme: no revela si la notificación de OTRO usuario existe.
    if row is None or row.user_id != current_user.id:
        api_error(status.HTTP_404_NOT_FOUND, "notificacion_no_encontrada", "No encontrada")
    if row.read_at is None:
        row.read_at = utc_now()
        session.add(row)
        commit_or_conflict(session, "No fue posible marcar la notificación.")
    return _read(row)


class BroadcastRequest(ApiWriteSchema):
    title: str = Field(min_length=1, max_length=140)
    body: str = Field(min_length=1, max_length=500)
    audience: Literal["all", "customers", "staff"] = "all"


@router.post("/broadcast", status_code=status.HTTP_201_CREATED)
def send_broadcast(
    payload: BroadcastRequest,
    session: SessionDep,
    current_user: CurrentUser,
    _: NotificationPermissions.SEND.requiere,
) -> dict:
    created = broadcast(
        session, title=payload.title, body=payload.body, audience=payload.audience
    )
    record_config_change(
        session, actor_user_id=current_user.id, entity_type="notifications",
        entity_id=_BROADCAST_AUDIT_ID, action="broadcast",
        changed_fields=["title", "body", "audience"],
    )
    commit_or_conflict(session, "No fue posible enviar la difusión.")
    # Correos best-effort DESPUÉS del commit; el tick Taskiq es la red de seguridad.
    kick_email_dispatch()
    return {"created": created, "audience": payload.audience}
