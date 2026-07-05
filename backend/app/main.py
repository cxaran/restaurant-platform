from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from backend.app.api.router import router as api_router
from backend.app.core.csrf import MutationOriginGuardMiddleware
from backend.app.core.error_handlers import register_exception_handlers
from backend.app.core.request_logging import RequestLoggingMiddleware, configure_logging
from backend.app.core.settings import settings


configure_logging()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None]:
    """Ciclo de vida de la API. Carga el dominio verificado persistido (los orígenes
    verificados solo AÑADEN a los del entorno) e inicia el broker de Taskiq SOLO para
    PUBLICAR tareas (p. ej. despertar el tick tras un respaldo manual); el worker y el
    scheduler siguen siendo procesos propios (profile "taskiq"), nunca hijos de
    FastAPI. Un fallo del broker no impide arrancar la API (la cola es durable: el
    tick programado procesa lo pendiente igual)."""
    from backend.app.core.runtime_origins import load_from_database
    from backend.app.taskiq_app import broker

    load_from_database()

    try:
        await broker.startup()
    except Exception:
        import logging

        logging.getLogger("backend.request").warning("taskiq_broker_startup_failed")
    yield
    try:
        await broker.shutdown()
    except Exception:
        pass


# Versión pública de la API expuesta en OpenAPI (independiente del despliegue).
# Súbela al introducir cambios incompatibles en los contratos de la API.
API_VERSION = "1.0.0"

# Descripción en Markdown que ReDoc y Swagger UI renderizan en la portada de la
# documentación. Redactada en español, como el resto de los mensajes de la API.
API_DESCRIPTION = """\
Plataforma para restaurantes — sitio público con pedidos en línea, panel de
operación diaria y administración por contrato — construida sobre
**platform-core** (FastAPI + Next.js, self-hosted, instalación única).

Todas las rutas se montan bajo `/api/v1`. La autenticación acepta una **cookie
`session_token` httponly** o un **Bearer token**; los permisos se exigen por
recurso (RBAC declarado en código).

### Experiencias
- **Sitio público** — catálogo, carrito, checkout, pedidos, cuenta y créditos.
- **Panel** — operación diaria: pedidos, POS, entregas, reparto y tickets.
- **Administración** — recursos genéricos por contrato, storefront, finanzas,
  notificaciones y respaldos.

### Invariantes de dominio
Un pedido es **100 % dinero o 100 % créditos**; *pago confirmado ≠ pedido
completado*; las cantidades son enteros positivos estrictos en cada capa.
"""

app = FastAPI(
    title=settings.project_name,
    summary="API de la plataforma para restaurantes (sitio público, panel y administración).",
    description=API_DESCRIPTION,
    version=API_VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# El guard se agrega antes que el logging para que el logging quede exterior y
# registre también las solicitudes rechazadas por origen.
app.add_middleware(MutationOriginGuardMiddleware)
app.add_middleware(RequestLoggingMiddleware)

# Renovación deslizante de sesión: pasada la mitad de la vida del JWT, la
# cookie se re-emite con el mismo ttl/jti (ver backend/app/auth/session_refresh.py).
from backend.app.auth.session_refresh import sliding_session_middleware  # noqa: E402

app.middleware("http")(sliding_session_middleware)
register_exception_handlers(app)
app.include_router(api_router)
