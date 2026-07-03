"""Servicio de catálogo: reorden atómico (§13) y menú público denormalizado.

Reorden: el cliente envía la lista COMPLETA de IDs de una colección; el
backend valida pertenencia exacta (sin faltantes, sobrantes ni duplicados) y
reasigna posiciones en pasos de 10 dentro de la transacción del llamador. El
orden visual jamás toca pedidos históricos.

Menú público: estructura lista para render — categorías activas con productos
activos y disponibles, modificadores efectivos (overrides aplicados) y sólo
opciones disponibles. El precio que viaja es el VIGENTE; los snapshots
históricos pertenecen a los pedidos (§15).
"""

import uuid
from typing import Protocol, Sequence

from sqlmodel import Session, select

from backend.app.models.catalog import (
    ModifierGroup,
    Product,
    ProductCategory,
    ProductModifierGroup,
)

SORT_STEP = 10

# entity_id determinístico para auditar operaciones de COLECCIÓN (reordenar
# categorías) que no pertenecen a una fila concreta. Hex con letras a propósito
# (afinidad NUMERIC de SQLite en tests; ver business_service.SINGLETON_AUDIT_ID).
CATALOG_AUDIT_ID = uuid.UUID("00000000-0000-4000-a000-ca7a10600001")


class SortOrderError(ValueError):
    """La lista de IDs no coincide exactamente con la colección."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class _Sortable(Protocol):
    id: uuid.UUID
    sort_order: int


def apply_sort_order(rows: Sequence[_Sortable], ordered_ids: Sequence[uuid.UUID]) -> None:
    """Reasigna ``sort_order`` (10, 20, 30…) según la lista completa de IDs.

    Valida el contrato del §13: IDs duplicados, inexistentes o faltantes se
    rechazan; nada se aplica parcialmente (el commit es del llamador).
    """
    if len(set(ordered_ids)) != len(ordered_ids):
        raise SortOrderError("ids_duplicados", "La lista de orden contiene IDs repetidos.")

    by_id = {row.id: row for row in rows}
    unknown = [str(item) for item in ordered_ids if item not in by_id]
    if unknown:
        raise SortOrderError(
            "ids_desconocidos",
            "La lista de orden incluye elementos que no pertenecen a la colección.",
        )
    missing = set(by_id) - set(ordered_ids)
    if missing:
        raise SortOrderError(
            "ids_faltantes",
            "La lista de orden debe incluir TODOS los elementos de la colección.",
        )

    for position, item_id in enumerate(ordered_ids, start=1):
        by_id[item_id].sort_order = position * SORT_STEP


# ---------------------------------------------------------------------------
# Menú público
# ---------------------------------------------------------------------------

def build_public_menu(session: Session) -> list[dict]:
    """Menú público: sólo lo activo/disponible, en el orden del administrador.

    Devuelve estructuras planas (dicts) que el router valida contra los schemas
    públicos; así el shape queda declarado una sola vez en ``schemas/catalog.py``.
    """
    categories = session.exec(
        select(ProductCategory)
        .where(ProductCategory.is_active == True)  # noqa: E712
        .order_by(
            ProductCategory.sort_order,  # pyright: ignore[reportArgumentType]
            ProductCategory.created_at,  # pyright: ignore[reportArgumentType]
        )
    ).all()

    menu: list[dict] = []
    for category in categories:
        products = [
            product
            for product in sorted(category.products, key=lambda p: (p.sort_order, p.name))
            if product.is_active and product.is_available
        ]
        if not products:
            continue
        menu.append(
            {
                "id": category.id,
                "name": category.name,
                "description": category.description,
                "products": [_public_product(product) for product in products],
            }
        )
    return menu


def _public_product(product: Product) -> dict:
    images = sorted(product.images, key=lambda i: (not i.is_primary, i.sort_order))
    inclusions = sorted(product.inclusions, key=lambda i: i.sort_order)
    links = sorted(
        (link for link in product.modifier_links if link.is_active),
        key=lambda l: l.sort_order,
    )
    return {
        "id": product.id,
        "name": product.name,
        "description": product.description,
        "money_price_amount": product.money_price_amount,
        "is_money_purchase_available": product.is_money_purchase_available,
        "credits_awarded_per_unit": product.credits_awarded_per_unit,
        "credit_redemption_price": product.credit_redemption_price,
        "is_featured": product.is_featured,
        "max_units_per_order": product.max_units_per_order,
        "image_file_ids": [image.file_id for image in images],
        "inclusions": [
            {"name": inclusion.name, "description": inclusion.description}
            for inclusion in inclusions
        ],
        "modifier_groups": [
            group_payload
            for link in links
            if (group_payload := _public_modifier_group(link)) is not None
        ],
    }


def _public_modifier_group(link: ProductModifierGroup) -> dict | None:
    group: ModifierGroup = link.modifier_group
    if not group.is_active:
        return None
    options = [
        option
        for option in sorted(group.options, key=lambda o: o.sort_order)
        if option.is_active and option.is_available
    ]
    if not options:
        return None
    return {
        "id": group.id,
        "name": group.name,
        "selection_type": group.selection_type,
        "is_required": group.is_required,
        # Overrides por producto (§12.3): min/max EFECTIVOS para este producto.
        "min_selections": (
            link.min_selections_override
            if link.min_selections_override is not None
            else group.min_selections
        ),
        "max_selections": (
            link.max_selections_override
            if link.max_selections_override is not None
            else group.max_selections
        ),
        "options": [
            {
                "id": option.id,
                "name": option.name,
                "description": option.description,
                "price_adjustment": option.price_adjustment,
            }
            for option in options
        ],
    }
