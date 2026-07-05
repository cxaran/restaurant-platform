# Google Analytics 4 (GA4) — integración del sitio público

La plataforma mide el **sitio público** (storefront + login/registro) con GA4.
El **panel** (`/panel`) y el **admin** (`/admin`) nunca se miden. La integración
es centralizada: ningún componente llama a Google directo — todo pasa por
`frontend/src/core/analytics/` (catálogo cerrado de eventos, anti-PII
estructural, no-op cuando está apagada o bloqueada por adblock).

## Configuración (post-bootstrap, editable en runtime)

La configuración vive en la base de datos (`system_settings`), **no** en
variables de entorno: se edita sin recompilar ni redesplegar, queda auditada
(nombres de campo, nunca valores) y se sirve al sitio por
`GET /api/v1/public/site/analytics` (cache 60 s).

Editar en: **`/admin/resources/system_settings`** (permiso
`system_settings:configure`).

| Campo | Qué hace |
|---|---|
| **Analítica del sitio (GA4)** | Interruptor general. Apagado: no se carga ningún script ni se envía nada. |
| **ID de medición de GA4** | `G-XXXXXXXXXX`. Obligatorio para poder encender la analítica (409 si falta). |
| **Exigir consentimiento de cookies** | Muestra el aviso de cookies; hasta aceptar no se carga GA ni se envía evento alguno. Recomendado: encendido. |
| **Modo de depuración (DebugView)** | Marca los eventos para GA4 DebugView. Solo para validar; apagar en operación. |

> El ID de medición de GA4 es un identificador público por diseño de Google.
> Aquí no se guarda ningún secreto de analítica. Si algún día se añade envío
> desde el backend (Measurement Protocol), su `api_secret` deberá guardarse
> cifrado en el servidor y JAMÁS exponerse al cliente.

## Pasos del administrador en Google

1. Crear (o elegir) una **propiedad de Google Analytics 4** en
   [analytics.google.com](https://analytics.google.com) → Administración.
2. Crear un **flujo de datos web** con la URL pública del sitio.
3. Copiar el **ID de medición** (formato `G-XXXXXXXXXX`).
4. Pegarlo en `/admin/resources/system_settings` → *ID de medición de GA4* y
   encender *Analítica del sitio (GA4)*.
5. Con el sitio en producción, validar la medición (sección siguiente).
6. En GA4 → Administración → Eventos, marcar como **conversiones clave**:
   `purchase` (pedido creado) y `sign_up` (registro completado).

## Validación (prueba manual)

1. Encender **Modo de depuración (DebugView)** en la configuración.
2. Abrir GA4 → Administración → **DebugView**.
3. En el sitio público (ventana normal, no bloqueador):
   - Cargar la portada → debe aparecer `page_view` (si se exige consentimiento,
     primero aceptar el aviso de cookies).
   - Navegar a `/menu` y cambiar de categoría → `page_view` + `view_menu_category`.
   - Abrir un producto → `view_item`; agregarlo → `add_to_cart`.
   - Ir a `/checkout` con carrito → `begin_checkout`.
   - Confirmar un pedido de prueba → `purchase` con `transaction_id`.
   - Clic en un teléfono/WhatsApp del footer → `phone_click` / `whatsapp_click`.
   - Completar un registro → `sign_up`; iniciar sesión → `login`.
4. Verificar que **rechazar** el aviso de cookies detiene todos los eventos y
   que el enlace **«Cookies»** del pie reabre el aviso.
5. Apagar el modo de depuración.

Alternativa: extensión *Tag Assistant* de Google para inspeccionar los hits.

## Eventos implementados

`page_path` se añade automáticamente a todo evento (solo pathname — **nunca**
query string: rutas como `reset-password?token=…` no se filtran).

| Evento | Cuándo | Parámetros | Objetivo |
|---|---|---|---|
| `page_view` | Carga inicial y cada cambio de ruta (SPA), deduplicado | `page_path`, `page_location` (sin query) | Tráfico y navegación |
| `cta_click` | Clic en CTA del hero configurable | `cta_name`, `cta_location`, `destination_type` | Rendimiento de portada |
| `whatsapp_click` / `phone_click` | Clic en contacto (footer o CTA) | `link_location` | Intención de contacto |
| `view_item` | Vista del detalle de producto | `item_id`, `item_name` | Interés por producto |
| `view_menu_category` | Cambio de pestaña de categoría | `category_name` | Navegación del menú |
| `add_to_cart` / `remove_from_cart` | Alta/baja de línea (punto único en el store del carrito) | `item_id`, `item_name`, `quantity`, `purchase_mode` | Embudo de compra |
| `begin_checkout` | Montaje del checkout con carrito | `item_count`, `purchase_mode` | Embudo de compra |
| **`purchase`** | **Pedido creado con éxito** (confirmación real del backend) | `transaction_id`, `value`+`currency` (solo dinero), `item_count`, `fulfillment_type`, `purchase_mode` | **Conversión principal** |
| `sign_up` | Registro completado | `method` | Conversión secundaria |
| `login` | Sesión iniciada | `method` (`password`/`email_code`) | Retención |

### Regla anti-PII (no negociable)

Jamás se envían: nombres, correos, teléfonos, direcciones, notas del cliente,
contenido de formularios ni query strings. Los `item_id`/`transaction_id` son
identificadores técnicos del catálogo/pedido, no datos personales. El catálogo
de eventos (`frontend/src/core/analytics/events.ts`) es la única puerta: un
parámetro que no está declarado ahí no compila.

## Consentimiento

Con *Exigir consentimiento* encendido:

- Antes de decidir: **no se carga el script ni se envía nada** (control real,
  no cosmético).
- **Aceptar** inicia la medición al instante, sin recargar (incluye el
  `page_view` de la página actual).
- **Rechazar** la mantiene apagada.
- El enlace **«Cookies»** del pie del sitio reabre el aviso para cambiar la
  preferencia. La cookie de sesión (necesaria) es independiente.
- Señales publicitarias (`ad_storage`, `ad_user_data`, `ad_personalization`)
  siempre **denegadas**: esto mide uso, no perfila anuncios.

La página `/terminos` documenta las cookies al visitante (sección
«Cookies y analítica», visible solo con la analítica encendida).

## Eventos recomendados para etapas futuras (no implementados)

No existen hoy las funcionalidades o señales correspondientes; no inventar:

- `search` — no hay búsqueda de productos (solo tabs de categoría).
- `contact_form_*` — no hay formulario de contacto/cotización.
- `email_click` — no hay enlaces `mailto:` en el sitio.
- `order_status_viewed` / seguimiento en vivo — `/pedidos/[id]` no tiene
  polling de estado.
- `select_promotion` (cupón aplicado), `credits_mode_toggled`,
  `delivery_zone_quote_result` — señales reales pero secundarias; añadirlas al
  catálogo cuando se prioricen.

## Arquitectura (referencia técnica)

- `backend/app/models/system_settings.py` — columnas `analytics_*`
  (migración `b7d4e29c63f1`).
- `backend/app/api/v1/public_site.py` — `GET /public/site/analytics`.
- `frontend/src/core/analytics/analytics.ts` — adaptador (gtag encapsulado);
  `events.ts` — catálogo tipado; `consent.ts` — persistencia del consentimiento.
- `frontend/src/components/analytics/` — `AnalyticsProvider` (montado en los
  layouts `(storefront)` y `(public)`), `ConsentBanner`,
  `CookiePreferencesLink`.
- Cambiar de proveedor de analítica = reescribir `analytics.ts`; la aplicación
  no cambia.
