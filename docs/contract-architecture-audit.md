# Auditoría de arquitectura de contratos — Release Candidate

**Fecha:** 2026-07-04 · **Commit base:** `272b9fd` · Inventario factual previo a las etapas del RC
(`docs/release-candidate-spec.md`). Complementa `docs/architecture/resource-contract-audit.md`
(auditoría del motor genérico, previa al dominio restaurante).

## 1. Contrato OpenAPI

- **Fuente:** `GET /api/openapi.json` (rutas montadas bajo `/api/v1`).
- **Generación de tipos:** `npm run generate:api` (`frontend/scripts/generate-openapi.mjs`) →
  `frontend/src/generated/openapi.ts` (único archivo generado; nunca se edita a mano).
- **Guarda de drift:** `npm run check:api` (mismo script con `--check`); incluido en
  `npm run check:canonical`. Se ejecuta contra backend vivo antes de cerrar cada etapa.
- **Consumo:** aliases type-only en `src/core/api/contracts.ts` (plataforma) y
  `src/core/restaurant-api/contracts.ts` (dominio), patrón `components["schemas"]["X"]`.

## 2. Cliente API compartido y adaptadores

| Pieza | Archivo | Rol |
|---|---|---|
| `requestJson<T>` | `src/core/api/request.ts` | base de todo fetch; serialización + multipart + envelope `{code,message,errors}` |
| `browserApi` | `src/core/api/browser-client.ts` | mutaciones del navegador (`credentials: "include"`, cookie httponly) |
| `serverApi` | `src/core/api/server-client.ts` | data en RSC (`BACKEND_INTERNAL_URL`, `no-store`, cookie reenviada) |
| `api-error.ts` | `src/core/api/api-error.ts` | normalización de errores |
| Adaptadores dominio | `src/core/restaurant-api/*` (`business`, `menu`, `storefront`, `orders`, `view-models`, `theme`, `site-metadata`) | envolturas centralizadas; jamás replican contratos |

## 3. Catálogo dinámico `GET /api/v1/resources`

- Proyección por sesión/RBAC (`backend/app/resources/projection.py`); recurso invisible = omitido;
  `GET /resources/{name}` → 404 uniforme.
- `PlatformShell` deriva la navegación admin iterando el catálogo (sin menú hardcodeado;
  único mapeo especial: `backup_settings`/`backup_runs` → `/admin/backups`).
- CRUD genérico: `/admin/resources/[resourceName]` con `ResourceTable`, filtros declarativos,
  formularios desde capability `forms`, `RelationEditor`, acciones condicionales.

### ResourceDefinitions existentes (en `backend/app/resources/registry.py`)

`users`, `roles`, `system_settings`, `backup_settings`, `backup_runs`, `audit_events`, `permissions` — **7, todas de platform-core**.

### Recursos del dominio restaurante registrados

**Ninguno al inicio del RC.** Los módulos del dominio (catálogo, zonas, tarifas, métodos de pago,
categorías financieras, perfiles, códigos de descuento) existen sólo como routers especializados.
**Brecha a cerrar en Etapa 7** — candidatos a registry (contratos CRUD compatibles):

- `product_categories`, `products`, `modifier_groups`, `modifier_options` (catálogo)
- `payment_methods`, `finance_categories`
- `delivery_zones`, `shipping_rates`
- `discount_codes` (se crea en Etapa 5)
- `staff_profiles` / `customer_profiles` (lectura/gestión limitada)

### Pantallas especializadas (correctamente fuera del CRUD genérico)

Storefront (editor + público), POS, pedidos (`/panel/pedidos`), cocina, reparto, tickets,
carrito, checkout, créditos, cuenta, configurador de producto. Su **acceso** debe derivarse de
capabilities/permisos reales; hoy `/panel` filtra módulos por `session.permissions`
(sin `role === "x"` en todo `src/`), y `/admin/storefront` se alcanza por URL —
**brecha de navegación declarativa a cerrar en Etapa 7** (extensión mínima del contrato).

