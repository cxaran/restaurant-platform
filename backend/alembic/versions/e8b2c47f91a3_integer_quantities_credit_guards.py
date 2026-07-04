"""Correcciones H1/H2/H3 de la auditoría: cantidades enteras y guardas de créditos.

H1 — Todas las cantidades de producto son ENTEROS positivos: ``order_lines.quantity``,
``order_line_modifiers.quantity`` y ``order_line_refund_allocations.refunded_quantity``
pasan de NUMERIC a INTEGER con CHECK >= 1. PRECONDICIÓN: no deben existir valores
fraccionarios — la migración lo verifica y FALLA con mensaje claro antes de convertir
(jamás trunca en silencio).

H2 — Idempotencia del ledger de créditos a nivel base: ``refund_allocation_id`` liga
cada movimiento de reembolso a su causa exacta, e índices únicos parciales impiden
duplicar reserva/liberación por canje y devolución/reverso por asignación.
PRECONDICIÓN: no deben existir duplicados previos (se verifica y falla explícito).

Regla de clientes: créditos SOLO con ``customer_user_id`` — CHECK en ``orders``.

NO EJECUTADA aún: pendiente de aplicar contra PostgreSQL.

Revision ID: e8b2c47f91a3
Revises: d5a8f36c92e7
Create Date: 2026-07-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

# revision identifiers, used by Alembic.
revision: str = "e8b2c47f91a3"
down_revision: Union[str, Sequence[str], None] = "d5a8f36c92e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_QUANTITY_COLUMNS = (
    ("order_lines", "quantity"),
    ("order_line_modifiers", "quantity"),
    ("order_line_refund_allocations", "refunded_quantity"),
)


def _fail_if_fractional(table: str, column: str) -> None:
    op.execute(
        f"""
        DO $$
        DECLARE bad_count integer;
        BEGIN
            SELECT count(*) INTO bad_count FROM {table}
            WHERE {column} <> floor({column}) OR {column} < 1;
            IF bad_count > 0 THEN
                RAISE EXCEPTION
                    'Migración H1 abortada: % fila(s) de {table}.{column} con valores '
                    'fraccionarios, cero o negativos. Corrige los datos manualmente '
                    'antes de migrar; esta migración NO trunca valores.', bad_count;
            END IF;
        END $$;
        """
    )


def upgrade() -> None:
    """Upgrade schema."""
    # ------------------------------------------------------------------
    # H1: cantidades enteras (verificar → convertir → CHECK >= 1)
    # ------------------------------------------------------------------
    for table, column in _QUANTITY_COLUMNS:
        _fail_if_fractional(table, column)

    op.drop_constraint("order_lines_quantity_positive", "order_lines", type_="check")
    op.alter_column(
        "order_lines", "quantity",
        type_=sa.Integer(), postgresql_using="quantity::integer",
        existing_nullable=False,
        comment="Unidades ENTERAS (H1): sin fracciones; los créditos multiplican exacto.",
    )
    op.create_check_constraint("order_lines_quantity_positive", "order_lines", "quantity >= 1")

    op.alter_column(
        "order_line_modifiers", "quantity",
        type_=sa.Integer(), postgresql_using="quantity::integer",
        existing_nullable=False,
    )
    op.create_check_constraint(
        "order_line_modifiers_quantity_positive", "order_line_modifiers", "quantity >= 1"
    )

    op.drop_constraint(
        "order_line_refund_allocations_qty_positive",
        "order_line_refund_allocations",
        type_="check",
    )
    op.alter_column(
        "order_line_refund_allocations", "refunded_quantity",
        type_=sa.Integer(), postgresql_using="refunded_quantity::integer",
        existing_nullable=False,
        comment="Unidades ENTERAS (H1); el tope ACUMULA reembolsos previos de la línea (H3).",
    )
    op.create_check_constraint(
        "order_line_refund_allocations_qty_positive",
        "order_line_refund_allocations",
        "refunded_quantity >= 1",
    )

    # ------------------------------------------------------------------
    # Regla de clientes: créditos SOLO con customer_user_id
    # ------------------------------------------------------------------
    op.execute(
        """
        DO $$
        DECLARE bad_count integer;
        BEGIN
            SELECT count(*) INTO bad_count FROM orders
            WHERE customer_user_id IS NULL
              AND (credits_earned_total_snapshot <> 0 OR credits_redeemed_total <> 0);
            IF bad_count > 0 THEN
                RAISE EXCEPTION
                    'Migración abortada: % pedido(s) sin cliente con créditos distintos '
                    'de cero. Corrige los datos antes de aplicar el CHECK.', bad_count;
            END IF;
        END $$;
        """
    )
    op.create_check_constraint(
        "orders_credits_require_customer",
        "orders",
        "customer_user_id IS NOT NULL "
        "OR (credits_earned_total_snapshot = 0 AND credits_redeemed_total = 0)",
    )

    # Canales internos SIEMPRE registran al empleado capturista (regla §14.1,
    # ahora también en base; online ya exige cliente vía CHECK previo).
    op.execute(
        """
        DO $$
        DECLARE bad_count integer;
        BEGIN
            SELECT count(*) INTO bad_count FROM orders
            WHERE source <> 'online' AND created_by IS NULL;
            IF bad_count > 0 THEN
                RAISE EXCEPTION
                    'Migración abortada: % pedido(s) de canal interno sin created_by. '
                    'Corrige los datos antes de aplicar el CHECK.', bad_count;
            END IF;
        END $$;
        """
    )
    op.create_check_constraint(
        "orders_staff_requires_employee",
        "orders",
        "source = 'online' OR created_by IS NOT NULL",
    )

    # Devoluciones SOLO-CRÉDITOS (pedidos sin pago monetario): la asignación
    # puede existir sin payment_refund, con dinero en 0 y actor obligatorio.
    op.alter_column(
        "order_line_refund_allocations", "payment_refund_id",
        existing_type=PG_UUID(as_uuid=True), nullable=True,
    )
    op.add_column(
        "order_line_refund_allocations",
        sa.Column(
            "processed_by", PG_UUID(as_uuid=True), nullable=True,
            comment="Actor de la devolución (siempre registrado; obligatorio sin pago).",
        ),
    )
    op.create_foreign_key(
        op.f("fk_order_line_refund_allocations_processed_by_user"),
        "order_line_refund_allocations", "user", ["processed_by"], ["id"],
        ondelete="RESTRICT",
    )
    op.create_check_constraint(
        "order_line_refund_allocations_credit_only_no_money",
        "order_line_refund_allocations",
        "payment_refund_id IS NOT NULL OR money_refunded_amount = 0",
    )
    op.create_check_constraint(
        "order_line_refund_allocations_actor_required",
        "order_line_refund_allocations",
        "payment_refund_id IS NOT NULL OR processed_by IS NOT NULL",
    )

    # ------------------------------------------------------------------
    # H2: causa exacta + idempotencia del ledger
    # ------------------------------------------------------------------
    op.add_column(
        "credit_ledger_entries",
        sa.Column(
            "refund_allocation_id",
            PG_UUID(as_uuid=True),
            nullable=True,
            comment="Causa exacta del movimiento cuando proviene de un reembolso (H2).",
        ),
    )
    op.create_foreign_key(
        op.f("fk_credit_ledger_entries_refund_allocation_id_order_line_refund_allocations"),
        "credit_ledger_entries",
        "order_line_refund_allocations",
        ["refund_allocation_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    # Precondición: sin duplicados históricos que violen los únicos parciales.
    op.execute(
        """
        DO $$
        DECLARE bad_count integer;
        BEGIN
            SELECT count(*) INTO bad_count FROM (
                SELECT credit_redemption_id FROM credit_ledger_entries
                WHERE entry_type IN ('redeem_reservation', 'redemption_release')
                  AND credit_redemption_id IS NOT NULL
                GROUP BY credit_redemption_id, entry_type HAVING count(*) > 1
            ) dupes;
            IF bad_count > 0 THEN
                RAISE EXCEPTION
                    'Migración H2 abortada: % canje(s) con movimientos duplicados en el '
                    'ledger. Revisa y corrige manualmente antes de migrar.', bad_count;
            END IF;
        END $$;
        """
    )
    op.create_index(
        "uq_credit_ledger_reservation_per_redemption", "credit_ledger_entries",
        ["credit_redemption_id"], unique=True,
        postgresql_where=sa.text("entry_type = 'redeem_reservation'"),
    )
    op.create_index(
        "uq_credit_ledger_release_per_redemption", "credit_ledger_entries",
        ["credit_redemption_id"], unique=True,
        postgresql_where=sa.text("entry_type = 'redemption_release'"),
    )
    op.create_index(
        "uq_credit_ledger_refund_per_allocation", "credit_ledger_entries",
        ["refund_allocation_id"], unique=True,
        postgresql_where=sa.text("entry_type = 'redemption_refund'"),
    )
    op.create_index(
        "uq_credit_ledger_reversal_per_allocation", "credit_ledger_entries",
        ["refund_allocation_id"], unique=True,
        postgresql_where=sa.text("entry_type = 'earn_reversal'"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("uq_credit_ledger_reversal_per_allocation", table_name="credit_ledger_entries")
    op.drop_index("uq_credit_ledger_refund_per_allocation", table_name="credit_ledger_entries")
    op.drop_index("uq_credit_ledger_release_per_redemption", table_name="credit_ledger_entries")
    op.drop_index(
        "uq_credit_ledger_reservation_per_redemption", table_name="credit_ledger_entries"
    )
    op.drop_constraint(
        op.f("fk_credit_ledger_entries_refund_allocation_id_order_line_refund_allocations"),
        "credit_ledger_entries",
        type_="foreignkey",
    )
    op.drop_column("credit_ledger_entries", "refund_allocation_id")

    op.drop_constraint(
        "order_line_refund_allocations_actor_required",
        "order_line_refund_allocations", type_="check",
    )
    op.drop_constraint(
        "order_line_refund_allocations_credit_only_no_money",
        "order_line_refund_allocations", type_="check",
    )
    op.drop_constraint(
        op.f("fk_order_line_refund_allocations_processed_by_user"),
        "order_line_refund_allocations", type_="foreignkey",
    )
    op.drop_column("order_line_refund_allocations", "processed_by")
    op.alter_column(
        "order_line_refund_allocations", "payment_refund_id",
        existing_type=PG_UUID(as_uuid=True), nullable=False,
    )

    op.drop_constraint("orders_staff_requires_employee", "orders", type_="check")
    op.drop_constraint("orders_credits_require_customer", "orders", type_="check")

    op.drop_constraint(
        "order_line_refund_allocations_qty_positive",
        "order_line_refund_allocations",
        type_="check",
    )
    op.alter_column(
        "order_line_refund_allocations", "refunded_quantity",
        type_=sa.Numeric(10, 2), existing_nullable=False, comment=None,
    )
    op.create_check_constraint(
        "order_line_refund_allocations_qty_positive",
        "order_line_refund_allocations",
        "refunded_quantity > 0",
    )

    op.drop_constraint(
        "order_line_modifiers_quantity_positive", "order_line_modifiers", type_="check"
    )
    op.alter_column(
        "order_line_modifiers", "quantity", type_=sa.Numeric(10, 2), existing_nullable=False
    )

    op.drop_constraint("order_lines_quantity_positive", "order_lines", type_="check")
    op.alter_column(
        "order_lines", "quantity", type_=sa.Numeric(10, 2), existing_nullable=False,
        comment=None,
    )
    op.create_check_constraint("order_lines_quantity_positive", "order_lines", "quantity > 0")
