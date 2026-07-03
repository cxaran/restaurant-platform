from backend.app.security.security_group import SecurityGroup


class FilePermissions(SecurityGroup, label="Archivos"):
    # Archivos binarios de stored_files (imágenes, favicon, comprobantes, facturas,
    # evidencias). READ cubre descargar/consultar por id desde el panel interno;
    # UPLOAD cubre subir nuevos archivos. La entrega pública de imágenes referidas
    # por contenido publicado (menú, storefront) tendrá su propia ruta sin sesión
    # en etapas posteriores; estos permisos NO la gobiernan.
    READ = ("files:read", "Descargar y consultar archivos almacenados")
    UPLOAD = ("files:upload", "Subir archivos al almacén")
