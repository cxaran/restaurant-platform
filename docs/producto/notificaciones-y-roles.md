# Notificaciones y roles

## Notificaciones: campana + correo + aviso del dispositivo

Cada notificación es **una sola pieza que llega por tres medios**: la campana 🔔
(sitio, panel y admin), un correo al usuario y — si el dispositivo lo activó —
una **notificación del sistema** (Web Push) que llega aunque la página esté
cerrada. Correos y pushes salen en segundos tras el evento y el sistema
reintenta los pendientes cada minuto.

| Quién | Recibe | Cuándo |
|---|---|---|
| **Cliente** | Estado de su pedido | Recibido, confirmado, preparando, listo, en camino, entregado, cancelado |
| **Personal** con `notifications:order_alerts` | «Pedido web nuevo» | Al crearse un pedido desde el sitio |
| **Cualquier audiencia** | Promoción/aviso | Cuando el administrador difunde |

Las ventas de **mostrador** no notifican al cliente (está presente y se lleva
su ticket), aunque la venta quede asociada a su cuenta.

La alerta de pedido nuevo se asigna **por rol**: dale
`notifications:order_alerts` al rol de quien deba enterarse (cocina, gerente,
tú). Quien no tenga el permiso, no recibe ruido.

### Avisos del dispositivo (Web Push) por plataforma

Se activan desde el panel de la campana 🔔 → **«Activar avisos en este
dispositivo»** (el navegador pide permiso). Cada dispositivo/navegador se
suscribe por separado bajo la sesión activa.

| Plataforma | Cómo |
|---|---|
| **PC / Mac** (Chrome, Edge, Firefox, Safari 16+) | Botón + aceptar permiso |
| **Android** (Chrome/Firefox) | Botón + aceptar permiso; llega con el navegador cerrado |
| **iPhone / iPad** (iOS 16.4+) | Primero **añadir la app a la pantalla de inicio** (Compartir → «Añadir a pantalla de inicio»); dentro de la app instalada, activar los avisos. La campana muestra la instrucción cuando aplica |

Para el personal (cocina/caja/reparto) esto convierte la alerta de pedido
nuevo en un aviso **instantáneo del sistema**, sin necesidad de tener el panel
abierto. Las claves técnicas (VAPID) se generan solas en el primer uso; no hay
nada que configurar.

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
