# Plan de implementación del backend

## Dominio restaurante (`REPORTE_INTEGRAL_ANALISIS_PROYECTO.md`) sobre la base actual de `platform-core`

Este plan traduce el reporte integral a etapas de implementación concretas del backend FastAPI existente. El enfoque es: **qué pieza de la base actual se reutiliza, cómo se adapta, y qué hay que construir de cero**. Las referencias «§N» apuntan a secciones del reporte integral.

## Resumen ejecutivo

- **Cero cambios en tablas core.** `user` queda intacto (todos los usuarios tienen correo; teléfono y datos operativos van en perfiles 1:1 `customer_profiles`/`staff_profiles`). Cliente = usuario; empleado = usuario + rol; no hay tabla de clientes.
- **Invariante de pedidos:** no hay pedido sin usuario — `CHECK (customer_user_id IS NOT NULL OR created_by IS NOT NULL)`; web exige cliente con sesión, canales de personal exigen empleado registrado.
- **10 etapas** (0–9) con dependencias explícitas; una migración Alembic por etapa; el corte «Fase 1» del reporte = etapas 0–5 + 9 (storefront avanza en paralelo desde la etapa 2).
- **Todo lo genérico se hereda:** auth, RBAC declarado en código, query engine allowlist, helpers de rutas, registry de recursos con UI autogenerada, singletons de configuración, auditoría, Taskiq, wizard de instalación y seeds idempotentes. Lo nuevo de infraestructura son sólo PostGIS y `stored_files`.
- **Producto genérico, sin marca:** ningún preset "Tony"; presets de tema neutros + metadatos del sitio configurables (título, descripción, favicon, imagen social). Tony-Tony es la primera configuración, no código.
- **Cada etapa cierra con 6 criterios verificables** (migración reversible, suite canónica, catálogo de permisos, guard de OpenAPI, reconciliación de permisos + E2E del wizard, seeds idempotentes).

---

# 1. Inventario de la base actual y cómo se reutiliza

