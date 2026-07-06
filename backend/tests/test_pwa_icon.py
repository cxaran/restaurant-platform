"""Ícono cuadrado de la PWA: centrado, relación de aspecto y márgenes."""

import io
import unittest

from PIL import Image

from backend.app.services.pwa_icon_service import IconRenderError, build_square_icon


def _png(width: int, height: int, color=(200, 80, 40, 255)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGBA", (width, height), color).save(buffer, format="PNG")
    return buffer.getvalue()


class SquareIconTest(unittest.TestCase):
    def test_wide_logo_becomes_square_and_centered(self) -> None:
        out = build_square_icon(_png(400, 120), size=512)
        with Image.open(io.BytesIO(out)) as img:
            self.assertEqual(img.size, (512, 512))  # cuadrado del tamaño pedido
            img = img.convert("RGBA")
        # Márgenes transparentes arriba/abajo (el logo es más ancho que alto).
        self.assertEqual(img.getpixel((256, 2))[3], 0)  # borde superior transparente
        self.assertEqual(img.getpixel((256, 509))[3], 0)  # borde inferior transparente
        # Centro opaco (el logo).
        self.assertEqual(img.getpixel((256, 256))[3], 255)

    def test_tall_logo_pads_sides(self) -> None:
        out = build_square_icon(_png(120, 400), size=256)
        with Image.open(io.BytesIO(out)) as img:
            img = img.convert("RGBA")
            self.assertEqual(img.size, (256, 256))
        self.assertEqual(img.getpixel((2, 128))[3], 0)  # izquierda transparente
        self.assertEqual(img.getpixel((128, 128))[3], 255)  # centro opaco

    def test_square_logo_preserved(self) -> None:
        out = build_square_icon(_png(300, 300), size=192)
        with Image.open(io.BytesIO(out)) as img:
            self.assertEqual(img.size, (192, 192))

    def test_solid_background_fills_margins(self) -> None:
        out = build_square_icon(_png(400, 100), size=200, background="#ffffff")
        with Image.open(io.BytesIO(out)) as img:
            img = img.convert("RGBA")
        top = img.getpixel((100, 2))
        self.assertEqual(top, (255, 255, 255, 255))  # margen blanco opaco

    def test_size_is_clamped(self) -> None:
        big = build_square_icon(_png(50, 50), size=99999)
        with Image.open(io.BytesIO(big)) as img:
            self.assertEqual(img.size, (1024, 1024))  # MAX_ICON_SIZE
        small = build_square_icon(_png(50, 50), size=1)
        with Image.open(io.BytesIO(small)) as img:
            self.assertEqual(img.size, (48, 48))  # MIN_ICON_SIZE

    def test_padding_shrinks_and_centers(self) -> None:
        # Con padding, un logo CUADRADO deja de tocar los bordes (zona segura).
        out = build_square_icon(_png(300, 300), size=200, padding=0.2)
        with Image.open(io.BytesIO(out)) as img:
            img = img.convert("RGBA")
            self.assertEqual(img.size, (200, 200))
        self.assertEqual(img.getpixel((100, 2))[3], 0)  # borde superior transparente
        self.assertEqual(img.getpixel((100, 100))[3], 255)  # centro opaco

    def test_maskable_white_full_bleed(self) -> None:
        # Ícono adaptable de Android: fondo blanco lleno + logo centrado con padding.
        out = build_square_icon(_png(300, 300), size=512, background="#ffffff", padding=0.14)
        with Image.open(io.BytesIO(out)) as img:
            img = img.convert("RGBA")
        self.assertEqual(img.getpixel((4, 4)), (255, 255, 255, 255))  # esquina blanca opaca
        self.assertEqual(img.getpixel((256, 256))[3], 255)  # centro opaco (logo)

    def test_garbage_raises(self) -> None:
        with self.assertRaises(IconRenderError):
            build_square_icon(b"no soy una imagen", size=192)


if __name__ == "__main__":
    unittest.main()
