# Auditoría técnica del backend — dominio restaurante

> **📌 DOCUMENTO HISTÓRICO (actualizado 2026-07-04).** Es la foto de la auditoría
> del 2026-07-03 y se conserva como REGISTRO, no como lista de pendientes
> vigente. Los diez hallazgos H1–H10 están **cerrados**: H1–H9 corregidos y
> validados (§10) y H10 resuelto por la regla de auto-completar la venta de
> mostrador al verificar el pago (`api/v1/payments.py::verify_payment`). La
> fuente de verdad del estado actual es el código y la suite de tests, no este
> documento. Para el trabajo en curso, ver `docs/plan-admin-gaps.md` y
> `GOALS.md`.

**Fecha:** 2026-07-03 · **Alcance:** revisión estática (sin ejecutar nada) de las etapas 0–9 implementadas sobre platform-core · **Fuente de verdad:** el código, las migraciones y las reglas hoy presentes en `backend/` — no lo planeado en documentos.

Clasificación usada en cada hallazgo:
`[OK]` implementado y revisado estáticamente · `[RIESGO]` implementado con riesgo potencial · `[BUG]` defecto identificable por lectura · `[FALTA]` no implementado · `[NO-VERIF]` no verificable sin ejecución · `[PRUEBAS]` requiere pruebas reales posteriores · `[FUERA]` fuera del alcance actual.

---

## 1. Resumen ejecutivo

La base es sólida: invariantes críticas están en la base de datos (no solo en código), la máquina de estados es declarativa, el histórico es inmutable y la suite (515 tests) cubre los caminos felices y varios adversos. Los problemas encontrados se concentran en **efectos encadenados entre módulos que se integraron por etapas**: créditos ↔ reembolsos, pagos ↔ aprobación, y el manejo de fechas naive/aware heredado del core.

**Hallazgos de mayor severidad (detalle en §3):**

| # | Severidad | Hallazgo | Estado |
| --- | --- | --- | --- |
| H1 | Alta | Cantidades fraccionarias en líneas de canje producen producto gratis | **CORREGIDO Y VALIDADO** (migración aplicada + suite verde; §10) |
| H2 | Alta | Reembolso de línea canjeada NO consumida puede devolver créditos dos veces | **CORREGIDO Y VALIDADO** (§10) |
| H3 | Alta | Reembolsos repetidos sobre la misma línea no acumulan tope por cantidad | **CORREGIDO Y VALIDADO** (§10) |
| H4 | Media | `payment_status` puede quedar «paid» prematuro en deliveries pagados antes de aprobar | **Corregido**: recompute al aprobar; cobro parcial → «pending» (§10) |
| H5 | Media | Cancelar un pedido con pago cobrado no exige ni sugiere reembolso | **Corregido**: exige `acknowledge_paid_payments` + bitácora (§10) |
| H6 | Media | Posible deadlock en PG por orden de locks no determinista en `price_cart` | **Corregido**: locks por id en productos y líneas (§10) |
| H7 | Media | Mezcla naive/aware en `utc_now()` vs columnas `timestamptz` (depende del TZ de la conexión) | **Corregido**: sesión PG fijada a UTC en `connect_args` (§10) |
| H8 | Media | Sanitización de SVG por regex es evadible → vector XSS almacenado vía `/public/files` | **Mitigado**: favicon sin SVG (backend) + verificación MIME (frontend) (§10) |
| H9 | Baja | `collection_instruction` etiqueta «efectivo» a cualquier pago pendiente | **Corregido**: «cobrar efectivo» solo con método de cobro real (§10) |
| H10 | Baja | Venta POS con transferencia queda `approved` para siempre si nadie la completa tras verificar | **Corregido**: la venta de mostrador aprobada y pagada se auto-completa al verificar el pago (`verify_payment`; test `test_pos_transfer_stays_pending_verification` + escenario E del RC) |

---

## 2. Revisión estática por área