| Pieza existente | Ubicación | Uso en el dominio restaurante |
| --- | --- | --- |
| Modelos SQLAlchemy 2.0 (`Base`, `Mapped`) | `app/models/base.py`, `user.py` | Todos los modelos nuevos siguen este patrón (NO SQLModel). `User`/`Role`/`UserRole`/`RoleAccess` quedan intactos: usuario = cliente (§1.2). |
| Enums no nativos (VARCHAR + CHECK) | `app/models/enums.py` | Todos los estados del dominio (`orders.status`, `payment_status`, `purchase_mode`, etc.) se declaran aquí con `native_enum=False`. |
| Autenticación completa (JWT + cookie, lockout, registro 2 pasos, Google, verificación) | `app/auth/*` | Se reutiliza sin cambios para clientes y personal. El registro público de clientes ya existe (`register.py` + gate `REGISTRATION_ALLOWED`/system_settings). |
| Token store Redis bidireccional | `app/auth/token_store.py` | Reutilizable para el flujo «reclamar cuenta mínima» (token de reclamo → user_id) si se agrega en fase posterior. |
| RBAC declarado en código | `app/security/security_group.py`, `groups/*`, `catalog.py` | Se agregan grupos nuevos por módulo de dominio (ver §5 de este plan). Patrón: enum `(access_string, descripción)` + registro en `SECURITY_GROUPS` + actualizar `tests/test_security_catalog.py`. |
| Motor de consultas allowlist | `app/query/*` (`ListQueryContract`, `ResourceQuery`, `QueryOptions`) | Todos los list endpoints (productos, pedidos, movimientos financieros, ledger de créditos) se construyen con esto. Semántica de calendario (`query/calendar.py`) sirve directo para filtros por fecha de `occurred_at`/`created_at`. |
| Helpers generales de rutas | `app/api/resource_actions.py` | Base de todos los routers: `get_or_404`, `get_owned_or_404` (autoservicio del cliente: *sus* pedidos/direcciones), `lock_for_update` (reservas de créditos, tomar envío, límite diario), `create_entity`/`patch_entity`, `replace_to_many` (reordenamientos y relaciones producto↔modificadores), `commit_or_conflict`. |
| Registro de recursos + proyección de capacidades | `app/resources/registry.py` (`ResourceDefinition`, `ActionDef`), `resources/projection.py`, `schemas/capabilities.py` | Los catálogos administrativos «planos» (categorías financieras, métodos de pago, teléfonos del negocio, zonas, tarifas) se publican aquí y el frontend genera la UI desde `ResourceCapability`: filtros/orden salen del `CompiledQueryPlan`, formularios de los schemas, autorización con `SecurityControl.check` (nunca se serializan permisos). `ActionDef` con `fixed_body` cubre toggles (disponibilidad de producto, zona activa) sin endpoints nuevos; `create_transport=MULTIPART` + `download_url_template` cubren adjuntos (evidencias de gasto/pago). Las pantallas ricas (POS, pedidos, editor del sitio, repartidor) sí tendrán endpoints propios. |
| Asistente de instalación (wizard) | `app/bootstrap/service.py`, `api/v1/bootstrap.py`, `models/setup.py` (`platform_setup`) | Primer arranque token-gated: crea el admin inicial, el rol admin del sistema con TODOS los permisos declarados y hasta 10 roles adicionales validados contra `declared_permissions()`. Los grupos de permisos nuevos del dominio aparecen solos en su catálogo (`GET /bootstrap/catalog`): ahí se ofrecerán plantillas de roles del restaurante (Empleado, Repartidor, Editor de contenido) sin tocar el mecanismo. |
| Reconciliación aditiva de permisos | `bootstrap/service.py::sync_system_admin_role_permissions` | Los permisos declarados DESPUÉS del setup no llegan solos al rol admin de una instalación ya inicializada. Cada etapa que agrega grupos depende de que esta reconciliación corra en el deploy (hoy la ejecuta el seed `core/bootstrap.py`). Es lo que hace seguro agregar permisos etapa por etapa. |
| Seed idempotente | `core/bootstrap.py::bootstrap_initial_data` | Molde para los seeds del dominio: get-or-create + sync, ejecutable N veces sin duplicar. Aquí (o en migraciones de datos) se siembran métodos de pago, categorías financieras, páginas de sistema del storefront y el preset de tema. |
| Supervivencia administrativa | `security/admin_survival.py`, `resource_actions.commit_with_admin_survival` | Invariante post-condición dentro de la misma transacción en mutaciones de usuarios/roles. Cubre el dominio sin trabajo extra (la cobertura se evalúa contra el catálogo declarado, que crece con cada etapa); sólo hay que usar `commit_with_admin_survival` si alguna pantalla nueva muta roles. |
| Checklist de puesta en marcha | `system_settings_service.build_setup_checklist` + banner del dashboard | Se extiende con los pasos del restaurante: configurar negocio, horarios, zonas, métodos de pago, publicar portada. Es el mecanismo correcto para guiar la puesta en marcha SIN engordar el wizard. |
| Patrón singleton de configuración | `app/models/system_settings.py` + `services/system_settings_service.py` | Molde exacto para `business_profile`, `business_settings` y `storefront_settings` (PK `CHECK (id = 1)`, servicio get-or-create, PATCH parcial). |
| Auditoría de configuración (solo nombres de campos) | `app/services/config_audit.py` + `audit_events` | Se reutiliza para: cambios de configuración del negocio, precios de catálogo, publicación/rollback del storefront. El historial operativo de pedidos NO va aquí: usa sus propias bitácoras (`order_status_history`, `order_shipping_history`). |
| Taskiq sobre PostgreSQL (patrón `backups.tick`) | `app/taskiq_app.py`, `jobs/tasks/backups.py` | Molde para jobs del dominio: purga de `courier_location_events` (§19.4) y publicación programada de revisiones del storefront (`scheduled_publish_at`, §41). |
| Correo saliente | `app/services/email_service.py` | Fase posterior: notificaciones de pedido. No es bloqueante de ninguna etapa. |
| Envelope de errores + handlers | `app/schemas/error.py`, `core/error_handlers.py` | Todos los errores de negocio nuevos usan `{code, message, errors}`. Definir códigos de dominio (ej. `producto_agotado_hoy`, `limite_por_pedido_excedido`, `envio_ya_tomado`). |
| Rate limiting | `app/security/rate_limit.py` | Aplicar a los endpoints públicos nuevos (checkout, cotización de envío). |
| Cifrado de secretos / backups | `services/secret_cipher.py`, `backup_service.py` | Sin cambios. **Atención**: excluir `stored_files.file_content` del artefacto EXPLORER (columnas sensibles/pesadas) al crear la tabla. |
| Convención de schemas por operación | `app/schemas/base.py` (`ApiReadSchema`, `ApiWriteSchema`, `ApiPatchSchema`) | Cada recurso del dominio define `XCreate/XRead/XListItem/XUpdate/XQuery` según la convención. También es la herramienta para validar los `*_config` JSONB del storefront (un modelo Pydantic `extra="forbid"` por plantilla). |

