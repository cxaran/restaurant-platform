from backend.app.security.security_group import SecurityGroup


class CreditPermissions(SecurityGroup, label="Créditos"):
    # Créditos (§22). El cliente consulta su propio saldo y movimientos por
    # propiedad del registro (sin permiso); estos permisos son del panel:
    # ver créditos de cualquier cliente y ajustar manualmente (asiento auditado
    # en el ledger; el saldo JAMÁS se edita directo).
    READ_ALL = ("credits:read_all", "Ver créditos de cualquier cliente")
    MANUAL_ADJUST = ("credits:manual_adjust", "Ajustar créditos manualmente")