### 2.1 Estructura y dependencias — `[OK]`
- Convenciones respetadas: modelos SQLAlchemy 2.0 sobre `models/base.py` (nunca SQLModel), enums como VARCHAR+CHECK, schemas por operación, servicios por dominio, un router por área registrado en `api/v1/router.py`.
- `GeoAlchemy2`/`shapely` añadidos con pin; el resto de dependencias sin cambios. `models/geometry.py` aísla el problema PostGIS-vs-SQLite con `TypeDecorator` (decisión correcta y documentada).
- Cadena de migraciones lineal y única: `f4c9…→a9d3…→c7e2…→d8f1…→e5b8…→f2a6…→a4c7…→b6e9…→c9f4…→d5a8…`. Cada una con downgrade simétrico. `[NO-VERIF]` su aplicación en una base con datos reales (solo se probó contra base dev vacía).

### 2.2 Invariantes en base de datos — `[OK]`
Verificadas en modelos **y** migraciones (idénticas):
- `orders`: `customer_user_id IS NOT NULL OR created_by IS NOT NULL`; online exige cliente; folio único global (secuencia).
- Únicos parciales: teléfono principal activo, dirección default activa por usuario, imagen primaria por producto, **asignación de reparto vigente por entrega**, **un `payment_income` por pago**, un canje por línea.
- Coherencia de producto (precio si venta monetaria; vendible de alguna forma), montos no negativos, estados con CHECK.
- `[RIESGO]` menor: los CHECK están duplicados textualmente entre modelo y migración; una divergencia futura pasaría inadvertida (no hay test que compare metadata↔migración).

### 2.3 Autorización — `[OK]` con matices
- 41 permisos en 11 grupos; guardas de catálogo actualizadas; autoservicio por propiedad (direcciones, pedidos propios, créditos propios) sin revelar existencia ajena (404 uniformes).
- Escalones correctos: `orders:approve`/`orders:cancel` adicionales a `transition`; `storefront:publish`/`rollback` separados de `edit`; POS exige doble permiso.
- `[RIESGO]` `POST /courier/deliveries/{id}/complete` no lleva dependencia de permiso en la firma (la verificación es manual dentro del handler). Correcto hoy, pero es el único endpoint del dominio con ese patrón: fácil de romper en refactors y no aparece "protegido" al inspeccionar la ruta.
- `[RIESGO]` `deliveries_queue` y varios `sort_*` reinvocan otra función-endpoint pasando `True` como el parámetro del permiso (`list_categories(session, True)`). Funciona porque el permiso ya se validó, pero es frágil (si cambia la firma, el type-checker no ayuda porque hay `type: ignore`).

### 2.4 Transacciones e idempotencia
- `[OK]` Composición checkout/captura/POS: todo (pedido + líneas + reserva de créditos + entrega + envío + pago) se confirma con un único `commit_or_conflict`; un fallo revierte el conjunto completo, incluida la reserva de créditos.
- `[OK]` `record_payment_income` es idempotente en código **y** por índice único parcial; `mark_paid` rechaza pagos no pendientes; `take_delivery` maneja la carrera con `IntegrityError → 409`.
- `[OK]` Doble cancelación / completar tras cancelar: imposible — `completed` y `cancelled` no tienen salidas en `ORDER_TRANSITIONS`, y `on_order_cancelled`/`on_order_completed` solo procesan canjes en `reserved` (re-entrantes por diseño).
- `[RIESGO]` H6: ver §3.
- `[NO-VERIF]` El aislamiento real de los locks (`FOR UPDATE` de productos y de usuario) solo se demostrará con dos transacciones concurrentes contra PostgreSQL. `[PRUEBAS]` — el plan ya lo marca como test dirigido pendiente.

### 2.5 Fechas y zonas horarias — `[RIESGO]` transversal (H7)
- `utils/utc_now.py` devuelve **naive** (`tzinfo=None`) por convención del core, pero TODAS las columnas del dominio son `DateTime(timezone=True)`. En PostgreSQL, insertar naive en `timestamptz` lo interpreta en el `TimeZone` de la sesión: correcto solo si la conexión opera en UTC (default típico, no garantizado).
- Mezclas concretas: `business_day_bounds` produce aware-UTC (bien), `server_default now()` produce hora del servidor, `utc_now()` produce naive-UTC. En `storefront_service.public_page_payload` se compara `utc_now()` naive contra `visible_from.replace(tzinfo=None)` — si el driver devuelve el timestamptz en un offset ≠ UTC, las ventanas de visibilidad se corren.
- Recomendación (para después): normalizar `utc_now()` del dominio a aware-UTC o fijar `TimeZone=UTC` en la conexión. `[PRUEBAS]` con base real y TZ del servidor ≠ UTC.