## Adaptaciones puntuales a piezas existentes

1. **`User` no se toca.** Teléfono, notas y datos comerciales viven en `customer_profiles`/`staff_profiles` (1:1 opcionales, §8.2/§8.4). La búsqueda de cliente por teléfono es sobre `customer_profiles.phone_normalized`.
2. **Cuenta mínima creada por empleado (§8.3, opcional):** se crea un `User` con `hashed_password` aleatorio (nunca conocido por el empleado) y `customer_profiles` con estado. El «reclamo» posterior reutiliza el flujo existente de `forgot_password`/verificación de correo — siempre posible porque toda cuenta tiene correo.
3. **`email` se queda NOT NULL + UNIQUE en `user`.** Decisión de dominio: todos los usuarios tienen correo. La cuenta mínima sólo puede crearse si el cliente proporciona un correo; si no lo da, el pedido simplemente se registra sin usuario asociado (permitido por §1.2). Consecuencia: **no hay ninguna migración sobre tablas core** y los flujos de auth quedan intactos.
4. **`test_auth_routes.py` y `test_security_catalog.py`** son guardas que se actualizan en cada etapa que agrega rutas o permisos.

---

# 2. Infraestructura faltante (Etapa 0 — prerequisito de todo)

## 2.1 PostGIS

- Cambiar la imagen de Postgres en `compose.yml` / `compose.dev.yml` a `postgis/postgis` (misma versión mayor).
- Dependencias nuevas en `backend/requirements.txt`: `GeoAlchemy2` (columnas `geometry(...)` en modelos y migraciones) y `shapely` (parsing GeoJSON→WKB en schemas).
- Migración inicial de dominio: `CREATE EXTENSION IF NOT EXISTS postgis`.
- Convención de API: las geometrías entran/salen como GeoJSON (`Point`, `MultiPolygon`, SRID 4326); conversión en schemas, nunca WKT crudo del cliente.
- Los tests canónicos que hoy corren sin PostGIS deben seguir pasando: los módulos de dominio con geometría se prueban contra la base dev en Docker (documentar en el runbook de tests).

## 2.2 `stored_files` + servicio de archivos (§7)

No existe nada de archivos hoy. Crear:

- `models/stored_file.py` — tabla del reporte (BYTEA, sha256, mime, `uploaded_by`).
- `services/file_service.py` — guardar con validación (MIME por contenido, tamaño máximo por tipo de uso, hash, dedupe por sha256 opcional), servir como respuesta binaria protegida, borrado lógico. Reglas §53: JPG/PNG/WEBP para imágenes (más ICO/PNG/SVG exclusivamente para el favicon, §45.1), límites configurables.
- Router `api/v1/files.py`: subida (multipart, ya soportado por `ResourceDefinition.create_transport=MULTIPART` si se publica como recurso) y descarga con permiso. La descarga pública de imágenes de catálogo/storefront requiere una ruta pública de solo lectura para archivos referenciados por contenido publicado (sin sesión).
- Exclusión de `file_content` en el snapshot EXPLORER de backups.

