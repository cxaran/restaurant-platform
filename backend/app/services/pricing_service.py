"""Pricing de pedidos: del carrito a líneas con snapshots congelados (§15).

Única puerta de entrada para valuar un pedido. Lee el catálogo VIGENTE, valida
todas las reglas comerciales y produce líneas listas para persistir. El
frontend nunca manda precios ni saldos (§22.6): sólo IDs y cantidades.

Reglas aplicadas:
 - producto activo y disponible; modo de compra permitido por el producto;
 - modificadores: opción del grupo vinculado al producto, disponible, y
   conteos entre el min/max EFECTIVOS (override del producto sobre el grupo);
 - límites de venta (§11.2): ``max_units_per_order`` por pedido y
   ``daily_unit_limit`` contra el consumo real del día (order_lines de pedidos
   no cancelados, día en la zona horaria del negocio) bajo lock del producto;
 - créditos (§12.4/§22.1): el producto canjeado no genera créditos y su base
   monetaria es 0; los modificadores SIEMPRE se pagan con dinero; la cortesía
   no genera ni consume créditos.
"""

import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import func as sa_func
from sqlmodel import Session, select

from backend.app.models.catalog import ModifierOption, Product
from backend.app.models.orders import Order, OrderLine, OrderLineModifier
from backend.app.services.business_service import business_timezone, get_business_profile

_LINE_SORT_STEP = 10


