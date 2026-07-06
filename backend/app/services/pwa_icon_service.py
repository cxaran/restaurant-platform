"""Ícono cuadrado de la PWA derivado del logo del negocio (bajo demanda).

El manifest y el apple-touch-icon necesitan un PNG CUADRADO; el logo subido no
lo es necesariamente. Aquí se centra el logo en un lienzo cuadrado (lado = el
mayor de sus dos dimensiones, SIN deformar) y se rellenan los márgenes con
transparencia (o un color sólido opcional), luego se escala al tamaño pedido.

Se genera al vuelo en el endpoint público (con cache); no se guarda copia.
"""

import io
from typing import Optional

# Tamaños de ícono admitidos (evita que un tercero pida renders enormes).
MIN_ICON_SIZE = 48
MAX_ICON_SIZE = 1024


class IconRenderError(Exception):
    """El origen no es una imagen que Pillow pueda abrir."""


def _parse_background(background: Optional[str]) -> tuple[int, int, int, int]:
    """'transparent'/None → RGBA transparente; hex ('fff'|'ffffff', con o sin
    '#') → color opaco. Cualquier otra cosa cae a transparente."""
    if not background or background.strip().lower() in ("transparent", "none"):
        return (0, 0, 0, 0)
    value = background.strip().lstrip("#")
    if len(value) == 3:
        value = "".join(ch * 2 for ch in value)
    if len(value) != 6:
        return (0, 0, 0, 0)
    try:
        r, g, b = (int(value[i : i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        return (0, 0, 0, 0)
    return (r, g, b, 255)


def build_square_icon(
    source: bytes, *, size: int, background: Optional[str] = None
) -> bytes:
    """Devuelve un PNG cuadrado ``size``×``size`` con el logo CENTRADO y su
    relación de aspecto intacta; márgenes transparentes (o el color dado).

    Levanta ``IconRenderError`` si el origen no es una imagen legible.
    """
    from PIL import Image, UnidentifiedImageError

    side = max(MIN_ICON_SIZE, min(size, MAX_ICON_SIZE))
    try:
        with Image.open(io.BytesIO(source)) as opened:
            logo = opened.convert("RGBA")
    except (UnidentifiedImageError, OSError, ValueError) as error:
        raise IconRenderError(str(error)) from error

    # Lienzo cuadrado = el mayor de los dos lados (nunca recorta el logo).
    canvas_side = max(logo.width, logo.height)
    canvas = Image.new("RGBA", (canvas_side, canvas_side), _parse_background(background))
    offset = ((canvas_side - logo.width) // 2, (canvas_side - logo.height) // 2)
    # La propia imagen como máscara preserva su transparencia al pegar.
    canvas.paste(logo, offset, logo)

    if canvas_side != side:
        canvas = canvas.resize((side, side), Image.LANCZOS)

    buffer = io.BytesIO()
    canvas.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()