## 2.3 Paquete de dominio

Organización propuesta (mismo layout actual, un módulo por área):

```text
app/models/        business.py, profiles.py, addresses.py, catalog.py,
                   shipping.py, orders.py, payments.py, deliveries.py,
                   finances.py, credits.py, storefront.py, stored_file.py
app/services/      business_service.py, catalog_service.py, pricing_service.py,
                   order_service.py, shipping_service.py, payment_service.py,
                   delivery_service.py, finance_service.py, credit_service.py,
                   storefront_service.py, file_service.py
app/schemas/       espejo por recurso, convención XCreate/XRead/...
app/api/v1/        business.py, catalog.py, storefront_public.py, menu_public.py,
                   cart_checkout.py, orders.py, pos.py, shipping.py, deliveries.py,
                   courier.py, payments.py, finances.py, credits.py,
                   storefront_admin.py, files.py
app/security/groups/  business.py, catalog.py, orders.py, shipping.py,
                   deliveries.py, payments.py, finances.py, credits.py, storefront.py
app/storefront/templates/   registro de plantillas en código (ver etapa 8)
```

Una migración Alembic por etapa (no una gigante), siempre autogenerada contra `Base.metadata` y revisada a mano (CHECKs, índices parciales, GIST).

## 2.4 Aprovisionamiento inicial del dominio (bootstrap y seeds)

El dominio se engancha al aprovisionamiento existente en cuatro puntos, sin modificar el flujo del wizard:

1. **Filas singleton sembradas en su migración** (patrón ya usado por `system_settings`: «la migración ya sembró la fila; aquí sólo se actualiza»): `business_profile`, `business_settings` y `storefront_settings` nacen con defaults en su propia migración de datos. Si el wizard capturó `institution_name`, se usa como `trade_name` inicial del negocio.
2. **Seeds de catálogos base, idempotentes** (patrón `core/bootstrap.py`): métodos de pago iniciales (§18.1), categorías financieras sugeridas (§21.2), páginas de sistema del storefront (`home`, `menu`, `credits`, …) y un tema inicial basado en un preset neutro (sin marca; §58.4). Get-or-create por clave natural (`code`/`page_key`), nunca duplican al re-ejecutarse.
3. **Roles sugeridos del restaurante en el wizard**: el mecanismo de `additional_roles` ya valida contra `declared_permissions()` y admite hasta 10 roles; el frontend del wizard ofrecerá plantillas precargadas (Empleado: captura/aprobación/tickets; Repartidor: `deliveries:self_assign` y compañía; Editor de contenido: `storefront:*` sin publish). Cero cambios de backend en el wizard: solo crecen el catálogo de permisos y las plantillas del cliente.
4. **Reconciliación en cada deploy**: `sync_system_admin_role_permissions` (aditiva) debe ejecutarse tras migrar cada etapa para que el rol admin del sistema reciba los permisos nuevos en instalaciones ya inicializadas. Hoy corre dentro del seed; documentar en el runbook de deploy que seed/reconciliación forman parte del `--profile migrate`.

Además, `build_setup_checklist` gana ítems del dominio (negocio configurado, horario cargado, al menos una zona con tarifa, método de pago activo, portada publicada) para guiar la puesta en marcha desde el dashboard.

---

# 3. Etapas de implementación

El orden respeta dependencias de datos y el orden recomendado del reporte (§27). Cada etapa incluye: modelos + migración, servicio, schemas, router, permisos + catálogo, y tests (suite canónica).

## Etapa 1 — Negocio y perfiles (§5, §6, §8, §9)

**Tablas:** `business_profile`, `business_phones`, `business_settings`, `business_weekly_hours`, `business_special_dates`, `business_special_date_slots`, `customer_profiles`, `staff_profiles`, `user_addresses`.

