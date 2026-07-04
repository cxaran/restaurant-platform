"""Núcleo comercial: pedidos y su histórico inmutable (§14–§17).

UNA sola tabla ``orders`` para todos los canales (§14.1): el canal vive en
``source`` y la identidad en la invariante «no hay pedido sin usuario» —
``customer_user_id`` (cliente) o ``created_by`` (empleado que registró).

Histórico económico inmutable (§15): cada línea congela nombre, precio,
modificadores y créditos del momento. El catálogo vigente jamás reconstruye un
pedido pasado. Nada se elimina: se cancela, reversa o anula con bitácora.

Estados como VARCHAR + CHECK (enums no nativos, convención del proyecto); las
transiciones válidas viven en ``order_service`` como tabla declarativa.
"""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import (
    JSON,
    BigInteger,
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
from .geometry import PointGeometry

# Canales (§14.1)
ORDER_SOURCES = ("online", "counter", "phone", "whatsapp", "social", "manual")
FULFILLMENT_TYPES = ("delivery", "pickup", "counter")

# Estados del pedido (§16) y de pago
ORDER_STATUSES = (
    "draft",
    "submitted",
    "pending_shipping_review",
    "pending_payment_verification",
    "pending_approval",
    "approved",
    "preparing",
    "ready",
    "out_for_delivery",
    "completed",
    "cancelled",
)
PAYMENT_STATUSES = (
    "unpaid",
    "pending",
    "pending_verification",
    "paid",
    "partially_refunded",
    "refunded",
    "voided",
)

# Modo de compra de una línea (§15.1)
PURCHASE_MODES = ("money", "credits", "complimentary")

# Modo del PEDIDO completo (§1.3 GOALS): íntegramente dinero o íntegramente
# créditos — jamás híbrido. "complimentary" no es un modo de pedido.
ORDER_PURCHASE_MODES = ("money", "credits")

# H5 (§1.6 GOALS): resolución financiera obligatoria al cancelar con cobro.
CANCELLATION_MONEY_RESOLUTIONS = ("refund_now", "refund_pending", "retain")

# Ajustes (§15.3); "discount_code" es el ajuste creado por un código de
# descuento fijo (Etapa 5 RC) y queda ligado a su redención.
ADJUSTMENT_TYPES = ("discount", "promotion", "courtesy", "manual_fee", "discount_code")
ADJUSTMENT_DIRECTIONS = ("charge", "discount")

# Envío (§17.2)
SHIPPING_CALCULATION_STATUSES = ("calculated", "pending_review", "finalized", "not_available")
SHIPPING_CALCULATION_SOURCES = (
    "polygon_auto",
    "employee_selected_rate",
    "employee_manual_override",
    "free_shipping_rule",
)

# Origen de la ubicación de entrega (§17.1)
LOCATION_SOURCES = (
    "customer_selected",
    "saved_address",
    "employee_selected",
    "geocoded",
    "not_provided",
)


def _in_clause(column: str, values: tuple[str, ...]) -> str:
    quoted = ", ".join(f"'{value}'" for value in values)
    return f"{column} IN ({quoted})"


class Order(Base):
    """Pedido/venta de cualquier canal (§14.1)."""

    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint(_in_clause("source", ORDER_SOURCES), name="orders_source"),
        CheckConstraint(
            _in_clause("fulfillment_type", FULFILLMENT_TYPES), name="orders_fulfillment_type"
        ),
        CheckConstraint(_in_clause("status", ORDER_STATUSES), name="orders_status"),
        CheckConstraint(
            _in_clause("payment_status", PAYMENT_STATUSES), name="orders_payment_status"
        ),
        # Invariante §1.2/§14.1: no hay pedido sin usuario.
        CheckConstraint(
            "customer_user_id IS NOT NULL OR created_by IS NOT NULL",
            name="orders_requires_user",
        ),
        # Pedido web lo crea el propio cliente: online exige cliente.
        CheckConstraint(
            "source != 'online' OR customer_user_id IS NOT NULL",
            name="orders_online_requires_customer",
        ),
        # Todo pedido de canal interno registra al empleado capturista.
        CheckConstraint(
            "source = 'online' OR created_by IS NOT NULL",
            name="orders_staff_requires_employee",
        ),
        # Créditos SOLO con cliente (regla H1/H2): sin customer_user_id el pedido
        # no gana ni canjea créditos. La parte cross-tabla (que no existan
        # credit_redemptions) la protege el servicio dentro de la transacción.
        CheckConstraint(
            "customer_user_id IS NOT NULL "
            "OR (credits_earned_total_snapshot = 0 AND credits_redeemed_total = 0)",
            name="orders_credits_require_customer",
        ),
        # Pedido íntegro (§1.3 GOALS): un pedido es 100% dinero O 100% créditos.
        CheckConstraint(
            _in_clause("purchase_mode", ORDER_PURCHASE_MODES),
            name="orders_purchase_mode",
        ),
        # Un pedido de canje jamás mueve dinero: sin subtotal, sin envío, sin
        # total monetario y siempre con cliente. La homogeneidad de las líneas
        # (cross-tabla) la garantiza pricing_service en la misma transacción.
        CheckConstraint(
            "purchase_mode != 'credits' OR ("
            "items_subtotal_amount = 0 "
            "AND discount_total_amount = 0 "
            "AND (shipping_total_amount IS NULL OR shipping_total_amount = 0) "
            "AND (total_money_amount IS NULL OR total_money_amount = 0) "
            "AND customer_user_id IS NOT NULL"
            ")",
            name="orders_credits_mode_no_money",
        ),
        # H5 (§1.6): la resolución sólo toma valores conocidos y «retener»
        # exige motivo auditable. Que EXISTA resolución cuando hubo cobro lo
        # exige transition_order (cross-tabla con payments).
        CheckConstraint(
            "cancellation_money_resolution IS NULL OR "
            + _in_clause("cancellation_money_resolution", CANCELLATION_MONEY_RESOLUTIONS),
            name="orders_cancel_resolution",
        ),
        CheckConstraint(
            "cancellation_money_resolution != 'retain' "
            "OR cancellation_resolution_note IS NOT NULL",
            name="orders_retain_requires_note",
        ),
        Index("uq_orders_order_number", "order_number", unique=True),
        Index("uq_orders_public_code", "public_code", unique=True),
        Index("ix_orders_customer_created", "customer_user_id", "created_at"),
        Index("ix_orders_status_created", "status", "created_at"),
        Index("ix_orders_source_created", "source", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    order_number: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        comment="Folio consecutivo ÚNICO para todos los canales (secuencia PostgreSQL).",
    )
    public_code: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
        comment="Folio público: prefijo del negocio + número (ej. ORD-000245).",
    )
    customer_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Cliente (usuario). NULL sólo en pedidos capturados por personal (§1.2).",
    )
    source: Mapped[str] = mapped_column(String(30), nullable=False)
    fulfillment_type: Mapped[str] = mapped_column(String(30), nullable=False)
    purchase_mode: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="money",
        comment="Modo íntegro del pedido: money o credits — nunca híbrido (§1.3).",
    )
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="submitted")
    payment_status: Mapped[str] = mapped_column(String(40), nullable=False, default="unpaid")
    customer_name_snapshot: Mapped[Optional[str]] = mapped_column(
        String(180),
        nullable=True,
        comment="Obligatorio en delivery/pickup (regla de aplicación); mostrador puede omitirlo.",
    )
    customer_phone_snapshot: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    customer_email_snapshot: Mapped[Optional[str]] = mapped_column(String(180), nullable=True)
    business_snapshot: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSON,
        nullable=True,
        comment=(
            "Encabezado/pie del negocio al crear el pedido (trade_name, slogan, "
            "logo_file_id, footer_text): el ticket reimpreso muestra lo vendido, "
            "no el branding actual (§20). NULL en pedidos previos a este campo."
        ),
    )
    items_subtotal_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0")
    )
    discount_total_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0")
    )
    shipping_total_amount: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(12, 2),
        nullable=True,
        comment="Costo de envío FINAL congelado al aprobar; NULL mientras no esté definido.",
    )
    total_money_amount: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(12, 2),
        nullable=True,
        comment="Total monetario congelado al aprobar (§16).",
    )
    credits_earned_total_snapshot: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    credits_redeemed_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    customer_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    internal_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    approved_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("user.id", ondelete="RESTRICT"), nullable=True
    )
    approved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cancelled_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("user.id", ondelete="RESTRICT"), nullable=True
    )
    cancellation_money_resolution: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
        comment="H5: refund_now | refund_pending | retain; sólo al cancelar con cobro.",
    )
    cancellation_resolution_note: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True, comment="Motivo de la resolución (obligatorio al retener)."
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Empleado (usuario) que registró el pedido; NULL sólo en pedidos online.",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    lines: Mapped[list["OrderLine"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )
    adjustments: Mapped[list["OrderAdjustment"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )
    status_history: Mapped[list["OrderStatusHistory"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )
    delivery: Mapped[Optional["OrderDelivery"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", uselist=False
    )
    shipping: Mapped[Optional["OrderShipping"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", uselist=False
    )


class OrderLine(Base):
    """Línea vendida con snapshots congelados (§15.1)."""

    __tablename__ = "order_lines"
    __table_args__ = (
        CheckConstraint(_in_clause("purchase_mode", PURCHASE_MODES), name="order_lines_mode"),
        # H1: SOLO enteros positivos — no existen medias órdenes en restaurante.
        CheckConstraint("quantity >= 1", name="order_lines_quantity_positive"),
        Index("ix_order_lines_order", "order_id"),
        Index("ix_order_lines_product", "product_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    product_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Referencia viva al producto; el histórico real vive en los snapshots.",
    )
    product_name_snapshot: Mapped[str] = mapped_column(String(180), nullable=False)
    product_description_snapshot: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    quantity: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Unidades ENTERAS (H1): sin fracciones; los créditos multiplican exacto.",
    )
    purchase_mode: Mapped[str] = mapped_column(String(20), nullable=False)
    money_unit_price_snapshot: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0")
    )
    modifier_money_total_per_unit: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0")
    )
    money_line_total_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0")
    )
    credits_awarded_per_unit_snapshot: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    credits_earned_total_snapshot: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    credit_redemption_price_per_unit_snapshot: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True
    )
    credits_redeemed_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    customer_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    order: Mapped["Order"] = relationship(back_populates="lines")
    modifiers: Mapped[list["OrderLineModifier"]] = relationship(
        back_populates="line", cascade="all, delete-orphan"
    )


