"""Tests del servicio de archivos (validación por contenido) y sus rutas.

La validación no requiere base de datos: sniffing por magic bytes, perfiles y
límites son lógica pura. La persistencia real (BYTEA en PostgreSQL) se ejercita
contra el stack de desarrollo; aquí ``store_file`` se prueba con una sesión
stub que sólo registra add/flush.
"""

import hashlib
import os
import unittest


DEV_ENV = {
    "ENVIRONMENT": "local",
    "SECRET_KEY": "test-secret-key",
    "ACCESS_TOKEN_EXPIRE_MINUTES": "30",
    "EMAIL_TOKEN_EXPIRE_MINUTES": "30",
    "TRYS_BEFORE_LOCK": "5",
    "REDIS_HOST": "redis",
    "REDIS_PORT": "6379",
    "REDIS_DB": "0",
    "SMTP_HOST": "mailpit",
    "SMTP_PORT": "1025",
    "SMTP_USER": "test@example.com",
    "SMTP_PASSWORD": "test-password",
    "SMTP_FROM_EMAIL": "test@example.com",
    "SMTP_FROM_NAME": "Restaurant Platform Test",
    "SMTP_TLS": "false",
    "SMTP_SSL": "false",
    "SMTP_USE_CREDENTIALS": "false",
    "POSTGRES_USER": "platform",
    "POSTGRES_PASSWORD": "platform",
    "POSTGRES_SERVER": "postgres",
    "POSTGRES_PORT": "5432",
    "POSTGRES_DB": "restaurant_platform",
}

os.environ.update(DEV_ENV)

from fastapi.testclient import TestClient  # noqa: E402

from backend.app.main import app  # noqa: E402
from backend.app.services.file_service import (  # noqa: E402
    FILE_PROFILES,
    FileValidationError,
    sniff_content_type,
    store_file,
    validate_file,
)

client = TestClient(app)

# Binarios mínimos válidos por formato (sólo cabeceras: el sniffing no decodifica).
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 32
WEBP_BYTES = b"RIFF" + b"\x20\x00\x00\x00" + b"WEBP" + b"\x00" * 32
ICO_BYTES = b"\x00\x00\x01\x00" + b"\x00" * 32
PDF_BYTES = b"%PDF-1.7\n" + b"\x00" * 32
XML_BYTES = b'<?xml version="1.0"?><cfdi:Comprobante></cfdi:Comprobante>'
SVG_BYTES = b'<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'
SVG_SCRIPT_BYTES = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
SVG_HANDLER_BYTES = b'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'
GIF_BYTES = b"GIF89a" + b"\x00" * 32


class SniffContentTypeTest(unittest.TestCase):
    def test_detects_known_formats(self) -> None:
        cases = {
            "png": PNG_BYTES,
            "jpeg": JPEG_BYTES,
            "webp": WEBP_BYTES,
            "ico": ICO_BYTES,
            "pdf": PDF_BYTES,
            "xml": XML_BYTES,
            "svg": SVG_BYTES,
        }
        for expected, content in cases.items():
            with self.subTest(format=expected):
                sniffed = sniff_content_type(content)
                assert sniffed is not None
                self.assertEqual(sniffed.format_key, expected)

    def test_unknown_content_returns_none(self) -> None:
        self.assertIsNone(sniff_content_type(b"contenido arbitrario sin firma"))

    def test_xml_with_svg_root_is_svg(self) -> None:
        content = b'<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>'
        sniffed = sniff_content_type(content)
        assert sniffed is not None
        self.assertEqual(sniffed.format_key, "svg")


