"""Tests de la etapa 4b: pricing con snapshots, modificadores y límites."""

import os
import unittest
import uuid
from datetime import datetime, timezone
from decimal import Decimal


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

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402
from sqlmodel import Session  # noqa: E402

from pydantic import SecretStr  # noqa: E402

from backend.app.auth.security import get_password_hash  # noqa: E402
from backend.app.models import Base  # noqa: E402
from backend.app.models.catalog import (  # noqa: E402
    ModifierGroup,
    ModifierOption,
    Product,
    ProductCategory,
    ProductModifierGroup,
)
from backend.app.models.orders import Order, OrderLine  # noqa: E402
from backend.app.models.user import User  # noqa: E402
from backend.app.services.pricing_service import (  # noqa: E402
    CartLineInput,
    CartModifierInput,
    PricingError,
    price_cart,
)


def _engine():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return engine


class PricingTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = _engine()
        with Session(self.engine) as session:
            category = ProductCategory(name="Boneless")
            session.add(category)
            session.flush()

            self.boneless_id = uuid.uuid4()
            session.add(
                Product(
                    id=self.boneless_id,
                    category_id=category.id,
                    name="Orden de boneless",
                    description="12 piezas",
                    money_price_amount=Decimal("230"),
                    credits_awarded_per_unit=20,
                    max_units_per_order=5,
                    daily_unit_limit=10,
                )
            )
            self.dip_id = uuid.uuid4()
            session.add(
                Product(
                    id=self.dip_id,
                    category_id=category.id,
                    name="Dip ranch",
                    money_price_amount=Decimal("15"),
                    credits_awarded_per_unit=2,
                    credit_redemption_price=50,
                )
            )

            salsas = ModifierGroup(
                name="Salsas", selection_type="single", min_selections=1,
                max_selections=1, is_required=True,
            )
            extras = ModifierGroup(name="Extras", selection_type="multiple")
            session.add_all([salsas, extras])
            session.flush()

            self.bbq_id = uuid.uuid4()
            self.buffalo_id = uuid.uuid4()
            self.papas_id = uuid.uuid4()
            session.add_all(
                [
                    ModifierOption(
                        id=self.bbq_id, modifier_group_id=salsas.id, name="BBQ",
                        price_adjustment=Decimal("0"),
                    ),
                    ModifierOption(
                        id=self.buffalo_id, modifier_group_id=salsas.id, name="Buffalo",
                        price_adjustment=Decimal("0"),
                    ),
                    ModifierOption(
                        id=self.papas_id, modifier_group_id=extras.id,
                        name="Papas francesa", price_adjustment=Decimal("35"),
                    ),
                ]
            )
            session.add_all(
                [
                    ProductModifierGroup(
                        product_id=self.boneless_id, modifier_group_id=salsas.id, sort_order=10
                    ),
                    ProductModifierGroup(
                        product_id=self.boneless_id, modifier_group_id=extras.id, sort_order=20
                    ),
                ]
            )
            session.commit()

    def _session(self) -> Session:
        return Session(self.engine)

    def test_money_line_freezes_snapshots_and_totals(self) -> None:
        with self._session() as session:
            priced = price_cart(
                session,
                [
                    CartLineInput(
                        product_id=self.boneless_id,
                        quantity=2,
                        purchase_mode="money",
                        modifiers=(
                            CartModifierInput(self.buffalo_id),
                            CartModifierInput(self.papas_id),
                        ),
                        customer_note="Sin apio",
                    )
                ],
            )
        line = priced.lines[0]
        self.assertEqual(line.product_name_snapshot, "Orden de boneless")
        self.assertEqual(line.money_unit_price_snapshot, Decimal("230"))
        self.assertEqual(line.modifier_money_total_per_unit, Decimal("35"))
        self.assertEqual(line.money_line_total_amount, Decimal("530"))  # (230+35)*2
        self.assertEqual(line.credits_earned_total_snapshot, 40)
        self.assertEqual(priced.items_subtotal_amount, Decimal("530"))
        self.assertEqual(priced.credits_earned_total, 40)
        self.assertEqual(priced.credits_redeemed_total, 0)
        self.assertEqual(
            [m.option_name_snapshot for m in line.modifiers], ["Buffalo", "Papas francesa"]
        )

    def test_credit_redemption_line(self) -> None:
        with self._session() as session:
            priced = price_cart(
                session,
                [
                    CartLineInput(
                        product_id=self.dip_id, quantity=2, purchase_mode="credits"
                    )
                ],
            )
        line = priced.lines[0]
        self.assertEqual(line.money_unit_price_snapshot, Decimal("0"))
        self.assertEqual(line.money_line_total_amount, Decimal("0"))
        self.assertEqual(line.credits_earned_total_snapshot, 0)  # canje no genera (§22.1)
        self.assertEqual(line.credits_redeemed_total, 100)  # 50 × 2
        self.assertEqual(priced.credits_redeemed_total, 100)

    def test_required_group_must_be_selected(self) -> None:
        with self._session() as session:
            with self.assertRaises(PricingError) as ctx:
                price_cart(
                    session,
                    [
                        CartLineInput(
                            product_id=self.boneless_id,
                            quantity=1,
                            purchase_mode="money",
                        )
                    ],
                )
        self.assertEqual(ctx.exception.code, "seleccion_incompleta")

    def test_single_group_rejects_two_options(self) -> None:
        with self._session() as session:
            with self.assertRaises(PricingError) as ctx:
                price_cart(
                    session,
                    [
                        CartLineInput(
                            product_id=self.boneless_id,
                            quantity=1,
                            purchase_mode="money",
                            modifiers=(
                                CartModifierInput(self.bbq_id),
                                CartModifierInput(self.buffalo_id),
                            ),
                        )
                    ],
                )
        self.assertEqual(ctx.exception.code, "seleccion_excedida")

    def test_option_from_unlinked_group_rejected(self) -> None:
        with self._session() as session:
            with self.assertRaises(PricingError) as ctx:
                price_cart(
                    session,
                    [
                        CartLineInput(
                            product_id=self.dip_id,
                            quantity=1,
                            purchase_mode="money",
                            modifiers=(CartModifierInput(self.bbq_id),),
                        )
                    ],
                )
        self.assertEqual(ctx.exception.code, "opcion_no_aplicable")

    def test_max_units_per_order_aggregates_lines(self) -> None:
        with self._session() as session:
            with self.assertRaises(PricingError) as ctx:
                price_cart(
                    session,
                    [
                        CartLineInput(
                            product_id=self.boneless_id, quantity=3,
                            purchase_mode="money",
                            modifiers=(CartModifierInput(self.bbq_id),),
                        ),
                        CartLineInput(
                            product_id=self.boneless_id, quantity=3,
                            purchase_mode="money",
                            modifiers=(CartModifierInput(self.buffalo_id),),
                        ),
                    ],
                )
        self.assertEqual(ctx.exception.code, "limite_por_pedido_excedido")

    def test_daily_unit_limit_counts_existing_orders(self) -> None:
        with self._session() as session:
            employee = User(
                name="Karla", last_name="R", email="karla@example.com",
                hashed_password=get_password_hash(SecretStr("x")), token="t",
            )
            session.add(employee)
            session.flush()
            order = Order(
                order_number=1, public_code="ORD-000001",
                source="counter", fulfillment_type="counter",
                status="submitted", payment_status="unpaid",
                created_by=employee.id,
                created_at=datetime.now(timezone.utc),
            )
            session.add(order)
            session.flush()
            session.add(
                OrderLine(
                    order_id=order.id, product_id=self.boneless_id,
                    product_name_snapshot="Orden de boneless",
                    quantity=8, purchase_mode="money",
                    money_unit_price_snapshot=Decimal("230"),
                    money_line_total_amount=Decimal("1840"),
                )
            )
            session.commit()

            # 8 consumidas hoy + 3 pedidas > límite 10.
            with self.assertRaises(PricingError) as ctx:
                price_cart(
                    session,
                    [
                        CartLineInput(
                            product_id=self.boneless_id, quantity=3,
                            purchase_mode="money",
                            modifiers=(CartModifierInput(self.bbq_id),),
                        )
                    ],
                )
            self.assertEqual(ctx.exception.code, "producto_agotado_hoy")

            # 8 + 2 = 10 exacto: permitido.
            priced = price_cart(
                session,
                [
                    CartLineInput(
                        product_id=self.boneless_id, quantity=2,
                        purchase_mode="money",
                        modifiers=(CartModifierInput(self.bbq_id),),
                    )
                ],
            )
            self.assertEqual(len(priced.lines), 1)

    def test_unavailable_product_rejected(self) -> None:
        with self._session() as session:
            product = session.get(Product, self.boneless_id)
            assert product is not None
            product.is_available = False
            session.commit()
            with self.assertRaises(PricingError) as ctx:
                price_cart(
                    session,
                    [
                        CartLineInput(
                            product_id=self.boneless_id, quantity=1,
                            purchase_mode="money",
                            modifiers=(CartModifierInput(self.bbq_id),),
                        )
                    ],
                )
        self.assertEqual(ctx.exception.code, "producto_no_disponible")


if __name__ == "__main__":
    unittest.main()
