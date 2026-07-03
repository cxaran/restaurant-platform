from backend.app.security.security_group import SecurityGroup


class BusinessPermissions(SecurityGroup, label="Negocio"):
    # Configuración del negocio único (§5–§6): perfil, política operativa,
    # teléfonos, horarios y fechas especiales. Dos permisos gruesos: leer la
    # configuración interna y modificarla. El endpoint público del sitio NO
    # usa permisos (expone sólo datos públicos).
    READ = ("business:read", "Ver la configuración del negocio")
    UPDATE = ("business:update", "Modificar la configuración del negocio")
