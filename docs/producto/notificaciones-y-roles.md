# Notificaciones y roles

## Notificaciones: campana + correo, siempre ambos

Cada notificación es **una sola pieza que llega por dos medios**: la campana 🔔
(sitio, panel y admin) y un correo al usuario. Los correos salen en segundos
tras el evento y el sistema reintenta los pendientes cada minuto.

| Quién | Recibe | Cuándo |
|---|---|---|
| **Cliente** | Estado de su pedido | Recibido, confirmado, preparando, listo, en camino, entregado, cancelado |
| **Personal** con `notifications:order_alerts` | «Pedido web nuevo» | Al crearse un pedido desde el sitio |
| **Cualquier audiencia** | Promoción/aviso | Cuando el administrador difunde |

La alerta de pedido nuevo se asigna **por rol**: dale
`notifications:order_alerts` al rol de quien deba enterarse (cocina, gerente,
tú). Quien no tenga el permiso, no recibe ruido.

## Difusión (`/admin/notificaciones`, permiso `notifications:send`)

Título (asunto del correo) + mensaje (texto plano, límites controlados) +
audiencia:

- **Todos** — todas las cuentas activas.
- **Solo clientes** — cuentas sin rol de personal.
- **Solo personal** — cuentas con algún rol.

El envío reporta a cuántos usuarios llegó y queda auditado (nombres de campos,
nunca el contenido).

## Permisos y roles (RBAC)

Los permisos se **declaran en código** y se agrupan por módulo; un rol es un
conjunto de permisos y un usuario puede tener varios roles. Grupos:

`users` · `roles` · `permissions` · `system_settings` · `backups` ·
`audit_events` · `files` · `business` · `catalog` · `shipping` · `orders` ·
`payments` · `tickets` · `deliveries` · `finances` · `credits` · `storefront` ·
`profiles` · `discount_codes` · `notifications`

La navegación del panel y el admin se **proyecta por permisos**: cada quien ve
solo sus módulos, y el backend revalida cada acción.

### Roles sugeridos por puesto

| Puesto | Permisos base |
|---|---|
| **Cocina** | `orders:read`, `orders:transition`, `notifications:order_alerts` |
| **Cajero / mostrador** | `orders:read`, `orders:capture`, `orders:transition`, `payments:read`, `payments:record`, `tickets:print` |
| **Repartidor** | `deliveries:read`, `deliveries:self_assign` |
| **Gerente** | Lo anterior + `orders:approve`, `orders:cancel`, `payments:verify`, `payments:refund`, `finances:*`, `notifications:order_alerts` |
| **Editor del sitio** | `storefront:read`, `storefront:edit`, `files:read`, `files:upload` (+ `storefront:manage_theme` si maneja la marca) |
| **Marketing** | `notifications:send`, `discount_codes:*`, permisos de editor del sitio |

> Los clientes **no tienen rol**: su cuenta solo accede a recursos propios
> (sus pedidos, direcciones, créditos, notificaciones).

### Reglas de seguridad que el sistema garantiza

- **Supervivencia administrativa**: es imposible dejar la instalación sin un
  administrador con cobertura completa de permisos.
- Cambiar contraseña/correo o «revocar sesiones» invalida **todas** las
  sesiones activas de ese usuario al instante.
- La bitácora `audit_events` (permiso `audit_events:read`) registra los cambios
  de configuración con **solo nombres de campos, nunca valores**.
