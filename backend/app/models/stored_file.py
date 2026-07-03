"""Archivos binarios almacenados en la base de datos (§7 del reporte integral).

Tabla REUTILIZABLE para todo archivo del dominio: logo del negocio, imágenes de
producto, favicon, comprobantes de pago, facturas PDF/XML, fotos de gastos y
evidencias de entrega. El contenido vive en ``file_content`` (BYTEA) con carga
DIFERIDA: ningún listado ni schema de lectura debe proyectarlo; sólo el endpoint
de descarga lo materializa. El snapshot EXPLORER de respaldos excluye columnas
binarias por tipo, así que este contenido nunca viaja al artefacto explorable.
"""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    CHAR,
    DateTime,
    ForeignKey,
    Index,
    LargeBinary,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class StoredFile(Base):
    """Archivo binario con metadatos de validación (MIME, tamaño, hash)."""

    __tablename__ = "stored_files"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    original_filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Nombre original del archivo tal como lo subió el usuario.",
    )
    mime_type: Mapped[str] = mapped_column(
        String(120),
        nullable=False,
        comment="Tipo MIME validado por CONTENIDO en el backend (no confiar en el cliente).",
    )
    byte_size: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        comment="Tamaño del contenido en bytes.",
    )
    sha256: Mapped[str] = mapped_column(
        CHAR(64),
        nullable=False,
        comment="Hash SHA-256 (hex) del contenido: integridad y deduplicación opcional.",
    )
    file_content: Mapped[bytes] = mapped_column(
        LargeBinary,
        nullable=False,
        deferred=True,
        comment="Contenido binario. Carga diferida: sólo el endpoint de descarga lo lee.",
    )
    kind: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
        comment=(
            "Perfil de validación con el que se aceptó el archivo "
            "(image, favicon, document). Gobierna MIME y tamaño máximo permitidos."
        ),
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        comment="Desactivación lógica: false oculta el archivo sin borrar el binario.",
    )
    uploaded_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Usuario que subió el archivo.",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="Fecha y hora de creación del registro.",
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Fecha y hora de la última modificación.",
    )

    __table_args__ = (
        Index("ix_stored_files_sha256", "sha256"),
        Index("ix_stored_files_uploaded_by", "uploaded_by"),
    )
