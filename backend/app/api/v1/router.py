from fastapi import APIRouter

from backend.app.api.v1.auth import router as auth_router
from backend.app.api.v1.permissions import router as permissions_router
from backend.app.api.v1.roles import router as roles_router
from backend.app.api.v1.users import router as users_router
from backend.app.api.v1.users_admin import router as users_admin_router


router = APIRouter(prefix="/v1")
router.include_router(auth_router)
router.include_router(permissions_router)
router.include_router(roles_router)
router.include_router(users_router)
router.include_router(users_admin_router)
