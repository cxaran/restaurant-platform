from typing import Literal

from backend.app.schemas.base import ApiSchema


class HealthRead(ApiSchema):
    status: Literal["ok"]


class ReadinessRead(ApiSchema):
    status: Literal["ok"]
    checks: dict[str, bool]
