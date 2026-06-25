"""Datos editables por el usuario autenticado."""

from fastapi import APIRouter, status

from backend.app.api.resource_actions import (
    api_error,
    get_or_404,
    patch_entity,
    serialize,
    update_entity_values,
)
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.auth.security import generate_token, get_password_hash, verify_password
from backend.app.core.database import SessionDep
from backend.app.models.user import User
from backend.app.schemas.auth import MessageResponse
from backend.app.schemas.user_profile import (
    UserPasswordChangeRequest,
    UserProfileRead,
    UserProfileUpdate,
)

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserProfileRead)
def read_profile(
    session: SessionDep,
    current_user: CurrentUser,
) -> UserProfileRead:
    user = get_or_404(session, User, current_user.id, "Usuario no encontrado")
    return serialize(UserProfileRead, user)


@router.patch("/me", response_model=UserProfileRead)
def update_profile(
    payload: UserProfileUpdate,
    session: SessionDep,
    current_user: CurrentUser,
) -> UserProfileRead:
    user = get_or_404(session, User, current_user.id, "Usuario no encontrado")
    user = patch_entity(
        session,
        user,
        payload,
        actor_id=current_user.id,
        rotate_token_fields=("email",),
        token_factory=generate_token,
        conflict_message="Ya existe un usuario con ese email",
    )
    return serialize(UserProfileRead, user)


@router.post("/me/password", response_model=MessageResponse)
def change_password(
    payload: UserPasswordChangeRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> MessageResponse:
    user = get_or_404(session, User, current_user.id, "Usuario no encontrado")
    if not verify_password(payload.current_password, user.hashed_password):
        api_error(
            status.HTTP_400_BAD_REQUEST,
            "invalid_current_password",
            "La contraseña actual es inválida",
        )
    update_entity_values(
        session,
        user,
        {
            "hashed_password": get_password_hash(payload.password),
            "token": generate_token(),
        },
        actor_id=current_user.id,
        conflict_message="No se pudo cambiar la contraseña",
    )
    return MessageResponse(message="Contraseña actualizada correctamente")
