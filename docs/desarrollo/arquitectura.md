# Arquitectura

Mapa técnico de referencia. Convenciones de trabajo y comandos exactos para
agentes: [`CLAUDE.md`](../../CLAUDE.md).

## Vista general

Monorepo con stack Docker Compose: `nginx` → `frontend` (Next.js) + `backend`
(FastAPI), más `postgres` (PostGIS) y `redis`. Toda la API bajo `/api/v1`.

```
backend/app/
├── auth/        Login (cookie httponly o Bearer), lockout en Redis, registro 2 pasos
├── security/    RBAC declarado en código: SecurityGroup → catálogo → Depends
├── query/       Motor de listados allowlist-only (ListQueryContract + planes compilados)
├── resources/   RESOURCE_REGISTRY → /api/v1/resources (proyección por permisos) + navegación
├── models/      SQLAlchemy 2.0 declarativo (¡la sesión es de SQLModel, los modelos NO!)
├── schemas/     Contratos por operación (ApiRead/Write/PatchSchema; extra="forbid" en writes)
├── services/    Lógica de dominio (una transacción por request; commit en el router)
├── api/v1/      Routers delgados (validar → servicio → auditar → commit)
├── jobs/tasks/  Tareas Taskiq (ticks por minuto que consultan trabajo vencido en BD)
└── storefront/  Contratos Pydantic del sitio configurable + presets de tema
frontend/src/
├── app/(storefront)/  Sitio público del cliente     ├── app/panel/  Operación diaria
├── app/(public)/      Login/registro                └── app/admin/  Administración
├── components/        UI (genéricos por contrato + storefront + layout TTShell)
├── core/              Clientes API (tipos SOLO de src/generated/openapi.ts), stores
└── generated/         openapi.ts — regenerado del backend, con guardia de drift
```

## Decisiones estructurales clave

- **Identidad**: JWT HS256 cuyo `jti` es una *versión de token* por usuario —
  rotarla (cambio de contraseña/correo, revocar sesiones) invalida todo al
  instante sin lista negra.
- **RBAC**: permisos como enums en código, almacenados como strings en
  `role_access`, exigidos con `Permiso.requiere` como dependencia FastAPI. El
  frontend jamás decide por nombre de rol: la navegación llega proyectada.
- **Query engine**: solo los campos declarados son filtrables/ordenables
  ("lo no declarado permanece prohibido"); errores de configuración fallan en
  el import, errores del cliente → 422 con sobre `{code, message, errors}`.
- **Configuración editable en runtime** en `system_settings` (singleton
  auditado, secretos Fernet write-only); el `.env` guarda solo secretos de
  despliegue y gates que la UI no puede saltar.
- **Fechas**: `utc_now()` devuelve UTC **naive**; la conexión PG fija
  `TimeZone=UTC`. No comparar naive contra aware.
- **Enums** persistidos como VARCHAR + CHECK (no nativos).
- **Archivos** en BYTEA con validación por magic bytes y perfiles por uso;
  entrega pública solo imagen/favicon; **SVG bloqueado** en branding.

## Dominio restaurante — invariantes (backend + BD, jamás solo frontend)

- Pedido **100 % dinero o 100 % créditos**; canje sin envío y sin códigos.
- **Pago confirmado ≠ completado**: `completed` = entrega real; ahí se
  acreditan créditos ganados y se consumen canjes/códigos. Contra-entrega se
  cobra atómicamente al completar.
- Cancelar con cobro exige resolución explícita (reembolso ahora/pendiente/
  retener con motivo) → cola de conciliación.
- Totales **congelados al aprobar** (incluido envío final); ajustes
  posteriores auditados.
- Cantidades: enteros positivos estrictos en schema, servicio y CHECK.
- Máquina de estados declarativa (`ORDER_TRANSITIONS`) con hooks centrales:
  la transición crea la notificación del cliente en la misma transacción.

## Storefront plano (sin CMS)

Tablas `storefront_settings` (singleton: tema, metadatos, carrusel),
`storefront_heros`, `storefront_highlights`, `storefront_footer`. La portada es
composición fija en código; guardar publica al instante (`is_active` es el
único gate). Contratos Pydantic `extra="forbid"` en
`app/storefront/templates.py`; CTAs con tipos de enlace controlados; tema por
presets + tokens (nunca CSS libre). Público:
`GET /public/storefront/site` (todo en una llamada) y
`GET /public/storefront/highlights?surface=`.

## Notificaciones

Una fila `notifications` por usuario/evento = **campana + correo** (cola
`email_status` en la misma fila). Las filas se crean **dentro** de la
transacción del evento (checkout → alertas `order_new` a roles con
`notifications:order_alerts`; `transition_order` → fila del cliente). Correos:
hilo best-effort post-commit + tick Taskiq por minuto con
`FOR UPDATE SKIP LOCKED` (sin duplicados). Difusión del admin con
`notifications:send`, auditada.

## Frontend

- **Tipos solo de `src/generated/openapi.ts`** (`npm run generate:api`, guardia
  `check:api`) — cero interfaces espejo.
- Tres mundos de tokens: `tt-*` (panel/admin, shell `TTShell`) y `--sf-*`
  (sitio público, derivados del tema publicado con parseo allowlist).
- El admin genérico se dirige por `GET /api/v1/resources`; las pantallas
  especializadas se registran en la navegación del backend.
