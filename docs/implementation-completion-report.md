# Reporte de implementación — Release Candidate

**Estado:** COMPLETADO (2026-07-04). Baseline: commit `272b9fd` (suite backend 533/0).
Cierre: suite backend **599 tests / 0 fallos** en SQLite Y contra PostgreSQL real
(597 pass + 2 skips justificados), frontend canónico verde (typecheck, lint, 184 tests,
build), `check:api` contra backend vivo sin drift, concurrencia PG 5/5, E2E integral HTTP
49/49, Playwright A–G 8/8, validación browser por roles con Chrome DevTools MCP y revisión
visual 4/5 contra el handoff (P0/P1 corregidos). Detalle de validaciones:
`docs/browser-e2e-validation-report.md` y `docs/tony-tony-visual-fidelity-review.md`.

## Etapa 0 — Baseline y documentación (`201c3d3`)

- Versionados `GOALS.md` (nota de jerarquía: el spec prevalece) y
  `docs/release-candidate-spec.md`.
- Creados `docs/deployment-runbook.md`, `docs/release-candidate-plan.md`,
  `docs/contract-architecture-audit.md`; `CLAUDE.md` documenta el dominio restaurante.
- Inventario factual completo backend/frontend (brechas por etapa en el contract audit).
- Validación: suite backend 533 tests / 0 fallos (53 skips de infraestructura); typecheck,
  lint y build frontend verdes; Git limpio.

## Etapa 1 — Configurador de producto (`4f4ed29`)

- `core/storefront/configurator.ts` (lógica pura: grupos requeridos, min/max,
  single/multiple, round-trip de edición, precio estimado de presentación, enteros estrictos)
  + `cart-lines.ts` (firma de línea, `replaceLine` con fusión).
- `ProductConfigurator.tsx`: modal/bottom-sheet accesible (dialog, Escape, focus, body-lock),
  radio/checkbox según `selection_type`, contador por grupo, stepper entero, modo edición.
- `MenuView`: grupos requeridos → configurador obligatorio; solo opcionales → agregado rápido
  + "Personalizar"; carrito muestra modificadores y permite editar precargado.
- Validación: 19 tests nuevos (node:test) en `check:canonical`; typecheck/lint/build verdes.

## Etapa 2 — Pedido íntegro money XOR credits (backend `dee91bb`)

- `price_cart` valida homogeneidad (`pedido_mixto`) y rechaza modificadores con costo en
  canje (`modificador_monetario_en_canje`); `create_order` exige cliente y prohíbe delivery
  en canje (`canje_sin_envio`); POS rechaza canje (`pos_solo_dinero`).
- Contrato: `CheckoutRequest`/`CaptureRequest.purchase_mode` + validación de coherencia
  (`modo_compra_mixto`); `purchase_mode` expuesto en OrderRead/MyOrderRead/OrderListItem.
- Migración `b3f7a91d64c2` (columna + CHECKs + backfill del histórico) validada contra
  PostGIS real: upgrade → downgrade → re-upgrade.
- Validación: tests dirigidos nuevos; suite completa 538/0. Tipos OpenAPI regenerados contra
  backend vivo.
- Frontend (modo credits en carrito/checkout): ver etapa en curso.

## Etapa 4 (parcial backend) — Resolución financiera al cancelar (H5) (`ebbeeef`)

- Transición a `cancelled` con pagos cobrados exige `payment_resolution`
  (refund_now | refund_pending | retain + motivo); persistida con CHECKs y en bitácora.
- Cola de conciliación `GET /orders/cancellations/pending-refunds` (payments:read).
- Migración `c5e8d73a91f4` validada contra PostGIS. Suite 540/0.

## Etapas 2/3 frontend (`210a13f`)

- Carrito con modo persistido money/credits (migración tolerante de storage), toggle sólo
  con sesión+saldo, checkout credits pickup-only sin fallback automático; `/cuenta` pública
  real con perfil/pedidos/direcciones/créditos/logout. 12 tests nuevos.

## Etapa 4 panel (`6d65024`)

- Diálogo accesible de cancelación con resolución H5; cola de conciliación en
  /panel/pedidos; /panel/entregas (despacho + asignación manual);
  /panel/reparto/[delivery_id] recuperable tras refresh; todos los tipos del panel
  migrados a aliases generados (panel-contracts.ts).

## Etapa 5 (`d81c4f26ae93` + `008b7e2`)

- Backend completo de códigos fijos web-only (27 tests) y UI: cupón en checkout money
  (cotización real, invalidación al cambiar carrito/modo), descuento snapshot en pedido
  público, /admin/codigos-descuento con CRUD, vigencias, cliente objetivo y redenciones.

## Etapa 6 backend (`3c98b4c`)

- Supersesión de programación con auditoría y razón legible; preview firmado temporal
  (crear/consumir/invalidar); payload público tipado (PublicStorefrontPage); plantillas
  content.image_text / info_cards / faq. Migración e2a9c56b41d7 validada. Suite 571/0.

## Etapa 7 (en curso)

- Implementado por el orquestador: expiración de `submitted` web a 60 min (job Taskiq
  `orders.expire_submitted`, libera créditos/códigos/cupo, respeta pedidos con cobro),
  notificaciones A/C/G best-effort post-commit (Mailpit en dev), rate limiting de
  checkout y cotización de códigos (IP+usuario), reportes `/reports/sales-by-hour` y
  `/reports/top-products` desde snapshots (finances:read). E2E integral actualizado a
  pedido íntegro + códigos.
- En agente: ResourceDefinitions del dominio + navigation_modules por capabilities.

## Etapas 6/7 frontend y cierres (`b78c6bf`…)

- Frontend final: catálogo `{resources, navigation_modules}` consumido (PlatformShell con
  grupo Módulos; `/panel` desde el contrato), Storefront tipado sin espejos (view-models
  derivados del contrato; HEADER/FOOTER_SCHEMA eliminados), renderer con
  image_text/info_cards/faq, estado real de programación + razón de supersesión, enlace de
  preview firmado en el editor, `/admin/reportes`.
- Etapa 8: tests de concurrencia PG (5 carreras, dos sesiones), suite completa contra
  PostgreSQL real (compatibilidad GeoAlchemy2 en los TypeDecorator), migraciones en BD
  virgen, E2E integral 49 pasos, spec Playwright A–G (8/8) con dos fixes reales (204 en
  requestJson; carrera de doble borrador serializada con FOR UPDATE).
- Etapa 9: validación browser por roles/viewports con Chrome DevTools MCP; P0 (hero 500
  server→client), P1 (header móvil encimado) y P2 (favicon 404) corregidos; Tony-Tony
  aplicado como configuración para la revisión de fidelidad (4/5 global).

## Riesgos restantes (fuera del alcance del RC)

1. `brand_primary` del tema no es configurable por contrato (solo preset+accent): el rojo
   exacto Tony requiere extender `ThemeCreate`.
2. Programar una publicación y luego cancelar puede dejar dos borradores conviviendo
   (observación del E2E; sin pérdida de datos — decidir política de borrador único).
3. Notificaciones A/C/G son best-effort en hilo; en volumen alto convendría moverlas al
   broker Taskiq.
4. P3 documentados: 4 campos del editor sin id/name; banner de checklist puede tapar una
   tarjeta del dashboard hasta descartarse.
5. Datos de demo acumulados en el stack E2E (corridas repetidas) — irrelevante fuera del
   entorno desechable.
