"""Catálogo de productos y modificadores (§11–§13 del reporte integral).

El catálogo VIGENTE sólo define ventas futuras: los pedidos congelan snapshots
y nunca se reconstruyen con precios actuales (§15). Por eso aquí no hay nada
histórico — desactivar o reordenar jamás toca pedidos pasados.

Reglas de coherencia (§11.2) como CHECKs:
 - venta monetaria habilitada exige precio;
 - todo producto debe poder venderse de alguna forma (dinero o canje);
 - los límites de venta (§11.2: unidades por pedido y por día) son opcionales
   y positivos. El consumo diario NUNCA es un contador editable: se calcula
   desde order_lines (etapa 4).

El orden visual (§13) vive en ``sort_order`` con pasos de 10; el reorden es un
reemplazo atómico de la lista completa (ver catalog_service).
"""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base

# selection_type de un grupo de modificadores: una sola opción (salsa) o varias.
MODIFIER_SELECTION_TYPES = ("single", "multiple")


class ProductCategory(Base):
    """Grupo visible del menú (§11.1)."""

    __tablename__ = "product_categories"
    __table_args__ = (Index("ix_product_categories_sort", "sort_order"),)

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        comment="Oculta el grupo del sitio sin perder productos ni historial.",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    products: Mapped[list["Product"]] = relationship(back_populates="category")


class Product(Base):
    """Presentación vendible (§11.2): dinero, créditos o ambos."""

    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint(
            "NOT is_money_purchase_available OR money_price_amount IS NOT NULL",
            name="products_money_requires_price",
        ),
        CheckConstraint(
            "is_money_purchase_available OR credit_redemption_price IS NOT NULL",
            name="products_sellable_somehow",
        ),
        CheckConstraint(
            "money_price_amount IS NULL OR money_price_amount >= 0",
            name="products_price_non_negative",
        ),
        CheckConstraint(
            "credits_awarded_per_unit >= 0", name="products_credits_awarded_non_negative"
        ),
        CheckConstraint(
            "credit_redemption_price IS NULL OR credit_redemption_price >= 1",
            name="products_redemption_positive",
        ),
        CheckConstraint(
            "preparation_minutes IS NULL OR preparation_minutes >= 0",
            name="products_preparation_non_negative",
        ),
        CheckConstraint(
            "max_units_per_order IS NULL OR max_units_per_order >= 1",
            name="products_max_units_positive",
        ),
        CheckConstraint(
            "daily_unit_limit IS NULL OR daily_unit_limit >= 1",
            name="products_daily_limit_positive",
        ),
        Index("ix_products_category_sort", "category_id", "sort_order"),
        Index("ix_products_active_available", "is_active", "is_available"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("product_categories.id", ondelete="RESTRICT"),
        nullable=False,
    )
    sku: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    money_price_amount: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(12, 2),
        nullable=True,
        comment="Precio monetario VIGENTE; los pedidos guardan su propio snapshot (§15).",
    )
    is_money_purchase_available: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    credits_awarded_per_unit: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Créditos que otorga cada unidad comprada con dinero (§22.1).",
    )
    credit_redemption_price: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        comment="Precio alternativo en créditos; NULL = no canjeable.",
    )
    is_available: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        comment="Disponibilidad MANUAL del día (§11.2): sin reactivación automática.",
    )
    is_featured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    preparation_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    max_units_per_order: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        comment="Límite de unidades del producto en UN pedido; para más, otro pedido.",
    )
    daily_unit_limit: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        comment=(
            "Tope de unidades aceptadas por día (evita sobrepedidos). El consumo se "
            "calcula desde order_lines; no existe contador editable."
        ),
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    category: Mapped["ProductCategory"] = relationship(back_populates="products")
    images: Mapped[list["ProductImage"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )
    inclusions: Mapped[list["ProductInclusion"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )
    modifier_links: Mapped[list["ProductModifierGroup"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )


class ProductImage(Base):
    """Imagen de producto (§11.3) apuntando a stored_files."""

    __tablename__ = "product_images"
    __table_args__ = (
        # A lo sumo una imagen principal por producto.
        Index(
            "uq_product_images_primary_per_product",
            "product_id",
            unique=True,
            postgresql_where=text("is_primary"),
        ),
        Index("ix_product_images_product_sort", "product_id", "sort_order"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
    )
    file_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("stored_files.id", ondelete="RESTRICT"),
        nullable=False,
    )
    alt_text: Mapped[Optional[str]] = mapped_column(String(180), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    product: Mapped["Product"] = relationship(back_populates="images")


class ProductInclusion(Base):
    """Elemento incluido sin cargo (§11.4): «12 piezas», «papas gajo», …"""

    __tablename__ = "product_inclusions"
    __table_args__ = (Index("ix_product_inclusions_product_sort", "product_id", "sort_order"),)

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    product: Mapped["Product"] = relationship(back_populates="inclusions")


class ModifierGroup(Base):
    """Grupo genérico de modificadores (§12.1): salsas, extras, aderezos…"""

    __tablename__ = "modifier_groups"
    __table_args__ = (
        CheckConstraint(
            "selection_type IN ('single', 'multiple')",
            name="modifier_groups_selection_type",
        ),
        CheckConstraint("min_selections >= 0", name="modifier_groups_min_non_negative"),
        CheckConstraint(
            "max_selections IS NULL OR max_selections >= 1",
            name="modifier_groups_max_positive",
        ),
        CheckConstraint(
            "max_selections IS NULL OR max_selections >= min_selections",
            name="modifier_groups_max_gte_min",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    selection_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="single",
        comment="single = una opción (salsa); multiple = varias (extras).",
    )
    min_selections: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_selections: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    options: Mapped[list["ModifierOption"]] = relationship(
        back_populates="group", cascade="all, delete-orphan"
    )
    product_links: Mapped[list["ProductModifierGroup"]] = relationship(
        back_populates="modifier_group", cascade="all, delete-orphan"
    )


class ModifierOption(Base):
    """Opción de un grupo (§12.2): BBQ, Buffalo, papas gajo, dip ranch…"""

    __tablename__ = "modifier_options"
    __table_args__ = (
        CheckConstraint(
            "price_adjustment >= 0", name="modifier_options_price_non_negative"
        ),
        Index("ix_modifier_options_group_sort", "modifier_group_id", "sort_order"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    modifier_group_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("modifier_groups.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    price_adjustment: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        default=Decimal("0"),
        comment="Cargo adicional VIGENTE por elegir la opción; 0 = sin costo.",
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    group: Mapped["ModifierGroup"] = relationship(back_populates="options")


class ProductModifierGroup(Base):
    """Vínculo producto ↔ grupo de modificadores con overrides (§12.3)."""

    __tablename__ = "product_modifier_groups"
    __table_args__ = (
        CheckConstraint(
            "min_selections_override IS NULL OR min_selections_override >= 0",
            name="product_modifier_groups_min_non_negative",
        ),
        CheckConstraint(
            "max_selections_override IS NULL OR max_selections_override >= 1",
            name="product_modifier_groups_max_positive",
        ),
        Index(
            "uq_product_modifier_groups_pair",
            "product_id",
            "modifier_group_id",
            unique=True,
        ),
        Index("ix_product_modifier_groups_product_sort", "product_id", "sort_order"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
    )
    modifier_group_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("modifier_groups.id", ondelete="RESTRICT"),
        nullable=False,
    )
    min_selections_override: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    max_selections_override: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    product: Mapped["Product"] = relationship(back_populates="modifier_links")
    modifier_group: Mapped["ModifierGroup"] = relationship(back_populates="product_links")
