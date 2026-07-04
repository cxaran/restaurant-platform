# Frontend: plan de reutilización e integración del Storefront

**Fecha:** 2026-07-03 · **Alcance:** primera integración real del sitio público (Tony-Tony como primera configuración, jamás como código) sobre el frontend contract-driven existente. Backend intacto.

## 1. Matriz de reutilización

| Recurso existente | Ubicación | Uso actual | Decisión | Uso nuevo | Motivo |
|---|---|---|---|---|---|
| Tipos generados OpenAPI | `src/generated/openapi.ts` | Contratos de plataforma | **Reutilizar sin cambios** (regenerado) | Todos los contratos del dominio (checkout, menú, storefront, pedidos) | Regenerado desde el backend actual (+9.4k líneas); fuente única de tipos |
| Fachada de contratos | `src/core/api/contracts.ts` | Aliases type-only | **Extender** (patrón, no el archivo) | `src/core/restaurant-api/contracts.ts` con aliases del dominio | Mismo patrón, módulo separado para no mezclar dominios |
| `requestJson` + envelope de error | `src/core/api/request.ts`, `api-error.ts` | Base de todo fetch | **Reutilizar sin cambios** | Debajo de todos los clients nuevos | Serialización, multipart y `{code,message,errors}` ya resueltos |
| `browserApi` (`credentials:include`) | `src/core/api/browser-client.ts` | Mutaciones cliente | **Reutilizar sin cambios** | Carrito→checkout, mis pedidos | Cookie httponly de sesión; nada que rehacer |
| `serverApi` (`BACKEND_INTERNAL_URL`, `no-store`) | `src/core/api/server-client.ts` | Data en RSC | **Reutilizar sin cambios** | Payload público storefront/business/menu | `no-store` forzado = regla de caché de esta tarea cumplida por defecto |
| Sesión (`getSession`/`requireSession`) | `src/core/auth/session.ts` | Gating del panel | **Reutilizar sin cambios** | Checkout y "mis pedidos" del sitio | No existe checkout invitado: la sesión ya está resuelta |
| `SessionProvider`/`useSession` | `src/core/auth/SessionProvider.tsx` | Contexto del panel | **Reutilizar sin cambios** | Header del sitio (login vs cuenta) | Mismo contexto |
| Catálogo de capabilities/guards | `src/core/resources/*` | Panel genérico | **Reutilizar sin cambios** para CRUD admin | Catálogo, zonas, métodos de pago, etc. se administran por `/resources/*` cuando el backend los proyecte | No duplicar CRUD; el dominio aún no registra `ResourceDefinition` (gap backend documentado en §4) |
| `ResourceTable`/toolbar/filtros/paginación | `src/components/resources/*` | Listas genéricas | **No usar en el sitio público** | — | El sitio público es experiencia especializada, no una tabla |
| UI base (`Button`, `Card`, `Badge`, `EmptyState`, `LoadingState`, `FieldError`) | `src/components/ui/*` | Panel | **Reutilizar con adaptación** en páginas admin del storefront; **no usar** en sitio público | Página admin de storefront | El sitio público usa tokens del tema publicado, no la paleta púrpura del panel |
| Tokens de estilo del panel (`globals.css`) | `src/app/globals.css` | Tema admin | **No usar** en sitio público | El sitio define `--sf-*` desde `theme_tokens` publicados | Dos sistemas de tema deliberadamente separados |
| `PlatformShell` | `src/components/layout/PlatformShell.tsx` | Nav del panel | **Reutilizar sin cambios** | Sin cambios: la página admin de storefront se alcanza por URL; la nav es contract-driven y el dominio aún no está en el registry | No hardcodear navegación contra el patrón del shell |
| Drift-check OpenAPI | `scripts/generate-openapi.mjs` | `check:api` | **Reutilizar sin cambios** | Regenerado con schema exportado por import de la app (sin servidor ni DB) | Único paso manual documentado |
| Wizard bootstrap, backups, cuenta | `features/bootstrap`, `core/backups`, `account` | — | **No tocar** | — | Fuera del alcance |

**No se duplicó:** tipos request/response, enums, permisos, estados de pedido, paginación, auth, validaciones del contrato, cálculo de precios/créditos/reembolsos/disponibilidad (todo llega calculado del backend).

