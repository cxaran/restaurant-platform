from backend.app.security.security_group import SecurityGroup


class StorefrontPermissions(SecurityGroup, label="Sitio público"):
    # Editor del sitio (§52). Editar borradores NO otorga publicar: publicar y
    # revertir son decisiones separadas. Nada de esto toca catálogo, precios,
    # pedidos ni créditos (§55: la configuración visual no cambia la lógica).
    READ_DRAFT = ("storefront:read_draft", "Ver borradores del sitio")
    EDIT = ("storefront:edit", "Editar borradores (textos, secciones, orden)")
    MANAGE_MEDIA = ("storefront:manage_media", "Administrar imágenes del sitio")
    MANAGE_THEME = ("storefront:manage_theme", "Cambiar tema y metadatos del sitio")
    PREVIEW = ("storefront:preview", "Previsualizar borradores")
    PUBLISH = ("storefront:publish", "Publicar revisiones")
    ROLLBACK = ("storefront:rollback", "Restaurar versiones anteriores")
    MANAGE_NAVIGATION = ("storefront:manage_navigation", "Administrar páginas y navegación")