### 2.6 Archivos — `[OK]` con un vector (H8)
- Validación por magic bytes, perfiles por uso, tamaño con lectura acotada (`read(max+1)`), BYTEA diferido fuera de todo listado, EXPLORER de backups lo excluye por tipo.
- `[RIESGO]` H8: el rechazo de SVG "activo" es por regex (`<script`, `on\w+=`). Es evadible (entidades, `xlink:href="javascript:…"`, `<foreignObject>`, `<use>` externo). Un favicon SVG malicioso subido por un usuario con `files:upload` se sirve luego **sin sesión** desde `/public/files/{id}` con `Content-Type: image/svg+xml` inline → XSS almacenado en el origen del sitio. Mitigaciones futuras: servir SVG con `Content-Disposition: attachment` o `Content-Security-Policy: sandbox`, o restringir favicon a ICO/PNG.
- `[RIESGO]` menor: `/public/files` sirve cualquier archivo `kind∈{image,favicon}` activo aunque nada publicado lo referencie (UUID v4 impracticable de adivinar, pero toda imagen subida es técnicamente pública).
- `[FALTA]` límite de tamaño a nivel ASGI/nginx para el body multipart (la lectura acotada protege memoria del parseo del archivo, no del request completo).

### 2.7 Pedidos y pricing — `[OK]` núcleo, con H1/H4/H5
- Snapshots completos (nombre, precio, modificadores, créditos); el catálogo vigente jamás reconstruye históricos; totales congelados en aprobación; delivery no aprueba sin `final_amount` (probado).
- Reglas de modificadores (min/max efectivos, single/multiple, requeridos) correctas y probadas.
- `daily_unit_limit` derivado de `order_lines` reales bajo lock del producto; `draft`/`cancelled` excluidos. `[RIESGO]` conceptual: pedidos `submitted` que luego se cancelan liberan cupo (correcto), pero pedidos que quedan eternamente `submitted` lo consumen — no hay expiración de pedidos abandonados (`[FALTA]` limpieza/expiración de `submitted` viejos).
- `quantity` es `Decimal(10,2)` (fiel al reporte) pero el dominio real vende unidades enteras → H1 (créditos) y redondeos raros posibles en tickets (`2.5 ×` boneless). No hay validación de enteros en ninguna capa.

### 2.8 Pagos — `[OK]` con H4/H9/H10; **reglas §18 correctas** (flags por método, cambio, verificación, sin datos sensibles).

### 2.9 Repartos — `[OK]`
- Cola, autoasignación transaccional, reasignación que nunca borra, visibilidad §19.2 estricta (probada antes/durante/después), operación offline, purga Taskiq registrada en el broker.
- `[RIESGO]` `assign_courier` no valida el estado del pedido (se puede asignar a un pedido `submitted` o `completed`); la cola sí filtra, la asignación manual no.
- `[RIESGO]` `available_deliveries` hace N+1 (`current_assignment` por fila) — irrelevante con volúmenes de un solo negocio, anotado por higiene.
- `[RIESGO]` el resumen diario cuenta como "efectivo cobrado" cualquier pago `paid` con `change_requested_for_amount` — un pago en efectivo SIN dato de cambio no cuenta (subregistro).

### 2.10 Finanzas — `[OK]` con H2/H3/H5; fórmula §21.1 correcta y probada; void con historial; ingresos de sistema no anulables a mano.

### 2.11 Créditos — `[OK]` diseño (ledger inmutable, saldo derivado, lock por usuario) con H1/H2/H3.

### 2.12 Storefront — `[OK]`
- Plantillas en código con `extra="forbid"`; CTAs controlados (probado el bloqueo de `javascript:` y `http://`); borrador clona publicada; publicar valida TODO el árbol y archiva; rollback re-publica con permiso propio; público solo publicado con bindings reales; presets neutros (test anti-marca).
- `[RIESGO]` `validate_section_configs` valida CTAs solo en `slides` y `cta` top-level por introspección de nombres de campo; una plantilla futura con CTAs en otra forma no se validaría semánticamente (el patrón invita al olvido).
- `[RIESGO]` binding `category` sin `category_id` pasa validación y resuelve lista vacía silenciosa (§48 pedía "fuente válida" — validación semántica pendiente).

