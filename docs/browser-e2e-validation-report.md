# Reporte de validación integrada y en navegador — Release Candidate

**Fecha:** 2026-07-04 · **Commit probado:** ver «Estado final» (la validación corre sobre la
punta de `main` durante el cierre del RC; los hashes exactos quedan en el historial).

## Entorno

- **Stack aislado:** `docker compose -f compose.e2e.yml` — nginx (127.0.0.1:31080) →
  frontend (Next.js prod) + backend (FastAPI prod), PostGIS 16-3.5, Redis 7, Mailpit
  (API en 127.0.0.1:31025). Migraciones aplicadas por el servicio `migrate`
  (alembic upgrade head) antes de arrancar el backend. Base de datos
  `restaurant_platform_e2e_test`, datos 100% sembrados por las pruebas — sin datos reales.
- **Stack ligero adicional** (E2E integral por HTTP): uvicorn local :31800 + PostGIS
  desechable (contenedor `rc-mig-check`, db `integral_e2e_test` migrada desde cero) +
  Redis desechable (:16379).
- **Versiones:** Node v25.9.0, Python 3.11.9 (venv backend), Docker 29.5.3,
  Playwright Chromium (projecto `chromium` del config canónico).

## Comandos ejecutados y resultados

| Validación | Comando | Resultado |
|---|---|---|
| Migraciones en BD virgen | `alembic upgrade head` (db nueva `rc_fresh_test`) | cadena completa hasta `e2a9c56b41d7` OK |
| Up/down/up de cada migración nueva | `alembic upgrade/downgrade` sobre PostGIS | `b3f7a91d64c2`, `c5e8d73a91f4`, `d81c4f26ae93`, `e2a9c56b41d7` reversibles |
| Suite backend (SQLite) | runner de `canonical_suite` | 599 tests · 0 fallos (53 skips solo-PG) |
| Suite backend (PostgreSQL real) | ídem con `TEST_POSTGRES_URL` | 599 tests · 597 pass · 2 skips · 0 fallos |
| Concurrencia 2 sesiones PG | `unittest backend.tests.test_concurrency_pg` | 5/5: créditos, cupo diario, tomar entrega, redención de código, reembolso por línea — un ganador y un conflicto controlado |
| check:api contra backend VIVO | `OPENAPI_URL=http://127.0.0.1:31080/api/openapi.json npm run check:api` | **Sin drift** |
| Frontend canónico | typecheck, lint, 13 suites node:test, build | verdes (184 tests unitarios) |
| E2E integral HTTP | `python backend/tests/e2e_integral_stack.py` (stack ligero) | **49/49 pasos OK**: bootstrap → catálogo+modificadores → storefront (media/layout/publish/payload público) → créditos → mezcla rechazada → código de descuento (cotizar/reservar/consumir/reuso rechazado) → transiciones → ticket con descuento (total 360) → POS efectivo y transferencia → H5 → reportes |
| E2E Playwright bootstrap | `npm run test:e2e:bootstrap` (suite admin/auth previa) | ver sección Playwright |
| E2E Playwright dominio (A–G) | `npm run test:e2e:rc` | ver sección Playwright |

## Incidencias encontradas y corregidas durante la validación

1. **P0 — portada `/` devolvía 500 en el stack real**: `SectionRenderer` (Server Component)
   pasaba un callback `renderCta` al carrusel cliente; React no serializa funciones a través
   de esa frontera. Corregido renderizando los CTA en servidor (commit
   `fix(storefront): hero CTAs render server-side`). Solo reproducible con stack integrado —
   la suite estática no lo cubría.
2. **Assert desactualizado del E2E integral**: el ticket ahora incluye la línea de descuento
   (total 460−100=360); el script se actualizó para asertar el descuento.
3. **Convivencia de módulos PG de la suite**: los tests de concurrencia limpian la base
   `*_test` al salir (los teardowns de `test_backups` chocaban con filas residuales).
4. **GeoAlchemy2 + TypeDecorator**: los hooks DDL de GeoAlchemy2 introspeccionan con
   `dialect=None` y sondean `spatial_index`/`use_typmod`; los tipos geoespaciales del
   proyecto ahora los toleran (antes `create_all/drop_all` sobre PG fallaba).

## Playwright — escenarios A–G del spec RC

