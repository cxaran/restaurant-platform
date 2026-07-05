"""Configuración de Google Analytics 4 en system_settings.

Cuatro columnas de analítica del sitio público: interruptor, ID de medición
GA4 (público por diseño de Google; no es un secreto), exigencia de
consentimiento de cookies y modo de depuración (DebugView). Se siembran con
la analítica APAGADA para no cambiar el comportamiento vigente.

Revision ID: b7d4e29c63f1
Revises: a2c9f47b81e3
Create Date: 2026-07-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b7d4e29c63f1"
down_revision: Union[str, Sequence[str], None] = "a2c9f47b81e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "system_settings",
        sa.Column(
            "analytics_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
            comment=(
                "Google Analytics 4 en el sitio público. Apagado no se carga ningún "
                "script ni se envía evento alguno."
            ),
        ),
    )
    op.add_column(
        "system_settings",
        sa.Column(
            "analytics_ga4_measurement_id",
            sa.String(length=30),
            nullable=True,
            comment="ID de medición de GA4 (G-XXXXXXXXXX); identificador público.",
        ),
    )
    op.add_column(
        "system_settings",
        sa.Column(
            "analytics_require_consent",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
            comment=(
                "Exigir consentimiento de cookies analíticas antes de cargar o "
                "enviar cualquier evento."
            ),
        ),
    )
    op.add_column(
        "system_settings",
        sa.Column(
            "analytics_debug_mode",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
            comment="Enviar eventos con debug_mode para GA4 DebugView (solo pruebas).",
        ),
    )
    # Los defaults a nivel app gobiernan las filas nuevas; el server_default solo
    # sirvió para sembrar la fila singleton existente.
    op.alter_column("system_settings", "analytics_enabled", server_default=None)
    op.alter_column("system_settings", "analytics_require_consent", server_default=None)
    op.alter_column("system_settings", "analytics_debug_mode", server_default=None)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("system_settings", "analytics_debug_mode")
    op.drop_column("system_settings", "analytics_require_consent")
    op.drop_column("system_settings", "analytics_ga4_measurement_id")
    op.drop_column("system_settings", "analytics_enabled")