## 4. Schemas Storefront

- Backend expone JSON Schema por plantilla (`GET /storefront/templates`: content/style/
  data_binding/behavior) y `header_schema`/`footer_schema` en `GET /storefront/layout`.
- Editor consume esos schemas vía `SchemaForm`. **Espejo local a eliminar:** `HEADER_SCHEMA`/
  `FOOTER_SCHEMA` fallback en `StorefrontAdminView.tsx` (el contrato ya existe → Etapa 6).
- Payload público `/public/storefront/{page_key}`: tipado defensivo en `view-models.ts` porque
  OpenAPI lo declara `dict` — **brecha backend** (tipar `response_model`) en Etapa 6.

## 5. Espejos/tipos manuales detectados (a eliminar o justificar)

| Ubicación | Tipo | Situación |
|---|---|---|
| `admin/storefront/editor-api.ts` | `PageSummary`, `TemplateInfo`, `DraftRevision`, … | endpoints ya tipados en OpenAPI → migrar a aliases de `components["schemas"]` |
| `panel/pedidos/OrdersBoard.tsx` | `OrderRow` | endpoint tipado → usar tipo generado |
| `panel/pos/PosView.tsx` | `PosLine`/`PosResult` | ídem |
| `panel/reparto/RepartoView.tsx` | `QueueItem`/`Assignment`/`Summary` | ídem |
| `panel/tickets/TicketView.tsx` | `TicketPayload` | ídem |
| `(storefront)/creditos/page.tsx` | `CreditTotals`/`CreditMovement` | ídem |
| `core/restaurant-api/view-models.ts` | VMs storefront público | justificado mientras el payload sea `dict`; eliminar al tipar el endpoint |

## 6. Tests-guarda del catálogo

- `backend/tests/test_security_catalog.py` — lista exacta y unicidad de permisos.
- `backend/tests/test_resources_capabilities.py` — proyección de capabilities + 403 forjados.
- `backend/tests/test_bootstrap_routes.py` — rutas de bootstrap.
- Complementarios: `test_capability_config_errors`, `test_error_contract`, `test_csrf_origin`,
  `test_admin_survival`, `test_auth_routes` (ausencia de `/auth/refresh|logout`).

Regla: cada permiso, grupo, ResourceDefinition, acción o ruta bootstrap nueva actualiza su
test-guarda en el mismo cambio. Nunca skip/relajar/borrar.

## 7. Capacidades backend faltantes al inicio del RC (resumen)

| Capacidad | Estado | Etapa |
|---|---|---|
| `purchase_mode` a nivel pedido (money XOR credits) + validaciones | NO EXISTE (sólo por línea; mezcla permitida) | 2 |
| `discount_codes`/`discount_code_redemptions` + permisos + adjustment `discount_code` | NO EXISTE | 5 |
| Cancelación con resolución financiera tri-estado + cola de reembolsos pendientes | PARCIAL (`acknowledge_paid_payments`) | 4 |
| Preview firmado temporal (≤24 h) | PARCIAL (sólo permiso `storefront:preview`) | 6 |
| Supersesión de publicación programada (cancelar si hubo publish posterior) | A VERIFICAR/IMPLEMENTAR | 6 |
| Payload público storefront tipado + eliminación de espejos | PARCIAL | 6 |
| Templates `content.image_text`/`info_cards`/`faq` | NO EXISTEN | 6 |
| ResourceDefinitions del dominio + navegación de módulos especializados | NO EXISTE | 7 |
| Expiración de `submitted` a 60 min (job) | NO EXISTE | 7 |
| Notificaciones A/C/G de pedidos | NO EXISTE (infra email sí) | 7 |
| Rate limiting de checkout y validación de código | NO EXISTE (sí auth/quote) | 7 |
| Reportes ventas por hora / más vendidos | NO EXISTE | 7 |
| Tests de concurrencia dos sesiones PG | NO EXISTEN | 8 |
