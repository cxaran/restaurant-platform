from pydantic import BaseModel


class ErrorItem(BaseModel):
    """Detalle de un error asociado a un campo concreto."""

    field: str | None = None
    message: str


class ErrorResponse(BaseModel):
    """Envelope de error estándar para toda la API."""

    code: str
    message: str
    errors: list[ErrorItem] | None = None


# Alias semánticos de la convención de la visión de arquitectura.
ApiError = ErrorResponse
ValidationErrorDetail = ErrorItem
