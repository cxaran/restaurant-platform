from backend.app.security.security_group import SecurityGroup


class FinancePermissions(SecurityGroup, label="Finanzas"):
    # Movimientos monetarios (§21). Registrar cubre gastos/ingresos manuales y
    # sus evidencias; anular deja historial (nunca se elimina). Los ingresos de
    # pagos son del SISTEMA y no se anulan a mano — se reembolsan (payments:refund).
    READ = ("finances:read", "Ver movimientos y resúmenes financieros")
    RECORD = ("finances:record", "Registrar gastos e ingresos manuales")
    VOID = ("finances:void", "Anular movimientos manuales con motivo")