## 2. Módulos nuevos

- `src/core/restaurant-api/` — envoltura del cliente generado (nunca lo replica):
  - `contracts.ts` (aliases type-only), `business.ts` + `menu.ts` (RSC), `storefront.ts` (RSC; **el payload público es `dict` sin tipar en OpenAPI** → `view-models.ts` define el VM con parseo defensivo, gap documentado en §4), `orders.ts` (browser: checkout/mis pedidos), `view-models.ts` (ThemeTokens, SectionVM, parsers), `theme.ts` (tokens→CSS vars `--sf-*`, mapa `font_family_key`→fuentes autorizadas de `next/font`).
- `src/core/storefront/cart.tsx` — carrito local (Context + `localStorage`), **cantidades enteras ≥1** (steppers; sin `parseInt` correctivo), persiste entre login/registro. El carrito NO es fuente de verdad económica: muestra precios del menú como referencia y el checkout siempre recotiza en backend.
- `src/core/storefront/demo-fixtures.ts` — fixture Tony-Tony (tokens/hero/anuncio) SOLO con `NEXT_PUBLIC_STOREFRONT_DEMO=true`; jamás activo por defecto.
- `src/components/storefront/` — `StorefrontThemeProvider`, `BrandLockup`, `StorefrontHeader/Footer`, `SectionRenderer` + `templates/` (registry), `UnknownTemplateFallback`, `MenuView`, `ProductCard`, `QuantityStepper`, `CartBar`, `SafeImage` (solo `/api/v1/public/files/`).
- Rutas `src/app/(storefront)/sitio/…` — `layout` (tema+metadata), `/sitio` (home publicado o fallback), `/sitio/menu`, `/sitio/carrito`, `/sitio/checkout`, `/sitio/pedidos`, `/sitio/pedidos/[id]`.
- Admin mínimo: `src/app/(platform)/storefront/page.tsx` — preview de borrador reutilizando el MISMO `SectionRenderer`, publicar real, y estados "capacidad pendiente de API" para lo bloqueado.

**Regla de render compartido:** público = revisión publicada → `StorefrontThemeProvider` → `SectionRenderer`; preview admin = borrador → mismos componentes. Un solo renderer.

**Arquitectura de rutas (decisión final — tres entornos):**

```text
/            → experiencia pública (portada publicada, /menu, /carrito,
               /checkout, /pedidos, /pedidos/[id], /cuenta, /creditos)
/panel       → operación diaria (shell común; módulos derivados de
               capabilities reales, jamás de role === "x"; las pantallas
               operativas — pedidos/POS/reparto/tickets — son el siguiente
               incremento y se muestran como CapabilityGate not_implemented,
               nunca simuladas)
/admin       → administración y gobierno (shell contract-driven existente:
               /admin/resources/*, /admin/backups, /admin/account,
               /admin/storefront)
```

Redirecciones de compatibilidad en `next.config.ts` (NO usarse en navegación, CTAs ni metadata nuevas): `/sitio/*→/*`, `/resources/*→/admin/resources/*`, `/backups/*→/admin/backups/*`, `/account→/admin/account`, `/storefront→/admin/storefront`. Post-login: `?next=` interno validado (sin open-redirect) con default `/` (público); el personal navega a `/panel` o `/admin` según sus permisos. **Temporal documentado:** `/cuenta` redirige a `/admin/account` hasta que la cuenta del cliente viva en el shell público. `/creditos` es página pública real (consume `/credits/me` + movimientos del backend).

**Páginas del storefront sin endpoint de listado:** el admin NO mantiene una lista hardcodeada de páginas sembradas como entidades — abre únicamente la portada conocida (`home`) y muestra "Selección de páginas: pendiente de API (`GET /storefront/pages` no existe)". Las rutas públicas (`/`, `/menu`, `/creditos`, …) existen como rutas de aplicación, no como espejo de registros en base.

## 3. Tema, marca y metadata

