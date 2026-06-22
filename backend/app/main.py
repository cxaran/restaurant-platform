from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI

from backend.app.auth.bootstrap import bootstrap_superuser
from backend.app.core.settings import settings
from backend.app.routes import admin_router, auth_router, pos_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    bootstrap_superuser()
    yield


app = FastAPI(
    title=settings.project_name,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.include_router(
    APIRouter(
        routes=[
            *auth_router.routes,
            *admin_router.routes,
            *pos_router.routes,
        ],
    ),
    prefix="/api/v1",
)
