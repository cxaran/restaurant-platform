from backend.app.security.security_group import SecurityGroup


class ProfilePermissions(SecurityGroup, label="Perfiles"):
    # Perfiles 1:1 (§8.2/§8.4): datos comerciales del cliente y operativos del
    # personal. La identidad y los roles siguen viviendo en users; aquí sólo se
    # administra la extensión (teléfono de búsqueda, capacidad de reparto...).
    READ = ("profiles:read", "Ver perfiles de clientes y personal")
    MANAGE_CUSTOMERS = ("profiles:manage_customers", "Editar perfiles de clientes")
    MANAGE_STAFF = ("profiles:manage_staff", "Editar perfiles del personal")