- Singletons con el patrón de `system_settings_service` (fila sembrada en la migración, get-or-create defensivo, PATCH, auditoría con `config_audit`); `trade_name` inicial desde el `institution_name` del wizard cuando exista.
- `business_service.is_open_now()` / horario efectivo del día (prioridad: fecha especial → semanal → cerrado, §6.3). Lo consumen el header público, el storefront (§37.4) y la validación de checkout.
- Índice parcial `UNIQUE ... WHERE is_primary` en teléfonos (§5.2).
- `staff_profiles` incluye desde ya `is_delivery_available` y `courier_public_note` (§8.4).
- Endpoint público mínimo: `GET /public/business` (nombre, logo, teléfonos públicos, abierto/cerrado, umbral de envío gratis) — sin sesión, cacheable.
- `user_addresses`: CRUD de autoservicio con `get_owned_or_404`; geometría opcional.
- Recursos en `registry.py`: teléfonos, horarios, fechas especiales (UI genérica admin).

**Reutiliza:** singleton pattern, config_audit, resource_actions, registry.
**Nuevo:** lógica de horarios, primer uso de PostGIS (`user_addresses.location`).

## Etapa 2 — Catálogo (§11, §12, §13)

**Tablas:** `product_categories`, `products` (con `max_units_per_order`, `daily_unit_limit`), `product_images`, `product_inclusions`, `modifier_groups`, `modifier_options`, `product_modifier_groups`.

- CRUD admin con `ResourceQuery` para listados; imágenes vía `stored_files`.
- **Reordenamiento atómico** (§13): endpoint por colección (`PUT .../sort-order` con la lista completa de IDs) implementado sobre `replace_to_many`/transacción — valida pertenencia, rechaza duplicados, normaliza a pasos de 10.
- CHECKs de coherencia (§11.2): precio requerido si `is_money_purchase_available`, etc.
- Endpoint público del menú: `GET /public/menu` — categorías activas + productos disponibles + modificadores, ordenado por `sort_order`, sin precios históricos, cacheable. El catálogo se publica al instante (§58.3): sin revisiones.
- `catalog_service.remaining_daily_units(product)` — consumo del día calculado desde `order_lines` de pedidos aceptados (§11.2); no hay contador editable.

**Reutiliza:** query engine, resource_actions, registry, file_service.
**Nuevo:** servicio de orden visual, menú público denormalizado.

## Etapa 3 — Zonas y tarifas de envío (§10)

**Tablas:** `delivery_zones` (MultiPolygon + GIST), `shipping_rate_rules`.

- `shipping_service.resolve_zone(point)` — `ST_Covers` + prioridad para solapes.
- `shipping_service.quote(point|None, subtotal)` — devuelve `(zona, tarifa, monto_estimado, es_gratis, status)`; sin ubicación → `pending_review` (§17.2). Considera envío gratis por tarifa y global (§10.2).
- Endpoint público de cotización estimada para el carrito (rate-limited).
- Admin: CRUD de zonas con GeoJSON (validar polígonos con shapely).

**Nuevo:** todo; primera lógica PostGIS seria.

## Etapa 4 — Núcleo de pedidos (§14–§17, §58.2)

**Tablas:** `orders`, `order_lines`, `order_line_modifiers`, `order_adjustments`, `order_status_history`, `order_deliveries`, `order_shipping`, `order_shipping_history`.

Servicios clave (el corazón del sistema, no delegable a helpers genéricos):

