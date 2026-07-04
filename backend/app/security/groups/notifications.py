from backend.app.security.security_group import SecurityGroup


class NotificationPermissions(SecurityGroup, label="Notificaciones"):
    # Las notificaciones PROPIAS (campana) las lee cualquier usuario
    # autenticado — recurso /me sin permiso. Estos controles gobiernan lo demás:
    # SEND habilita el panel de difusión del administrador y ORDER_ALERTS marca
    # QUIÉN recibe la alerta de pedido web nuevo (se asigna por rol, como todo).
    SEND = ("notifications:send", "Enviar notificaciones y promociones")
    ORDER_ALERTS = (
        "notifications:order_alerts",
        "Recibir alertas de pedidos web nuevos",
    )
