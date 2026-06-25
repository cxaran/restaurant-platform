---
name: platform-api-conventions
description: Use when editing FastAPI routes, Pydantic schemas, REST endpoints, pagination, filters, OpenAPI, RBAC permissions, database-facing API contracts, or API error behavior in platform-core.
---

# Platform API Conventions

Use this skill for backend API work in `platform-core`.

The project direction is a modular monolith, API-first, reusable base backend for web and mobile products. Keep changes small and aligned with the existing structure. Do not introduce broad architectural refactors unless explicitly requested.

## Project Structure

This project does not use a `modules/` directory.

Use the current layered backend structure:

- `backend/app/api/` for routers and versioned route composition.
- `backend/app/auth/` for authentication flows, token/session logic, and auth dependencies.
- `backend/app/core/` for settings, database, Redis, and infrastructure config.
- `backend/app/models/` for SQLAlchemy ORM models.
- `backend/app/schemas/` for Pydantic HTTP contracts.
- `backend/app/security/` for RBAC permission catalog and permission checks.
- `backend/app/utils/` for small shared helpers.

Do not introduce a `modules/` structure unless the user explicitly requests a structural refactor.

## Language Policy

Use English for technical identifiers:

- routes
- schema names
- class names
- function names
- field names
- permission strings
- module names

Use Spanish for user-facing text:

- API response messages
- `HTTPException.detail`
- emails
- business-oriented comments and docstrings when useful for maintainers

Example: `LoginRequest`, `users:read`, `/api/v1/auth/login`, but `"Sesión iniciada correctamente"`.

## REST And Routing

- Public API routes live under `/api/v1`.
- Use plural resource nouns: `/users`, `/roles`, `/permissions`.
- Use path params for single resources: `/users/{user_id}`.
- Do not duplicate prefixes in endpoint decorators.
- Auth action routes live under `/auth`.
- Existing auth routes are:
  - `POST /api/v1/auth/login`
  - `GET /api/v1/auth/me`
  - `POST /api/v1/auth/register/request`
  - `POST /api/v1/auth/register/complete`
  - `POST /api/v1/auth/unlock`

Do not add `/refresh` or `/logout` unless explicitly requested.

Use HTTP methods consistently:

- `GET` reads resources.
- `POST` creates resources or executes explicit actions.
- `PATCH` is the default update method.
- `PUT` is only for true full replacement.
- `DELETE` deletes or soft-deletes depending on the resource.

Use explicit action subroutes only for non-CRUD behavior, such as `POST /users/{user_id}/restore`.

## Schemas

Schemas are HTTP contracts, not ORM mirrors.

- Use separate request and response schemas when exposure or semantics differ.
- Input schemas should use `extra="forbid"` unless there is a documented exception.
- Output schemas built from ORM objects should use `from_attributes=True`.
- Always declare `response_model` for JSON domain endpoints.
- Do not return ORM models directly without an output schema.
- Do not accept server-controlled fields in request bodies: `id`, timestamps, ownership, privilege flags, or audit fields.
- For `PATCH`, use optional fields and apply changes with `model_dump(exclude_unset=True)`.

Preferred schema names:

- `XCreate`
- `XUpdate`
- `XRead`
- `XListItem`
- `XReplace` (full replacement, PUT)
- `XAction`Request / `XAction`Result for non-CRUD actions (e.g. `PasswordChangeRequest`)

## Reusable route helpers (`api/resource_actions.py`)

Routes should read as business logic only; the repetitive parts use **general,
multi-use** helpers (not single-use functions). Reuse these instead of inlining
SQL/serialization/CRUD in a router:

- Reads: `get_or_404`, `serialize` / `serialize_many` / `serialize_with`,
  `list_child_values` (scalar children, e.g. a role's permission strings),
  `related_stmt` (base stmt to list entities via an association table),
  `paginate_resource` (wraps `ResourceQuery.paginate`).
- Writes: `create_entity`, `patch_entity` (PATCH = `exclude_unset` + optional
  token rotation on sensitive fields), `update_entity_values`, `deactivate_entity`
  (soft delete via `is_active`), `replace_to_many` (M2M, e.g. user↔roles),
  `replace_child_values` (scalar children with allowlist, e.g. role permissions),
  `ensure_allowed_values`.
- Infra: `api_error`, `commit_or_conflict` (maps `IntegrityError`→409),
  `touch_entity` (audit `updated_at`/`updated_by`), `assign_values`, `dedupe`.

Rule: if a piece of route logic is generic enough to recur, it belongs in
`resource_actions.py` as a general helper — never as a one-off function in the
router. Permission catalog derivation uses `security/catalog.declared_permissions()`
(single source), not inline comprehensions.

The `/users` prefix is served by two routers: `api/v1/users.py` (self-service:
`/me`, `/me/password`) included **before** `api/v1/users_admin.py` (admin CRUD +
`/{user_id}/roles`, `/{user_id}/revoke-sessions`), so the literal `/me` wins over
`/{user_id}`.

## Authentication

The app supports both a browser cookie and a bearer JWT, read from the same
request. Either token path is valid.

- `/auth/login` uses `backend.app.auth.auth.authenticate` and `set_session_cookie`
  (cookie key `session_token`, see `auth/auth.py`).
- `/auth/me` and protected routes read either the `session_token` cookie or
  `Authorization: Bearer` via `auth/auth_dependencies.py` (`get_current_user`).
- The token is a JWT whose `jti` is a **token version**, not a token id: it holds
  `User.token`. Any password/email change or forced logout rotates `User.token`,
  invalidating all previously issued JWTs. Do not treat `jti` as unique per token.
- Public auth routes do not require a logged-in user: `/login`,
  `/register/request`, `/register/complete`, `/unlock`.

Do not add `/refresh` or `/logout` unless explicitly requested; `test_auth_routes.py`
asserts they are absent from the OpenAPI schema.

Future production hardening may include `Secure` cookies, CSRF protection for
browser mutating requests, and additional JWT claims such as `iss` and `aud`. Do
not add those unless requested.

## RBAC And Permissions

Authorization is permission-based, not role-name-based.

- Roles aggregate permissions.
- Endpoints should check permissions, not role names.
- Permission strings are stable policy identifiers.
- Use the catalog in `backend/app/security/catalog.py`.

Current permission groups:

- `UserPermissions`
- `RolePermissions`
- `PermissionPermissions`

Current permission string style:

- `users:read`
- `users:create`
- `users:update`
- `users:delete`
- `users:manage_roles`
- `roles:read`
- `roles:create`
- `roles:update`
- `roles:delete`
- `roles:manage_permissions`
- `permissions:read`

When adding a permission, update the relevant group and update catalog tests.

## Pagination, Filters, And Sorting

Use offset pagination by default for CRUD/admin endpoints.

- Use `limit` and `offset`.
- Define a default `limit` and a maximum `limit`.
- Always use deterministic ordering.
- Append `id` internally as a tie-breaker when the primary sort is not unique.
- Do not compute exact `total` automatically; prefer `has_next` unless the UI needs total pages.

Use cursor/keyset pagination only for large, dynamic, feed-like, or deep-scroll endpoints.

Filtering rules:

- Use query params.
- Use typed query schemas for complex filters.
- Use allowlists for filterable and sortable fields.
- Use repeated query params for multi-value filters.
- Reject unknown sort fields.
- Do not accept raw column names or SQL expressions from clients.

Search rules:

- Use `q` for human text search.
- Keep exact filters separate from text search.
- Design Postgres indexes from real filter and sort patterns.

## Database And Migrations

PostgreSQL is the source of truth.

- Every schema change must go through Alembic.
- Keep SQLAlchemy models on `backend.app.models.base.Base`.
- Do not use `SQLModel` for ORM models in this project.
- Use UTC timestamps.
- Use `Decimal` / `NUMERIC` for money, never `float`.
- Use database constraints and indexes for critical integrity.

## Active State And Soft Delete

`is_active` and `deleted_at` have different purposes and may coexist.

- `is_active`: operational enable/disable state.
- `deleted_at`: soft deletion timestamp.
- `deleted_by`: actor who soft-deleted the record, when applicable.

Do not replace `is_active` with `deleted_at`, or `deleted_at` with `is_active`, without an explicit migration decision.

Soft delete is selective, not universal. Apply it only when the resource needs recovery, history, or lifecycle semantics.

## Multi-Tenancy

This is a base project intended to be reused by other projects.

Do not apply multi-tenancy by default.

Do not add these unless the consuming project has an explicit product direction for multi-tenancy:

- `organization_id`
- `tenant_id`
- tenant-aware permissions
- tenant-scoped indexes
- tenant filters

When multi-tenancy is required, define first:

- tenant entity name
- data ownership boundaries
- global vs tenant-scoped permissions
- authorization rules
- required indexes

## Errors

Use stable HTTP status codes:

- `400` malformed or unsupported request shape.
- `401` missing or invalid authentication.
- `403` authenticated but missing permission.
- `404` resource not found.
- `409` uniqueness or state conflict.
- `422` validation error.

### Unified error envelope (already in place)

`core/error_handlers.py` (registered in `main.py` via `register_exception_handlers`)
normalizes every error to the `ErrorResponse` envelope `{code, message, errors?}`
(`schemas/error.py`). There is **no per-route error helper requirement** — just
raise FastAPI's native `HTTPException`:

- `raise HTTPException(status_code=401, detail="Credenciales inválidas")` →
  `{"code": "http_401", "message": "Credenciales inválidas"}` (generic code, via
  `_http_exception_handler`). This is the preferred, shortest form for simple
  route errors.
- `QueryParameterError`/`RequestValidationError` → `422` with `errors[].field`.

When a **semantic code** or **field-level errors** are useful, the route or a
helper raises `HTTPException(detail={"code": ..., "message": ..., "errors": [...]})`
and the handler passes it through unchanged. `resource_actions.api_error(status,
code, message, errors=)` is the convenience wrapper for that (used by the CRUD
helpers, e.g. `get_or_404` → `resource_not_found`, `ensure_allowed_values` →
field errors). Do not catch these in the router; let the handler build the body.

Future target: RFC 9457 Problem Details using `application/problem+json`. Do not introduce a partial error framework without an explicit task.

Never expose stack traces, SQL strings, secrets, internal hostnames, or infrastructure details in API responses.

## Tests

For API changes:

- Add or update route contract tests.
- Assert OpenAPI contains expected public routes.
- Assert unimplemented routes are not exposed when that matters.
  (`test_auth_routes.py` asserts `/auth/refresh` and `/auth/logout` are absent.)
- Add catalog tests when adding permissions
  (`test_security_catalog.py` asserts the exact ordered permission list).
- Tests are stdlib `unittest`. `backend/tests/` has **no `__init__.py`**, so
  `unittest discover` does **not** work. Run modules explicitly from the repo
  root (see `AGENTS.md` for the full module list), e.g.:
  `python -m unittest backend.tests.test_auth_routes`

For auth routes, keep tests aligned with the current contract:

- `/api/v1/auth/login`
- `/api/v1/auth/me`
- `/api/v1/auth/register/request`
- `/api/v1/auth/register/complete`
- `/api/v1/auth/unlock`

## Documentation Direction

When asked to document conventions, prefer these files:

- `docs/project-direction.md`
- `docs/engineering-standards.md`
- `docs/api-conventions.md`
- `docs/security.md`
- `docs/database-conventions.md`
- `docs/adr/`

Do not create these docs unless requested.
