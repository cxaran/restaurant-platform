"""Schemas de archivos almacenados (``stored_files``).

El contenido binario NUNCA se proyecta en un schema: la descarga es una
respuesta binaria del endpoint dedicado. Aquí sólo viajan metadatos.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from backend.app.schemas.base import ApiReadSchema


class StoredFileRead(ApiReadSchema):
    """Metadatos públicos de un archivo almacenado (sin contenido)."""

    id: UUID
    original_filename: str
    mime_type: str
    byte_size: int
    sha256: str
    kind: str
    is_active: bool
    uploaded_by: Optional[UUID] = None
    created_at: datetime
