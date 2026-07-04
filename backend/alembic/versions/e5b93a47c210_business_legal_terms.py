"""Textos legales editables del negocio (Términos y Aviso de Privacidad).

``business_profile.terms_extra`` y ``business_profile.privacy_extra`` guardan
las cláusulas OPCIONALES que el administrador agrega al documento legal
autogenerado que se sirve en ``/terminos`` (datos del negocio + cupones
vigentes). Ambas son texto libre y opcional.

Revision ID: e5b93a47c210
Revises: a9d31c7e54f2
Create Date: 2026-07-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e5b93a47c210"
down_revision: Union[str, Sequence[str], None] = "a9d31c7e54f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "business_profile",
        sa.Column(
            "terms_extra",
            sa.Text(),
            nullable=True,
            comment=(
                "Cláusulas adicionales de los Términos y Condiciones, editables por el "
                "administrador; se anexan al documento autogenerado de /terminos."
            ),
        ),
    )
    op.add_column(
        "business_profile",
        sa.Column(
            "privacy_extra",
            sa.Text(),
            nullable=True,
            comment=(
                "Texto adicional del Aviso de Privacidad, editable por el administrador; "
                "se anexa a la sección de privacidad autogenerada de /terminos."
            ),
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("business_profile", "privacy_extra")
    op.drop_column("business_profile", "terms_extra")