### 2.13 Auditoría (config_audit) — `[OK]` en negocio, catálogo, zonas, storefront (solo nombres de campo). `[FALTA]` en: verificación/rechazo de pagos, reembolsos y ajustes de créditos manuales — quedan trazados en sus propias tablas (verified_by, processed_by, created_by), lo cual es defendible, pero el criterio "cambios sensibles → audit_events" no es uniforme.

---

## 3. Cadenas de decisiones con riesgo (análisis profundo)

### H1 · `[BUG]` Canje con cantidad fraccionaria = producto gratis
```text
Cliente envía línea purchase_mode=credits con quantity=0.5 (Decimal gt 0 lo permite)
→ pricing_service._price_line: credits_redeemed = int(50 × int(0.5)) = int(50 × 0) = 0
→ la línea pasa: base monetaria $0, créditos canjeados 0
→ reserve_order_redemptions filtra credits_redeemed_total > 0 → NO crea reserva
→ pedido válido con producto canjeable a costo CERO (ni dinero ni créditos)
```
Mismo truncamiento en créditos ganados (`int(quantity)`): `quantity=1.9` gana créditos de 1. **Nada en schema, servicio ni CHECK exige cantidades enteras.** Mitigación futura: validar `quantity == int(quantity)` en `OrderLineInput`/pricing, o multiplicar con `Decimal` y redondear explícitamente.

### H2 · `[BUG]` Doble devolución de créditos: reembolso + cancelación
```text
Cliente canjea (reserva −50, estado reserved) y paga los extras en dinero
→ pago verificado (paid) ANTES de completar el pedido
→ empleado reembolsa el pago asignando la línea canjeada
→ on_refund_allocation emite redemption_refund +50 (sin mirar el estado del canje)
→ después el pedido se cancela
→ on_order_cancelled ve la redemption AÚN "reserved" → redemption_release +50
→ el cliente recuperó 100 créditos por un canje de 50
```
Análogo con `earn_reversal`: `create_refund` emite el reverso de créditos ganados aunque el pedido nunca se haya completado (el `earn` nunca ocurrió) → saldo puede quedar negativo. **Causa raíz:** `create_refund` no consulta `order.status` ni el estado de `credit_redemptions`; los hooks de créditos asumen un orden temporal (completar antes de reembolsar) que ningún constraint garantiza. Mitigación: en `on_refund_allocation`, emitir `redemption_refund` solo si el canje está `consumed` (y marcarlo), y `earn_reversal` solo si el pedido está `completed`.

### H3 · `[BUG]` Reembolsos repetidos sobre la misma línea
```text
Pedido 2×boneless pagado $460 → reembolso A: línea 1, qty 1, $230 (ok)
→ reembolso B: MISMA línea, qty 2, $230
→ validación por línea: 2 ≤ line.quantity (2) → pasa
→ acumulado por línea: 3 de 2 unidades reembolsadas
→ créditos ganados revertidos: 3× el valor por unidad
```
El único tope global es `Σ reembolsos ≤ payment.received_amount` (monetario). No hay acumulado de `refunded_quantity` por línea a través de reembolsos. Mitigación: sumar asignaciones previas de la línea antes de validar.

### H4 · `[RIESGO]` `payment_status="paid"` prematuro en deliveries
```text
Pedido web delivery, envío pending_review (final NULL)
→ cliente transfiere y el empleado registra el pago con expected = subtotal+estimado (o subtotal)
→ verify → mark_paid → recompute: target = total_money_amount (NULL) → items_subtotal
→ paid_total ≥ subtotal → orders.payment_status = "paid"
→ luego se fija envío $45 y se aprueba: total congelado = subtotal + 45
→ recompute NO se re-ejecuta al aprobar → el pedido queda "paid" debiendo $45
```
Mitigación: recomputar el estado de pago dentro de `_freeze_totals_on_approval` (o al fijar envío).

### H5 · `[RIESGO]` Cancelación con dinero ya cobrado
`transition → cancelled` no consulta pagos: un pedido con pago `paid` se cancela sin exigir reembolso ni marcar nada. El ingreso (`payment_income`) permanece `recorded` en un pedido cancelado, correcto contablemente SOLO si siempre sigue un reembolso manual — nada lo fuerza ni lo recuerda. Mitigación: al cancelar con pagos `paid`, exigir `reason_code` específico y/o devolver advertencia estructurada; reporte de conciliación "cancelados con cobro sin reembolso".