class OrderLineModifier(Base):
    """Salsa/extra elegido, congelado (§15.2)."""

    __tablename__ = "order_line_modifiers"
    __table_args__ = (
        CheckConstraint("quantity >= 1", name="order_line_modifiers_quantity_positive"),
        Index("ix_order_line_modifiers_line", "order_line_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    order_line_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("order_lines.id", ondelete="CASCADE"),
        nullable=False,
    )
    modifier_option_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("modifier_options.id", ondelete="RESTRICT"),
        nullable=True,
    )
    group_name_snapshot: Mapped[str] = mapped_column(String(120), nullable=False)
    option_name_snapshot: Mapped[str] = mapped_column(String(180), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    unit_price_adjustment: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0")
    )
    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    line: Mapped["OrderLine"] = relationship(back_populates="modifiers")


class OrderAdjustment(Base):
    """Descuento, promoción, cortesía o cargo manual AUTORIZADO (§15.3)."""

    __tablename__ = "order_adjustments"
    __table_args__ = (
        CheckConstraint(
            _in_clause("adjustment_type", ADJUSTMENT_TYPES), name="order_adjustments_type"
        ),
        CheckConstraint(
            _in_clause("direction", ADJUSTMENT_DIRECTIONS), name="order_adjustments_direction"
        ),
        CheckConstraint("amount >= 0", name="order_adjustments_amount_non_negative"),
        Index("ix_order_adjustments_order", "order_id"),
        # Una redención de código produce a lo más UN ajuste (índice único
        # parcial: la columna es NULL en los demás tipos de ajuste).
        Index(
            "uq_order_adjustments_discount_redemption",
            "discount_code_redemption_id",
            unique=True,
            postgresql_where=text("discount_code_redemption_id IS NOT NULL"),
            sqlite_where=text("discount_code_redemption_id IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    adjustment_type: Mapped[str] = mapped_column(String(40), nullable=False)
    direction: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        comment="charge suma al total; discount resta. El envío NO se maneja aquí (§15.3).",
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    authorized_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("user.id", ondelete="RESTRICT"), nullable=False
    )
    discount_code_redemption_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey(
            "discount_code_redemptions.id",
            ondelete="RESTRICT",
            name="fk_order_adjustments_discount_code_redemption",
        ),
        nullable=True,
        comment="Redención del código de descuento que originó este ajuste (Etapa 5 RC).",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    order: Mapped["Order"] = relationship(back_populates="adjustments")


class OrderStatusHistory(Base):
    """Bitácora append-only de estados y acciones (§15.4)."""

    __tablename__ = "order_status_history"
    __table_args__ = (Index("ix_order_status_history_order", "order_id", "changed_at"),)

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    previous_status: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    new_status: Mapped[str] = mapped_column(String(40), nullable=False)
    reason_code: Mapped[Optional[str]] = mapped_column(
        String(80),
        nullable=True,
        comment="Motivo estable (§15.4): customer_cancelled, outside_coverage, …",
    )
    internal_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    customer_visible_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    changed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("user.id", ondelete="RESTRICT"), nullable=True
    )
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    order: Mapped["Order"] = relationship(back_populates="status_history")


class OrderDelivery(Base):
    """Datos de entrega de un pedido delivery: SNAPSHOT de dirección (§17.1)."""

    __tablename__ = "order_deliveries"
    __table_args__ = (
        CheckConstraint(
            _in_clause("location_source", LOCATION_SOURCES),
            name="order_deliveries_location_source",
        ),
        Index("uq_order_deliveries_order", "order_id", unique=True),
        # GIST de location en la migración (ix_order_deliveries_location).
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    user_address_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user_addresses.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Referencia a la dirección guardada usada; el snapshot es la verdad.",
    )
    recipient_name: Mapped[str] = mapped_column(String(180), nullable=False)
    recipient_phone: Mapped[str] = mapped_column(String(30), nullable=False)
    street: Mapped[str] = mapped_column(String(180), nullable=False)
    external_number: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    internal_number: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    neighborhood: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    postal_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    references: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    location: Mapped[Optional[Any]] = mapped_column(PointGeometry(), nullable=True)
    location_source: Mapped[str] = mapped_column(
        String(40), nullable=False, default="not_provided"
    )
    delivery_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    delivered_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    delivered_to_name: Mapped[Optional[str]] = mapped_column(String(180), nullable=True)
    delivery_proof_file_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("stored_files.id", ondelete="RESTRICT"), nullable=True
    )
    delivery_completion_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    order: Mapped["Order"] = relationship(back_populates="delivery")


