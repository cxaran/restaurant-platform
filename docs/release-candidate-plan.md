# Plan de Release Candidate — checklist verificable

**Especificación:** `docs/release-candidate-spec.md` (prevalece) · **Roadmap:** `GOALS.md`
**Commit base:** `272b9fd` · **Baseline (2026-07-04):** backend 533 tests / 0 failed (53 skipped
por infraestructura), frontend typecheck+lint+build verdes, Git limpio salvo docs del goal.

Estados por columna: `—` no aplica · `☐` pendiente · `☑` hecho con evidencia (comando/resultado
en `docs/implementation-completion-report.md` o en los reportes de validación).

| Etapa | Planeado | Implementado | Unit | Integración | Browser/E2E | Visual | Commit | Riesgo restante |
|---|---|---|---|---|---|---|---|---|
| 0. Baseline y documentación | ☑ | ☑ | — | — | — | — | ☐ | — |
| 1. Configurador de producto | ☑ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 2. Canje íntegro (money XOR credits) | ☑ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 3. /cuenta pública | ☑ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 4. Pagos vs fulfillment + panel | ☑ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 5. Códigos de descuento fijo | ☑ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 6. Storefront completo | ☑ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 7. Perfiles/registry/expiración/notif./reportes | ☑ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 8. Pruebas reales (migraciones/concurrencia/E2E) | ☑ | ☐ | ☐ | ☐ | ☐ | — | ☐ | |
| 9. Revisión visual y browser MCP | ☑ | ☐ | — | — | ☐ | ☐ | ☐ | |

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