`frontend/e2e/restaurant.rc.spec.ts` (`npm run test:e2e:rc`, `E2E_BASE_URL=http://127.0.0.1:31080`):
**8/8 en verde en tres corridas consecutivas** (7.0 s la final). Preparación por API
(bootstrap condicional, catálogo con grupo requerido, storefront publicado, roles/usuarios,
créditos, código) y flujos de USUARIO por UI real:

- **A** Portada publicada → configurador (dialog, «Media») → agregado rápido → carrito con
  modificador → login conservando carrito → cupón RCPROMO (−$50 visible) → pedido pickup.
- **B** Cajero Tomar→Aprobar, cocina A cocina→Listo, cajero Entregado; redención `consumed`;
  segundo quote → 422 `codigo_ya_usado`.
- **C** Canje íntegro: no-canjeable bloqueado con explicación, checkout credits solo-pickup,
  saldo exacto en `/creditos`; 422 `modo_compra_mixto` y `canje_sin_envio` por API.
- **D** Reparto: shipping finalizado → repartidor toma → inicia → **recarga y la entrega
  persiste** (endpoint real) → cobro y entrega; colas vacías después.
- **E** Verificar transferencia NO completa un pedido operativo (queda `approved` + paid);
  counter/counter H10 sí auto-completa (decisión); cancelar pagado exige resolución →
  «Reembolso pendiente» → aparece en la cola de conciliación.
- **F** Editar hero → publicar → `/` refleja; preview firmado consumido SIN sesión (200);
  programar → «Programada para…» → cancelar → borrador.
- **G** Cliente sin módulos en `/panel` y `/admin`; cocina 404 en códigos; cajero 403 en
  permisos de roles; cliente 403 en `/orders`; pedido ajeno → 404.

Bugs reales corregidos por esta corrida: parseo de `204 No Content` en `requestJson`
(la UI reportaba fallo en operaciones exitosas) y carrera de doble borrador en
`get_or_create_draft` (dos revisiones con el mismo número; serializado con `FOR UPDATE`).

## Validación browser con Chrome DevTools MCP

**Instancia:** Chrome dedicado del MCP (contextos aislados por rol: visitante, cliente,
cajero, repartidor, admin — sin cookies personales). **Usuarios sembrados** (por el spec RC,
sufijo del run `3X02G`): `admin.rc@`, `cliente.rc@`, `cajero.rc@`, `cocina.rc@`,
`repartidor.rc@` `example.com`. Tony-Tony aplicado COMO CONFIGURACIÓN (trade name + slogan
vía `PATCH /business/profile`, tema preset «cálido» + acento vía `POST /storefront/theme`).

| Rol · pantalla | Viewport | Consola | Red | Evidencia |
|---|---|---|---|---|
| Visitante · `/` fallback | 1440/768/390 | 1 error (favicon 404 → **corregido**) | resto 200 | `visitante-home-fallback-*.png` |
| Visitante · `/` publicada | 1440 | limpia | 200 | `visitante-home-publicada-1440.png` |
| Visitante · `/menu` + configurador | 1440 | limpia | 200 | `visitante-configurador-1440.png` |
| Cliente · login → `/cuenta` | 1440 | limpia | 200 | `cliente-cuenta-1440.png` |
| Cajero · `/panel/pedidos` (cola H5) | 1440 | limpia | 200 | `cajero-panel-pedidos-1440.png` |
| Repartidor · `/panel/reparto` | 390 | limpia | 200 | `repartidor-panel-reparto-390.png` |
| Admin · `/admin` (nav dinámica + Módulos) | 1440 | limpia | 200 | `admin-dashboard-1440.png` |
| Admin · `/admin/reportes` | 1440 | limpia | 200 | `admin-reportes-1440.png` |
| Admin · `/admin/storefront` | 1440 | 1 issue a11y (4 campos sin id/name — P3 documentado) | 200 | `admin-storefront-editor-1440.png` |

Persistencia tras refresh: cubierta por Playwright D (entrega del repartidor tras reload)
y sesión por cookie httponly en todos los roles. Sin errores de hidratación, CORS, 401/403
inesperados ni 500 tras los fixes. Hallazgos y estado: ver
`docs/tony-tony-visual-fidelity-review.md` (P0/P1/P2 corregidos; 2×P3 documentados).

## Estado final

Con los fixes aplicados (hero server-side, header móvil, favicon, 204, doble borrador), el
criterio de aprobación E2E del roadmap se cumple: todos los escenarios pasan, ninguna acción
revela datos ajenos, no existe pedido híbrido y no hay automatizaciones falsas de pago,
envío, descuento o publicación.