### H6 · `[RIESGO]` Deadlock por orden de locks en `price_cart`
`_load_products_locked` bloquea productos en el orden del carrito (`dict` de inserción). Dos checkouts con los mismos productos en orden inverso pueden abrazarse (deadlock detectado por PG → error 500 no mapeado). Mitigación trivial: `ORDER BY id` en el `SELECT … FOR UPDATE` (o `sorted(product_ids)`).

### H7 · Fechas naive/aware — ver §2.5. Cadena ejemplo:
```text
Servidor PG con TimeZone=America/Mexico_City
→ utc_now() naive (16:00 UTC) se inserta en timestamptz → PG lo lee como 16:00 LOCAL (22:00 UTC)
→ consumed_daily_units compara contra bounds aware correctos → conteo del día desplazado 6h
→ límites diarios y resúmenes del repartidor cruzan días erróneamente
```

### H9 · `[BUG]` menor — instrucción de cobro
`collection_instruction`: si no hay pagos cash con cambio, el fallback toma **cualquier** pago `pending` (p. ej. transferencia sin verificar) y lo etiqueta "Cobrar $X en efectivo". El repartidor cobraría dos veces. Mitigación: filtrar por método `allows_cash_change` o por código de método.

### H10 · `[RIESGO]` POS + transferencia queda en limbo
`pos_sale` con método verificable deja `approved` + `pending_verification` (correcto), pero `verify_payment` no completa la venta de mostrador → queda `approved` indefinidamente salvo intervención con `orders:transition`. Decisión de producto pendiente: ¿verificar completa automáticamente ventas `counter`?

---

## 4. Funcionalidades planeadas NO implementadas — `[FALTA]`

| Área | Faltante | Impacto |
| --- | --- | --- |
| Perfiles | **Ningún endpoint** crea/edita `customer_profiles` ni `staff_profiles` (solo modelos+tablas). Sin API no hay repartidores (`can_deliver`) ni búsqueda de cliente por teléfono. **Bloqueante funcional para reparto y captura.** |
| Cuenta mínima (§8.3) | Flujo de creación por empleado + reclamo por correo: no existe. |
| Cliente cancela su pedido | No hay endpoint de autoservicio (existe `customer_cancelled` como reason_code interno). |
| Storefront | Endpoints de `storefront_section_media` (tabla creada, sin API); edición de layout header/footer (solo seed); publicación programada (`scheduled_publish_at` sin job Taskiq); advertencias de diseño del preview (§47). |
| Panel/Reportes | "Ventas por hora", "más vendidos" (§58.3), resumen del dashboard del prototipo — solo existe `finances/summary`. |
| Registry/UI genérica | Ningún `ResourceDefinition` de dominio en `resources/registry.py` → la UI autogenerada del frontend no ve catálogos nuevos. |
| Listados | `orders`/`finances` usan filtros manuales, no el query engine (`ResourceQuery`) — sin `total`, sin operadores, inconsistente con el resto de la plataforma. |
| Rate limiting | Solo la cotización pública; checkout/captura sin bucket propio. |
| Notificaciones | Correos de pedido (email_service listo, sin uso en dominio). |
| Docs | `CLAUDE.md` no menciona los módulos nuevos; runbook de deploy (reconciliación de permisos + Postgres externo con PostGIS) no escrito. |
| Expiración | Pedidos `submitted` abandonados nunca expiran (consumen límite diario y ensucian panel). |

**Decididos como NO aplicables (no son faltantes):** checkout invitado, corte de caja, folio por canal, recurrencia semanal, rastreo público por código, reactivación automática de disponibilidad.

---

## 5. No verificable sin ejecución — `[NO-VERIF]` / `[PRUEBAS]`
1. Concurrencia real de locks (límite diario, reserva de créditos, tomar envío) — tests de dos transacciones contra PG.
2. Comportamiento timestamptz con TZ de servidor ≠ UTC (H7).
3. `ST_Covers` con polígonos reales complejos (multipolígonos con huecos, antimeridiano no aplica).
4. Rendimiento de `/public/menu` y `/public/storefront/*` con catálogo grande (hoy sin caché de aplicación, solo headers).
5. Migraciones sobre base con datos preexistentes y el flujo completo del wizard (E2E `npm run test:e2e:bootstrap` — no ejecutado en esta sesión para frontend).
6. Serialización JSON de `Decimal` en campos `dict` del storefront público (los bindings convierten a `str` manualmente — revisar consistencia en el cliente).

