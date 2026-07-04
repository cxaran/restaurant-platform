# Plan: cierre de huecos admin (backend listo sin frontend)

> Documento de TRABAJO compartido entre sesiones. Marcar cada casilla al
> completar Y VERIFICAR (no antes). Si otra sesión toma una fase, anotarlo en
> la línea "En curso:". Última actualización: 2026-07-04.

Origen: análisis de cobertura backend↔admin (conversación 2026-07-04). Vistas
especiales existentes: Resumen, Negocio, Catálogo, Editor del sitio, Zonas de
entrega, Códigos de descuento, Reportes, Backups + recursos genéricos
(`/admin/resources/*`). Los huecos son capacidades del backend sin UI (o con
backend incompleto, marcado como tal).

## Reglas transversales (aplican a TODAS las fases)

- Tras cualquier cambio de contrato backend: reconstruir backend del stack
  (`docker compose -f compose.e2e.yml up -d --build --no-deps backend`),
  `npm run generate:api` con `OPENAPI_URL=http://127.0.0.1:31080/api/openapi.json`
  y versionar `src/generated/openapi.ts` (guard `npm run check:api`).
- Permisos NUEVOS: alta en su `SecurityGroup`, registrar en `SECURITY_GROUPS`
  (`security/catalog.py`) y actualizar `tests/test_security_catalog.py`
  (asserts de lista EXACTA). Recursos nuevos: actualizar
  `tests/test_resources_capabilities.py`.
- Nada de lógica de negocio en frontend: cobertura, topes y validaciones las
  decide el backend; la UI muestra el mensaje real del envelope de error.
- Verificación mínima por fase: (a) unittest de los módulos tocados,
  (b) `tsc --noEmit` + eslint de archivos tocados, (c) flujo REAL contra el
  stack e2e (API o navegador), (d) al cierre de todo: suite canónica backend
  + `npm run check:canonical` + rebuild frontend del stack.

---

## Fase 1 — Explorador de pedidos (admin)

**En curso: OTRA SESIÓN ya implementó parte** (no duplicar): `GET /orders` con
`OffsetPage`, multi-estado, `source`, `fulfillment_type`, búsqueda `q` (folio/
cliente/teléfono/destinatario/dirección), `created_from`/`created_to`, y
`GET /orders/status-counts`; el tablero `/panel/pedidos` ya tiene presets de
fecha y paginación (PAGE_SIZE 30).

Pendiente (deltas sobre lo anterior):

- [ ] 1.1 `OrderListItem`: enriquecer con datos finales — `approved_at`,
      `approved_by_name` (join a `User.name`; resolver en el endpoint, no en
      el schema), `payment_method_label` (snapshot del primer pago `paid`;
      existe helper en `payment_service.py:232`), `shipping_total_amount`,
      `completed_at`/`cancelled_at`. Mantener la lista ligera: nada de líneas.
- [ ] 1.2 Bitácora expuesta al equipo: `OrderStatusHistoryRead`
      (previous/new_status, reason_code, internal_note, customer_visible_note,
      `changed_by_name`, changed_at) como `status_history` en `OrderRead`.
      La vista del CLIENTE sigue viendo solo `visible_notes` (ya existe).
- [ ] 1.3 Detalle del panel: línea de tiempo con la bitácora (quién y cuándo
      aprobó/preparó/completó, motivo de cancelación, notas por transición).
- [ ] 1.4 Filtros restantes en `GET /orders`: `purchase_mode`,
      `payment_status`, `customer_user_id` (este último lo necesita la ficha
      de cliente de la Fase 3).
- [ ] 1.5 Export CSV del listado filtrado (mismo criterio que el export de la
      tabla genérica de recursos; si conviene, botón "Exportar" en el tablero
      que pagine `GET /orders` con los filtros vigentes).
