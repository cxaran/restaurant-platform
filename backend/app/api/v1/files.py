"""Archivos almacenados: subida y descarga protegidas (``files:*``).

La subida es multipart (``python-multipart``) bajo un perfil de validación
(``kind``): el backend valida por CONTENIDO (magic bytes) y por tamaño máximo
del perfil; el Content-Type del cliente no se considera. La descarga entrega el
binario con el MIME validado y ``Content-Disposition`` inline.

La entrega pública de imágenes referidas por contenido publicado (menú,
storefront) NO vive aquí: tendrá su ruta de sólo lectura sin sesión cuando
exista contenido publicado que la requiera (etapas 2 y 9 del plan).
"""

from typing import Annotated
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, File, Form, Response, UploadFile, status

from backend.app.api.resource_actions import api_error, serialize
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.models.stored_file import StoredFile
from backend.app.schemas.stored_file import StoredFileRead
from backend.app.security.groups.files import FilePermissions
from backend.app.services.file_service import (
    FILE_PROFILES,
    FileValidationError,
    get_active_file,
    store_file,
)

router = APIRouter(prefix="/files", tags=["files"])

_NOT_FOUND = "Archivo no encontrado"


@router.post("", response_model=StoredFileRead, status_code=status.HTTP_201_CREATED)
async def upload_file(
    session: SessionDep,
    current_user: CurrentUser,
    _: FilePermissions.UPLOAD.requiere,
    file: Annotated[UploadFile, File(description="Archivo binario a almacenar.")],
    kind: Annotated[str, Form(description="Perfil de validación: image, favicon o document.")],
) -> StoredFileRead:
    profile = FILE_PROFILES.get(kind)
    if profile is None:
        permitted = ", ".join(sorted(FILE_PROFILES))
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "perfil_desconocido",
            f"Perfil de archivo no reconocido; use uno de: {permitted}.",
        )

    # Lee a lo sumo max_bytes + 1: suficiente para detectar exceso sin cargar
    # a memoria archivos arbitrariamente grandes.
    content = await file.read(profile.max_bytes + 1)
    try:
        stored = store_file(
            session,
            content=content,
            original_filename=file.filename or "archivo",
            kind=kind,
            uploaded_by=current_user.id,
        )
    except FileValidationError as exc:
        status_code = (
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
            if exc.code == "archivo_demasiado_grande"
            else status.HTTP_422_UNPROCESSABLE_ENTITY
        )
        api_error(status_code, exc.code, exc.message)

    session.commit()
    session.refresh(stored)
    return serialize(StoredFileRead, stored)


@router.get("/{file_id}/details", response_model=StoredFileRead)
def get_file_details(
    file_id: UUID,
    session: SessionDep,
    _: FilePermissions.READ.requiere,
) -> StoredFileRead:
    stored = get_active_file(session, file_id)
    if stored is None:
        api_error(status.HTTP_404_NOT_FOUND, "archivo_no_encontrado", _NOT_FOUND)
    return serialize(StoredFileRead, stored)


@router.get("/{file_id}")
def download_file(
    file_id: UUID,
    session: SessionDep,
    _: FilePermissions.READ.requiere,
) -> Response:
    stored = get_active_file(session, file_id)
    if stored is None:
        api_error(status.HTTP_404_NOT_FOUND, "archivo_no_encontrado", _NOT_FOUND)

    # Nombre seguro para el header (RFC 5987) sin depender del charset del original.
    filename_ascii = stored.original_filename.encode("ascii", "ignore").decode() or "archivo"
    disposition = (
        f"inline; filename=\"{filename_ascii}\"; "
        f"filename*=UTF-8''{quote(stored.original_filename)}"
    )
    return Response(
        content=stored.file_content,
        media_type=stored.mime_type,
        headers={
            "Content-Disposition": disposition,
            # El binario es inmutable por id (el contenido nunca se edita in situ).
            "Cache-Control": "private, max-age=3600",
            "X-Content-Type-Options": "nosniff",
        },
    )
