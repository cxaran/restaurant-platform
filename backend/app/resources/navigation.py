"""Registro declarativo de módulos ESPECIALIZADOS de navegación.

Los recursos tabulares se descubren por ``RESOURCE_REGISTRY``; las pantallas
especializadas (editor del sitio, POS, cola de repartos…) no tienen contrato
tabular y solo necesitan aparecer en la navegación según permisos. Este módulo
declara ese contrato mínimo: nombre, label, ``href`` y los permisos que lo
hacen visible (*anyOf*). La proyección (``visible_navigation_modules``) publica
únicamente los módulos donde el usuario tiene ALGUNO de los permisos; cada
pantalla y sus endpoints siguen revalidando permisos por su cuenta.

Nota: ``backups`` ya existe como recurso registrado (``backup_settings``/
``backup_runs``) y NO se duplica aquí.
"""

from dataclasses import dataclass
from typing import Literal

from backend.app.schemas.capabilities import NavigationModule
from backend.app.schemas.user import SessionUser
from backend.app.security.groups.deliveries import DeliveryPermissions
from backend.app.security.groups.discounts import DiscountCodePermissions
from backend.app.security.groups.finances import FinancePermissions
from backend.app.security.groups.orders import OrderPermissions
from backend.app.security.groups.payments import TicketPermissions
from backend.app.security.groups.storefront import StorefrontPermissions
from backend.app.security.security_group import SecurityGroup


@dataclass(frozen=True)
class NavigationModuleDef:
    """Módulo especializado declarado en código.

    ``permissions`` es un *anyOf* de controles existentes del catálogo de
    seguridad: basta que el usuario cumpla uno para que el módulo se proyecte."""

    name: str
    label: str
    href: str
    section: Literal["admin", "panel"]
    permissions: tuple[SecurityGroup, ...]

    def __post_init__(self) -> None:
        # Un módulo sin permisos sería visible para todos: error de definición.
        if not self.permissions:
            raise ValueError(
                f"El módulo de navegación '{self.name}' debe declarar al menos un permiso."
            )


NAVIGATION_REGISTRY: tuple[NavigationModuleDef, ...] = (
    NavigationModuleDef(
        name="storefront",
        label="Editor del sitio",
        href="/admin/storefront",
        section="admin",
        permissions=(StorefrontPermissions.READ_DRAFT, StorefrontPermissions.EDIT),
    ),
    NavigationModuleDef(
        name="codigos-descuento",
        label="Códigos de descuento",
        href="/admin/codigos-descuento",
        section="admin",
        permissions=(DiscountCodePermissions.READ,),
    ),
    NavigationModuleDef(
        name="reportes",
        label="Reportes",
        href="/admin/reportes",
        section="admin",
        permissions=(FinancePermissions.READ,),
    ),
    NavigationModuleDef(
        name="pedidos",
        label="Pedidos",
        href="/panel/pedidos",
        section="panel",
        permissions=(OrderPermissions.READ,),
    ),
    NavigationModuleDef(
        name="pos",
        label="Venta de mostrador",
        href="/panel/pos",
        section="panel",
        permissions=(OrderPermissions.CAPTURE,),
    ),
    NavigationModuleDef(
        name="entregas",
        label="Entregas",
        href="/panel/entregas",
        section="panel",
        permissions=(DeliveryPermissions.READ,),
    ),
    NavigationModuleDef(
        name="reparto",
        label="Mi reparto",
        href="/panel/reparto",
        section="panel",
        permissions=(DeliveryPermissions.SELF_ASSIGN,),
    ),
    NavigationModuleDef(
        name="tickets",
        label="Tickets",
        href="/panel/tickets",
        section="panel",
        permissions=(TicketPermissions.PRINT,),
    ),
)


def visible_navigation_modules(user: SessionUser) -> list[NavigationModule]:
    """Módulos donde el usuario tiene ALGUNO de los permisos declarados (anyOf)."""
    return [
        NavigationModule(
            name=module.name,
            label=module.label,
            href=module.href,
            section=module.section,
            required_permissions=[
                control.permission for control in module.permissions
            ],
        )
        for module in NAVIGATION_REGISTRY
        if any(control.check(user) for control in module.permissions)
    ]
