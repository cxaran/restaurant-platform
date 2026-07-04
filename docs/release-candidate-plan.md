# Plan de Release Candidate — checklist verificable

**Especificación:** `docs/release-candidate-spec.md` (prevalece) · **Roadmap:** `GOALS.md`
**Commit base:** `272b9fd` · **Baseline (2026-07-04):** backend 533 tests / 0 failed (53 skipped
por infraestructura), frontend typecheck+lint+build verdes, Git limpio salvo docs del goal.

Estados por columna: `—` no aplica · `☐` pendiente · `☑` hecho con evidencia (comando/resultado
en `docs/implementation-completion-report.md` o en los reportes de validación).

| Etapa | Planeado | Implementado | Unit | Integración | Browser/E2E | Visual | Commit | Riesgo restante |
|---|---|---|---|---|---|---|---|---|
| 0. Baseline y documentación | ☑ | ☑ | — | — | — | — | ☑ `201c3d3` | — |
| 1. Configurador de producto | ☑ | ☑ | ☑ 19 tests | ☐ | ☐ | ☐ | ☑ `4f4ed29` | validar E2E/visual |
| 2. Canje íntegro (money XOR credits) | ☑ | ☑ (`dee91bb` backend, `210a13f` frontend) | ☑ | ☑ migración PostGIS | ☐ | ☐ | ☑ | validar E2E |
| 3. /cuenta pública | ☑ | ☑ (`210a13f`) | ☑ | ☐ | ☐ | ☐ | ☑ | validar E2E/visual |
| 4. Pagos vs fulfillment + panel | ☑ | ☑ (`ebbeeef` backend, `6d65024` panel) | ☑ | ☑ migración PostGIS | ☐ | ☐ | ☑ | validar E2E |
| 5. Códigos de descuento fijo | ☑ | ☑ (`d81c…` backend 27 tests, `008b7e2` UI) | ☑ | ☑ migración PostGIS | ☐ | ☐ | ☑ | validar E2E |
| 6. Storefront completo | ☑ | ☑ (`3c98b4c` backend + frontend final) | ☑ | ☑ migración PostGIS | ☑ Playwright F | ☑ | ☑ | brand_primary por contrato (riesgo doc.) |
| 7. Perfiles/registry/expiración/notif./reportes | ☑ | ☑ (backend + navegación/reportes frontend) | ☑ (suite 599/0) | ☑ | ☑ (nav dinámica verificada) | ☑ | ☑ | notif. a broker (futuro) |
| 8. Pruebas reales (migraciones/concurrencia/E2E) | ☑ | ☑ | ☑ suites SQLite y PG | ☑ BD virgen + 5 carreras PG + check:api vivo + E2E integral 49/49 | ☑ Playwright A–G 8/8 | — | ☑ (`b78c6bf`+spec) | — |
| 9. Revisión visual y browser MCP | ☑ | ☑ | — | — | ☑ MCP 5 roles × 3 viewports | ☑ 4/5, P0/P1 corregidos | ☑ | 2×P3 documentados |

## Cierre

**Release Candidate: criterios de la sección 14 del spec cumplidos** (2026-07-04). Stack
Docker aislado levantado y validado; migraciones reales; check:api vivo sin drift; suites
verdes; concurrencia PG; Playwright A–G; Chrome DevTools MCP por roles y viewports;
fidelidad ≥4/5 sin P0/P1; reportes Markdown reales; Git limpio con commits por concern.

## Estado de partida por etapa (hallazgos del inventario)

- **Etapa 1:** el menú agrega directo al carrito con `modifiers: []`; no existe configurador.
  Backend valida grupos requeridos/min-max (defensa final probada).
- **Etapa 2:** `purchase_mode` sólo por línea; el backend **permite mezclar** money/credits en un
  pedido y aplicar envío a pedidos de canje — hay que introducir la invariante de pedido íntegro
  (backend primero, luego UI). `CheckoutForm`/`PosView` hardcodean `purchase_mode: "money"`.
- **Etapa 3:** `/cuenta` redirige a `/admin/account` (temporal documentado) — construir la real.
- **Etapa 4:** H1–H10 corregidos en backend (auditoría §1); falta resolución financiera
  tri-estado de cancelación (hoy sólo `acknowledge_paid_payments`), cola de reembolsos
  pendientes visible, y pantalla de despacho `/panel/entregas`.
- **Etapa 5:** módulo completo inexistente (modelos, migración, permisos, endpoints, UI).
- **Etapa 6:** media/reorder/schedule/layout/templates base EXISTEN; faltan preview firmado,
  regla de supersesión de programación, payload público tipado, quitar espejos header/footer,
  y templates `content.image_text`/`info_cards`/`faq`.
- **Etapa 7:** perfiles API EXISTE; faltan ResourceDefinitions del dominio, navegación
  declarativa de módulos especializados, expiración de `submitted` (60 min), notificaciones
  A/C/G, rate limiting de checkout/código y reportes (ventas por hora, más vendidos).
- **Etapa 8:** suite canónica verde en SQLite; faltan migraciones+suite contra PostGIS aislado,
  concurrencia con dos sesiones PG y E2E Playwright de dominio (sólo existe bootstrap).
- **Etapa 9:** sin evidencia browser previa; handoff local en `.design-handoff/tony-tony/`.

## Criterio de cierre (sección 14 del spec)

RC se declara sólo con: stack Docker aislado levantado; migraciones reales aplicadas;
`check:api` contra backend vivo sin drift; suites backend/frontend verdes; concurrencia PG
ejecutada; E2E browser real (escenarios A–G); roles y 3 viewports probados con Chrome DevTools
MCP; comparación con handoff ≥4/5 y sin P0/P1; reportes Markdown reales; Git limpio con commits
lógicos.
