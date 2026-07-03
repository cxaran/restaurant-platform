from backend.app.security.security_group import SecurityGroup


class CatalogPermissions(SecurityGroup, label="Catálogo"):
    # Catálogo de productos y modificadores (§11–§13). Los cambios se publican al
    # instante en el sitio (§58.3); el orden visual tiene permiso propio para poder
    # dar «acomodar el menú» sin dar edición de precios.
    READ = ("catalog:read", "Ver el catálogo administrativo")
    CREATE = ("catalog:create", "Crear categorías, productos y modificadores")
    UPDATE = ("catalog:update", "Editar catálogo (precios, créditos, disponibilidad)")
    SORT = ("catalog:sort", "Reordenar el menú visible")