- [ ] 1.6 Verificar: unittest `test_orders`/`test_order_routes`; en vivo:
      filtrar por fechas+estado+búsqueda, paginar, ver aprobador/método de
      pago/envío en la lista y bitácora completa en el detalle.

## Fase 2 — Finanzas admin + reembolsos ejecutables

Backend COMPLETO (no tocar salvo bugs): `GET/POST /finances/entries`
(manual_income/expense/delivery_expense/adjustment, filtros from/to/direction/
entry_type, limit≤200), `POST /finances/entries/{id}/void` (motivo),
`POST /finances/entries/{id}/attachments` (comprobantes, files kind=document),
categorías (`finance_categories` recurso + endpoints), `GET /finances/summary`,
`POST /payments/{id}/refunds` (parcial por línea, topes acumulados),
`POST /orders/{id}/credit-refunds`.

- [x] 2.1 Módulo de navegación `finanzas` (+ test_resources_capabilities
      actualizado) y página `/admin/finanzas` con gate `finances:read`.
- [x] 2.2 Vista Finanzas (`FinanzasView.tsx`): summary con rango, libro con
      filtros (rango/dirección/tipo) y "cargar más", adjuntos como enlaces.
- [x] 2.3 Alta manual (`finances:record`): dirección/tipo/categoría/monto/
      fecha/concepto/contraparte + comprobante opcional (document + attach).
- [x] 2.4 Anulación con motivo inline (`finances:void`); anulados atenuados
      con su motivo visible.
- [x] 2.5 `PaymentRefundControl` (RefundControls.tsx) en OrderPayments:
      monto+motivo+ref/banco y asignación por línea opcional.
- [x] 2.6 `CreditRefundControl` para pedidos 100% créditos (línea+cant+motivo).
- [x] 2.7 Cola H5 accionable: cada pendiente se expande y reembolsa ahí mismo
      (carga pedido+pagos on demand); al cubrir, sale de la cola.
- [x] 2.8 Verificado: unittest payments+finances (25 OK); EN VIVO por API:
      gasto→libro/summary, anulación (voided + summary lo excluye), y ciclo
      H5 completo: capture→approve→pago cash→verify→cancel refund_pending→
      aparece en cola→POST refund→sale de la cola. `/admin/finanzas` sirve 200
      autenticado. (Pendiente menor: smoke visual con navegador en 6.3.)

## Fase 3 — Clientes (ficha 360) y ajustes de créditos

Backend COMPLETO: `GET /profiles/customers?search=`, `GET/PUT
/profiles/customers/{user_id}` (notas internas), `GET /credits/users/{id}`,
`GET /credits/users/{id}/movements`, `POST /credits/adjustments` (motivo
obligatorio). Falta SOLO el filtro `customer_user_id` en `GET /orders` (1.4).

- [x] 3.1 Módulo `clientes` (navigation + test actualizado) y página
      `/admin/clientes` (gate profiles:read): búsqueda por nombre o teléfono
      (auto-detección de dígitos) + lista de resultados.
- [x] 3.2 Ficha (`ClientesView.tsx`): contacto, notas internas editables
      (PUT upsert completo para no borrar campos), créditos y pedidos del
      cliente vía `GET /orders?customer_user_id=` (filtro AÑADIDO al backend
      en `_apply_order_list_filters` — cubre también 1.4 parcialmente).
- [x] 3.3 Ajuste manual (`credits:manual_adjust`): delta ± + motivo; el saldo
      se rederiva del ledger y el movimiento aparece en la lista.
- [x] 3.4 Verificado EN VIVO por API: upsert de perfil con notas, ajuste
      +100 (entry manual_adjustment; saldo recalculado), y 29 pedidos del
      cliente filtrados por `customer_user_id`. tsc+eslint OK; openapi
      regenerado (query param nuevo). Tests orders/rutas/capacidades: 73 OK.

## Fase 4 — Métodos de pago (ÚNICO con backend nuevo)

