from fastapi import FastAPI

from backend.app.api.router import router as api_router
from backend.app.core.csrf import MutationOriginGuardMiddleware
from backend.app.core.error_handlers import register_exception_handlers
from backend.app.core.request_logging import RequestLoggingMiddleware, configure_logging
from backend.app.core.settings import settings


configure_logging()

app = FastAPI(
    title=settings.project_name,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# El guard se agrega antes que el logging para que el logging quede exterior y
# registre también las solicitudes rechazadas por origen.
app.add_middleware(MutationOriginGuardMiddleware)
app.add_middleware(RequestLoggingMiddleware)
register_exception_handlers(app)
app.include_router(api_router)
