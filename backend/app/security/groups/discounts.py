from backend.app.security.security_group import SecurityGroup


class DiscountCodePermissions(SecurityGroup, label="Códigos de descuento"):
    # Códigos de descuento fijo web-only (Etapa 5 RC). El cliente cotiza su
    # código por sesión propia (sin permiso); estos permisos son del panel.
    READ = ("discount_codes:read", "Ver códigos de descuento y redenciones")
    MANAGE = ("discount_codes:manage", "Crear y administrar códigos de descuento")
