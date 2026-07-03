"""Catálogo administrativo bajo ``catalog:*`` (§11–§13).

Los cambios se publican al instante en el sitio (§58.3): aquí no hay
borradores ni revisiones — eso es exclusivo del storefront. Todo cambio queda
auditado con nombres de campos (nunca valores). Los reordenamientos usan el
contrato atómico del §13: lista completa de IDs, validación exacta y pasos de
10, en una sola transacción.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, Query, status
from sqlmodel import select

from backend.app.api.resource_actions import (
    api_error,
    commit_or_conflict,
    get_or_404,
    serialize,
    serialize_many,
)
from backend.app.auth.auth_dependencies import CurrentUser
from backend.app.core.database import SessionDep
from backend.app.models.catalog import (
    ModifierGroup,
    ModifierOption,
    Product,
    ProductCategory,
    ProductImage,
    ProductInclusion,
    ProductModifierGroup,
)
from backend.app.schemas.catalog import (
    CategoryCreate,
    CategoryRead,
    CategoryUpdate,
    ModifierGroupCreate,
    ModifierGroupRead,
    ModifierGroupUpdate,
    ModifierOptionCreate,
    ModifierOptionRead,
    ModifierOptionUpdate,
    ProductCreate,
    ProductImageAttach,
    ProductImageRead,
    ProductInclusionRead,
    ProductInclusionsReplace,
    ProductModifierGroupRead,
    ProductModifierGroupsReplace,
    ProductRead,
    ProductUpdate,
    SortOrderReplace,
)
from backend.app.security.groups.catalog import CatalogPermissions
from backend.app.services.catalog_service import (
    CATALOG_AUDIT_ID,
    SortOrderError,
    apply_sort_order,
)
from backend.app.services.config_audit import record_config_change
from backend.app.services.file_service import get_active_file
from backend.app.utils.utc_now import utc_now

router = APIRouter(prefix="/catalog", tags=["catalog"])

_CATEGORY_NOT_FOUND = "Categoría no encontrada"
_PRODUCT_NOT_FOUND = "Producto no encontrado"
_GROUP_NOT_FOUND = "Grupo de modificadores no encontrado"
_OPTION_NOT_FOUND = "Opción no encontrada"
_SORT_STEP = 10


def _audit(
    session: SessionDep,
    current_user: CurrentUser,
    *,
    entity_type: str,
    entity_id: uuid.UUID,
    action: str,
    fields: list[str],
) -> None:
    record_config_change(
        session,
        actor_user_id=current_user.id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        changed_fields=sorted(fields),
    )


def _apply_sort_or_422(rows, ids) -> None:
    try:
        apply_sort_order(rows, ids)
    except SortOrderError as exc:
        api_error(status.HTTP_422_UNPROCESSABLE_ENTITY, exc.code, exc.message)


def _serialize_product(product: Product) -> ProductRead:
    images = sorted(product.images, key=lambda i: (not i.is_primary, i.sort_order))
    inclusions = sorted(product.inclusions, key=lambda i: i.sort_order)
    return ProductRead(
        **{
            field: getattr(product, field)
            for field in ProductRead.model_fields
            if field not in {"images", "inclusions"}
        },
        images=serialize_many(ProductImageRead, images),
        inclusions=serialize_many(ProductInclusionRead, inclusions),
    )


# ---------------------------------------------------------------------------
# Categorías
# ---------------------------------------------------------------------------

@router.get("/categories", response_model=list[CategoryRead])
def list_categories(
    session: SessionDep, _: CatalogPermissions.READ.requiere
) -> list[CategoryRead]:
    rows = session.exec(
        select(ProductCategory).order_by(
            ProductCategory.sort_order,  # pyright: ignore[reportArgumentType]
            ProductCategory.created_at,  # pyright: ignore[reportArgumentType]
        )
    ).all()
    return serialize_many(CategoryRead, rows)


@router.post("/categories", response_model=CategoryRead, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: CategoryCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: CatalogPermissions.CREATE.requiere,
) -> CategoryRead:
    last = session.exec(
        select(ProductCategory.sort_order).order_by(
            ProductCategory.sort_order.desc()  # pyright: ignore[reportAttributeAccessIssue]
        )
    ).first()
    category = ProductCategory(**payload.model_dump(), sort_order=(last or 0) + _SORT_STEP)
    session.add(category)
    session.flush()
    _audit(
        session, current_user,
        entity_type="product_categories", entity_id=category.id,
        action="create", fields=list(payload.model_dump().keys()),
    )
    commit_or_conflict(session, "No fue posible crear la categoría.")
    session.refresh(category)
    return serialize(CategoryRead, category)


@router.patch("/categories/{category_id}", response_model=CategoryRead)
def update_category(
    category_id: uuid.UUID,
    payload: CategoryUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: CatalogPermissions.UPDATE.requiere,
) -> CategoryRead:
    category = get_or_404(session, ProductCategory, category_id, _CATEGORY_NOT_FOUND)
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(category, field, value)
    category.updated_at = utc_now()
    session.add(category)
    if changes:
        _audit(
            session, current_user,
            entity_type="product_categories", entity_id=category.id,
            action="update", fields=list(changes.keys()),
        )
    commit_or_conflict(session, "No fue posible guardar la categoría.")
    session.refresh(category)
    return serialize(CategoryRead, category)


@router.put("/categories/sort-order", response_model=list[CategoryRead])
def sort_categories(
    payload: SortOrderReplace,
    session: SessionDep,
    current_user: CurrentUser,
    _: CatalogPermissions.SORT.requiere,
) -> list[CategoryRead]:
    rows = session.exec(select(ProductCategory)).all()
    _apply_sort_or_422(rows, payload.ids)
    _audit(
        session, current_user,
        entity_type="product_categories", entity_id=CATALOG_AUDIT_ID,
        action="sort", fields=["sort_order"],
    )
    commit_or_conflict(session, "No fue posible reordenar las categorías.")
    return list_categories(session, True)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Productos
# ---------------------------------------------------------------------------

@router.get("/products", response_model=list[ProductRead])
def list_products(
    session: SessionDep,
    _: CatalogPermissions.READ.requiere,
    category_id: Optional[uuid.UUID] = Query(default=None),
    include_inactive: bool = Query(default=False),
) -> list[ProductRead]:
    stmt = select(Product)
    if category_id is not None:
        stmt = stmt.where(Product.category_id == category_id)
    if not include_inactive:
        stmt = stmt.where(Product.is_active == True)  # noqa: E712
    stmt = stmt.order_by(
        Product.category_id,  # pyright: ignore[reportArgumentType]
        Product.sort_order,  # pyright: ignore[reportArgumentType]
    )
    return [_serialize_product(product) for product in session.exec(stmt).all()]


@router.post("/products", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
def create_product(
    payload: ProductCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: CatalogPermissions.CREATE.requiere,
) -> ProductRead:
    category = get_or_404(session, ProductCategory, payload.category_id, _CATEGORY_NOT_FOUND)
    last = session.exec(
        select(Product.sort_order)
        .where(Product.category_id == category.id)
        .order_by(Product.sort_order.desc())  # pyright: ignore[reportAttributeAccessIssue]
    ).first()
    product = Product(**payload.model_dump(), sort_order=(last or 0) + _SORT_STEP)
    session.add(product)
    session.flush()
    _audit(
        session, current_user,
        entity_type="products", entity_id=product.id,
        action="create", fields=list(payload.model_dump().keys()),
    )
    commit_or_conflict(session, "No fue posible crear el producto.")
    session.refresh(product)
    return _serialize_product(product)


@router.patch("/products/{product_id}", response_model=ProductRead)
def update_product(
    product_id: uuid.UUID,
    payload: ProductUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: CatalogPermissions.UPDATE.requiere,
) -> ProductRead:
    product = get_or_404(session, Product, product_id, _PRODUCT_NOT_FOUND)
    changes = payload.model_dump(exclude_unset=True)

    if "category_id" in changes:
        get_or_404(session, ProductCategory, changes["category_id"], _CATEGORY_NOT_FOUND)

    # Coherencia §11.2 sobre el estado RESULTANTE del patch (el CHECK de la base
    # es la última red; aquí damos un 422 legible).
    effective_money_available = changes.get(
        "is_money_purchase_available", product.is_money_purchase_available
    )
    effective_price = changes.get("money_price_amount", product.money_price_amount)
    effective_redemption = changes.get(
        "credit_redemption_price", product.credit_redemption_price
    )
    if effective_money_available and effective_price is None:
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "producto_sin_precio",
            "Un producto disponible por dinero requiere precio monetario.",
        )
    if not effective_money_available and effective_redemption is None:
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "producto_invendible",
            "El producto debe poder venderse de alguna forma: dinero o canje en créditos.",
        )

    for field, value in changes.items():
        setattr(product, field, value)
    product.updated_at = utc_now()
    session.add(product)
    if changes:
        _audit(
            session, current_user,
            entity_type="products", entity_id=product.id,
            action="update", fields=list(changes.keys()),
        )
    commit_or_conflict(session, "No fue posible guardar el producto.")
    session.refresh(product)
    return _serialize_product(product)


@router.put("/categories/{category_id}/products/sort-order", response_model=list[ProductRead])
def sort_products_in_category(
    category_id: uuid.UUID,
    payload: SortOrderReplace,
    session: SessionDep,
    current_user: CurrentUser,
    _: CatalogPermissions.SORT.requiere,
) -> list[ProductRead]:
    category = get_or_404(session, ProductCategory, category_id, _CATEGORY_NOT_FOUND)
    rows = session.exec(
        select(Product)
        .where(Product.category_id == category.id)
        .where(Product.is_active == True)  # noqa: E712
    ).all()
    _apply_sort_or_422(rows, payload.ids)
    _audit(
        session, current_user,
        entity_type="product_categories", entity_id=category.id,
        action="sort_products", fields=["sort_order"],
    )
    commit_or_conflict(session, "No fue posible reordenar los productos.")
    return list_products(session, True, category_id=category.id, include_inactive=False)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Imágenes del producto
# ---------------------------------------------------------------------------

@router.post(
    "/products/{product_id}/images",
    response_model=ProductImageRead,
    status_code=status.HTTP_201_CREATED,
)
def attach_product_image(
    product_id: uuid.UUID,
    payload: ProductImageAttach,
    session: SessionDep,
    current_user: CurrentUser,
    _: CatalogPermissions.UPDATE.requiere,
) -> ProductImageRead:
    product = get_or_404(session, Product, product_id, _PRODUCT_NOT_FOUND)
    stored = get_active_file(session, payload.file_id)
    if stored is None or stored.kind != "image":
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "archivo_invalido",
            "El archivo no existe, está inactivo o no es una imagen.",
        )
    if payload.is_primary:
        for image in product.images:
            if image.is_primary:
                image.is_primary = False
                image.updated_at = utc_now()
                session.add(image)
    last = max((image.sort_order for image in product.images), default=0)
    image = ProductImage(
        product_id=product.id,
        file_id=payload.file_id,
        alt_text=payload.alt_text,
        is_primary=payload.is_primary,
        sort_order=last + _SORT_STEP,
    )
    session.add(image)
    session.flush()
    _audit(
        session, current_user,
        entity_type="products", entity_id=product.id,
        action="attach_image", fields=["images"],
    )
    commit_or_conflict(session, "No fue posible asociar la imagen.")
    session.refresh(image)
    return serialize(ProductImageRead, image)


@router.delete(
    "/products/{product_id}/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT
)
def detach_product_image(
    product_id: uuid.UUID,
    image_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    _: CatalogPermissions.UPDATE.requiere,
) -> None:
    product = get_or_404(session, Product, product_id, _PRODUCT_NOT_FOUND)
    image = session.get(ProductImage, image_id)
    if image is None or image.product_id != product.id:
        api_error(status.HTTP_404_NOT_FOUND, "imagen_no_encontrada", "Imagen no encontrada")
    # Se elimina el VÍNCULO; el archivo en stored_files permanece.
    session.delete(image)
    _audit(
        session, current_user,
        entity_type="products", entity_id=product.id,
        action="detach_image", fields=["images"],
    )
    commit_or_conflict(session, "No fue posible quitar la imagen.")


@router.put("/products/{product_id}/images/sort-order", response_model=list[ProductImageRead])
def sort_product_images(
    product_id: uuid.UUID,
    payload: SortOrderReplace,
    session: SessionDep,
    current_user: CurrentUser,
    _: CatalogPermissions.SORT.requiere,
) -> list[ProductImageRead]:
    product = get_or_404(session, Product, product_id, _PRODUCT_NOT_FOUND)
    _apply_sort_or_422(list(product.images), payload.ids)
    _audit(
        session, current_user,
        entity_type="products", entity_id=product.id,
        action="sort_images", fields=["images"],
    )
    commit_or_conflict(session, "No fue posible reordenar las imágenes.")
    session.refresh(product)
    ordered = sorted(product.images, key=lambda i: i.sort_order)
    return serialize_many(ProductImageRead, ordered)


# ---------------------------------------------------------------------------
# Inclusiones (reemplazo atómico completo)
# ---------------------------------------------------------------------------

@router.put("/products/{product_id}/inclusions", response_model=ProductRead)
def replace_product_inclusions(
    product_id: uuid.UUID,
    payload: ProductInclusionsReplace,
    session: SessionDep,
    current_user: CurrentUser,
    _: CatalogPermissions.UPDATE.requiere,
) -> ProductRead:
    product = get_or_404(session, Product, product_id, _PRODUCT_NOT_FOUND)
    for inclusion in list(product.inclusions):
        session.delete(inclusion)
    for position, item in enumerate(payload.inclusions, start=1):
        session.add(
            ProductInclusion(
                product_id=product.id,
                name=item.name,
                description=item.description,
                sort_order=position * _SORT_STEP,
            )
        )
    _audit(
        session, current_user,
        entity_type="products", entity_id=product.id,
        action="replace_inclusions", fields=["inclusions"],
    )
    commit_or_conflict(session, "No fue posible guardar las inclusiones.")
    session.refresh(product)
    return _serialize_product(product)


# ---------------------------------------------------------------------------
# Grupos de modificadores y opciones
# ---------------------------------------------------------------------------

def _serialize_group(group: ModifierGroup) -> ModifierGroupRead:
    options = sorted(group.options, key=lambda o: o.sort_order)
    return ModifierGroupRead(
        **{
            field: getattr(group, field)
            for field in ModifierGroupRead.model_fields
            if field != "options"
        },
        options=serialize_many(ModifierOptionRead, options),
    )


@router.get("/modifier-groups", response_model=list[ModifierGroupRead])
def list_modifier_groups(
    session: SessionDep, _: CatalogPermissions.READ.requiere
) -> list[ModifierGroupRead]:
    rows = session.exec(
        select(ModifierGroup).order_by(
            ModifierGroup.sort_order,  # pyright: ignore[reportArgumentType]
            ModifierGroup.created_at,  # pyright: ignore[reportArgumentType]
        )
    ).all()
    return [_serialize_group(group) for group in rows]


@router.post(
    "/modifier-groups", response_model=ModifierGroupRead, status_code=status.HTTP_201_CREATED
)
def create_modifier_group(
    payload: ModifierGroupCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: CatalogPermissions.CREATE.requiere,
) -> ModifierGroupRead:
    group = ModifierGroup(**payload.model_dump())
    session.add(group)
    session.flush()
    _audit(
        session, current_user,
        entity_type="modifier_groups", entity_id=group.id,
        action="create", fields=list(payload.model_dump().keys()),
    )
    commit_or_conflict(session, "No fue posible crear el grupo.")
    session.refresh(group)
    return _serialize_group(group)


@router.patch("/modifier-groups/{group_id}", response_model=ModifierGroupRead)
def update_modifier_group(
    group_id: uuid.UUID,
    payload: ModifierGroupUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: CatalogPermissions.UPDATE.requiere,
) -> ModifierGroupRead:
    group = get_or_404(session, ModifierGroup, group_id, _GROUP_NOT_FOUND)
    changes = payload.model_dump(exclude_unset=True)

    effective_min = changes.get("min_selections", group.min_selections)
    effective_max = changes.get("max_selections", group.max_selections)
    if effective_max is not None and effective_max < effective_min:
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "seleccion_incoherente",
            "max_selections no puede ser menor que min_selections.",
        )

    for field, value in changes.items():
        setattr(group, field, value)
    group.updated_at = utc_now()
    session.add(group)
    if changes:
        _audit(
            session, current_user,
            entity_type="modifier_groups", entity_id=group.id,
            action="update", fields=list(changes.keys()),
        )
    commit_or_conflict(session, "No fue posible guardar el grupo.")
    session.refresh(group)
    return _serialize_group(group)


@router.post(
    "/modifier-groups/{group_id}/options",
    response_model=ModifierOptionRead,
    status_code=status.HTTP_201_CREATED,
)
def create_modifier_option(
    group_id: uuid.UUID,
    payload: ModifierOptionCreate,
    session: SessionDep,
    current_user: CurrentUser,
    _: CatalogPermissions.CREATE.requiere,
) -> ModifierOptionRead:
    group = get_or_404(session, ModifierGroup, group_id, _GROUP_NOT_FOUND)
    last = max((option.sort_order for option in group.options), default=0)
    option = ModifierOption(
        modifier_group_id=group.id,
        **payload.model_dump(),
        sort_order=last + _SORT_STEP,
    )
    session.add(option)
    session.flush()
    _audit(
        session, current_user,
        entity_type="modifier_options", entity_id=option.id,
        action="create", fields=list(payload.model_dump().keys()),
    )
    commit_or_conflict(session, "No fue posible crear la opción.")
    session.refresh(option)
    return serialize(ModifierOptionRead, option)


@router.patch("/modifier-options/{option_id}", response_model=ModifierOptionRead)
def update_modifier_option(
    option_id: uuid.UUID,
    payload: ModifierOptionUpdate,
    session: SessionDep,
    current_user: CurrentUser,
    _: CatalogPermissions.UPDATE.requiere,
) -> ModifierOptionRead:
    option = get_or_404(session, ModifierOption, option_id, _OPTION_NOT_FOUND)
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(option, field, value)
    option.updated_at = utc_now()
    session.add(option)
    if changes:
        _audit(
            session, current_user,
            entity_type="modifier_options", entity_id=option.id,
            action="update", fields=list(changes.keys()),
        )
    commit_or_conflict(session, "No fue posible guardar la opción.")
    session.refresh(option)
    return serialize(ModifierOptionRead, option)


@router.put(
    "/modifier-groups/{group_id}/options/sort-order",
    response_model=list[ModifierOptionRead],
)
def sort_modifier_options(
    group_id: uuid.UUID,
    payload: SortOrderReplace,
    session: SessionDep,
    current_user: CurrentUser,
    _: CatalogPermissions.SORT.requiere,
) -> list[ModifierOptionRead]:
    group = get_or_404(session, ModifierGroup, group_id, _GROUP_NOT_FOUND)
    _apply_sort_or_422(list(group.options), payload.ids)
    _audit(
        session, current_user,
        entity_type="modifier_groups", entity_id=group.id,
        action="sort_options", fields=["options"],
    )
    commit_or_conflict(session, "No fue posible reordenar las opciones.")
    session.refresh(group)
    return serialize_many(
        ModifierOptionRead, sorted(group.options, key=lambda o: o.sort_order)
    )


# ---------------------------------------------------------------------------
# Vínculo producto ↔ grupos (reemplazo atómico con overrides y orden)
# ---------------------------------------------------------------------------

@router.get(
    "/products/{product_id}/modifier-groups",
    response_model=list[ProductModifierGroupRead],
)
def list_product_modifier_groups(
    product_id: uuid.UUID,
    session: SessionDep,
    _: CatalogPermissions.READ.requiere,
) -> list[ProductModifierGroupRead]:
    product = get_or_404(session, Product, product_id, _PRODUCT_NOT_FOUND)
    links = sorted(
        (link for link in product.modifier_links if link.is_active),
        key=lambda l: l.sort_order,
    )
    return [
        ProductModifierGroupRead(
            modifier_group_id=link.modifier_group_id,
            name=link.modifier_group.name,
            min_selections_override=link.min_selections_override,
            max_selections_override=link.max_selections_override,
            sort_order=link.sort_order,
        )
        for link in links
    ]


@router.put(
    "/products/{product_id}/modifier-groups",
    response_model=list[ProductModifierGroupRead],
)
def replace_product_modifier_groups(
    product_id: uuid.UUID,
    payload: ProductModifierGroupsReplace,
    session: SessionDep,
    current_user: CurrentUser,
    _: CatalogPermissions.UPDATE.requiere,
) -> list[ProductModifierGroupRead]:
    product = get_or_404(session, Product, product_id, _PRODUCT_NOT_FOUND)

    ids = [item.modifier_group_id for item in payload.groups]
    if len(set(ids)) != len(ids):
        api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "grupos_duplicados",
            "La lista contiene grupos repetidos.",
        )
    for item in payload.groups:
        group = session.get(ModifierGroup, item.modifier_group_id)
        if group is None or not group.is_active:
            api_error(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "grupo_invalido",
                "Algún grupo de modificadores no existe o está inactivo.",
            )

    for link in list(product.modifier_links):
        session.delete(link)
    session.flush()
    for position, item in enumerate(payload.groups, start=1):
        session.add(
            ProductModifierGroup(
                product_id=product.id,
                modifier_group_id=item.modifier_group_id,
                min_selections_override=item.min_selections_override,
                max_selections_override=item.max_selections_override,
                sort_order=position * _SORT_STEP,
            )
        )
    _audit(
        session, current_user,
        entity_type="products", entity_id=product.id,
        action="replace_modifier_groups", fields=["modifier_groups"],
    )
    commit_or_conflict(session, "No fue posible guardar los grupos del producto.")
    session.refresh(product)
    return list_product_modifier_groups(product.id, session, True)  # type: ignore[arg-type]