class OrderShipping(Base):
    """Decisión de envío del pedido con auditoría de cómo se calculó (§17.2)."""

    __tablename__ = "order_shipping"
    __table_args__ = (
        CheckConstraint(
            _in_clause("calculation_status", SHIPPING_CALCULATION_STATUSES),
            name="order_shipping_status",
        ),
        CheckConstraint(
            _in_clause("calculation_source", SHIPPING_CALCULATION_SOURCES),
            name="order_shipping_source",
        ),
        Index("uq_order_shipping_order", "order_id", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    # El HISTORIAL del pedido vive en los snapshots (nombre de zona/tarifa) y en
    # los montos congelados; estas FKs son solo el enlace vivo y NO deben impedir
    # borrar una zona o tarifa: al eliminarlas, la referencia cae a NULL.
    delivery_zone_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("delivery_zones.id", ondelete="SET NULL"), nullable=True
    )
    delivery_zone_name_snapshot: Mapped[Optional[str]] = mapped_column(
        String(120), nullable=True
    )
    shipping_rate_rule_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("shipping_rate_rules.id", ondelete="SET NULL"),
        nullable=True,
    )
    shipping_rate_name_snapshot: Mapped[Optional[str]] = mapped_column(
        String(120), nullable=True
    )
    calculation_status: Mapped[str] = mapped_column(String(40), nullable=False)
    calculation_source: Mapped[str] = mapped_column(String(40), nullable=False)
    estimated_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    final_amount: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(12, 2),
        nullable=True,
        comment="Un delivery NO puede aprobarse mientras sea NULL (§17.2).",
    )
    is_free_shipping: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    manual_override_reason: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Obligatorio (regla de aplicación) cuando el monto es manual.",
    )
    finalized_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("user.id", ondelete="RESTRICT"), nullable=True
    )
    finalized_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    order: Mapped["Order"] = relationship(back_populates="shipping")
    history: Mapped[list["OrderShippingHistory"]] = relationship(
        back_populates="shipping", cascade="all, delete-orphan"
    )


class OrderShippingHistory(Base):
    """Bitácora de cambios de costo/tarifa de envío (§17.3)."""

    __tablename__ = "order_shipping_history"
    __table_args__ = (Index("ix_order_shipping_history_shipping", "order_shipping_id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    order_shipping_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("order_shipping.id", ondelete="CASCADE"),
        nullable=False,
    )
    previous_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    new_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    previous_zone_name_snapshot: Mapped[Optional[str]] = mapped_column(
        String(120), nullable=True
    )
    new_zone_name_snapshot: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    previous_rate_name_snapshot: Mapped[Optional[str]] = mapped_column(
        String(120), nullable=True
    )
    new_rate_name_snapshot: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    changed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("user.id", ondelete="RESTRICT"), nullable=True
    )
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    shipping: Mapped["OrderShipping"] = relationship(back_populates="history")
