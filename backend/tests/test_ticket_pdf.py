"""Ticket PDF del pedido: render del recibo térmico y despacho post-commit.

- ``render_ticket_pdf`` compone el payload (dinero y créditos) en un PDF válido
  del ancho térmico configurado (58/80 mm).
- ``schedule_completed_order_ticket`` programa el envío para DESPUÉS del commit
  (no envía si hay rollback ni si el pedido no tiene correo capturado).
"""

import os
import unittest
from datetime import datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch


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
    "SMTP_FROM_NAME": "Restaurant Test",
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

from sqlalchemy import text  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402
from sqlmodel import Session, create_engine  # noqa: E402

from backend.app.services import order_notifications  # noqa: E402
from backend.app.services.order_notifications import (  # noqa: E402
    schedule_completed_order_ticket,
)
from backend.app.services.ticket_pdf_service import (  # noqa: E402
    _money,
    render_ticket_pdf,
)


def _money_payload() -> dict:
    return {
        "business": {
            "trade_name": "Tacos El Güero",
            "slogan": "Los mejores",
            "footer_text": "¡Gracias por su compra!",
        },
        "public_code": "ABC-0421",
        "created_at": datetime(2026, 7, 6, 20, 30),
        "source": "counter",
        "fulfillment_type": "delivery",
        "status": "completed",
        "status_label": "Entregado",
        "attended_by": "Juan Pérez",
        "customer": {"name": "María López", "phone": "5544332211", "email": "maria@example.com"},
        "delivery": {
            "street": "Av. Reforma",
            "external_number": "123",
            "internal_number": "4B",
            "neighborhood": "Centro",
            "city": "CDMX",
            "references": "Portón azul",
        },
        "lines": [
            {
                "name": "Taco al pastor con todo y un nombre muy largo para forzar el wrap",
                "quantity": 3,
                "purchase_mode": "money",
                "unit_price": Decimal("25"),
                "line_total": Decimal("75"),
                "customer_note": "sin cebolla",
                "credits_redeemed": 0,
                "modifiers": [
                    {"group": "Extra", "option": "Queso", "quantity": 1, "total": Decimal("10")},
                ],
            },
        ],
        "totals": {
            "items_subtotal": Decimal("75"),
            "discounts": Decimal("10"),
            "discount_code": "BIENVENIDO",
            "shipping": Decimal("30"),
            "total": Decimal("95"),
            "credits_earned": 9,
            "credits_redeemed": 0,
        },
        "payments": [
            {
                "method": "Efectivo",
                "status": "paid",
                "expected_amount": Decimal("95"),
                "received_amount": Decimal("100"),
                "change_requested_for_amount": Decimal("100"),
                "change_amount": Decimal("5"),
            },
        ],
    }


def _credits_payload() -> dict:
    payload = _money_payload()
    payload["lines"] = [
        {
            "name": "Combo canjeado",
            "quantity": 1,
            "purchase_mode": "credits",
            "unit_price": None,
            "line_total": None,
            "customer_note": None,
            "credits_redeemed": 40,
            "modifiers": [],
        },
    ]
    payload["totals"] = {
        "items_subtotal": Decimal("0"),
        "discounts": Decimal("0"),
        "discount_code": None,
        "shipping": None,
        "total": None,
        "credits_earned": 0,
        "credits_redeemed": 40,
    }
    payload["payments"] = []
    return payload


class TicketPdfRenderTest(unittest.TestCase):
    def test_renders_valid_pdf_for_both_paper_sizes(self) -> None:
        for size in ("thermal_58", "thermal_80"):
            pdf = render_ticket_pdf(
                _money_payload(), paper_size=size, currency_code="MXN"
            )
            self.assertTrue(pdf.startswith(b"%PDF-"), size)
            self.assertGreater(len(pdf), 500, size)

    def test_unknown_paper_size_falls_back_without_error(self) -> None:
        pdf = render_ticket_pdf(_money_payload(), paper_size="a3_gigante")
        self.assertTrue(pdf.startswith(b"%PDF-"))

    def test_credits_only_order_renders(self) -> None:
        pdf = render_ticket_pdf(_credits_payload(), paper_size="thermal_80")
        self.assertTrue(pdf.startswith(b"%PDF-"))

    def test_money_formatting_matches_web_format_money(self) -> None:
        # Igual que formatMoney de la web: entero sin decimales, fracción con 2,
        # miles con coma y «—» para nulo.
        self.assertEqual(_money(Decimal("10"), "MXN"), "$10")
        self.assertEqual(_money(Decimal("125.5"), "MXN"), "$125.50")
        self.assertEqual(_money(Decimal("1234"), "MXN"), "$1,234")
        self.assertEqual(_money(Decimal("1234.5"), "MXN"), "$1,234.50")
        self.assertEqual(_money(Decimal("10"), "EUR"), "€10")
        self.assertEqual(_money(None, "MXN"), "—")


class ScheduleCompletedTicketTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )

    def _session(self) -> Session:
        return Session(self.engine)

    def test_dispatches_after_commit_when_email_present(self) -> None:
        order = SimpleNamespace(
            id="11111111-1111-1111-1111-111111111111",
            customer_email_snapshot="cliente@example.com",
        )
        with patch.object(order_notifications, "_dispatch_completed_ticket") as spy:
            with self._session() as session:
                schedule_completed_order_ticket(session, order)
                session.execute(text("SELECT 1"))
                spy.assert_not_called()  # aún no: la transacción no ha commiteado
                session.commit()
            spy.assert_called_once_with(order.id)

    def test_no_dispatch_on_rollback(self) -> None:
        order = SimpleNamespace(
            id="22222222-2222-2222-2222-222222222222",
            customer_email_snapshot="cliente@example.com",
        )
        with patch.object(order_notifications, "_dispatch_completed_ticket") as spy:
            with self._session() as session:
                schedule_completed_order_ticket(session, order)
                session.execute(text("SELECT 1"))
                session.rollback()
            spy.assert_not_called()

    def test_no_op_without_captured_email(self) -> None:
        order = SimpleNamespace(id="33333333-3333-3333-3333-333333333333", customer_email_snapshot=None)
        with patch.object(order_notifications, "_dispatch_completed_ticket") as spy:
            with self._session() as session:
                schedule_completed_order_ticket(session, order)
                session.execute(text("SELECT 1"))
                session.commit()
            spy.assert_not_called()


if __name__ == "__main__":
    unittest.main()