class ValidateFileTest(unittest.TestCase):
    def test_accepts_valid_image_formats(self) -> None:
        for content in (PNG_BYTES, JPEG_BYTES, WEBP_BYTES):
            with self.subTest(head=content[:4]):
                sniffed = validate_file(content, kind="image")
                self.assertIn(sniffed.format_key, {"png", "jpeg", "webp"})

    def test_rejects_disallowed_format_for_profile(self) -> None:
        # GIF no está en ningún perfil; ICO no es imagen de catálogo; XML no es favicon.
        for kind, content in (("image", GIF_BYTES), ("image", ICO_BYTES), ("favicon", XML_BYTES)):
            with self.subTest(kind=kind):
                with self.assertRaises(FileValidationError) as ctx:
                    validate_file(content, kind=kind)
                self.assertEqual(ctx.exception.code, "formato_no_permitido")

    def test_favicon_accepts_ico_png_and_clean_svg(self) -> None:
        for content in (ICO_BYTES, PNG_BYTES, SVG_BYTES):
            with self.subTest(head=content[:4]):
                validate_file(content, kind="favicon")

    def test_rejects_svg_with_active_content(self) -> None:
        for content in (SVG_SCRIPT_BYTES, SVG_HANDLER_BYTES):
            with self.subTest(head=content[:24]):
                with self.assertRaises(FileValidationError) as ctx:
                    validate_file(content, kind="favicon")
                self.assertEqual(ctx.exception.code, "svg_con_contenido_activo")

    def test_document_accepts_pdf_and_xml(self) -> None:
        for content in (PDF_BYTES, XML_BYTES):
            with self.subTest(head=content[:5]):
                validate_file(content, kind="document")

    def test_rejects_empty_and_oversized_and_unknown_kind(self) -> None:
        with self.assertRaises(FileValidationError) as ctx:
            validate_file(b"", kind="image")
        self.assertEqual(ctx.exception.code, "archivo_vacio")

        oversized = PNG_BYTES + b"\x00" * FILE_PROFILES["image"].max_bytes
        with self.assertRaises(FileValidationError) as ctx:
            validate_file(oversized, kind="image")
        self.assertEqual(ctx.exception.code, "archivo_demasiado_grande")

        with self.assertRaises(FileValidationError) as ctx:
            validate_file(PNG_BYTES, kind="otro")
        self.assertEqual(ctx.exception.code, "perfil_desconocido")


class _StubSession:
    """Sesión mínima: registra add() y acepta flush() sin base de datos."""

    def __init__(self) -> None:
        self.added: list[object] = []

    def add(self, obj: object) -> None:
        self.added.append(obj)

    def flush(self) -> None:
        pass


class StoreFileTest(unittest.TestCase):
    def test_store_file_sets_validated_metadata(self) -> None:
        session = _StubSession()

        stored = store_file(
            session,  # type: ignore[arg-type]  # stub estructural para lógica pura
            content=PNG_BYTES,
            original_filename="  logo.png  ",
            kind="image",
            uploaded_by=None,
        )

        self.assertIs(session.added[0], stored)
        self.assertEqual(stored.original_filename, "logo.png")
        self.assertEqual(stored.mime_type, "image/png")
        self.assertEqual(stored.byte_size, len(PNG_BYTES))
        self.assertEqual(stored.sha256, hashlib.sha256(PNG_BYTES).hexdigest())
        self.assertEqual(stored.kind, "image")
        self.assertTrue(stored.is_active)

    def test_store_file_rejects_invalid_content_without_persisting(self) -> None:
        session = _StubSession()

        with self.assertRaises(FileValidationError):
            store_file(
                session,  # type: ignore[arg-type]
                content=GIF_BYTES,
                original_filename="foto.gif",
                kind="image",
                uploaded_by=None,
            )
        self.assertEqual(session.added, [])


class FileRoutesTest(unittest.TestCase):
    def test_openapi_exposes_file_routes(self) -> None:
        response = client.get("/api/openapi.json")

        self.assertEqual(response.status_code, 200)
        paths = response.json()["paths"]
        self.assertIn("/api/v1/files", paths)
        self.assertIn("/api/v1/files/{file_id}", paths)
        self.assertIn("/api/v1/files/{file_id}/details", paths)

    def test_upload_requires_authentication(self) -> None:
        response = client.post(
            "/api/v1/files",
            files={"file": ("x.png", PNG_BYTES, "image/png")},
            data={"kind": "image"},
        )
        self.assertEqual(response.status_code, 401)

    def test_download_requires_authentication(self) -> None:
        response = client.get("/api/v1/files/00000000-0000-0000-0000-000000000000")
        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
