"""Render del ticket PDF del pedido (recibo térmico 58/80 mm).

Replica el MISMO diseño que imprime la web (``frontend/.../ticket-print.ts``):
tipografía monoespaciada, logo en escala de grises, cabecera
``Pedido/Fecha/Tipo/Atendió/Estado``, líneas ``qty × nombre`` con modificadores
y notas, totales y pagos con idéntico formato de moneda (``formatMoney``:
símbolo ``$``, sin decimales cuando el importe es entero). Se compone 100% desde
el payload inmutable de ``ticket_service.build_ticket_payload`` y se envía por
correo al completar el pedido.

Puro reportlab (sin dependencias del sistema). El origen de reportlab es la
esquina inferior izquierda: se acumulan las filas, se mide la altura total y se
dibuja de arriba hacia abajo.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from io import BytesIO
from typing import Optional

from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

# Ancho del papel (rollo térmico) por tamaño soportado.
_PAPER_WIDTH_MM = {"thermal_58": 58.0, "thermal_80": 80.0}
_DEFAULT_PAPER = "thermal_80"

# Monoespaciada como la web (font-family: ui-monospace, monospace).
_FONT = "Courier"
_FONT_BOLD = "Courier-Bold"
_FONT_ITALIC = "Courier-Oblique"
_BASE_SIZE = 8.5
_SMALL_SIZE = 7.5
_LINE_FACTOR = 1.5  # ~ line-height 1.55 de la web
_MARGIN = 3.0 * mm  # padding lateral 3 mm como la web
_INDENT = 7.0  # sangría de modificadores/notas (~padding-left 10px)

_CURRENCY_SYMBOLS = {"MXN": "$", "USD": "$", "EUR": "€", "GBP": "£", "COP": "$", "ARS": "$"}

# Mismas etiquetas que el panel web (order-meta.ts).
_FULFILLMENT_LABELS = {
    "delivery": "A domicilio",
    "pickup": "Recoger en tienda",
    "counter": "Mostrador",
}
_PAYMENT_STATUS_LABELS = {
    "pending": "Pendiente",
    "pending_verification": "Por verificar",
    "paid": "Pagado",
    "rejected": "Rechazado",
    "voided": "Anulado",
    "refunded": "Reembolsado",
}


def _to_decimal(value) -> Optional[Decimal]:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def _money(value, currency_code: str) -> str:
    """Equivalente a ``formatMoney`` de la web: ``$`` + miles con coma y sin
    decimales cuando el importe es entero (``—`` para nulo)."""
    amount = _to_decimal(value)
    if amount is None:
        return "—"
    symbol = _CURRENCY_SYMBOLS.get((currency_code or "").upper(), "$")
    if amount == amount.to_integral_value():
        return f"{symbol}{int(amount):,}"
    return f"{symbol}{amount:,.2f}"


def _is_money_row(value) -> bool:
    """``moneyRow`` de la web: finito y distinto de cero."""
    amount = _to_decimal(value)
    return amount is not None and amount != 0


def _format_created_at(value: Optional[datetime], tz_name: Optional[str]) -> str:
    if value is None:
        return ""
    moment = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    if tz_name:
        try:
            from zoneinfo import ZoneInfo

            moment = moment.astimezone(ZoneInfo(tz_name))
        except Exception:
            # tzdata ausente (p. ej. Windows sin el paquete): se muestra UTC.
            pass
    # "dd/mm/yyyy - hh:mm" como formatTicketDate de la web.
    return moment.strftime("%d/%m/%Y - %H:%M")


class _Receipt:
    """Acumula renglones y luego los dibuja en un PDF de altura ajustada."""

    def __init__(self, width_pt: float) -> None:
        self.width = width_pt
        self.usable = width_pt - 2 * _MARGIN
        self._rows: list[tuple] = []

    # -- composición --
    def gap(self, height: float = 4.0) -> None:
        self._rows.append(("gap", height))

    def rule(self) -> None:
        self._rows.append(("rule",))

    def image(self, png_bytes: bytes, max_h: float) -> None:
        self._rows.append(("image", png_bytes, max_h))

    def banner(self, text: str, *, size: float = _BASE_SIZE) -> None:
        self._rows.append(("banner", text, size))

    def center(self, text: str, *, size: float = _BASE_SIZE, bold: bool = False) -> None:
        for chunk in self._wrap(text, size, bold):
            self._rows.append(("center", chunk, size, bold, False))

    def left(
        self,
        text: str,
        *,
        size: float = _BASE_SIZE,
        bold: bool = False,
        italic: bool = False,
        indent: float = 0.0,
    ) -> None:
        for chunk in self._wrap(text, size, bold, max_width=self.usable - indent):
            self._rows.append(("left", chunk, size, bold, italic, indent))

    def row(
        self,
        left: str,
        right: str,
        *,
        size: float = _BASE_SIZE,
        bold: bool = False,
        indent: float = 0.0,
    ) -> None:
        """Dos columnas: ``left`` (envuelve) y ``right`` (importe, no envuelve)."""
        right = right or ""
        font = _FONT_BOLD if bold else _FONT
        right_w = stringWidth(right, font, size)
        left_max = self.usable - indent - right_w - 6
        lines = self._wrap(left, size, bold, max_width=max(left_max, 20))
        for index, chunk in enumerate(lines):
            self._rows.append(
                ("row", chunk, right if index == len(lines) - 1 else "", size, bold, indent)
            )

    # -- medición y render --
    def _wrap(
        self, text: str, size: float, bold: bool, max_width: Optional[float] = None
    ) -> list[str]:
        text = (text or "").replace("\n", " ").strip()
        if not text:
            return [""]
        font = _FONT_BOLD if bold else _FONT
        limit = self.usable if max_width is None else max_width
        words = text.split(" ")
        lines: list[str] = []
        current = ""
        for word in words:
            candidate = f"{current} {word}".strip()
            if stringWidth(candidate, font, size) <= limit or not current:
                current = candidate
            else:
                lines.append(current)
                current = word
        if current:
            lines.append(current)
        return lines or [""]

    def _image_size(self, png_bytes: bytes, max_h: float) -> tuple:
        from reportlab.lib.utils import ImageReader

        reader = ImageReader(BytesIO(png_bytes))
        iw, ih = reader.getSize()
        if iw <= 0 or ih <= 0:
            return reader, 0.0, 0.0
        scale = min(max_h / ih, self.usable / iw)
        return reader, iw * scale, ih * scale

    def _row_height(self, row: tuple) -> float:
        kind = row[0]
        if kind == "gap":
            return row[1]
        if kind == "rule":
            return 6.0
        if kind == "image":
            try:
                _, _, h = self._image_size(row[1], row[2])
            except Exception:
                return 0.0
            return h + 4.0
        if kind == "banner":
            return row[2] * _LINE_FACTOR + 4.0
        size = row[2] if kind in ("center", "left") else row[3]
        return size * _LINE_FACTOR

    def render(self) -> bytes:
        top_pad = bottom_pad = 4.0 * mm  # padding vertical 4 mm como la web
        height = top_pad + bottom_pad + sum(self._row_height(r) for r in self._rows)
        buffer = BytesIO()
        pdf = canvas.Canvas(buffer, pagesize=(self.width, height))
        y = height - top_pad
        for row in self._rows:
            kind = row[0]
            if kind == "gap":
                y -= row[1]
                continue
            if kind == "rule":
                y -= 3.0
                pdf.setDash(1, 2)
                pdf.setLineWidth(0.5)
                pdf.line(_MARGIN, y, self.width - _MARGIN, y)
                pdf.setDash()
                y -= 3.0
                continue
            if kind == "image":
                try:
                    reader, w, h = self._image_size(row[1], row[2])
                except Exception:
                    continue
                if h <= 0:
                    continue
                y -= h
                pdf.drawImage(
                    reader, (self.width - w) / 2, y, width=w, height=h, mask="auto"
                )
                y -= 4.0
                continue
            if kind == "banner":
                _, text, size = row
                line_h = size * _LINE_FACTOR
                y -= line_h
                pdf.setLineWidth(0.6)
                pdf.rect(_MARGIN, y - 1, self.usable, line_h + 1, stroke=1, fill=0)
                pdf.setFont(_FONT_BOLD, size)
                pdf.drawCentredString(self.width / 2, y + line_h * 0.28, text)
                y -= 4.0
                continue
            if kind == "center":
                _, text, size, bold, _italic = row
                y -= size * _LINE_FACTOR
                pdf.setFont(_FONT_BOLD if bold else _FONT, size)
                pdf.drawCentredString(self.width / 2, y + size * (_LINE_FACTOR - 1) * 0.5, text)
                continue
            if kind == "left":
                _, text, size, bold, italic, indent = row
                y -= size * _LINE_FACTOR
                font = _FONT_ITALIC if italic else (_FONT_BOLD if bold else _FONT)
                pdf.setFont(font, size)
                pdf.drawString(_MARGIN + indent, y + size * (_LINE_FACTOR - 1) * 0.5, text)
                continue
            # row (dos columnas)
            _, left, right, size, bold, indent = row
            y -= size * _LINE_FACTOR
            baseline = y + size * (_LINE_FACTOR - 1) * 0.5
            pdf.setFont(_FONT_BOLD if bold else _FONT, size)
            pdf.drawString(_MARGIN + indent, baseline, left)
            if right:
                pdf.drawRightString(self.width - _MARGIN, baseline, right)
        pdf.showPage()
        pdf.save()
        return buffer.getvalue()


def render_ticket_pdf(
    payload: dict,
    *,
    paper_size: str = _DEFAULT_PAPER,
    currency_code: str = "MXN",
    tz_name: Optional[str] = None,
    logo_bytes: Optional[bytes] = None,
) -> bytes:
    """Devuelve los bytes del PDF del ticket, replicando el diseño de la web."""
    width_mm = _PAPER_WIDTH_MM.get(paper_size, _PAPER_WIDTH_MM[_DEFAULT_PAPER])
    receipt = _Receipt(width_mm * mm)

    def money(value) -> str:
        return _money(value, currency_code)

    business = payload.get("business") or {}
    cancelled = payload.get("status") == "cancelled"
    if cancelled:
        receipt.banner("PEDIDO CANCELADO — SOLO INFORMATIVO")

    # Logo en escala de grises (como filter:grayscale(1) de la web).
    if logo_bytes:
        try:
            from PIL import Image

            with Image.open(BytesIO(logo_bytes)) as img:
                gray = img.convert("LA" if "A" in img.getbands() else "L")
                out = BytesIO()
                gray.save(out, format="PNG")
            receipt.image(out.getvalue(), max_h=33.0)  # ~44px
        except Exception:
            pass  # best-effort: sin logo si la imagen no se puede procesar

    name = (business.get("trade_name") or "").strip()
    if name:
        receipt.center(name, bold=True)
    slogan = (business.get("slogan") or "").strip()
    if slogan:
        receipt.center(slogan)
    receipt.rule()

    fulfillment = _FULFILLMENT_LABELS.get(
        payload.get("fulfillment_type"), payload.get("fulfillment_type") or ""
    )
    receipt.left(f"Pedido: {payload.get('public_code') or ''}", bold=True)
    receipt.left(f"Fecha: {_format_created_at(payload.get('created_at'), tz_name)}")
    receipt.left(f"Tipo: {fulfillment}")
    if payload.get("attended_by"):
        receipt.left(f"Atendió: {payload['attended_by']}")
    receipt.left(f"Estado: {payload.get('status_label') or ''}")

    customer = payload.get("customer") or {}
    delivery = payload.get("delivery")
    if customer.get("name") or customer.get("phone") or customer.get("email") or delivery:
        receipt.rule()
        if customer.get("name"):
            receipt.left(f"Cliente: {customer['name']}")
        if customer.get("phone"):
            receipt.left(f"Tel: {customer['phone']}")
        if customer.get("email"):
            receipt.left(f"Correo: {customer['email']}")
        if delivery:
            street = delivery.get("street") or ""
            if delivery.get("external_number"):
                street = f"{street} {delivery['external_number']}"
            if delivery.get("internal_number"):
                street = f"{street} int. {delivery['internal_number']}"
            if street.strip():
                receipt.left(street.strip())
            barrio = ", ".join(
                part
                for part in [delivery.get("neighborhood"), delivery.get("city")]
                if part
            )
            if barrio:
                receipt.left(barrio)
            if delivery.get("references"):
                receipt.left(f"Ref: {delivery['references']}")

    receipt.rule()
    for line in payload.get("lines") or []:
        qty = line.get("quantity") or 0
        if line.get("purchase_mode") == "credits":
            amount = f"{line.get('credits_redeemed') or 0} cr."
        else:
            amount = money(line.get("line_total"))
        receipt.row(f"{qty} × {line.get('name') or ''}", amount)
        for modifier in line.get("modifiers") or []:
            mqty = modifier.get("quantity") or 1
            total = modifier.get("total")
            receipt.row(
                f"+ {mqty} × {modifier.get('option') or ''}",
                money(total) if _is_money_row(total) else "",
                size=_SMALL_SIZE,
                indent=_INDENT,
            )
        if line.get("customer_note"):
            receipt.left(
                f"* {line['customer_note']}", size=_SMALL_SIZE, italic=True, indent=_INDENT
            )

    totals = payload.get("totals") or {}
    total_pending = totals.get("total") is None
    receipt.rule()
    receipt.row("Subtotal", money(totals.get("items_subtotal")))
    if _is_money_row(totals.get("discounts")):
        code = totals.get("discount_code")
        label = f"Descuento ({code})" if code else "Descuentos"
        receipt.row(label, f"-{money(totals.get('discounts'))}")
    if _is_money_row(totals.get("shipping")):
        receipt.row("Envío", money(totals.get("shipping")))
    receipt.row(
        "TOTAL",
        "por definir" if total_pending else money(totals.get("total")),
        bold=True,
    )
    if (totals.get("credits_redeemed") or 0) > 0:
        receipt.row("Créditos usados", str(totals["credits_redeemed"]))
    if (totals.get("credits_earned") or 0) > 0:
        receipt.row("Créditos ganados", str(totals["credits_earned"]))

    payments = payload.get("payments") or []
    if payments:
        receipt.rule()
        for payment in payments:
            change_for = payment.get("change_requested_for_amount")
            paga_con = f" (paga con {money(change_for)})" if _is_money_row(change_for) else ""
            status = payment.get("status")
            status_label = (
                f" · {_PAYMENT_STATUS_LABELS.get(status, status)}" if status != "paid" else ""
            )
            receipt.left(f"Pago: {payment.get('method') or ''}{paga_con}{status_label}")
            if _is_money_row(payment.get("change_amount")):
                receipt.row("Cambio", money(payment.get("change_amount")))

    receipt.gap(6.0)
    footer = (business.get("footer_text") or "").strip() or "¡Gracias por su compra!"
    receipt.center(footer)

    return receipt.render()