## 6. Fuera del alcance — `[FUERA]`
Frontend (todas las pantallas del prototipo), SMS/WhatsApp, impresión física de tickets, SEO avanzado, A/B testing (fase 3 del módulo storefront), multiempresa.

---

## 8. Correcciones aplicadas — H1, H2, H3 (2026-07-03)

**Estado global:** corregido por revisión estática; **NINGUNA migración ni prueba fue ejecutada** en esta tarea. Pendiente de validar en PostgreSQL y con la suite.

### 8.1 Archivos modificados
- `models/orders.py` — `order_lines.quantity` y `order_line_modifiers.quantity` a `Integer` con CHECK `>= 1`; nuevo CHECK `orders_credits_require_customer`.
- `models/finances.py` — `refunded_quantity` a `Integer` con CHECK `>= 1`.
- `models/credits.py` — columna `credit_ledger_entries.refund_allocation_id` (FK a la asignación) + 4 índices únicos parciales de idempotencia.
- `services/pricing_service.py` — `CartLineInput`/`CartModifierInput` con `int`; `_require_positive_int` (rechaza fracciones/0/negativos/bool, jamás trunca); eliminadas TODAS las conversiones `int(quantity)`; créditos = multiplicación exacta entero×entero.
- `services/credit_service.py` — `on_refund_allocation` reescrito con lifecycle y topes (ver 8.4); devuelve lo APLICADO.
- `services/finance_service.py` — `create_refund`: lock `FOR UPDATE` de la línea, acumulados por línea (cantidad y dinero), asignación registra los créditos realmente aplicados por el ledger; tope global por pago se conserva.
- `services/order_service.py` — regla de contacto por canal (pickup a nivel pedido; delivery en `order_deliveries`) y créditos-sin-cliente (canje → error `canje_sin_cliente`; ganados → snapshots forzados a 0).
- `api/v1/orders.py` — la composición de entrega exige `recipient_name`/`recipient_phone` reales (payload o fallback del pedido) → `datos_contacto_requeridos`.
- Schemas: `order.py`, `finance.py`, `payment.py` (ticket) — cantidades `int` con `ge=1` en entradas y lecturas.
- Tests actualizados (NO ejecutados): `test_pricing`, `test_orders`, `test_finances`, `test_credits` — incluyen los nuevos casos de lifecycle (reserved nunca devuelve; consumed devuelve con tope; reverso solo con pedido completed; tercer intento en cero).

### 8.2 Migración creada (NO ejecutada)
`backend/alembic/versions/e8b2c47f91a3_integer_quantities_credit_guards.py` — reversible. Precondiciones que **fallan explícitamente** (jamás truncan):
- filas con cantidades fraccionarias/cero/negativas en las 3 columnas;
- pedidos sin cliente con créditos ≠ 0;
- movimientos duplicados históricos de reserva/liberación por canje.

### 8.3 Constraints e índices añadidos
```text
order_lines.quantity                    INTEGER, CHECK >= 1
order_line_modifiers.quantity           INTEGER, CHECK >= 1
order_line_refund_allocations.refunded_quantity  INTEGER, CHECK >= 1
orders: CHECK customer_user_id IS NOT NULL
        OR (credits_earned_total_snapshot = 0 AND credits_redeemed_total = 0)
credit_ledger_entries.refund_allocation_id  FK → order_line_refund_allocations
UNIQUE parcial (credit_redemption_id)  WHERE entry_type='redeem_reservation'
UNIQUE parcial (credit_redemption_id)  WHERE entry_type='redemption_release'
UNIQUE parcial (refund_allocation_id)  WHERE entry_type='redemption_refund'
UNIQUE parcial (refund_allocation_id)  WHERE entry_type='earn_reversal'
```

