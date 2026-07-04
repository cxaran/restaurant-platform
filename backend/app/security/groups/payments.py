from backend.app.security.security_group import SecurityGroup


class PaymentPermissions(SecurityGroup, label="Pagos"):
    # Pagos de pedidos (§18): registrar el pago declarado, verificarlo
    # (transferencias/terminal) y reembolsar (etapa 7 completa el flujo
    # financiero). Nunca se guardan datos bancarios sensibles.
    READ = ("payments:read", "Ver pagos de pedidos")
    RECORD = ("payments:record", "Registrar pagos y evidencias")
    VERIFY = ("payments:verify", "Verificar o rechazar pagos declarados")
    REFUND = ("payments:refund", "Registrar reembolsos")
    MANAGE_METHODS = ("payments:manage_methods", "Administrar métodos de pago")


class TicketPermissions(SecurityGroup, label="Tickets"):
    # El ticket se arma desde snapshots (§20); este permiso cubre obtener el
    # payload imprimible y registrar cada impresión en la bitácora.
    PRINT = ("tickets:print", "Imprimir tickets y ver su bitácora")