- `theme_tokens` publicados → variables CSS `--sf-*` en el contenedor raíz del sitio (server-rendered, sin FOUC). Fallback sin storefront publicado: tokens espejo del preset neutro `calido` del backend (documentado como bootstrap; Tony-Tony llega por configuración publicada o fixture demo).
- Fuentes: `font_family_key` → allowlist local con `next/font` (`display_slab`→Alfa Slab One, `modern_sans`→Archivo, `classic_serif`→Lora, `friendly_rounded`→Baloo 2). Nunca strings remotos como fuente.
- `BrandLockup`: logo (`/public/files/{logo_file_id}`) + `trade_name` + `slogan` de `/public/business`, con `font-brand` = fuente display del tema. Fallback sin logo: monograma con inicial. No hay campo backend para "fuente exclusiva del nombre": se usa la display del tema (fallback documentado).
- Metadata (`generateMetadata` en el layout del sitio): título/descripción con la cadena del §45.1 (meta de página → settings del sitio → trade_name); OG image y favicon vía `/public/files`. **Favicon seguro**: el server verifica `content-type` contra allowlist (`ico/png/webp/jpeg`); SVG u otro tipo → fallback estático de bootstrap (`/favicon.ico`). Cache-busting con el propio file id (UUID cambia al reemplazar).

## 4. Capacidades feature-gated y APIs faltantes (verificado contra OpenAPI actual)

| Capacidad | Estado backend | Tratamiento frontend |
|---|---|---|
| Media por sección (slots desktop/móvil, alt, focal) | Tabla sí, **sin endpoints** | Se renderiza si el payload la trae; sin botones de subir/reemplazar; aviso "pendiente de API" en admin |
| Editar/publicar header/footer (`header_config`/`footer_config`) | **Sin contratos ni endpoints** | Header/footer se derivan de business + settings públicos (read-only); sin editor de navegación |
| Plantillas `catalog.categories`, `banner.credits`, `banner.delivery` | **No existen** | No registradas; `UnknownTemplateFallback` para keys desconocidas |
| Hero split/background | Es UNA plantilla `storefront.hero` con `slides[].variant` | Un solo componente con variantes; carrusel solo si hay >1 slide activa |
| Reorder atómico de secciones | Solo `PUT` individual | Sin drag-and-drop persistente; edición de posición no se ofrece como transaccional |
| JSON Schema por plantilla | `GET /storefront/templates` solo devuelve key/version/label | Sin editor universal de formularios; inspector de lectura únicamente |
| Listado de páginas/revisiones | **No hay `GET /storefront/pages`** | Admin usa el set de páginas de sistema sembradas (documentado como gap) |
| Publicación programada | Columna sin job Taskiq | No se ofrece; si se muestra, deshabilitada "pendiente de backend" |
| Preview por enlace firmado | No existe | Preview solo con permiso (`storefront:preview`) |
| Perfiles cliente/repartidor (buscar por teléfono, `can_deliver`) | **Sin API** | Checkout captura contacto manual; sin vinculación simulada; feature pendiente |
| Payload público storefront tipado | Endpoint devuelve `dict` en OpenAPI | VM local con parseo defensivo; pedir al backend `response_model` tipado |
| Rastreo con repartidor | `MyOrderRead.courier` (solo `out_for_delivery`, decidido por backend) | Se muestra tal cual llega; el frontend no calcula visibilidad |

## 5. Reglas funcionales aplicadas

- **Cantidades**: steppers enteros `1..n`; los inputs nunca aceptan 0/negativos/fracciones; sin `Math.floor` correctivo (si algo no es entero, es error).
- **Sin invitado**: `/sitio/checkout` sin sesión → "Confirma tus datos para continuar" con login/registro; el carrito local se conserva (localStorage) y se vuelve al checkout.
- **Créditos**: solo presentación de lo que devuelve la API; el canje queda fuera de esta primera integración de UI de carrito (el backend lo soporta; se documenta como siguiente incremento).
- **Precios**: el resumen del carrito es referencia del menú; el total real lo produce el backend en el checkout (y el envío puede quedar "por confirmar" — `shipping_pending_review` se muestra explícito, alineado con H4/H5 pendientes).
- **Caché**: `serverApi` fuerza `no-store` (sesión, storefront, menú, negocio, pedidos). Puntos futuros de revalidación por tags/webhook documentados aquí: menú y payload publicado son los candidatos cuando el backend emita invalidaciones.