### 8.4 Lifecycle definitivo de canjes (implementado en `credit_service`)
```text
reserved  → released (SOLO cancelación; una vez — índice único)
reserved  → consumed (SOLO completar)
reserved  → NUNCA redemption_refund
consumed  → devuelve créditos vía reembolso, acumulado ≤ credits_spent
released  → nada más
earn      → SOLO pedido completed; earn_reversal ≤ earn − ya revertido
sin customer_user_id → ningún movimiento de créditos (CHECK + servicio)
```
Capa BD: índices únicos parciales (idempotencia ante reintentos/concurrencia). Capa servicio: topes por remanente calculados DENTRO de la transacción, con lock de línea (H3) y lock de usuario en reservas (ya existente). Lo cross-tabla que un CHECK no puede expresar (que no existan `credit_redemptions` sin cliente; que delivery tenga `order_deliveries` con contacto) lo protege el servicio transaccional: `reserve_order_redemptions` exige cliente y `_compose_delivery_and_shipping` exige contacto+calle antes del único commit.

### 8.5 Regla de clientes por canal (implementada)
```text
online                → customer_user_id obligatorio (CHECK + servicio; el
                        checkout usa SIEMPRE el usuario autenticado, nunca
                        un id enviado por el navegador)
counter/phone/whatsapp/social/manual → customer_user_id opcional; created_by SIEMPRE
manual + delivery     → recipient_name/phone + calle obligatorios en order_deliveries
manual sin entrega    → sin cliente ni contacto (venta rápida), con created_by
pickup                → contacto a nivel pedido (hay que avisar)
sin cliente           → créditos ganados = 0 (forzado), canje = error; sin cliente
                        anónimo artificial; vínculo opcional a cliente existente intacto
```

### 8.6 Riesgos que permanecen (sin corregir en esta tarea)
H4 (paid prematuro en deliveries), H5 (cancelar con cobro sin reembolso), H6 (orden de locks en `price_cart` — nota: el lock de línea de H3 introduce un punto más; mismo remedio pendiente de ordenar por id), H7 (naive/aware), H8 (SVG), H9, H10, y todos los `[FALTA]` de §4.

### 8.7 Pruebas reales pendientes después de esta corrección
```text
- canje con quantity 0.5 debe ser rechazado (schema 422 y servicio);
- quantity 0, negativa, "1.5" y booleanos rechazados en carrito, POS y reembolsos;
- dos canjes simultáneos del mismo saldo (lock de usuario, 2 sesiones PG);
- reembolso de canje reserved seguido de cancelación → devolución ÚNICA;
- reembolso de canje consumed → devuelve con tope acumulado;
- reembolso parcial repetido de la misma línea (1+1 ok, tercero falla);
- reembolso por encima de quantity → reembolso_excede_linea;
- reembolso por encima del dinero histórico de la línea;
- reembolso por encima de créditos históricos (aplicado = remanente, no lo pedido);
- pedido manual delivery sin customer_user_id con contacto válido → aceptado;
- pedido manual delivery sin recipient_name/phone → datos_contacto_requeridos;
- pedido web sin sesión → 401; online jamás acepta customer_user_id arbitrario;
- pedido manual sin cliente que intenta canjear → canje_sin_cliente;
- pedido manual sin cliente con producto que otorga créditos → snapshots en 0
  y on_order_completed no acredita nada;
- migración e8b2c47f91a3 contra base con datos fraccionarios → falla explícita;
- migración e8b2c47f91a3 upgrade/downgrade en base limpia;
- índices únicos parciales del ledger ante doble llamada concurrente.
```

## 8-bis. Revisión estática posterior a H1–H3 (2026-07-03)

**Verificaciones realizadas** (diff + modelos + schemas + servicios + migración `e8b2c47f91a3`):

