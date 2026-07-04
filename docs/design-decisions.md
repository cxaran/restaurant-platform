# Decisiones de diseño — Release Candidate

Decisiones de producto y arquitectura aplicadas durante el cierre del RC. Cada una indica el
porqué y dónde vive la implementación. Complementa `GOALS.md` (roadmap) y
`docs/release-candidate-spec.md` (spec, prevalece).

## 1. Tres entornos: `/` público, `/panel` operativo, `/admin` administrativo

- `/` es la portada publicada del Storefront + flujos del cliente (`/menu`, `/carrito`,
  `/checkout`, `/pedidos`, `/cuenta`, `/creditos`). `/sitio` y las rutas admin legadas existen
  SOLO como redirects en `frontend/next.config.ts` — jamás en navegación, CTAs ni metadata.
- `/panel` es operación rápida orientada a pedidos; sus módulos se filtran por permisos reales
  de la sesión (`session.permissions`), nunca por `role === "x"` (cero ocurrencias en `src/`).
- `/admin` es el shell contract-driven: navegación derivada de `GET /api/v1/resources` y CRUD
  genérico en `/admin/resources/[name]`. Un administrador puede operar `/panel` si sus
  capabilities lo permiten; cocina/cajero/repartidor no reciben `/admin` por ser empleados.

## 2. Crédito íntegro (money XOR credits)

- Un pedido es 100% dinero o 100% créditos. Se rechazan: mezcla de líneas (`pedido_mixto`,
  `modo_compra_mixto`), pago de diferencia, envío en canje (`canje_sin_envio`), modificadores
  con costo en canje (`modificador_monetario_en_canje`) y códigos de descuento en canje.
- Capas: UI (modo explícito de carrito, opción oculta sin sesión/saldo) → servicio
  (`pricing_service`/`order_service`) → BD (`orders.purchase_mode` + CHECK
  `orders_credits_mode_no_money`). El backend jamás confía en la UI.
- El POS es una operación monetaria de un paso: rechaza líneas de canje (`pos_solo_dinero`);
  el canje presencial se captura como pedido normal (captura → completar).
- Ante rechazo por carrera (saldo consumido por otra sesión) la UI muestra el error del
  backend y CONSERVA carrito y modo — nunca cae a dinero automáticamente.

## 3. Pago confirmado ≠ pedido completado

- `completed` significa fulfillment real (entrega física / pickup entregado / mostrador
  entregado). Verificar una transferencia solo confirma el pago; el pedido sigue su ciclo.
- Única auto-transición (H10, decisión de producto reversible): venta `counter`+`counter`
  aprobada y totalmente pagada se completa al verificar el pago, con nota de auditoría —
  el mostrador inmediato es "cobrar y entregar".
- Efectivo contra entrega: el cobro se registra al completar la entrega (repartidor), con
  monto recibido y cambio calculados por el backend. `collection_instruction` solo dice
  "cobrar efectivo" para métodos realmente de efectivo (H9) — una transferencia pendiente
  jamás genera instrucción de cobro.
- H4: al congelar el total en la aprobación se recalcula `payment_status`; un pago previo
  que quedó corto por el envío regresa a `pending`. La UI de seguimiento muestra
  "envío por confirmar" mientras el total no esté congelado.

## 4. Cancelar no es reembolsar (H5)

- Cancelar con dinero cobrado exige resolución explícita en el contrato de transición:
  `refund_now` | `refund_pending` | `retain` (con motivo obligatorio y auditable).
- La decisión se persiste (`orders.cancellation_money_resolution/_note`, CHECKs) y alimenta
  la cola de conciliación `GET /orders/cancellations/pending-refunds`, que lista los
  cancelados con cobro cuya devolución no cubre lo cobrado. `retain` queda fuera de la cola.
- El reembolso sigue siendo un flujo separado (`/payments/{id}/refunds`), nunca implícito.

## 5. Códigos de descuento: fijos y web-only

- Regla única: descuenta X si el subtotal monetario elegible (productos + modificadores)
  alcanza Y. Sin porcentajes, sin envío gratis, sin límites globales, sin campañas, sin
  stacking, sin generador automático. El módulo se llama `discount_codes`, no "promotions".
- Solo `source=online` con cliente autenticado; una vez por usuario por código (único parcial
  en BD); un código activo por pedido (único parcial); reserva transaccional en el checkout,
  consumo en `completed`, liberación en cancelación/expiración. Un reembolso posterior a
  `completed` NO reactiva el código (se compensa con otro código, opcionalmente personal).
- Las redenciones guardan snapshots inmutables (código, nombre, montos): editar un código
  afecta solo usos futuros. El descuento vive como `order_adjustment` ligado 1:1 a la
  redención — el histórico jamás se reconstruye leyendo la definición vigente.
- El cliente solo envía el string del código; montos y elegibilidad los decide el backend.

## 6. Storefront dinámico por contratos

- El handoff Tony-Tony define la intención visual; la plataforma no conoce Tony-Tony: los
  valores viven en presets/tokens (`theme_tokens` → variables `--sf-*`), BrandLockup, logo,
  slogan y metadata son dinámicos. El fixture demo requiere opt-in explícito
  (`NEXT_PUBLIC_STOREFRONT_DEMO=true`) y pierde contra cualquier revisión publicada.
- Plantillas registradas en backend con JSON Schema (`extra="forbid"`); el editor genera
  formularios desde esos schemas (SchemaForm) — sin HTML/CSS/JS libre, CTAs con allowlist
  (`javascript:`/`data:`/`http:` bloqueados; externos solo HTTPS).
- Publicación versionada draft → published → archived; publicación programada vía Taskiq
  (validación inmediata al programar; una revisión que dejó de validar vuelve a draft).
  Regla de supersesión: una programación antigua se cancela si algo más reciente se publicó
  después de programarla — las campañas viejas no pisan cambios nuevos.

## 7. SVG público prohibido (H8)

- Ningún perfil de archivo acepta SVG; favicon/logo dinámicos solo `ico/png/webp/jpeg`,
  verificados por magic bytes en backend y por content-type en frontend (HEAD con timeout).
  La "sanitización" por regex se considera evadible y no es defensa. Se revisará solo cuando
  exista política de entrega segura del lado servidor (CSP sandbox / attachment).

## 8. Fechas: política de conexión UTC (H7)

- `utc_now()` del core devuelve naive-UTC; todas las columnas del dominio son `timestamptz`.
  La conexión PostgreSQL fija `TimeZone=UTC` en `connect_args`, de modo que el instante
  insertado es correcto sin depender del TZ del servidor. El frontend jamás evalúa ventanas
  de visibilidad: renderiza lo que el payload público entrega.

## 9. Roles y autorización en tres capas

- Frontend oculta por capabilities (experiencia); backend autoriza cada operación (permiso +
  ownership + transición); la BD mantiene invariantes (CHECKs, únicos parciales, FKs, locks
  ordenados por id — H6). Ocultar un botón nunca es defensa.
- Los permisos se declaran en código (`SECURITY_GROUPS`) y los tests-guarda
  (`test_security_catalog`, `test_resources_capabilities`, `test_bootstrap_routes`) fallan en
  CI ante cualquier cambio no consciente del catálogo.

## 10. Responsive y accesibilidad

- Mobile-first en el sitio público (bottom-sheet para el configurador, barra de carrito fija);
  desktop con hero split y grillas. Viewports de validación: 390×844, 768×1024, 1440×900.
  `prefers-reduced-motion` respetado (sin autoplay agresivo); foco visible; diálogos con
  `role="dialog"`/`aria-modal`, cierre con Escape y focus management.
