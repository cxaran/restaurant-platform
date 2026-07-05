# Instalación (producción self-hosted)

Objetivo: de un servidor vacío a la plataforma operando detrás de HTTPS, con el
conocimiento mínimo — instalar Docker, correr un script, abrir el dominio y
seguir el asistente.

## 1. Requisitos de infraestructura

- **PostgreSQL 16 con PostGIS** (imagen `postgis/postgis:16-3.5` del compose, o
  servidor externo con la extensión disponible). Las migraciones ejecutan
  `CREATE EXTENSION IF NOT EXISTS postgis`; el usuario de la app debe poder
  crearla o el DBA debe precrearla. La conexión fija `TimeZone=UTC` — no
  dependas del timezone del servidor.
- **Redis** (rate limiting, bloqueo de cuentas y tokens de registro/desbloqueo).
- **Docker + Docker Compose** para el stack canónico (`compose.yml`).
- **HTTPS real** terminado en tu proxy externo (el nginx del stack sirve HTTP
  interno: `/api/` → backend, resto → frontend).
- **SMTP o Resend** para correo saliente — se configura después, desde la UI.

## 2. Variables de entorno

`scripts/install.sh` genera el `.env` de producción con **todos los secretos
aleatorios únicos** y nunca sobreescribe uno existente. No hay defaults para
secretos: la app **no arranca** sin el entorno completo.

| Variable | Rol |
|---|---|
| `SECRET_KEY` | Firma JWT (HS256) |
| `APP_ENCRYPTION_KEY` | **Maestra Fernet** para secretos en reposo (SMTP/Resend/backups). Perderla = perder los secretos cifrados. Respáldala fuera del servidor |
| `BOOTSTRAP_SETUP_TOKEN` | Autoriza el asistente `/setup` (obligatoria en producción) |
| `POSTGRES_*` / `REDIS_*` | Conexiones a PostGIS y Redis |
| `SMTP_*` | Transporte de correo del modo `environment` (Mailpit solo en dev) |
| `ENVIRONMENT=production` | Activa cookies Secure, rate limit fail-closed y guardas de correo |
| `REGISTRATION_ALLOWED` | Gate de despliegue del registro público que la UI no puede saltar |
| `BACKUPS_ENABLED` | Kill-switch global de respaldos (ver [respaldos](respaldos.md)) |
| `TRUSTED_BROWSER_ORIGINS` | Override OPCIONAL de la allowlist CSRF — el dominio normal se declara en `/setup` |
| `RATE_LIMIT_*` | Buckets de login/registro/forgot/cotización/checkout |

El despliegue es **agnóstico del dominio**: el asistente `/setup` lo detecta
desde el navegador (el origen público real) y lo persiste en la configuración
del sistema — no vive en el `.env`.

## 3. Pasos

```bash
./scripts/install.sh                          # genera .env; imprime el token de /setup UNA vez
docker compose build
docker compose --profile migrate run --rm migrate
docker compose up -d
docker compose --profile taskiq up -d taskiq-worker taskiq-scheduler
```

> ⚠️ **El worker Taskiq no es opcional en producción**: sin él no corren la
> expiración de pedidos web abandonados, los correos de notificaciones, la
> purga de rastreo de repartidores ni los respaldos.

Después abre `https://tu-dominio.com/setup` con el token que imprimió el
instalador: el asistente crea el administrador inicial y el **rol fundacional
con todos los permisos declarados**, más los roles adicionales que definas.

## 4. Verificación post-instalación

```text
- GET /api/health                → 200
- Login del administrador        → cookie de sesión; dashboard carga con checklist
- GET /api/v1/resources          → catálogo de recursos según permisos
- Portada pública /              → carga (hero de fallback hasta configurar el sitio)
- Logs del scheduler Taskiq      → registra los ticks por minuto
```

## 5. Checklist de preproducción

```text
☐ HTTPS real terminado en el proxy; cookies Secure activas (ENVIRONMENT=production)
☐ Dominio público declarado en /setup (o TRUSTED_BROWSER_ORIGINS como override)
☐ BOOTSTRAP_SETUP_TOKEN definido (y retirado del historial de shell)
☐ APP_ENCRYPTION_KEY única y respaldada FUERA del servidor
☐ Workers Taskiq corriendo (scheduler + worker, una sola réplica del scheduler)
☐ Respaldos habilitados y un restore probado (ver respaldos.md)
☐ Rate limits de producción revisados (login/forgot/checkout)
☐ Favicon/logo: solo raster (ico/png/webp/jpeg); ningún SVG público
```

Siguiente paso: entrega el control al administrador del negocio →
[`producto/puesta-en-marcha.md`](../producto/puesta-en-marcha.md).