## 6. Fixtures demo

`NEXT_PUBLIC_STOREFRONT_DEMO=true` (false por defecto; no configurada en ningún compose/Dockerfile) habilita tokens Tony-Tony y un hero/anuncio de muestra SOLO cuando NO hay revisión publicada — una revisión publicada siempre gana. La portada demo se marca con un banner visible "DEMO — portada de muestra". Los productos del demo se hidratan del **menú real** (`/public/menu`): no existen precios/IDs ficticios y el checkout jamás puede enviar productos inventados. Assets del handoff: solo referencia visual, nunca media publicada.

**Favicon (política verificada):** decisión por MIME real (HEAD con timeout de 1.5 s), jamás por extensión; solo `ico/png/webp/jpeg`; SVG, error, timeout o HEAD no soportado → favicon local seguro; `generateMetadata` está envuelto en try/catch — la obtención del favicon nunca rompe la portada.

## 6-bis. Riesgos backend y decisiones defensivas del frontend

Cada capacidad cae en una de tres categorías: **disponible y conectada** (funcional), **parcial** (lectura/limitada con aviso) o **no disponible** (ni simulada ni persistida — oculta o "pendiente de servidor"). Patrón único: `CapabilityGate` (`components/storefront/CapabilityGate.tsx`), que distingue sin-permiso / endpoint-faltante / configuración-incompleta / no-implementada / error-temporal.

