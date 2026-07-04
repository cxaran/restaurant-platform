from backend.app.security.security_group import SecurityGroup


class DeliveryPermissions(SecurityGroup, label="Repartos"):
    # Operación de reparto (§19). SELF_ASSIGN es el permiso del repartidor:
    # ver la cola, marcar disponibilidad, tomar/iniciar/entregar SUS envíos y
    # manejar su tracking. COMPLETE_FOR_COURIER permite a otro empleado marcar
    # entregado en nombre del repartidor (operación sin conexión, §19.6).
    READ = ("deliveries:read", "Ver cola de envíos y asignaciones")
    ASSIGN = ("deliveries:assign", "Asignar o reasignar repartidores manualmente")
    SELF_ASSIGN = ("deliveries:self_assign", "Operar como repartidor (tomar y entregar envíos)")
    COMPLETE_FOR_COURIER = (
        "deliveries:complete_for_courier",
        "Marcar entregas en nombre del repartidor",
    )