- `pricing_service.build_order(...)` — recibe carrito (producto+cantidad+modificadores+modo de compra), lee catálogo VIGENTE, congela snapshots (nombres, precios, créditos), valida: disponibilidad, `max_units_per_order`, `daily_unit_limit` (con `lock_for_update` sobre los productos para evitar carrera), modificadores permitidos por producto, mínimos/máximos de selección.
- `order_service` — máquina de estados (§16): transiciones válidas por `source`/`fulfillment_type`, quién puede ejecutarlas (permiso vs. dueño), escritura de `order_status_history` en cada cambio con `reason_code`. La aprobación congela totales y exige `order_shipping.final_amount` en delivery (§17.2). Después de aprobar no hay edición: solo ajuste registrado, reembolso o cancelación.
- Identidad por canal (§1.2/§14.1): `source=online` exige `CurrentUser` y fija `customer_user_id`; canales de personal exigen permiso de captura, `customer_user_id` opcional, `created_by` siempre. Invariante en BD: `CHECK (customer_user_id IS NOT NULL OR created_by IS NOT NULL)` — no hay pedido sin usuario.
- `order_number`: secuencia PostgreSQL única; `public_code` = prefijo del negocio + número (§5.1). Una sola serie para todos los canales (§14.1).
- Numeración de estados públicos: función de mapeo interno→etiqueta (§58.2) usada por los endpoints del cliente.
- Endpoints: autoservicio del cliente (`GET /orders/mine`, `GET /orders/{id}` con `get_owned_or_404`, mapeo público de estados, «repetir pedido» que devuelve un carrito con precios actuales §58.3) y panel interno (listado con filtros por estado/canal vía query engine, detalle completo, transiciones, ajuste de envío con bitácora §17.3).

**Reutiliza:** enums no nativos, lock_for_update, query engine, error envelope.
**Nuevo:** pricing y máquina de estados; es la etapa más grande — subdividir PRs: (a) modelos+migración, (b) pricing, (c) estados+historial, (d) endpoints cliente, (e) endpoints internos.

## Etapa 5 — Pagos y tickets (§18, §20)

**Tablas:** `payment_method_configs`, `payments`, `payment_attachments`, `payment_refunds` (el refund se usa en etapa 7), `ticket_print_logs`.

- Seed de métodos iniciales (efectivo entrega/mostrador, transferencia, terminal, otro) en migración de datos.
- `payment_service`: crear pago según reglas del método (requiere referencia/banco/evidencia según flags), verificación manual (`verified_by/at`), marcado `paid` (dispara ingreso financiero en etapa 7 — dejar hook), cambio de efectivo (`change_*`).
- Instrucciones de cobro derivadas (§19.5): función que produce «cobrar $X / llevar cambio $Y» o «pagado, no cobrar» desde `payments` — la consumen repartidor y panel.
- Tickets: `GET /orders/{id}/ticket` devuelve el payload del ticket armado 100% desde snapshots (§20) + `POST .../ticket-prints` registra el log. El render de 58 mm es del frontend.
- POS (§58.1): no hay endpoints nuevos especiales — es el flujo de captura por personal de la etapa 4 con `source=counter` + pago inmediato; validar que el combinado quede en una sola transacción (`POST /pos/sales`: crear pedido aprobado + pago + entrega implícita `completed`).

## Etapa 6 — Repartidores (§19, §58.1)

**Tablas:** `delivery_assignments`, `courier_tracking_sessions`, `courier_location_events`.

- Cola «listos para salir»: `GET /courier/available-orders` (pedidos `ready`, delivery, sin asignación vigente) visible con `can_deliver` + `is_delivery_available`.
- **Tomar envío** (§19.5): `POST /courier/take/{order_delivery_id}` en transacción con índice parcial `UNIQUE(order_delivery_id) WHERE is_current` — el perdedor de la carrera recibe 409 con código `envio_ya_tomado`. Asignación manual por empleado convive (mismo servicio, distinto `assigned_by`).
- Visibilidad al cliente (§19.2): el detalle del pedido del cliente incluye repartidor (nombre, `courier_public_note`, teléfono público, última ubicación) SOLO cuando `status=out_for_delivery` y hay asignación vigente.
- Tracking opcional: sesión + eventos; job Taskiq de purga de eventos viejos (patrón `backups.tick`).
- Operación sin conexión (§19.6): «marcar entregado» acepta ejecutor repartidor **o** empleado con permiso; timestamps de entrega aceptan captura tardía.
- Resumen diario derivado (§19.7): un endpoint de agregación, cero tablas.