1. **Online→cliente en BASE:** confirmado — `orders_online_requires_customer` (`source <> 'online' OR customer_user_id IS NOT NULL`) **ya existía** en modelo y migración `e5b8c30d47a1`; no dependía del servicio. **Agregado** el faltante `orders_staff_requires_employee` (`source = 'online' OR created_by IS NOT NULL`) en modelo + migración `e8b2c47f91a3` con pre-check que falla explícito. `orders_requires_user` (genérico) y `orders_credits_require_customer` se conservan. Canales no web: `customer_user_id` sigue opcional.
2. **Enteros ESTRICTOS en API:** `OrderLineInput.quantity`, `OrderModifierInput.quantity`, `RefundAllocationItem.refunded_quantity` y `CreditRefundCreate.refunded_quantity` ahora usan `Field(strict=True, ge=1)` — sin coerción de `"1"`, `"1.0"`, `1.0`, `true/false`. Servicio (`_require_positive_int`, rechaza `bool`) y BD (CHECK `>= 1`) se conservan como capas 2 y 3. Ningún `int(quantity)` reintroducido. Tests con payloads `"1"` actualizados a números JSON.
3. **Reembolso 100% créditos (sin pago):** el modelo NO lo permitía (allocation exigía `payment_refund_id`). **Extensión mínima:** `payment_refund_id` ahora NULLABLE + columna `processed_by` (actor) + CHECKs `credit_only_no_money` (sin pago → dinero = 0) y `actor_required`. Nuevo servicio `refund_credits_only_line` (valida línea `credits`, motivo obligatorio, acumulado H3, ledger decide lo aplicable H2, falla si no hay nada devolvible) y endpoint `POST /orders/{id}/credit-refunds` bajo `payments:refund`. Sin pagos ficticios de $0. Idempotencia intacta: únicos parciales por `refund_allocation_id`.
4. **Montos controlados por backend (política documentada en `_lock_line_and_check_remaining`):** el payload sólo declara cantidad (+ dinero en reembolsos monetarios, acotado al remanente de `money_line_total_amount`, que ya incluye modificadores); créditos devueltos/revertidos SIEMPRE los calcula el ledger desde snapshots y estado del canje; ajustes excepcionales van por `order_adjustments`/asientos manuales, nunca como devolución de línea.
5. **Locks deterministas:** `create_refund` procesa asignaciones ordenadas por `order_line_id` ascendente antes de bloquear — la corrección H3 ya no introduce un patrón de lock no determinista. H6 (productos en `price_cart`) sigue pendiente como estaba.

**Archivos tocados en esta pasada:** `models/orders.py`, `models/finances.py`, migración `e8b2c47f91a3` (ampliada — sigue SIN ejecutar), `schemas/order.py`, `schemas/finance.py`, `services/finance_service.py`, `api/v1/finances.py`, tests de payloads.

**Pendiente de pruebas reales (adicional a §8.7):** strict-mode rechazando `"1"`/`1.0`/`true` vía HTTP; devolución solo-créditos (consumed → devuelve; reserved → `canje_no_devolvible`; segundo intento sin remanente); CHECKs nuevos (`orders_staff_requires_employee`, `credit_only_no_money`, `actor_required`) contra PostgreSQL; upgrade/downgrade de la migración ampliada.

## 9. Priorización actualizada (tras correcciones H1–H3)
1. Ejecutar migración `e8b2c47f91a3` + suite completa para validar H1–H3.
2. API de perfiles (bloqueante operativo).
3. H4 + H5, luego H6/H7/H8 y faltantes de producto.

## 7. Priorización original (histórica, previa a las correcciones)
1. **H1, H2, H3** — integridad de dinero/créditos (correcciones pequeñas y localizadas: validación de enteros; estado del canje/pedido en reembolsos; acumulado por línea).
2. **API de perfiles** (bloqueante para operar reparto y captura).
3. **H4 + H5** — recompute en aprobación y política de cancelación con cobro.
4. **H6, H7** — orden de locks y normalización de fechas (baratas ahora, caras después).
5. **H8** — política de SVG (o restringir favicon a ICO/PNG).
6. Resto de faltantes por prioridad de producto (media del storefront, reportes, registry).



Riesgos aún pendientes: H4–H10 y los [FALTA] de la auditoría (incluida la API de perfiles, bloqueante operativo).

## 10. Ejecución real (2026-07-03, cierre de pendientes)

- Migración `e8b2c47f91a3` aplicada contra PostGIS: upgrade → downgrade → re-upgrade OK; `order_lines.quantity` = INTEGER y los 4 índices únicos parciales del ledger verificados en el catálogo.
- Suite canónica: **529 tests, 476 passed, 0 failed** (incluye tests dirigidos nuevos: enteros estrictos vía HTTP, topes acumulados por línea, H4/H5/H9 y perfiles).
- **API de perfiles implementada** (bloqueante operativo resuelto): `/profiles/me`, búsqueda de clientes por teléfono (`?phone=`), upsert de personal con `can_deliver` y disponibilidad del propio repartidor; permisos `profiles:*` en el catálogo y en las 3 guardas.
- H4–H9 corregidos en código (tabla del resumen §1). H10 sigue abierto como decisión de producto.
- Aún pendiente de ejecución: pruebas de concurrencia con dos sesiones PG y E2E de navegador del flujo completo.
