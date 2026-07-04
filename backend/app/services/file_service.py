"""Servicio de archivos almacenados (§7 y §53 del reporte integral).

Único punto de entrada para guardar y servir binarios de ``stored_files``. La
validación es por CONTENIDO (magic bytes), nunca por la extensión ni el
Content-Type que declare el cliente. Cada archivo se acepta bajo un *perfil*
(``kind``) que define los formatos y el tamaño máximo permitidos:

    image    JPG / PNG / WEBP     imágenes de producto, banners, fotos
    favicon  ICO / PNG / SVG      ícono del sitio (§45.1)
    document PDF / XML / JPG / PNG / WEBP   facturas, comprobantes, evidencias

Reglas §53: tipo MIME, tamaño máximo, hash y permisos; el contenido binario
sólo se materializa en el endpoint de descarga (columna diferida).
"""

import hashlib
import re
import uuid
from dataclasses import dataclass
from typing import Optional

from sqlmodel import Session

from backend.app.models.stored_file import StoredFile
from backend.app.utils.utc_now import utc_now


class FileValidationError(ValueError):
    """Archivo rechazado por el perfil de validación. Código estable para la API."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class SniffedType:
    """Tipo real detectado por contenido."""

    format_key: str
    mime_type: str


@dataclass(frozen=True)
class FileProfile:
    """Perfil de aceptación: formatos permitidos y tamaño máximo en bytes."""

    kind: str
    allowed_formats: frozenset[str]
    max_bytes: int


# Límites iniciales (§53: "tamaño máximo configurable"): constantes del servicio
# hasta que exista una configuración editable; ajustar aquí es un solo lugar.
FILE_PROFILES: dict[str, FileProfile] = {
    "image": FileProfile(
        kind="image",
        allowed_formats=frozenset({"jpeg", "png", "webp"}),
        max_bytes=5 * 1024 * 1024,
    ),
    "favicon": FileProfile(
        kind="favicon",
        # H8: sin SVG — la sanitización por regex es evadible y el favicon se
        # sirve público sin sesión; ico/png cubren el caso real.
        allowed_formats=frozenset({"ico", "png"}),
        max_bytes=512 * 1024,
    ),
    "document": FileProfile(
        kind="document",
        allowed_formats=frozenset({"pdf", "xml", "jpeg", "png", "webp"}),
        max_bytes=10 * 1024 * 1024,
    ),
}

_FORMAT_MIME: dict[str, str] = {
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "ico": "image/x-icon",
    "svg": "image/svg+xml",
    "pdf": "application/pdf",
    "xml": "application/xml",
}

# El sniffing de SVG/XML sólo inspecciona el arranque del texto.
_TEXT_SNIFF_WINDOW = 1024
_SVG_OPEN_RE = re.compile(rb"<svg[\s>]", re.IGNORECASE)
_XML_DECL_RE = re.compile(rb"^\s*<\?xml", re.IGNORECASE)
# SVG con scripts o manejadores de eventos: rechazado (se sirve a navegadores).
_SVG_ACTIVE_CONTENT_RE = re.compile(rb"<script|\son[a-z]+\s*=", re.IGNORECASE)


def sniff_content_type(content: bytes) -> Optional[SniffedType]:
    """Detecta el formato real por magic bytes. ``None`` si no es reconocible."""
    if content.startswith(b"\xff\xd8\xff"):
        return SniffedType("jpeg", _FORMAT_MIME["jpeg"])
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return SniffedType("png", _FORMAT_MIME["png"])
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return SniffedType("webp", _FORMAT_MIME["webp"])
    if content.startswith(b"\x00\x00\x01\x00"):
        return SniffedType("ico", _FORMAT_MIME["ico"])
    if content.startswith(b"%PDF-"):
        return SniffedType("pdf", _FORMAT_MIME["pdf"])

    head = content[:_TEXT_SNIFF_WINDOW]
    if _SVG_OPEN_RE.search(head):
        return SniffedType("svg", _FORMAT_MIME["svg"])
    if _XML_DECL_RE.match(head):
        # Un XML cuyo raíz es <svg> es un SVG; cualquier otro XML es documento.
        if _SVG_OPEN_RE.search(content[:_TEXT_SNIFF_WINDOW * 4]):
            return SniffedType("svg", _FORMAT_MIME["svg"])
        return SniffedType("xml", _FORMAT_MIME["xml"])
    return None


def validate_file(content: bytes, *, kind: str) -> SniffedType:
    """Valida contenido contra el perfil ``kind``; regresa el tipo detectado."""
    profile = FILE_PROFILES.get(kind)
    if profile is None:
        raise FileValidationError("perfil_desconocido", "Perfil de archivo no reconocido.")
    if not content:
        raise FileValidationError("archivo_vacio", "El archivo está vacío.")
    if len(content) > profile.max_bytes:
        max_mb = profile.max_bytes / (1024 * 1024)
        raise FileValidationError(
            "archivo_demasiado_grande",
            f"El archivo excede el tamaño máximo permitido ({max_mb:g} MB).",
        )

    sniffed = sniff_content_type(content)
    if sniffed is None or sniffed.format_key not in profile.allowed_formats:
        permitted = ", ".join(sorted(profile.allowed_formats)).upper()
        raise FileValidationError(
            "formato_no_permitido",
            f"Formato de archivo no permitido; se aceptan: {permitted}.",
        )

    if sniffed.format_key == "svg" and _SVG_ACTIVE_CONTENT_RE.search(content):
        raise FileValidationError(
            "svg_con_contenido_activo",
            "El SVG contiene scripts o manejadores de eventos y fue rechazado.",
        )
    return sniffed


def store_file(
    session: Session,
    *,
    content: bytes,
    original_filename: str,
    kind: str,
    uploaded_by: Optional[uuid.UUID],
) -> StoredFile:
    """Valida y persiste un archivo. NO hace commit: transacción del llamador."""
    sniffed = validate_file(content, kind=kind)

    cleaned_name = (original_filename or "").strip() or "archivo"
    stored = StoredFile(
        original_filename=cleaned_name[:255],
        mime_type=sniffed.mime_type,
        byte_size=len(content),
        sha256=hashlib.sha256(content).hexdigest(),
        file_content=content,
        kind=kind,
        is_active=True,
        uploaded_by=uploaded_by,
    )
    session.add(stored)
    session.flush()
    return stored


def get_active_file(session: Session, file_id: uuid.UUID) -> Optional[StoredFile]:
    """Archivo activo por id (metadatos; el contenido es columna diferida)."""
    stored = session.get(StoredFile, file_id)
    if stored is None or not stored.is_active:
        return None
    return stored


def deactivate_file(session: Session, stored: StoredFile) -> StoredFile:
    """Borrado lógico. La eliminación física no existe (§53: no borrar imágenes
    usadas por contenido publicado); la limpieza profunda será una tarea futura."""
    stored.is_active = False
    stored.updated_at = utc_now()
    session.add(stored)
    session.flush()
    return stored