Hoy `payment_method_configs` no tiene CRUD ni recurso: solo lecturas
públicas/POS. Se administra por BD. Piezas:

- [x] 4.1 Schemas por operación en `schemas/payment.py` (ListItem con ui.list/
      filter, Read completo, Create con ui.form —code con patrón `[a-z0-9_]`—
      y Update PATCH parcial; el `code` es INMUTABLE).
- [x] 4.2 Permiso nuevo `payments:manage_methods` en `PaymentPermissions` +
      test_security_catalog actualizado.
- [x] 4.3 Endpoints `/payment-method-configs` (list OffsetPage vía query
      engine, GET/{id}, POST, PATCH). Sin DELETE: desactivar preserva pagos
      (FK RESTRICT); `updated_at` con utc_now.
- [x] 4.4 Recurso genérico `payment_methods` en `registry.py` (TABLE, filtros
      is_active/online/pos/verificación, búsqueda code/nombre, acciones
      activate/deactivate con visible_when + confirmación) →
      `/admin/resources/payment_methods` sale del shell genérico.
      test_resources_capabilities actualizado.
- [x] 4.5 Sin migración; openapi regenerado; typecheck OK.
- [x] 4.6 Verificado EN VIVO: creado `transferencia_bbva` (verificación
      manual) → visible en checkout público y POS; PATCH desactivar → fuera
      de ambos; listado admin pagina y muestra los 6 métodos.
      ⚠ NOTA DE DESPLIEGUE: los roles existentes NO reciben permisos nuevos
      solos — hay que añadir `payments:manage_methods` al rol admin (PUT
      /roles/{id}/permissions; además rota las sesiones del rol).

## Fase 5 — Staff: quién reparte (`can_deliver`)

Backend COMPLETO: `GET /profiles/staff`, `PUT /profiles/staff/{user_id}`.

- [x] 5.1 Sección "Repartidores del equipo" en `/panel/entregas` (visible con
      `profiles:manage_staff` + `profiles:read`): badge de estado y toggle.
      El PUT es UPSERT completo: se reenvía el perfil actual con `can_deliver`
      invertido para no borrar teléfono/foto/nota.
- [x] 5.2 Verificado EN VIVO por API: OFF también apaga
      `is_delivery_available` (regla del backend) y ON restaura sin perder
      campos. tsc+eslint OK.

## Fase 6 — Cierre integral

- [x] 6.1 `canonical_suite` backend: 605 tests, 552 passed, 53 skipped, 0
      failed (2026-07-04).
- [x] 6.2 `npm run check:canonical` en verde completo (check:api, lint,
      typecheck, unit tests y build).
- [~] 6.3 Stack e2e reconstruido (backend+frontend); smoke autenticado 200 en
      /admin/finanzas, /admin/clientes, /admin/resources/payment_methods,
      /panel/entregas y /panel/pedidos, y TODOS los flujos verificados por
      API contra el stack vivo (ver cada fase). Pendiente: smoke visual con
      navegador (clic a clic) cuando la Fase 1 de la sesión B esté cerrada.
- [ ] 6.4 Al cerrar Fase 1 (deltas): actualizar este plan y docs si aplica.

## Registro de avance

| Fecha | Sesión | Avance |
|-------|--------|--------|
| 2026-07-04 | A (esta) | Plan creado; análisis de huecos completo |
| 2026-07-04 | B (paralela) | Fase 1 parcial: OffsetPage + filtros fecha/q + status-counts + tablero con presets |
| 2026-07-04 | A | Fases 2, 3, 4 y 5 COMPLETAS y verificadas en vivo; filtro `customer_user_id` añadido a GET /orders (parte de 1.4); Fase 6: suites canónicas backend y frontend en verde, stack reconstruido, smoke 200. Pendiente: deltas 1.1–1.3, 1.5 (lista enriquecida, bitácora expuesta, export) y smoke visual final. |
