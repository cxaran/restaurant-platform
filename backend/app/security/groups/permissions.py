from backend.app.security.security_group import SecurityGroup


class PermissionPermissions(SecurityGroup):
    READ = ("permissions:read", "Listar permisos disponibles")
