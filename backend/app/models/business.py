"""Configuración del NEGOCIO único (§5 y §6 del reporte integral).

Un solo negocio, sin multiempresa: ``business_profile`` y ``business_settings``
son singletons garantizados por ``CHECK (id = 1)`` (la migración siembra la
fila; el servicio hace get-or-create defensivo). Los teléfonos, horarios
semanales y fechas especiales son catálogos administrables.

La identidad visual (tema, metadatos del sitio) NO vive aquí: pertenece al
módulo storefront. Aquí sólo hay operación: nombre, teléfonos, horarios y
políticas de venta.
"""

import uuid
from datetime import date, datetime, time
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    Boolean,
    CHAR,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    Time,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base

SINGLETON_ID = 1


class BusinessProfile(Base):
    """Fila ÚNICA con la identidad operativa del negocio (§5.1)."""

    __tablename__ = "business_profile"
    __table_args__ = (
        CheckConstraint("id = 1", name="business_profile_singleton"),
    )

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, default=SINGLETON_ID)
    trade_name: Mapped[str] = mapped_column(
        String(120),
        nullable=False,
        comment="Nombre comercial del negocio (se muestra en sitio, tickets y correos).",
    )
    legal_name: Mapped[Optional[str]] = mapped_column(String(180), nullable=True)
    slogan: Mapped[Optional[str]] = mapped_column(String(180), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(180), nullable=True)
    main_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    terms_extra: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment=(
            "Cláusulas adicionales de los Términos y Condiciones, editables por el "
            "administrador; se anexan al documento autogenerado de /terminos."
        ),
    )
    privacy_extra: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment=(
            "Texto adicional del Aviso de Privacidad, editable por el administrador; "
            "se anexa a la sección de privacidad autogenerada de /terminos."
        ),
    )
    currency_code: Mapped[str] = mapped_column(
        CHAR(3),
        nullable=False,
        default="MXN",
        comment="Código de moneda ISO 4217.",
    )
    timezone: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default="America/Mexico_City",
        comment="Zona horaria IANA del negocio: gobierna horarios y cortes del día.",
    )
    order_prefix: Mapped[str] = mapped_column(
        String(12),
        nullable=False,
        default="ORD",
        comment="Prefijo del folio público de pedidos (ej. ORD-000245).",
    )
    logo_file_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("stored_files.id", ondelete="RESTRICT"),
        nullable=True,
        comment="Logo del negocio en stored_files.",
    )
    is_accepting_orders: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        comment="Interruptor operativo: en false el sitio no acepta pedidos nuevos.",
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class BusinessSettings(Base):
    """Fila ÚNICA de política operativa de venta (§5.3)."""

    __tablename__ = "business_settings"
    __table_args__ = (
        CheckConstraint("id = 1", name="business_settings_singleton"),
    )

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, default=SINGLETON_ID)
    allow_online_orders: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    allow_delivery: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    allow_pickup: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    allow_counter_sales: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    credits_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        comment=(
            "Programa de créditos/puntos. Al apagarlo NO se emiten créditos nuevos "
            "(no hay asiento «earn» al completar), no se muestran en el sitio "
            "(/cuenta, /creditos, toggle del carrito) y NO se permite pagar con "
            "créditos. Los saldos existentes se conservan (ledger inmutable) y "
            "vuelven a estar disponibles si se reactiva."
        ),
    )
    allow_customer_registration: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        comment=(
            "Registro de clientes desde el sitio público. Convive con la política "
            "de plataforma (system_settings) y el gate de despliegue: todos deben permitir."
        ),
    )
    require_registered_user_for_checkout: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        comment="Pedido web SIEMPRE con usuario registrado (§1.2): no hay checkout invitado.",
    )
    order_approval_required: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        comment="Todos los pedidos pasan por aprobación antes de preparación (§16).",
    )
    online_orders_require_open_hours: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment=(
            "Los pedidos WEB sólo se aceptan dentro del horario de atención "
            "(semanal + fechas especiales). Sin horarios configurados el negocio "
            "cuenta como cerrado, por eso es opt-in. La captura de staff y el POS "
            "quedan exentos; el switch «Aceptando pedidos» manda por encima."
        ),
    )
    minimum_delivery_order_amount: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(12, 2), nullable=True
    )
    free_shipping_global_from_amount: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(12, 2),
        nullable=True,
        comment=(
            "Umbral global de envío gratis. Lo consumen el cálculo de envío, la barra "
            "superior del sitio (§35.4) y el progreso del carrito."
        ),
    )
    ticket_footer_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class BusinessPhone(Base):
    """Teléfonos del negocio (§5.2): varios, con a lo sumo un principal activo."""

    __tablename__ = "business_phones"
    __table_args__ = (
        # Máximo un teléfono principal ACTIVO: índice único parcial. Un principal
        # desactivado no bloquea designar otro.
        Index(
            "uq_business_phones_primary_active",
            "is_primary",
            unique=True,
            postgresql_where=text("is_primary AND is_active"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    label: Mapped[Optional[str]] = mapped_column(
        String(80),
        nullable=True,
        comment="Etiqueta visible: «Pedidos por WhatsApp», «Atención a clientes», …",
    )
    phone: Mapped[str] = mapped_column(String(30), nullable=False)
    phone_normalized: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        comment="Sólo dígitos (con lada), para búsqueda y enlaces tel:/wa.me.",
    )
    is_whatsapp: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_public: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        comment="Visible en el sitio público; en false es sólo interno.",
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class BusinessWeeklyHours(Base):
    """Horario semanal (§6.1): varios rangos por día (slots)."""

    __tablename__ = "business_weekly_hours"
    __table_args__ = (
        CheckConstraint(
            "day_of_week >= 0 AND day_of_week <= 6",
            name="business_weekly_hours_day_range",
        ),
        CheckConstraint("slot_number >= 1", name="business_weekly_hours_slot_min"),
        Index(
            "uq_business_weekly_hours_day_slot",
            "day_of_week",
            "slot_number",
            unique=True,
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    day_of_week: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        comment="0=lunes … 6=domingo (convención ISO, igual que date.weekday()).",
    )
    slot_number: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1)
    opens_at: Mapped[time] = mapped_column(Time, nullable=False)
    closes_at: Mapped[time] = mapped_column(
        Time,
        nullable=False,
        comment="Si closes_at <= opens_at el rango cruza medianoche (ej. 17:00–01:00).",
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class BusinessSpecialDate(Base):
    """Fecha especial (§6.2): festivo, cierre, mantenimiento o evento."""

    __tablename__ = "business_special_dates"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    calendar_date: Mapped[date] = mapped_column(Date, nullable=False, unique=True)
    is_closed: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment="true = cerrado todo el día; false = abre según sus slots propios.",
    )
    reason: Mapped[Optional[str]] = mapped_column(String(250), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    slots: Mapped[list["BusinessSpecialDateSlot"]] = relationship(
        back_populates="special_date", cascade="all, delete-orphan"
    )


class BusinessSpecialDateSlot(Base):
    """Horario específico de una fecha especial (§6.3)."""

    __tablename__ = "business_special_date_slots"
    __table_args__ = (
        CheckConstraint("slot_number >= 1", name="business_special_date_slots_slot_min"),
        Index(
            "uq_business_special_date_slots_date_slot",
            "special_date_id",
            "slot_number",
            unique=True,
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    special_date_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("business_special_dates.id", ondelete="CASCADE"),
        nullable=False,
    )
    slot_number: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1)
    opens_at: Mapped[time] = mapped_column(Time, nullable=False)
    closes_at: Mapped[time] = mapped_column(
        Time,
        nullable=False,
        comment="Si closes_at <= opens_at el rango cruza medianoche (ej. 17:00–01:00).",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    special_date: Mapped["BusinessSpecialDate"] = relationship(back_populates="slots")
