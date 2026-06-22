from fastapi import FastAPI

from backend.app.api.router import router as api_router
from backend.app.core.settings import settings


app = FastAPI(
    title=settings.project_name,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.include_router(api_router)
