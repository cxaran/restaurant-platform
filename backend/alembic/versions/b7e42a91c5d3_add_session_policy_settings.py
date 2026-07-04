"""Duración de sesión como política editable en system_settings.

``customer_session_days`` (cliente sin roles) y ``staff_session_minutes``
(personal con roles): NULL = heredar el default del despliegue
(CUSTOMER_SESSION_EXPIRE_DAYS / ACCESS_TOKEN_EXPIRE_MINUTES). Se configura
desde el bootstrap y se edita en Configuración del sistema; la renovación
deslizante extiende ambas sesiones mientras haya actividad.

Revision ID: b7e42a91c5d3
Revises: a1d5f83c72e9
Create Date: 2026-07-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b7e42a91c5d3"
down_revision: Union[str, Sequence[str], None] = "a1d5f83c72e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "system_settings",
        sa.Column(
            "customer_session_days",
            sa.Integer(),
            nullable=True,
            comment=(
                "Días de sesión del CLIENTE (usuario sin roles). NULL = usar el default "
                "del despliegue (CUSTOMER_SESSION_EXPIRE_DAYS). La renovación deslizante "
                "extiende la sesión con la actividad."
            ),
        ),
    )
    op.add_column(
        "system_settings",
        sa.Column(
            "staff_session_minutes",
            sa.Integer(),
            nullable=True,
            comment=(
                "Minutos de sesión del PERSONAL (usuario con roles). NULL = usar el "
                "default del despliegue (ACCESS_TOKEN_EXPIRE_MINUTES)."
            ),
        ),
    )
    op.create_check_constraint(
        "system_settings_customer_session_days_positive",
        "system_settings",
        "customer_session_days IS NULL OR customer_session_days > 0",
    )
    op.create_check_constraint(
        "system_settings_staff_session_minutes_positive",
        "system_settings",
        "staff_session_minutes IS NULL OR staff_session_minutes > 0",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        "system_settings_staff_session_minutes_positive", "system_settings", type_="check"
    )
    op.drop_constraint(
        "system_settings_customer_session_days_positive", "system_settings", type_="check"
    )
    op.drop_column("system_settings", "staff_session_minutes")
    op.drop_column("system_settings", "customer_session_days")
