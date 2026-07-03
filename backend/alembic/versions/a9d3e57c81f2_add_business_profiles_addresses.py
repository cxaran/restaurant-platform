"""Etapa 1 del dominio restaurante: negocio, perfiles y direcciones.

Crea la configuración del negocio único (§5: business_profile y
business_settings como singletons CHECK id=1, teléfonos con un principal
activo), los horarios (§6: semanal + fechas especiales con slots), los perfiles
1:1 del usuario (§8: customer_profiles y staff_profiles — cliente = usuario,
sin tabla de clientes) y las direcciones con punto PostGIS opcional (§9).

Siembra las filas singleton: business_profile toma trade_name del
institution_name capturado por el wizard cuando existe (§2.4 del plan).

Revision ID: a9d3e57c81f2
Revises: f4c9d81b2a37
Create Date: 2026-07-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

# revision identifiers, used by Alembic.
revision: str = "a9d3e57c81f2"
down_revision: Union[str, Sequence[str], None] = "f4c9d81b2a37"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "business_profile",
        sa.Column("id", sa.SmallInteger(), nullable=False),
        sa.Column(
            "trade_name",
            sa.String(length=120),
            nullable=False,
            comment="Nombre comercial del negocio (se muestra en sitio, tickets y correos).",
        ),
        sa.Column("legal_name", sa.String(length=180), nullable=True),
        sa.Column("slogan", sa.String(length=180), nullable=True),
        sa.Column("email", sa.String(length=180), nullable=True),
        sa.Column("main_address", sa.Text(), nullable=True),
        sa.Column(
            "currency_code",
            sa.CHAR(length=3),
            nullable=False,
            server_default="MXN",
            comment="Código de moneda ISO 4217.",
        ),
        sa.Column(
            "timezone",
            sa.String(length=64),
            nullable=False,
            server_default="America/Mexico_City",
            comment="Zona horaria IANA del negocio: gobierna horarios y cortes del día.",
        ),
        sa.Column(
            "order_prefix",
            sa.String(length=12),
            nullable=False,
            server_default="ORD",
            comment="Prefijo del folio público de pedidos (ej. ORD-000245).",
        ),
        sa.Column(
            "logo_file_id",
            PG_UUID(as_uuid=True),
            nullable=True,
            comment="Logo del negocio en stored_files.",
        ),
        sa.Column(
            "is_accepting_orders",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
            comment="Interruptor operativo: en false el sitio no acepta pedidos nuevos.",
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("id = 1", name="business_profile_singleton"),
        sa.ForeignKeyConstraint(
            ["logo_file_id"],
            ["stored_files.id"],
            name=op.f("fk_business_profile_logo_file_id_stored_files"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_business_profile")),
    )

    op.create_table(
        "business_settings",
        sa.Column("id", sa.SmallInteger(), nullable=False),
        sa.Column(
            "allow_online_orders", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column(
            "allow_delivery", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column(
            "allow_pickup", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column(
            "allow_counter_sales", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
        sa.Column(
            "allow_customer_registration",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
            comment=(
                "Registro de clientes desde el sitio público. Convive con la política "
                "de plataforma (system_settings) y el gate de despliegue: todos deben permitir."
            ),
        ),
        sa.Column(
            "require_registered_user_for_checkout",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
            comment="Pedido web SIEMPRE con usuario registrado (§1.2): no hay checkout invitado.",
        ),
        sa.Column(
            "order_approval_required",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
            comment="Todos los pedidos pasan por aprobación antes de preparación (§16).",
        ),
        sa.Column("minimum_delivery_order_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column(
            "free_shipping_global_from_amount",
            sa.Numeric(12, 2),
            nullable=True,
            comment=(
                "Umbral global de envío gratis. Lo consumen el cálculo de envío, la barra "
                "superior del sitio (§35.4) y el progreso del carrito."
            ),
        ),
        sa.Column("ticket_footer_text", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("id = 1", name="business_settings_singleton"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_business_settings")),
    )

    op.create_table(
        "business_phones",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column(
            "label",
            sa.String(length=80),
            nullable=True,
            comment="Etiqueta visible: «Pedidos por WhatsApp», «Atención a clientes», …",
        ),
        sa.Column("phone", sa.String(length=30), nullable=False),
        sa.Column(
            "phone_normalized",
            sa.String(length=30),
            nullable=False,
            comment="Sólo dígitos (con lada), para búsqueda y enlaces tel:/wa.me.",
        ),
        sa.Column("is_whatsapp", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "is_public",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
            comment="Visible en el sitio público; en false es sólo interno.",
        ),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_business_phones")),
    )
    op.create_index(
        "uq_business_phones_primary_active",
        "business_phones",
        ["is_primary"],
        unique=True,
        postgresql_where=sa.text("is_primary AND is_active"),
    )

    op.create_table(
        "business_weekly_hours",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column(
            "day_of_week",
            sa.SmallInteger(),
            nullable=False,
            comment="0=lunes … 6=domingo (convención ISO, igual que date.weekday()).",
        ),
        sa.Column("slot_number", sa.SmallInteger(), nullable=False, server_default="1"),
        sa.Column("opens_at", sa.Time(), nullable=False),
        sa.Column(
            "closes_at",
            sa.Time(),
            nullable=False,
            comment="Si closes_at <= opens_at el rango cruza medianoche (ej. 17:00–01:00).",
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "day_of_week >= 0 AND day_of_week <= 6", name="business_weekly_hours_day_range"
        ),
        sa.CheckConstraint("slot_number >= 1", name="business_weekly_hours_slot_min"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_business_weekly_hours")),
    )
    op.create_index(
        "uq_business_weekly_hours_day_slot",
        "business_weekly_hours",
        ["day_of_week", "slot_number"],
        unique=True,
    )

    op.create_table(
        "business_special_dates",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("calendar_date", sa.Date(), nullable=False),
        sa.Column(
            "is_closed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
            comment="true = cerrado todo el día; false = abre según sus slots propios.",
        ),
        sa.Column("reason", sa.String(length=250), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_business_special_dates")),
        sa.UniqueConstraint("calendar_date", name=op.f("uq_business_special_dates_calendar_date")),
    )

    op.create_table(
        "business_special_date_slots",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("special_date_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("slot_number", sa.SmallInteger(), nullable=False, server_default="1"),
        sa.Column("opens_at", sa.Time(), nullable=False),
        sa.Column(
            "closes_at",
            sa.Time(),
            nullable=False,
            comment="Si closes_at <= opens_at el rango cruza medianoche (ej. 17:00–01:00).",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("slot_number >= 1", name="business_special_date_slots_slot_min"),
        sa.ForeignKeyConstraint(
            ["special_date_id"],
            ["business_special_dates.id"],
            name=op.f("fk_business_special_date_slots_special_date_id_business_special_dates"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_business_special_date_slots")),
    )
    op.create_index(
        "uq_business_special_date_slots_date_slot",
        "business_special_date_slots",
        ["special_date_id", "slot_number"],
        unique=True,
    )

    op.create_table(
        "customer_profiles",
        sa.Column("user_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("full_name", sa.String(length=180), nullable=False),
        sa.Column("phone", sa.String(length=30), nullable=False),
        sa.Column(
            "phone_normalized",
            sa.String(length=30),
            nullable=False,
            comment="Sólo dígitos: búsqueda del cliente al capturar pedidos por teléfono/WhatsApp.",
        ),
        sa.Column(
            "email",
            sa.String(length=180),
            nullable=True,
            comment="Copia comercial de contacto; la identidad de acceso es user.email.",
        ),
        sa.Column(
            "internal_notes",
            sa.Text(),
            nullable=True,
            comment="Notas internas de operación (§8.2): NUNCA se muestran al cliente.",
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["user.id"],
            name=op.f("fk_customer_profiles_user_id_user"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_customer_profiles")),
    )
    op.create_index(
        "ix_customer_profiles_phone_normalized",
        "customer_profiles",
        ["phone_normalized"],
        unique=False,
    )

    op.create_table(
        "staff_profiles",
        sa.Column("user_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("display_name", sa.String(length=180), nullable=False),
        sa.Column(
            "contact_phone",
            sa.String(length=30),
            nullable=True,
            comment="Número interno del empleado: nunca se expone al cliente.",
        ),
        sa.Column("contact_phone_normalized", sa.String(length=30), nullable=True),
        sa.Column(
            "public_contact_phone",
            sa.String(length=30),
            nullable=True,
            comment="Único número autorizado para mostrarse al cliente durante la entrega.",
        ),
        sa.Column("photo_file_id", PG_UUID(as_uuid=True), nullable=True),
        sa.Column(
            "can_deliver",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
            comment="Capacidad de reparto: habilita ver la cola de envíos y tomar pedidos.",
        ),
        sa.Column(
            "is_delivery_available",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
            comment="El repartidor marca si está disponible para tomar envíos AHORA (§19.5).",
        ),
        sa.Column(
            "courier_public_note",
            sa.String(length=120),
            nullable=True,
            comment=(
                "Descripción breve visible al cliente SÓLO con el pedido en camino "
                "(§19.2): «Moto roja», etc."
            ),
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["photo_file_id"],
            ["stored_files.id"],
            name=op.f("fk_staff_profiles_photo_file_id_stored_files"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["user.id"],
            name=op.f("fk_staff_profiles_user_id_user"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_staff_profiles")),
    )

    op.create_table(
        "user_addresses",
        sa.Column("id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", PG_UUID(as_uuid=True), nullable=False),
        sa.Column(
            "label",
            sa.String(length=80),
            nullable=True,
            comment="Etiqueta del usuario: «Casa», «Oficina», …",
        ),
        sa.Column("street", sa.String(length=180), nullable=False),
        sa.Column("external_number", sa.String(length=30), nullable=True),
        sa.Column("internal_number", sa.String(length=30), nullable=True),
        sa.Column("neighborhood", sa.String(length=120), nullable=True),
        sa.Column("city", sa.String(length=120), nullable=True),
        sa.Column("postal_code", sa.String(length=20), nullable=True),
        sa.Column(
            "references",
            sa.Text(),
            nullable=True,
            comment="Referencias de entrega: «casa azul frente a la tienda».",
        ),
        sa.Column(
            "location",
            Geometry(geometry_type="POINT", srid=4326, spatial_index=False),
            nullable=True,
            comment="Punto exacto OPCIONAL (SRID 4326). Sin punto: envío a revisión manual.",
        ),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["user.id"],
            name=op.f("fk_user_addresses_user_id_user"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_user_addresses")),
    )
    op.create_index(
        "ix_user_addresses_user_active", "user_addresses", ["user_id", "is_active"], unique=False
    )
    op.create_index(
        "uq_user_addresses_default_per_user",
        "user_addresses",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("is_default AND is_active"),
    )
    op.create_index(
        "ix_user_addresses_location",
        "user_addresses",
        ["location"],
        unique=False,
        postgresql_using="gist",
    )

    # ------------------------------------------------------------------
    # Seed de singletons (idempotente): el wizard pudo capturar el nombre
    # institucional; se usa como nombre comercial inicial (§2.4 del plan).
    # ------------------------------------------------------------------
    op.execute(
        """
        INSERT INTO business_profile (id, trade_name)
        SELECT 1, COALESCE(
            NULLIF(TRIM((SELECT institution_name FROM system_settings LIMIT 1)), ''),
            'Mi Restaurante'
        )
        ON CONFLICT (id) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO business_settings (id)
        VALUES (1)
        ON CONFLICT (id) DO NOTHING
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_user_addresses_location", table_name="user_addresses")
    op.drop_index("uq_user_addresses_default_per_user", table_name="user_addresses")
    op.drop_index("ix_user_addresses_user_active", table_name="user_addresses")
    op.drop_table("user_addresses")
    op.drop_table("staff_profiles")
    op.drop_index("ix_customer_profiles_phone_normalized", table_name="customer_profiles")
    op.drop_table("customer_profiles")
    op.drop_index(
        "uq_business_special_date_slots_date_slot", table_name="business_special_date_slots"
    )
    op.drop_table("business_special_date_slots")
    op.drop_table("business_special_dates")
    op.drop_index("uq_business_weekly_hours_day_slot", table_name="business_weekly_hours")
    op.drop_table("business_weekly_hours")
    op.drop_index("uq_business_phones_primary_active", table_name="business_phones")
    op.drop_table("business_phones")
    op.drop_table("business_settings")
    op.drop_table("business_profile")
