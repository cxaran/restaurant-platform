# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Monorepo with a Docker Compose stack: `nginx` (reverse proxy) → `frontend` + `backend`, plus `redis` and `postgres`.

- `backend/` — FastAPI application.
- `frontend/` — Next.js application.
- `nginx/nginx.conf` — routes `/api/` to backend:8000 and everything else to frontend:3000.
- `compose.yml` (prod) / `compose.dev.yml` (dev) — both read env from `${APP_ENV_FILE:-.env}`; dev also injects inline env vars and runs Postgres + Mailpit.

## Critical convention: imports are absolute from `backend.`

Every module imports as `from backend.app... import ...`. The top-level package is **`backend`** (its parent, the repo root, must be on `PYTHONPATH`). Consequences:

- Always run commands **from the repo root** (`restaurant-platform/`), not from `backend/`.
- The ASGI app path is `backend.app.main:app` (the `Dockerfile` copies the source to `/app/backend/` with `PYTHONPATH=/app`, so this resolves both locally and in-container).

## Commands

Run everything from the repo root. Python deps live in `backend/venv` (activate it or use `backend/venv/Scripts/python`).

```powershell
# Run the API locally (needs Postgres + Redis reachable and env vars set)
uvicorn backend.app.main:app --reload

# Backend canonical suite (stdlib unittest; tests/ has no __init__.py, so do not use `discover`)
python -m backend.tests.canonical_suite
python -m unittest backend.tests.test_security_catalog          # single module
python -m unittest backend.tests.test_security_catalog.SecurityCatalogTest.test_catalog_permissions_are_unique  # single test

# Frontend canonical suite (run inside frontend container or frontend/ workdir)
npm run check:canonical

# Database migrations (Alembic config lives in backend/, points at backend/alembic)
alembic -c backend/alembic.ini revision --autogenerate -m "message"
alembic -c backend/alembic.ini upgrade head

# Full stack
docker compose -f compose.dev.yml up --build                    # dev: postgres + mailpit + backend
docker compose -f compose.dev.yml --profile migrate up migrate  # run migrations in-container
docker compose -f compose.dev.yml --profile taskiq up taskiq-worker taskiq-scheduler  # background jobs
docker compose up --build                                       # prod stack
```

API docs: `/api/docs`, `/api/redoc`, `/api/openapi.json`. All routes are mounted under `/api/v1` (`router.py` chain: `app/main.py` → `api/router.py` (`/api`) → `api/v1/router.py` (`/v1`) → feature routers).

Mailpit dev UI (captured outgoing email): http://localhost:8025.

## Architecture

### Settings & config
`app/core/settings.py` — a single Pydantic `Settings` (cached via `settings = get_settings()`) reads **all** config from environment variables. There are no defaults for secrets/DB/SMTP, so the app fails to import without a complete env. `postgres_dsn` and `mail_config` are computed fields. Tests and `compose.dev.yml` document the full required env var set. `scripts/install.sh` generates a production `.env` with unique random secrets (never overwrites an existing one).

Editable runtime policy lives in the DB, not in env vars: the `system_settings` singleton (`app/models/system_settings.py` + `app/services/system_settings_service.py`) holds public registration, verified base domain, institution name, password reset and the outgoing-mail transport (environment/SMTP/Resend, secrets Fernet-encrypted write-only). Env vars keep only deployment GATES the UI cannot bypass (`REGISTRATION_ALLOWED` → `registration_allowed_effective`). A derived setup checklist (`build_setup_checklist`) is served at `/system-settings/setup-checklist` and rendered as a dismissible banner on the dashboard.

Secrets at rest are encrypted with `app/services/secret_cipher.py`: `APP_ENCRYPTION_KEY` (Fernet) is the single master key (required in production); legacy `BACKUP_TOKEN_ENCRYPTION_KEY` stays in the decrypt chain (lazy re-encryption on rewrite).

