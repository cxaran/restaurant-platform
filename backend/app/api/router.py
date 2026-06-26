from fastapi import APIRouter

from backend.app.api.health import router as health_router
from backend.app.api.v1.router import router as v1_router


router = APIRouter(prefix="/api")
router.include_router(health_router)
router.include_router(v1_router)