class PricingError(ValueError):
    """Regla comercial violada al valuar el carrito. Código estable para la API."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class CartModifierInput:
    modifier_option_id: uuid.UUID
    quantity: int = 1


@dataclass(frozen=True)
class CartLineInput:
    product_id: uuid.UUID
    quantity: int  # H1: SOLO enteros positivos; el servicio lo re-valida.
    purchase_mode: str  # money | credits
    modifiers: tuple[CartModifierInput, ...] = ()
    customer_note: Optional[str] = None


def _require_positive_int(value, *, what: str) -> int:
    """H1: rechaza fracciones, cero, negativos y booleanos — sin truncar jamás."""
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise PricingError(
            "cantidad_invalida",
            f"{what} debe ser un número entero mayor o igual a 1.",
        )
    return value


@dataclass
class PricedOrder:
    """Resultado del pricing: líneas construidas (sin persistir) y totales."""

    lines: list[OrderLine] = field(default_factory=list)
    items_subtotal_amount: Decimal = Decimal("0")
    credits_earned_total: int = 0
    credits_redeemed_total: int = 0


def price_cart(session: Session, cart: list[CartLineInput]) -> PricedOrder:
    """Valida y valúa el carrito completo; falla ante la PRIMERA regla violada."""
    if not cart:
        raise PricingError("carrito_vacio", "El pedido no tiene productos.")

    result = PricedOrder()
    requested_by_product: dict[uuid.UUID, int] = {}
    for line in cart:
        _require_positive_int(line.quantity, what="La cantidad del producto")
        requested_by_product[line.product_id] = (
            requested_by_product.get(line.product_id, 0) + line.quantity
        )

    # Lock de productos con límite diario: serializa el conteo contra pedidos
    # concurrentes (dos checkouts a la vez no pueden rebasar el tope juntos).
    products = _load_products_locked(session, list(requested_by_product))

    for product_id, total_quantity in requested_by_product.items():
        product = products[product_id]
        _validate_product_limits(session, product, total_quantity)

    for position, line in enumerate(cart, start=1):
        product = products[line.product_id]
        result.lines.append(
            _price_line(session, product, line, sort_order=position * _LINE_SORT_STEP)
        )

    result.items_subtotal_amount = sum(
        (line.money_line_total_amount for line in result.lines), Decimal("0")
    )
    result.credits_earned_total = sum(
        line.credits_earned_total_snapshot for line in result.lines
    )
    result.credits_redeemed_total = sum(
        line.credits_redeemed_total for line in result.lines
    )
    return result


def _load_products_locked(
    session: Session, product_ids: list[uuid.UUID]
) -> dict[uuid.UUID, Product]:
    statement = select(Product).where(
        Product.id.in_(product_ids)  # pyright: ignore[reportAttributeAccessIssue]
    )
    # FOR UPDATE sólo tiene efecto real en PostgreSQL; SQLite (tests) lo ignora.
    statement = statement.with_for_update()
    rows = {product.id: product for product in session.exec(statement).all()}
    missing = set(product_ids) - set(rows)
    if missing:
        raise PricingError("producto_no_encontrado", "Algún producto del carrito no existe.")
    return rows


def _validate_product_limits(
    session: Session, product: Product, requested_units: int
) -> None:
    if not product.is_active or not product.is_available:
        raise PricingError(
            "producto_no_disponible",
            f"«{product.name}» no está disponible por ahora.",
        )
    if product.max_units_per_order is not None and requested_units > product.max_units_per_order:
        raise PricingError(
            "limite_por_pedido_excedido",
            f"«{product.name}» permite máximo {product.max_units_per_order} unidades por "
            "pedido; para más, haz otro pedido.",
        )
    if product.daily_unit_limit is not None:
        consumed = consumed_daily_units(session, product.id)
        if consumed + requested_units > product.daily_unit_limit:
            raise PricingError(
                "producto_agotado_hoy",
                f"«{product.name}» alcanzó el límite de pedidos de hoy.",
            )


def business_day_bounds(session: Session, day: Optional[date] = None) -> tuple[datetime, datetime]:
    """(inicio, fin) del día del negocio, expresados en UTC.

    Se convierten a UTC ANTES de consultar: PostgreSQL normalizaría solo
    (timestamptz), pero SQLite (tests) descarta la zona en columnas y
    parámetros, así que comparar en UTC es lo único correcto en ambos.
    """
    tz = business_timezone(get_business_profile(session))
    local_day = day or datetime.now(tz).date()
    start = datetime.combine(local_day, time.min, tzinfo=tz)
    return (start.astimezone(timezone.utc), (start + timedelta(days=1)).astimezone(timezone.utc))


def consumed_daily_units(session: Session, product_id: uuid.UUID) -> int:
    """Unidades del producto en pedidos NO cancelados creados hoy (§11.2).

    Derivado siempre de order_lines: no existe contador editable.
    """
    start, end = business_day_bounds(session)
    statement = (
        select(sa_func.coalesce(sa_func.sum(OrderLine.quantity), 0))
        .join(Order, Order.id == OrderLine.order_id)  # pyright: ignore[reportArgumentType]
        .where(OrderLine.product_id == product_id)
        .where(Order.status.notin_(["cancelled", "draft"]))  # pyright: ignore[reportAttributeAccessIssue]
        .where(Order.created_at >= start)
        .where(Order.created_at < end)
    )
    value = session.exec(statement).one()
    return int(value)


def _price_line(
    session: Session, product: Product, line: CartLineInput, *, sort_order: int
) -> OrderLine:
    if line.purchase_mode == "money":
        if not product.is_money_purchase_available or product.money_price_amount is None:
            raise PricingError(
                "producto_no_monetario",
                f"«{product.name}» no puede comprarse con dinero.",
            )
        unit_price = product.money_price_amount
        credits_awarded = product.credits_awarded_per_unit
        redemption_price = None
        credits_redeemed = 0
    elif line.purchase_mode == "credits":
        if product.credit_redemption_price is None:
            raise PricingError(
                "producto_no_canjeable",
                f"«{product.name}» no puede canjearse con créditos.",
            )
        # Canje: base monetaria 0, no genera créditos (§22.1).
        unit_price = Decimal("0")
        credits_awarded = 0
        redemption_price = product.credit_redemption_price
        # H1: multiplicación EXACTA entero×entero — jamás truncar cantidades.
        credits_redeemed = product.credit_redemption_price * line.quantity
    else:
        raise PricingError("modo_compra_invalido", "Modo de compra no reconocido.")

    modifier_rows, modifier_total_per_unit = _price_modifiers(session, product, line)

    quantity = line.quantity
    line_total = (unit_price + modifier_total_per_unit) * quantity
    order_line = OrderLine(
        product_id=product.id,
        product_name_snapshot=product.name,
        product_description_snapshot=product.description,
        quantity=quantity,
        purchase_mode=line.purchase_mode,
        money_unit_price_snapshot=unit_price,
        modifier_money_total_per_unit=modifier_total_per_unit,
        money_line_total_amount=line_total,
        credits_awarded_per_unit_snapshot=credits_awarded,
        credits_earned_total_snapshot=credits_awarded * quantity,
        credit_redemption_price_per_unit_snapshot=redemption_price,
        credits_redeemed_total=credits_redeemed,
        customer_note=line.customer_note,
        sort_order=sort_order,
    )
    order_line.modifiers = modifier_rows
    return order_line


def _price_modifiers(
    session: Session, product: Product, line: CartLineInput
) -> tuple[list[OrderLineModifier], Decimal]:
    """Valida selecciones contra los grupos EFECTIVOS del producto (§12.3)."""
    links = {
        link.modifier_group_id: link
        for link in product.modifier_links
        if link.is_active and link.modifier_group.is_active
    }

    selected_ids = [item.modifier_option_id for item in line.modifiers]
    if len(set(selected_ids)) != len(selected_ids):
        raise PricingError(
            "modificador_duplicado", "Hay opciones repetidas en la personalización."
        )

    options: dict[uuid.UUID, ModifierOption] = {}
    if selected_ids:
        rows = session.exec(
            select(ModifierOption).where(
                ModifierOption.id.in_(selected_ids)  # pyright: ignore[reportAttributeAccessIssue]
            )
        ).all()
        options = {option.id: option for option in rows}

    counts: dict[uuid.UUID, int] = {group_id: 0 for group_id in links}
    modifier_rows: list[OrderLineModifier] = []
    total_per_unit = Decimal("0")

    for item in line.modifiers:
        option = options.get(item.modifier_option_id)
        if option is None or not option.is_active or not option.is_available:
            raise PricingError(
                "opcion_no_disponible", "Alguna opción elegida no está disponible."
            )
        link = links.get(option.modifier_group_id)
        if link is None:
            raise PricingError(
                "opcion_no_aplicable",
                f"La opción «{option.name}» no aplica para «{product.name}».",
            )
        _require_positive_int(item.quantity, what="La cantidad de la opción")

        counts[option.modifier_group_id] += item.quantity
        row_total = option.price_adjustment * item.quantity
        total_per_unit += row_total
        modifier_rows.append(
            OrderLineModifier(
                modifier_option_id=option.id,
                group_name_snapshot=link.modifier_group.name,
                option_name_snapshot=option.name,
                quantity=item.quantity,
                unit_price_adjustment=option.price_adjustment,
                total_amount=row_total,
            )
        )

    for group_id, link in links.items():
        group = link.modifier_group
        minimum = (
            link.min_selections_override
            if link.min_selections_override is not None
            else group.min_selections
        )
        maximum = (
            link.max_selections_override
            if link.max_selections_override is not None
            else group.max_selections
        )
        if group.selection_type == "single":
            maximum = 1 if maximum is None else min(maximum, 1)
        count = counts[group_id]
        required_minimum = max(minimum, 1) if group.is_required else minimum
        if count < required_minimum:
            raise PricingError(
                "seleccion_incompleta",
                f"«{product.name}» requiere elegir {group.name.lower()}.",
            )
        if maximum is not None and count > maximum:
            raise PricingError(
                "seleccion_excedida",
                f"«{group.name}» permite máximo {maximum} selección(es).",
            )

    return modifier_rows, total_per_unit
