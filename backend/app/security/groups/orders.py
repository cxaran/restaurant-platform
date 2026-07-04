from backend.app.security.security_group import SecurityGroup


class OrderPermissions(SecurityGroup, label="Pedidos"):
    # Ciclo de vida del pedido (§14–§17). El autoservicio del cliente (sus
    # propios pedidos) NO usa permisos: usa propiedad del registro (§8.1).
    # APPROVE y CANCEL son adicionales a TRANSITION: mover estados operativos
    # no implica poder aprobar (congela dinero) ni cancelar.
    READ = ("orders:read", "Ver pedidos en el panel interno")
    CAPTURE = ("orders:capture", "Capturar pedidos de mostrador, teléfono y redes")
    TRANSITION = ("orders:transition", "Avanzar estados operativos del pedido")
    APPROVE = ("orders:approve", "Aprobar pedidos (congela totales)")
    CANCEL = ("orders:cancel", "Cancelar pedidos")
    ADJUST_SHIPPING = ("orders:adjust_shipping", "Ajustar el costo de envío antes de aprobar")
    ADJUST = ("orders:adjust", "Registrar descuentos y cargos autorizados")
