# Pruebas y verificación

Todo se ejecuta **desde la raíz del repo** (el paquete raíz es `backend`).

## Suite canónica del backend

`stdlib unittest`; `backend/tests/` **no tiene `__init__.py`** — no uses
`discover`, corre por nombre de módulo:

```bash
python -m backend.tests.canonical_suite                      # todo (imprime total/passed/failed)
python -m unittest backend.tests.test_storefront             # un módulo
python -m unittest backend.tests.test_orders.OrdersTest.test_x  # un test
```

- Cada módulo exporta su propio dict `DEV_ENV` y hace `os.environ.update(DEV_ENV)`
  **antes** de importar la app (no hay defaults para secretos). En Windows,
  exporta además `PYTHONUTF8=1`.
- Los tests corren sobre SQLite en memoria; con `TEST_POSTGRES_URL` apuntando a
  una base `*_test` se activan también los de Postgres real (query engine,
  broker Taskiq).
- Al añadir un módulo de tests: regístralo en
  `backend/tests/canonical_suite.py`.

## Suite canónica del frontend

```bash
cd frontend && npm run check:canonical
# = check:api + lint + typecheck + todos los tests unitarios + build
```

`check:api` exige `OPENAPI_URL` hacia un **backend vivo** (basta un uvicorn
local con el DEV_ENV mínimo; no necesita BD para servir el schema).

## Contrato OpenAPI sin drift

Los tipos del frontend viven SOLO en `src/generated/openapi.ts`:

```bash
# 1. Backend vivo en un puerto libre
uvicorn backend.app.main:app --port 18000   # con el DEV_ENV exportado
# 2. Regenerar y validar
cd frontend
OPENAPI_URL=http://127.0.0.1:18000/api/openapi.json npm run generate:api
OPENAPI_URL=... npm run check:api            # falla si hay drift o edición manual
```

Verifica que el JSON traiga los schemas recién añadidos antes de aceptar el
regenerado (cuidado con procesos zombis sirviendo un schema viejo).

## Migraciones

```bash
alembic -c backend/alembic.ini revision --autogenerate -m "mensaje"
alembic -c backend/alembic.ini upgrade head
```

Valida SIEMPRE la cadena completa contra un PostGIS desechable antes de
mergear (upgrade → downgrade → upgrade de tu revisión):

```bash
docker run -d --rm --name mig-check -e POSTGRES_USER=platform \
  -e POSTGRES_PASSWORD=platform -e POSTGRES_DB=mig_check -p 55433:5432 \
  postgis/postgis:16-3.5-alpine
POSTGRES_SERVER=localhost POSTGRES_PORT=55433 POSTGRES_DB=mig_check \
  alembic -c backend/alembic.ini upgrade head    # (resto del DEV_ENV exportado)
docker rm -f mig-check
```

Reglas: enums como VARCHAR + CHECK (no nativos); la tabla del broker Taskiq
**no** se migra; migraciones destructivas documentan su downgrade.

## Entorno de desarrollo completo

```bash
docker compose -f compose.dev.yml up --build           # postgres + redis + mailpit + backend + frontend
docker compose -f compose.dev.yml --profile migrate up migrate
docker compose -f compose.dev.yml --profile taskiq up taskiq-worker taskiq-scheduler
```

Mailpit captura el correo saliente en http://localhost:8025. API docs en
`/api/docs`.

## Qué mantener verde al cambiar código

| Cambias… | Actualiza también |
|---|---|
| Un permiso | `test_security_catalog.py` (lista exacta y ordenada), `test_resources_capabilities.py`, `test_bootstrap_routes.py` |
| Rutas de la API | `test_auth_routes.py` asserts sobre el OpenAPI; regenerar tipos del frontend |
| Un modelo | Migración Alembic validada contra PostGIS |
| Contratos públicos | `generate:api` + `check:api` (el build del frontend depende de ellos) |