## Etapa 7 — Finanzas y reembolsos (§21, §22.5)

**Tablas:** `financial_categories` (seed sugerido §21.2), `financial_entries`, `financial_entry_attachments`, `order_line_refund_allocations` (+ activar `payment_refunds`).

- `finance_service.record_payment_income(payment)` — enganchado al hook de etapa 5: un pago `paid` = UN ingreso (§21.4), idempotente por `payment_id`.
- Gastos/ingresos manuales con evidencias (`stored_files`), void con reverso (nunca DELETE, `reversal_of_entry_id`).
- Reembolsos: `payment_refunds` + asignación por línea; el reverso de créditos queda enganchado a etapa 8.
- Resumen del negocio (§58.1, sin corte de caja): endpoint de agregación por rango de fechas (ventas, envíos cobrados, gastos, neto, fórmula §21.1) usando la semántica de calendario del query engine.
- Listado de `financial_entries` con `ResourceQuery` (filtros por dirección, categoría, fechas).

## Etapa 8 — Créditos (§22)

**Tablas:** `credit_redemptions`, `credit_ledger_entries`.

- `credit_service.balance(user)` = `SUM(credit_delta)`; sin saldo materializado.
- Reserva transaccional al crear pedido con líneas `purchase_mode=credits` (validar saldo con lock por usuario — advisory lock o `SELECT ... FOR UPDATE` de sus reservas §22.6). Consumo al completar; liberación al cancelar; earn al completar (solo pedidos con `customer_user_id`, §22.1); reversos ligados a `order_line_refund_allocations`.
- Todo son hooks dentro de las transiciones de `order_service` — por eso créditos va después de pedidos y finanzas.
- Endpoints cliente: saldo + movimientos (query engine sobre el ledger) + catálogo canjeable (`credit_redemption_price IS NOT NULL`).

## Etapa 9 — Storefront (§29–§57)

**Tablas:** `storefront_settings`, `storefront_theme_revisions`, `storefront_layout_revisions`, `storefront_pages`, `storefront_page_revisions`, `storefront_page_sections`, `storefront_section_media`.

- **Registro de plantillas en código** (`app/storefront/templates/`): mismo espíritu que el catálogo de permisos — cada plantilla declara `template_key`, `template_version` y un modelo Pydantic (`extra="forbid"`) por cada config (`content/style/data_binding/behavior`). La validación de secciones resuelve el modelo por `(key, version)` y rechaza claves desconocidas (§33, §40). Catálogo inicial: las 6 del prototipo (§58.1) — barra de envío gratis (35.4, data-bound, sin texto libre), hero split/background/minimal con soporte de N slides y rotación (§34.1), banner promo, grilla de productos, horarios, contacto, footer.
- Presets de paleta en código, genéricos y neutros — ningún preset de marca (§58.4); `tokens_json` guarda el resultado; colores por sección referencian tokens. La identidad de cada negocio (la de Tony-Tony incluida) es 100% configuración, nunca código.
- Metadatos globales del sitio (§45.1): `site_title`, `site_description`, `favicon_file_id`, `social_image_file_id` en `storefront_settings`; favicon validado por `file_service` (ICO/PNG/SVG, dimensiones). El endpoint público entrega los metadatos resueltos con la cadena de fallback (página → sitio → `business_profile.trade_name`) para que el frontend arme el `<head>` (title, description, OG, favicon).
- Flujo borrador→publicar→rollback (§41, §48): servicio de revisiones (clonar publicada→borrador, validar todo el árbol al publicar, archivar la anterior, actualizar `published_revision_id`, auditar con `config_audit`); publicación programada vía job Taskiq (patrón tick sobre `scheduled_publish_at`).
- Endpoints: admin (CRUD borradores, secciones, media, orden con el mismo endpoint de reorden atómico de etapa 2, preview por `page_revision_id` con permiso `storefront:preview`) y público (`GET /public/storefront/{page_key}` — solo revisiones publicadas, resolviendo data bindings contra catálogo/negocio/horarios reales, cacheable con invalidación al publicar).
- Seed de páginas de sistema (`home`, `menu`, `credits`, …, `is_system_page=true`, §41).

