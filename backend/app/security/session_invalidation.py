"""Invalidación de sesiones por rotación de ``User.token``.

``get_current_user`` rechaza un JWT cuyo ``jti`` no coincide con ``User.token``
(ver ``auth/auth_dependencies.py``). Rotar ``token`` invalida de inmediato todas
las sesiones activas del usuario.

Reglas de este servicio (autoridad backend, no depende del frontend):

- opera sobre la sesión del llamador y **no** hace ``commit`` interno: la rotación
  vive dentro de la misma transacción que la mutación de privilegios;
- **no** devuelve tokens nuevos al exterior;
- la rotación debe ocurrir solo cuando la transacción puede completarse: el
  llamador invoca estas funciones tras aplicar y validar el cambio, justo antes
  del ``commit``.
"""

from uuid import UUID

from sqlmodel import Session, select

from backend.app.auth.security import generate_token
from backend.app.models.user import User, UserRole
from backend.app.utils.utc_now import utc_now


def _rotate(user: User, actor_id: UUID | None) -> None:
    user.token = generate_token()
    user.updated_at = utc_now()
    if actor_id is not None:
        user.updated_by = actor_id


def invalidate_user_sessions(
    user: User,
    *,
    actor_id: UUID | None = None,
) -> None:
    """Invalida las sesiones de un único usuario rotando su token de versión."""
    _rotate(user, actor_id)


def invalidate_role_members_sessions(
    session: Session,
    role_id: UUID,
    *,
    actor_id: UUID | None = None,
) -> list[User]:
    """Invalida las sesiones de todos los usuarios activos que tengan ``role_id``.

    Se consulta la membresía vigente sin importar el estado del rol: al desactivar
    o reemplazar permisos de un rol, sus miembros activos pierden o cambian su
    cobertura efectiva y sus sesiones deben rotarse. Devuelve los usuarios afectados.
    """
    members = list(
        session.exec(
            select(User)
            .join(UserRole, UserRole.user_id == User.id)
            .where(UserRole.role_id == role_id, User.is_active.is_(True))
        ).all()
    )
    for user in members:
        _rotate(user, actor_id)
    return members