Install domain: the deploy is domain-agnostic. The `/setup` wizard captures the public origin from the browser (`window.location.origin`), persists it as `system_settings.app_base_url` (unverified) and feeds the CSRF allowlist at runtime — `TRUSTED_BROWSER_ORIGINS` is an OPTIONAL additive override, no longer required in production. Domain verification: `POST /system-settings/{id}/verify-domain` fetches `GET /domain-challenge/{nonce}` THROUGH the candidate domain and compares an HMAC of the nonce; on success the origin is persisted with `verified_at` and ADDED to the CSRF allowlist at runtime (`app/core/runtime_origins.py` — it only adds, never replaces env origins; stores the guard-comparable form with effective port, and lazily reloads from DB before rejecting so gunicorn multi-worker sees fresh domains).

Config changes are audited via `app/services/config_audit.py` into the append-only `audit_events` table with FIELD NAMES ONLY (never values), and `audit_events` is exposed as a read-only queryable resource under the dedicated `audit_events:read` permission.

### Models & DB (note the SQLAlchemy / SQLModel split)
- Models in `app/models/user.py` use **SQLAlchemy 2.0** `DeclarativeBase` (`app/models/base.py`) with `Mapped[...]` / `mapped_column`. Alembic autogenerate targets `Base.metadata`.
- But `app/core/database.py` hands out **`sqlmodel.Session`** (`SessionDep`). So the ORM models are plain SQLAlchemy while the session type comes from SQLModel — keep new models on the SQLAlchemy `Base`, not `SQLModel`.
- Core tables: `User`, `Role`, `UserRole` (M2M), `RoleAccess` (permission strings attached to a role). UUID PKs, soft-delete via `is_active`, audit columns (`created_at`/`updated_at`/`updated_by`). Platform tables: `platform_setup`, `system_settings` (singleton), `audit_events` (append-only), `backup_settings`/`backup_oauth_states`/`backup_runs`.
- Enums persist as NON-native enums (`native_enum=False` → VARCHAR + CHECK; see `app/models/enums.py`). Size the VARCHAR to the longest value.
- Alembic migrations live in `backend/alembic/versions/`. The Taskiq broker table is NOT migrated (the broker creates it).

### Authentication (`app/auth/`)
- Password hashing: argon2 via passlib (`app/auth/security.py`). `verify_dummy_password` equalizes timing when a user doesn't exist.
- Tokens: **PyJWT**, HS256. `TokenPayload` carries `sub`/`exp`/`iat`/`jti`. The `jti` holds the user's `token` column — a **token version** string. Changing a user's password/email or forcing logout rotates `User.token`, instantly invalidating all existing JWTs (see `get_current_user`, which rejects when `user.token != data.jti`).
- Auth accepts either a `session_token` httponly cookie **or** a bearer token (`get_token` in `auth_dependencies.py`). `CurrentUser` is the dependency that resolves the user and loads their permission set.
- Account lockout (`account_lock.py`): failed attempts counted in Redis; after `TRYS_BEFORE_LOCK`, account is locked with exponential backoff (`get_locked_time`) and an unlock token is emailed.
- Registration is two-step and token-gated (`register.py`): `register/request` emails a token (stored in Redis), `register/complete` consumes it.

### Redis token store (`app/auth/token_store.py`, `app/core/redis.py`)
Generic bidirectional token↔subject store used for registration tokens, unlock tokens, and failed-login counters. `set_token_pair` keeps both `prefix:subject → token` and `token → subject` keys with a TTL so either direction can be looked up and old tokens get evicted on rotation.

### RBAC / permission catalog (`app/security/`)
Permissions are **declared in code**, stored in the DB as plain strings, and enforced as FastAPI dependencies:

- `SecurityControl` (`security_control.py`) wraps one permission string (e.g. `users:read`). Its `.requiere` property returns an `Annotated[bool, Depends(...)]` that raises 403 unless `CurrentUser` has the permission.
- `SecurityGroup` (`security_group.py`) is an `Enum` base; each member is `(access_string, description)` and exposes `.permission`, `.requiere`, `.check`.
- Concrete groups live in `app/security/groups/*.py` (`UserPermissions`, `RolePermissions`, `PermissionPermissions`) and are registered in `app/security/catalog.py` (`SECURITY_GROUPS`).
- Enforce on an endpoint by adding the dependency, e.g. `_: UserPermissions.READ.requiere`.
- A user's permission set is materialized at request time from `RoleAccess.access` joined through `UserRole` (`build_current_user`), and membership is checked via `UserBase.access_control`.