| Riesgo / faltante backend | Impacto visual | Comportamiento frontend | Feature gate / fallback | Condición para habilitar |
|---|---|---|---|---|
| H4 pago vs envío final | Un pedido podría verse "pagado" debiendo envío | `payment_status` se muestra tal cual llega, pero con contexto "envío por confirmar" cuando `shipping_pending_review`; subtotal/envío/total diferenciados; nunca "pagado por completo" con envío abierto | Texto contextual en carrito y seguimiento | Backend recompute al aprobar (H4 corregido) |
| H5 cancelar vs reembolsar | Cancelar podría parecer reembolso | No existe acción "cancelar" en el sitio; cuando se construya UI operativa, la advertencia "cancelar no garantiza reembolso automático" es obligatoria y el flujo de refund es separado | Acción no ofrecida aún | Endpoint/política de cancelación con resolución financiera |
| H6 deadlock/concurrencia | Doble cobro o error críptico | Submit deshabilitado durante el envío (checkout/publicar); 409 → "actualización simultánea… vuelve a intentarlo"; SIN reintentos automáticos económicos | Botones `disabled` + mensaje dedicado | Locks ordenados en backend |
| H7 ventanas de campaña | Secciones aparecerían/desaparecerían mal | El frontend **jamás** evalúa `visible_from/until` ni compara fechas: renderiza solo lo que el payload público entrega; preview etiquetado "la visibilidad real la decide el servidor" | Etiqueta en preview | `utc_now()` aware o TimeZone=UTC forzado |
| H8 SVG (favicon/logo/media) | XSS almacenado | Favicon y logo dinámicos SOLO raster verificado por content-type vía HEAD (`ico/png/webp/jpeg`); SVG → favicon local / monograma textual; jamás SVG remoto inline; sin "sanitización frontend" como solución | `resolveSafeFaviconPath`/`resolveSafeImagePath` | Política segura de entrega en el servidor de archivos |
| H9 instrucción de cobro | "Cobrar efectivo" sobre una transferencia | No hay UI de repartidor aún; regla registrada: nunca derivar "cobrar efectivo" de `status=pending` — solo de método explícitamente de cobro contra entrega | N/A (UI futura) | H9 corregido o método en el payload |
| H10 POS + transferencia | Venta "fantasma" en approved | No hay POS en frontend aún; regla registrada: verificar pago NO completa la venta; mostrar estado real + transición separada con permiso | N/A (UI futura) | Decisión de producto H10 |
| Media por sección | Heros/banners sin imagen | Se renderiza solo la media que entregue el payload; cero botones de subir/reemplazar; tarjeta `CapabilityGate` "endpoint de media no disponible"; placeholders neutros solo en demo/preview; sin Base64; assets del handoff jamás como media publicada | `CapabilityGate missing_endpoint` | Endpoints de `storefront_section_media` |
| Layout editable | Navegación no configurable | Header/footer derivados de `/public/business` (read-only); sin editor de navegación | Oculto en admin (lista pendientes) | Contratos `header_config`/`footer_config` + endpoints |
| Plantillas faltantes (`catalog.categories`, `banner.credits`, `banner.delivery`, `content.*`) | Bloques del handoff sin equivalente | No registradas ni publicables; sin JSON inventado; componentes internos solo bajo demo explícito | Registry cerrado a las 6 keys reales | Plantillas en el catálogo backend |
| Plantilla desconocida del backend | Página rota | Público: bloque omitido en silencio; preview: tarjeta diagnóstica con key+versión; jamás interpretar HTML/CSS/JS | `UnknownTemplateFallback` | Soporte agregado al registry |
| Reorder atómico | Orden corrupto en concurrencia | Sin drag-and-drop persistente; orden mostrado tal cual | No ofrecido | Endpoint de reorden transaccional |
| JSON Schema de plantillas | Editor de formularios | Solo inspector de lectura; sin editor universal inferido | No ofrecido | `model_json_schema()` expuesto en `/storefront/templates` |
| Publicación programada | Falsa automatización | "Programar" no existe como acción; `scheduled_publish_at` solo como metadato/pendiente; sin temporizadores frontend ni transiciones locales draft→published | Item en lista de pendientes del admin | Job Taskiq de publicación |
| Preview firmado | Compartir borradores | Preview solo con sesión+`storefront:preview`; sin rutas públicas de preview, sin "copiar enlace", sin QR | No ofrecido | Endpoint de enlace firmado temporal |
| API de perfiles | Operación de reparto/captura | Sin búsqueda de cliente por teléfono, sin editor de repartidores ni `can_deliver`, sin persistencia simulada; delivery manual = contacto capturado en el pedido | Avisos solo donde afectan la tarea | Endpoints de `customer_profiles`/`staff_profiles` |
| Binding `category` sin `category_id` | Sección vacía silenciosa | Público: la sección se elimina visualmente completa; preview: diagnóstico "fuente no configurada, requiere category_id" | Empty-state por modo | Validación semántica backend (§48) |
| Validación futura de CTAs | href peligrosos | Solo tipos de CTA conocidos; tipo desconocido o target inválido → el botón NO se renderiza (nunca href libre); bloqueados `javascript:/data:/blob:/file:/http:`; externos solo `https:` | `ctaHref` → null | Generalización de validación en backend |
| Créditos en el flujo web | Canje desde el carrito | El carrito actual solo compra con dinero; saldo/costo de canje/devoluciones JAMÁS se calculan en frontend; errores backend (`canje_sin_cliente`, `reembolso_excede_linea`, `canje_no_devolvible`, …) se muestran con su mensaje | Canje no ofrecido aún en UI | Incremento de UI de créditos consumiendo `/credits/me` |

## 7. Validaciones ejecutadas (2026-07-03)

- `npm run typecheck` ✅ · `npm run lint` ✅ · `npm run build` ✅ (26 rutas, `/sitio/*` y `/storefront` incluidas).
- Tests unitarios existentes (runner de Node): bootstrap, actions, public-auth, filters, list-query, detail-view, resource-form, export-rows, checklist, backups — **0 fallos**.
- `check:api`: los tipos se regeneraron en esta sesión desde el schema real (exportado importando la app backend, sin servidor ni DB); el paso con URL viva queda para cuando el stack esté arriba.
- NO ejecutado (fuera de alcance): migraciones backend, Docker, E2E. La integración con datos reales requiere aplicar las migraciones pendientes (incluida `e8b2c47f91a3`) y publicar una revisión del storefront.

## 8. Responsive y accesibilidad

Móvil primero en menú/carrito/checkout/seguimiento (barra de carrito fija inferior, tarjetas horizontales como el handoff); desktop con hero split de dos columnas, grilla de 3 tarjetas y header completo. Focus visible, botones semánticos, `aria-live` en el carrito, `prefers-reduced-motion` (carrusel sin autoplay y sin transiciones), estados: loading/empty/error/sin permiso/pendiente-de-API/sin-storefront/sin-logo/favicon-fallback/plantilla-desconocida.
