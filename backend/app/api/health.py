from fastapi import APIRouter, HTTPException, status
from sqlalchemy import text

from backend.app.core.database import engine
from backend.app.core.redis import redis_client
from backend.app.schemas.health import HealthRead, ReadinessRead

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthRead)
def health() -> HealthRead:
    return HealthRead(status="ok")


@router.get("/ready", response_model=ReadinessRead)
def readiness() -> ReadinessRead:
    checks = {"database": False, "redis": False}
    errors: list[dict[str, str]] = []

    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        checks["database"] = True
    except Exception:
        errors.append({"field": "database", "message": "Base de datos no disponible"})

    try:
        redis_client.ping()
        checks["redis"] = True
    except Exception:
        errors.append({"field": "redis", "message": "Redis no disponible"})

    if errors:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "service_unavailable",
                "message": "Servicio no disponible",
                "errors": errors,
            },
        )

    return ReadinessRead(status="ok", checks=checks)
