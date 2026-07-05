# Puesta en marcha del negocio

Del asistente inicial al sitio vendiendo. Todo se configura **desde la
interfaz**, autenticado y auditado — sin tocar archivos del servidor.

## 1. El asistente `/setup` (una sola vez)

Con el token que imprimió el instalador, el asistente crea:
- el **administrador inicial** (tu cuenta),
- el **rol fundacional** con todos los permisos (siempre habrá al menos un
  administrador con cobertura total — el sistema lo garantiza),
- los roles adicionales que definas (puedes crearlos después),
- y detecta/persiste el **dominio público** desde tu navegador.

## 2. El checklist del dashboard

Al entrar a `/admin` verás un checklist **derivado del estado real** del
sistema: cada punto pendiente enlaza a su pantalla. Orden recomendado:

1. **Correo saliente** — configuración del sistema: SMTP propio o Resend
   (secretos cifrados, solo escritura) y **correo de prueba**. Sin esto no
   salen registros, recuperaciones ni notificaciones.
2. **Dominio verificado** — la plataforma verifica tu dominio con un reto
   criptográfico y lo suma a los orígenes confiables.
3. **Registro público** — decide si los clientes pueden crear cuenta
   (se controla únicamente desde la configuración del sistema).
4. **Respaldos** — conectar Google Drive (guía del operador:
   [`operacion/respaldos.md`](../operacion/respaldos.md)).

## 3. Perfil del negocio

En **Negocio** (`/admin/negocio`, permiso `business:*`):

- **Identidad**: nombre comercial, eslogan, dirección principal, zona horaria.
- **Logo**: solo imágenes raster (`ico/png/webp/jpeg`) — el SVG está bloqueado
  por seguridad en todo el branding público.
- **Teléfonos**: cada uno con etiqueta, si es WhatsApp y si es público
  (los públicos aparecen en el sitio y el footer).
- **Horario semanal** y **fechas especiales** (festivos, cierres): el sitio
  muestra «Abierto/Cerrado ahora» real y, si activas «pedidos web solo en
  horario», el checkout se cierra fuera de él.
- **Interruptores de servicio**: permitir entrega a domicilio, permitir
  recoger en tienda, compra mínima a domicilio, umbral global de envío gratis.

## 4. Marca visual del sitio

En el **editor del sitio** (`/admin/storefront`) eliges preset de color, acento,
heros y footer — guía completa: [sitio-publico.md](sitio-publico.md). Los
metadatos (título, descripción, favicon, imagen para compartir) viven en la
pestaña **Apariencia**.

## 5. Analítica del sitio (GA4, opcional)

Se configura en la **configuración del sistema** (permiso
`system_settings:configure`); solo mide el **sitio público** — el panel y el
admin jamás se miden. Sin PII estructural: nunca nombres, correos, teléfonos ni
query strings.

1. Crea una propiedad GA4 y un flujo de datos web; copia el **ID de medición**
   (`G-XXXXXXXXXX`).
2. Pégalo en la configuración y enciende **Analítica del sitio**.
3. Recomendado: **Exigir consentimiento de cookies** (hasta aceptar, no se
   carga ni envía nada; el enlace «Cookies» del pie reabre el aviso).
4. Valida con **DebugView** (modo depuración temporal): portada → `page_view`,
   producto → `view_item`, carrito → `add_to_cart`, checkout → `begin_checkout`,
   pedido creado → `purchase`. Apaga el modo al terminar.
5. En GA4 marca como conversiones clave `purchase` y `sign_up`.

## 6. Equipo

Crea los roles de tu personal y asigna permisos por puesto — guía y roles
sugeridos: [notificaciones-y-roles.md](notificaciones-y-roles.md).

Con catálogo cargado ([catalogo-y-pedidos.md](catalogo-y-pedidos.md)) y zonas
de entrega definidas ([envios-creditos-descuentos.md](envios-creditos-descuentos.md)),
el sitio está listo para vender.