---

# 4. Orden, dependencias y entregables verificables

```text
Etapa 0  Infra (PostGIS, stored_files)      → nada la precede
Etapa 1  Negocio y perfiles                 → 0
Etapa 2  Catálogo                           → 0, 1 (imágenes)
Etapa 3  Zonas y tarifas                    → 0, 1
Etapa 4  Pedidos núcleo                     → 1, 2, 3
Etapa 5  Pagos, POS y tickets               → 4
Etapa 6  Repartidores                       → 4, 5 (instrucciones de cobro)
Etapa 7  Finanzas y reembolsos              → 5
Etapa 8  Créditos                           → 4, 7
Etapa 9  Storefront                         → 1, 2 (data bindings); independiente de 4–8
```

El storefront (9) puede avanzar en paralelo desde que existan catálogo y negocio. El corte natural de «Fase 1 del reporte» (§27) es: etapas 0–5 + 9; «Fase 2»: 6–8.

Cada etapa termina con:

1. Migración aplicada y reversible (`alembic upgrade/downgrade`).
2. Suite canónica verde (`python -m backend.tests.canonical_suite`) incluyendo módulos de test nuevos registrados en la suite.
3. `test_security_catalog.py` actualizado con los permisos nuevos.
4. OpenAPI revisado (guard de `test_auth_routes.py` intacto).
5. Reconciliación aditiva ejecutada en el deploy (seed) — el rol admin del sistema recibe los permisos nuevos — y el wizard sigue inicializando en limpio (`npm run test:e2e:bootstrap` verde cuando la etapa toca permisos o seeds).
6. Seeds de datos de la etapa idempotentes: re-ejecutar el seed no duplica filas.

---

# 5. Permisos nuevos (grupos a crear en `app/security/groups/`)

```text
business:read / business:update
catalog:read / catalog:create / catalog:update / catalog:sort
files:upload / files:read
shipping:read / shipping:manage
orders:read / orders:capture / orders:approve / orders:transition /
orders:cancel / orders:adjust_shipping / orders:adjust
payments:read / payments:verify / payments:refund
tickets:print
deliveries:read / deliveries:assign / deliveries:self_assign /
deliveries:complete_for_courier
finances:read / finances:record / finances:void
credits:read_all / credits:manual_adjust
storefront:read_draft / storefront:edit / storefront:manage_media /
storefront:manage_theme / storefront:preview / storefront:publish /
storefront:rollback
```

(El autoservicio del cliente — sus pedidos, direcciones, créditos — NO usa permisos: usa propiedad del registro, §8.1.)

---

# 6. Riesgos y decisiones a validar temprano

1. **Carreras de concurrencia**: límite diario por producto, reserva de créditos y «tomar envío» requieren bloqueo explícito; escribir tests de concurrencia dirigidos (dos transacciones) en etapas 4, 6 y 8.
2. **BYTEA para imágenes**: aceptado por el reporte (§7), pero fijar límites de tamaño desde etapa 0 y mantener `file_content` fuera de todo listado/query engine (nunca en `XListItem`).
3. **PostGIS en CI/tests locales**: los tests canónicos actuales no levantan Postgres; decidir en etapa 0 si los tests de dominio geoespacial corren solo contra el stack Docker dev (recomendado) y documentarlo.
4. **Rendimiento del menú público y storefront público**: son los endpoints calientes; diseñarlos desde el inicio con respuesta denormalizada + caché (invalidación al editar catálogo / publicar revisión).
5. **La máquina de estados de pedidos** es el punto de mayor riesgo de regresión: tabla de transiciones declarativa (estado origen → estados destino × permiso × condiciones) con tests exhaustivos, no `if`s dispersos.
