from fastapi import APIRouter, HTTPException, status

from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.auth.register import create_user, send_registration_token
from backend.app.core.database import SessionDep
from backend.app.schemas.auth import MessageResponse, RegisterRequest
from backend.app.schemas.user import UserBase, UserCreate

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=UserBase)
def read_current_user(current_user: CurrentUser) -> UserBase:
    return current_user


@router.post("/register/request", response_model=MessageResponse, status_code=status.HTTP_202_ACCEPTED)
async def request_registration(
    payload: RegisterRequest,
    session: SessionDep,
) -> MessageResponse:
    await send_registration_token(session, payload.email)
    return MessageResponse(message="Si el email es válido, se enviará un token de registro")


@router.post("/register/complete", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
def complete_registration(
    payload: UserCreate,
    session: SessionDep,
) -> MessageResponse:
    user = create_user(session, payload)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token de registro inválido o expirado",
        )
    return MessageResponse(message="Usuario registrado correctamente")

