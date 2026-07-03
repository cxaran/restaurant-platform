from backend.app.security.security_group import SecurityGroup


class ShippingPermissions(SecurityGroup, label="Envíos"):
    # Zonas de reparto (polígonos) y tarifas (§10). Dos permisos gruesos; la
    # cotización pública del carrito no usa permisos (endpoint público con
    # rate limiting). El ajuste del envío de UN pedido pertenece a orders (etapa 4).
    READ = ("shipping:read", "Ver zonas de reparto y tarifas")
    MANAGE = ("shipping:manage", "Administrar zonas de reparto y tarifas")