When adding a permission: add the enum member to the relevant group, ensure its group is in `SECURITY_GROUPS`, and update `tests/test_security_catalog.py` (which asserts the exact ordered list of permission strings and that they are unique).

### Schema conventions & the query engine (`app/schemas/`, `app/query/`)
Schemas follow a per-operation convention — a schema is a contract for **one operation/context**, never "the whole table". Technical base classes live in `app/schemas/base.py` (no business fields): root `ApiSchema`; `ApiReadSchema` (`from_attributes=True`) backs `XRead`/`XListItem`; `ApiWriteSchema` (`extra="forbid"`) backs `XCreate`/`XReplace`; `ApiPatchSchema` backs `XUpdate` (PATCH = all-Optional fields + consume with `model_dump(exclude_unset=True)`). The `XQuery` base is `query/schema.py::OffsetQuerySchema`. Naming per resource `X`: `XBase` (optional shared domain fields), `XCreate`, `XRead`, `XListItem`, `XUpdate`, `XReplace`, `XQuery`, `XDeleteResult`, `X<Action>Request/Result`. Note: `schemas/user.py::SessionUser` is the authenticated-session user (has `permissions` + `access_control`), **not** a generic read schema — don't confuse it with `UserRead`.

The `app/query/` engine turns a public read schema + ORM model + `QueryOptions` into a dynamic `XQuery` (FastAPI query-params model) plus filter/sort/pagination application. Security rule is **allowlist**: only fields listed in `QueryOptions` (`filter_fields`, `sort_fields`, `search_fields`, `in_fields`, `null_filter_fields`) become queryable — "lo no declarado permanece prohibido". Config errors fail fast at import (`QuerySchemaConfigError`); bad client params raise `QueryParameterError` → 422 via `core/error_handlers.py` using the `schemas/error.py` envelope (`{code, message, errors}`).

**Phase 2 layers (done):** `ListQueryContract` (`query/contracts.py`) is the main list abstraction — binds model + output schema + compiled query schema + `CompiledQueryPlan`, takes exactly one config source (`options` XOR `policy`), and always passes the explicit `plan` to the engine. `ResourceQuery` (`query/resource.py`) is now a thin **compatibility facade** over it (same constructor/`.Query`/`.paginate`). `QueryOptions.to_policy()` adapts options → `QueryPolicy`/`FieldSpec`; `compile_list_query[_from_policy]` returns `(schema, plan)`; the compiler/executor accept `plan=` (fall back to `__query_*__` only when omitted).

### Routing status
All feature routers are mounted (`api/v1/router.py`): `auth`, `permissions` (catalog read), `roles` (CRUD + permissions), `users` (self-service `/me`) and `users_admin` (admin CRUD + roles + revoke-sessions). `users` + `users_admin` share the `/users` prefix (self-service `/me` included first). Routers build list endpoints with `ResourceQuery` and the **general route helpers** in `api/resource_actions.py` (CRUD/relation/serialize/error helpers — keep one-off logic out of routers). `test_auth_routes.py` asserts `/auth/refresh` and `/auth/logout` are absent from the OpenAPI schema — keep it green when adding/removing routes.

### Restaurant domain (built on top of platform-core)

Three separated frontend experiences (Next.js App Router):

```text
/        → public storefront + customer flows: /menu, /carrito, /checkout,
           /pedidos, /pedidos/[id], /cuenta, /creditos  (group (storefront))
/panel   → daily operation: pedidos, pos, entregas, reparto, tickets —
           modules gated by real permissions, never role === "x"
/admin   → contract-driven admin shell: /admin/resources/[name] (generic CRUD
           from GET /api/v1/resources), /admin/storefront, /admin/backups, …
```

`/sitio` and legacy admin paths only exist as redirects in `frontend/next.config.ts`.

