from backend.app.security.security_group import SecurityGroup


class StorefrontPermissions(SecurityGroup, label="Sitio público"):
    # Editor plano del sitio: guardar es publicar (sin borradores). Nada de
    # esto toca catálogo, precios, pedidos ni créditos — la configuración
    # visual no cambia la lógica del negocio.
    READ = ("storefront:read", "Ver la configuración del sitio")
    EDIT = ("storefront:edit", "Editar heros, destacados y footer")
    MANAGE_THEME = ("storefront:manage_theme", "Cambiar tema y metadatos del sitio")
