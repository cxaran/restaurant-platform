# Runbook de despliegue — restaurant-platform

Guía operativa para instalar/actualizar la plataforma en producción. Complementa
`docs/backups-google-drive.md` y `docs/background-tasks-taskiq.md`.

## 1. Requisitos de infraestructura

- **PostgreSQL 16 con PostGIS** (imagen `postgis/postgis:16-3.5` o servidor externo con la
  extensión disponible). Las migraciones ejecutan `CREATE EXTENSION IF NOT EXISTS postgis`
  (`f4c9d81b2a37`); el usuario de la app debe poder crearla o el DBA debe precrearla.
  La conexión de la app fija `TimeZone=UTC` en `connect_args` (política H7) — no dependas del
  timezone del servidor.
- **Redis** (sesiones de rate limiting, lockout y tokens).
- **Docker + Docker Compose** para el stack canónico (`compose.yml`), o equivalente.
- **SMTP o Resend** para correo saliente (editable en runtime desde `system_settings`).

## 2. Variables de entorno obligatorias

`scripts/install.sh` genera un `.env` de producción con secretos aleatorios únicos y **no
sobreescribe** uno existente. Variables críticas:

| Variable | Rol |
|---|---|
| `SECRET_KEY` | firma JWT (HS256) |
| `APP_ENCRYPTION_KEY` | **maestra Fernet** para secretos en reposo (SMTP/Resend/backups). Obligatoria en producción. Perderla = perder los secretos cifrados |
| `POSTGRES_USER/PASSWORD/SERVER/PORT/DB` | conexión a PostGIS |
| `REDIS_HOST/PORT/DB` | Redis |
| `SMTP_*` | transporte de correo modo `environment` |
| `TRUSTED_BROWSER_ORIGINS` | override OPCIONAL de la allowlist CSRF (el dominio se declara en `/setup` y vive en `system_settings`) |
| `BOOTSTRAP_SETUP_TOKEN` | autoriza el wizard `/setup` (obligatoria en producción) |
| `ENVIRONMENT` | `production` activa cookies Secure, fail-closed de rate limit, guardas de correo |
| `REGISTRATION_ALLOWED` | gate de despliegue que la UI no puede saltar |
| `BACKUPS_ENABLED` | kill-switch de backups |
| `RATE_LIMIT_*` | buckets de login/bootstrap/forgot/registro/cotización/checkout |

No hay defaults para secretos: la app **no importa** sin el entorno completo.

## 3. Orden de despliegue (instalación nueva)

```text
1. Provisionar PostGIS + Redis; crear base vacía.
2. Generar .env (scripts/install.sh) y completar SMTP/orígenes.
3. docker compose up --build -d           # nginx → frontend + backend
4. docker compose -f compose.dev.yml --profile migrate up migrate
   (o: alembic -c backend/alembic.ini upgrade head con el .env cargado)
5. Levantar workers Taskiq: --profile taskiq up taskiq-worker taskiq-scheduler
   (publicación programada del storefront, expiración de pedidos, purgas y backups
   NO ocurren sin el worker+scheduler).
6. Abrir /setup y completar el wizard de bootstrap (crea admin + rol fundacional
   con TODOS los permisos declarados).
7. Verificación post-deploy (sección 5).
```

## 4. Actualización (release existente)

```text
1. Backup verificado reciente (ver docs/backups-google-drive.md) o pg_dump manual.
2. Desplegar imágenes nuevas SIN recrear el contenedor de BD.
3. alembic upgrade head (perfil migrate). Las migraciones con precondiciones
   (p. ej. e8b2c47f91a3) FALLAN explícitamente si hay datos inválidos: leer el
   error, corregir datos, reintentar. Jamás truncar a mano.
4. Reconciliación de permisos: los permisos se declaran en código; tras un deploy
   con permisos nuevos, el rol fundacional (platform_setup.system_admin_role_id)
   debe recibirlos. Verificar en /admin/resources/roles → permisos del rol admin;
   la supervivencia administrativa (admin_coverage_required) impide dejar el
   sistema sin cobertura total.
5. Reiniciar workers Taskiq (toman el código nuevo).
6. Verificación post-deploy.
```

## 5. Verificación post-deploy

```text
- GET /api/health                → 200
- GET /api/openapi.json          → 200 (y check:api del frontend sin drift)
- Login de un usuario admin      → cookie de sesión; dashboard carga
- GET /api/v1/resources          → catálogo según permisos
- Portada pública /              → revisión publicada del storefront (o fallback)
- Mailpit/SMTP: probar correo de prueba desde /admin (system settings)
- Worker Taskiq: log del scheduler registra ticks (backups.tick, storefront)
```

## 6. Rollback

```text
1. Volver a las imágenes anteriores (tags versionados).
2. Si la migración nueva ya corrió y el código viejo no la tolera:
   alembic -c backend/alembic.ini downgrade <revision_anterior>
   Todas las migraciones del dominio tienen downgrade simétrico; las que tienen
   precondiciones documentan su reversa. Si el downgrade destruye datos nuevos
   (tablas de la feature), preferir roll-forward con hotfix.
3. Restaurar backup sólo como último recurso (pg_restore del artefacto verificado).
```

## 7. Permisos de archivos y media

- Archivos subidos viven en BYTEA (BD), servidos por `/api/v1/public/files/{id}` con
  validación por magic bytes y perfiles por uso.
- **SVG está bloqueado** para branding público (H8): logo/favicon sólo `ico/png/webp/jpeg`.
  No relajar `FILE_PROFILES` sin política de entrega segura (CSP sandbox / attachment).
- nginx limita el body multipart (revisar `client_max_body_size` al ajustar tamaños).

## 8. Backups

- Pipeline cifrado a Google Drive: `docs/backups-google-drive.md`. Programa/retención se editan
  en BD (`/admin/backups`), no por cron del sistema. `age` opcional pero recomendado; custodiar
  la clave (se envía por correo al activarla).
- Probar restore en un entorno aislado al menos una vez por release.

## 9. Checklist preproducción

```text
☐ HTTPS real terminado en el proxy; cookies Secure activas (ENVIRONMENT=production)
☐ Dominio público declarado en /setup (o TRUSTED_BROWSER_ORIGINS como override)
☐ BOOTSTRAP_SETUP_TOKEN definido (y retirado del historial de shell)
☐ APP_ENCRYPTION_KEY única y respaldada fuera del servidor
☐ Migraciones aplicadas y verificadas en staging con datos representativos
☐ Workers Taskiq corriendo (scheduler + worker)
☐ Backups habilitados y un restore probado
☐ Rate limits de producción revisados (login/forgot/checkout)
☐ check:api sin drift contra el backend desplegado
☐ Favicon/logo: sólo raster; ningún SVG público
☐ E2E integral (Fase 9 del plan RC) ejecutado contra stack aislado, no producción
```