Key backend modules (`app/models` + `app/services` + `api/v1`): catalog (products,
modifier groups/options, `credit_redemption_price`), shipping (PostGIS zones + rates),
orders (state machine in `ORDER_TRANSITIONS`, immutable snapshots, frozen totals on
approval), payments (methods with `requires_manual_verification`/`allows_cash_change`,
verification ≠ fulfillment), deliveries (courier self-assign, `GET /courier/deliveries/mine`),
finances (per-line refunds with accumulated caps), credits (immutable ledger, balance =
SUM(delta), reserve→consume/release), storefront (FLAT config, no versioning: the home
page is a FIXED composition hero-carousel → highlight strip → live menu → footer; tables
`storefront_settings`/`storefront_heros`/`storefront_highlights`/`storefront_footer`,
Pydantic contracts in `app/storefront/templates.py`, saving publishes instantly — the only
gate is `is_active`; public payload at `GET /public/storefront/site` + `/highlights?surface=`),
profiles (customer/staff, `can_deliver`), discount codes (fixed-amount, web-only),
notifications (persistent per-user rows = in-app bell + email queue on the SAME row
(`email_status` pending→sent/failed/skipped); rows are created INSIDE the triggering
transaction — web-order created → users whose role grants `notifications:order_alerts`;
status transition → customer, hooked centrally in `transition_order`; admin broadcast via
`notifications:send` at `/admin/notificaciones` — emails dispatched by a post-commit
best-effort thread plus the `notifications.tick` Taskiq cron as safety net with
`FOR UPDATE SKIP LOCKED`).

Non-negotiable domain invariants (enforced backend + DB, never frontend-only):

- An order is **100% money or 100% credits** — no mixed lines, no monetary top-up,
  no shipping and no discount codes on credits orders.
- **Payment confirmed ≠ order completed**: `completed` means real fulfillment.
  Verifying a transfer never auto-completes (except explicit counter/counter sale rule).
  Cash-on-delivery is collected atomically with completion.
- Discount codes: fixed amount X with minimum Y, `source=online` + authenticated
  customer only, one use per user, reserve→consume on completed / release on
  cancel/expire, immutable snapshots on redemptions. **No promotions engine.**
- Quantities are strict positive integers at every layer (schema strict=True, service,
  DB CHECK) — never truncate.
- Public SVG is blocked (H8): branding uses ico/png/webp/jpeg only.
- Frontend types come ONLY from `src/generated/openapi.ts` (`npm run generate:api`,
  drift guard `npm run check:api`). Admin navigation derives from `GET /api/v1/resources`.
- `utc_now()` returns naive-UTC by core convention; the PG connection pins
  `TimeZone=UTC` (H7 policy). Don't compare naive against aware without care.

Docs live in `docs/` organized by audience (`operacion/`, `producto/`,
`usuario/`, `desarrollo/` — index at `docs/README.md`); keep them aligned when
changing behavior they describe. Historical audits/plans/specs were removed —
code comments citing `§`/`H*` anchors are historical markers of those documents.
Design handoff (visual reference only, git-ignored): `.design-handoff/`.

### Background jobs & backups
- **Taskiq over PostgreSQL** (`app/taskiq_app.py`; see `docs/desarrollo/tareas-en-segundo-plano.md`). Worker and scheduler are opt-in Docker services (`--profile taskiq`); FastAPI only starts the broker in its lifespan to PUBLISH tasks, never to run them. Channel/table: `restaurant_platform_taskiq*`.
- **Encrypted backups to Google Drive** (`app/services/backup_service.py`; see `docs/operacion/respaldos.md`): `backups.tick` runs every minute and consults due work in PostgreSQL (`backup_settings.next_run_at`) — the real schedule/retention is DB-edited, not a cron. Pipeline: `pg_dump --snapshot` → `pg_restore --list` verify → tar → OPTIONAL `age` encryption → resumable idempotent Drive upload → local GFS retention. An EXPLORER artifact (readable SQLite from the same snapshot, sensitive columns excluded) can accompany each backup. Frontend: `/backups` (Drive files + settings panel) and `/backups/explore` (sql.js WASM + local age decryption in the browser). The Docker image installs `postgresql-client` and `age`.
- Kill switch: `BACKUPS_ENABLED` (env); the real policy switch is `backup_settings.enabled` (UI-editable).

## Language
Code comments, docstrings, and user-facing API messages are written in **Spanish**. Match that when editing.
