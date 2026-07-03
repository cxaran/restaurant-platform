"""Etapa 0 del dominio restaurante: PostGIS + archivos almacenados.

Activa la extensión PostGIS (geometrías del dominio: zonas de reparto
``MultiPolygon`` y ubicaciones ``Point``, ambas SRID 4326) y crea
``stored_files``, la tabla reutilizable de archivos binarios (§7 del reporte
integral): logo, imágenes de producto, favicon, comprobantes, facturas y
evidencias. El contenido BYTEA queda excluido del snapshot EXPLORER de
respaldos por tipo binario.

Revision ID: f4c9d81b2a37
Revises: e7b34fa8c2d9
Create Date: 2026-07-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

# revision identifiers, used by Alembic.
revision: str = "f4c9d81b2a37"
down_revision: Union[str, Sequence[str], None] = "e7b34fa8c2d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # La imagen postgis/postgis trae la extensión disponible; en Postgres externos
    # el paquete postgis debe estar instalado (ver comentario en compose.yml).
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    op.create_table(
        "stored_files",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column(
            "original_filename",
            sa.String(length=255),
            nullable=False,
            comment="Nombre original del archivo tal como lo subió el usuario.",
        ),
        sa.Column(
            "mime_type",
            sa.String(length=120),
            nullable=False,
            comment="Tipo MIME validado por CONTENIDO en el backend (no confiar en el cliente).",
        ),
        sa.Column(
            "byte_size",
            sa.BigInteger(),
            nullable=False,
            comment="Tamaño del contenido en bytes.",
        ),
        sa.Column(
            "sha256",
            sa.CHAR(length=64),
            nullable=False,
            comment="Hash SHA-256 (hex) del contenido: integridad y deduplicación opcional.",
        ),
        sa.Column(
            "file_content",
            sa.LargeBinary(),
            nullable=False,
            comment="Contenido binario. Carga diferida: sólo el endpoint de descarga lo lee.",
        ),
        sa.Column(
            "kind",
            sa.String(length=40),
            nullable=False,
            comment=(
                "Perfil de validación con el que se aceptó el archivo "
                "(image, favicon, document). Gobierna MIME y tamaño máximo permitidos."
            ),
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
            comment="Desactivación lógica: false oculta el archivo sin borrar el binario.",
        ),
        sa.Column(
            "uploaded_by",
            PG_UUID(as_uuid=True),
            nullable=True,
            comment="Usuario que subió el archivo.",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            comment="Fecha y hora de creación del registro.",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Fecha y hora de la última modificación.",
        ),
        sa.ForeignKeyConstraint(
            ["uploaded_by"],
            ["user.id"],
            name=op.f("fk_stored_files_uploaded_by_user"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_stored_files")),
    )
    op.create_index("ix_stored_files_sha256", "stored_files", ["sha256"], unique=False)
    op.create_index(
        "ix_stored_files_uploaded_by", "stored_files", ["uploaded_by"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_stored_files_uploaded_by", table_name="stored_files")
    op.drop_index("ix_stored_files_sha256", table_name="stored_files")
    op.drop_table("stored_files")
    # La extensión NO se retira: otras bases del mismo servidor podrían usarla y
    # DROP EXTENSION fallaría si ya existen columnas geometry en otros esquemas.
