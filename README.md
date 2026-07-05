# Restaurant Platform

Plataforma completa para restaurantes — sitio público con pedidos en línea, panel de operación diaria y administración — **derivada de [platform-core](https://github.com/cxaran/platform-core)**, la base administrativa reutilizable y auto-hospedada sobre FastAPI + Next.js. Hereda resuelto lo que un producto necesita antes de escribir su dominio: autenticación, roles y permisos, listados gobernados por contrato, configuración editable en runtime, auditoría, tareas en segundo plano y respaldos cifrados.

Diseñada como **instalación única / organización única**. La base upstream (`platform-core`) queda configurada como remoto `upstream` para traer mejoras futuras con `git merge`.

## Las tres experiencias

```text
/        → sitio público: portada fija (heros en carrusel → destacado → menú),
           /menu, /carrito, /checkout, /pedidos, /cuenta, /creditos
/panel   → operación diaria: pedidos, POS, entregas, reparto, tickets —
           módulos proyectados por permisos reales, nunca por nombre de rol
/admin   → administración: recursos genéricos por contrato, catálogo, zonas de
           entrega, storefront, notificaciones, finanzas, respaldos, …
```

## Dominio restaurante

- **Catálogo**: productos con modificadores (grupos/opciones), destacados y canje por créditos.
- **Pedidos**: máquina de estados declarativa, snapshots inmutables, totales congelados al aprobar; expiración automática de pedidos web abandonados. Un pedido es **100 % dinero o 100 % créditos** (invariante de backend + BD).
- **Pagos**: métodos configurables (verificación manual, cambio en efectivo); *pago confirmado ≠ pedido completado*; contra-entrega se cobra atómicamente al completar; cancelar con cobro exige resolución explícita (cola de conciliación de reembolsos).
- **Envíos**: zonas PostGIS con tarifas, cotización pública, envío gratis por umbral.
- **Créditos**: libro mayor inmutable (saldo = SUM(delta)), reserva→consumo/liberación.
- **Códigos de descuento**: monto fijo, solo web autenticado, un uso por usuario.
- **Storefront configurable** (sin CMS): heros por plantilla (split/background/card/showcase/minimal) en carrusel, textos destacados por superficie con animaciones GPU-safe, footer con 3 plantillas, tema por presets + acento. Guardar publica al instante; contratos Pydantic `extra="forbid"`, CTAs con tipos de enlace controlados, jamás HTML/CSS libre.
- **Notificaciones**: cada evento llega por **campana in-app y correo** (misma fila, cola `email_status` con hilo post-commit + tick Taskiq). Cliente: estado de su pedido; personal con `notifications:order_alerts`: pedido web nuevo; admin: difusión de promociones desde `/admin/notificaciones`.

## Base heredada (platform-core)

- Login por cookie httponly o Bearer con *versión de token* (revocación instantánea), registro en dos pasos, recuperación y desbloqueo por token, rate limiting en Redis, CSRF por Origin.
- **RBAC declarado en código** (`SecurityGroup`), exigido como dependencias FastAPI; supervivencia administrativa garantizada.
- Contrato de recursos capability-driven (`RESOURCE_REGISTRY` → `/api/v1/resources` filtrado por sesión) y motor de query **allowlist-only**.
- Configuración del sistema en BD (singleton auditado): registro público, dominio verificado por reto HMAC, correo saliente (entorno/SMTP/Resend con secretos cifrados), checklist de puesta en marcha.
- Taskiq sobre PostgreSQL (worker/scheduler como servicios Docker opt-in) y **respaldos cifrados a Google Drive** con visor en el navegador.
- Auditoría `audit_events` append-only: cambios de configuración con **solo nombres de campos, nunca valores**.

## Stack

FastAPI (SQLAlchemy 2.0 + Alembic sobre PostgreSQL/PostGIS, Redis) · Next.js 16 / React 19 / Tailwind 4 · nginx · Docker Compose · Taskiq.

## Instalación (producción self-hosted)

```bash
./scripts/install.sh                          # genera el .env con secretos únicos
docker compose build
docker compose --profile migrate run --rm migrate
docker compose up -d
docker compose --profile taskiq up -d taskiq-worker taskiq-scheduler   # respaldos, correos, ticks
# Abre https://tu-dominio.com/setup con el token que imprimió el instalador.
```

Después del asistente, el checklist de la aplicación guía la configuración de correo, dominio verificado y Google Drive — todo desde la interfaz. Guía completa: `docs/operacion/instalacion.md`.

## Desarrollo

```bash
docker compose -f compose.dev.yml up --build                     # postgres + redis + mailpit + backend + frontend
docker compose -f compose.dev.yml --profile migrate up migrate   # migraciones
```

- Frontend: http://localhost:3000 · API docs: `/api/docs` · Mailpit: http://localhost:8025
- Los comandos se ejecutan **desde la raíz del repo** (el paquete raíz es `backend`); convenciones detalladas para agentes en `CLAUDE.md`.

### Pruebas

```bash
python -m backend.tests.canonical_suite   # suite backend (con TEST_POSTGRES_URL cubre también las de Postgres)
cd frontend && npm run check:canonical    # api + lint + typecheck + tests + build
```

## Estructura

```
backend/    FastAPI: auth, security (RBAC), query (motor allowlist), resources (contrato),
            models/services/api del dominio restaurante, jobs (Taskiq), alembic
frontend/   Next.js App Router: storefront público, panel de operación y admin por contrato
nginx/      Proxy: /api → backend, resto → frontend
docs/       Documentación por audiencia: operacion/ · producto/ · usuario/ · desarrollo/
scripts/    install.sh (instalador de producción)
```

## Documentación

Organizada **por audiencia** en [`docs/`](docs/README.md):

| Audiencia | Carpeta | Contenido |
|---|---|---|
| 🔧 Operador (self-hosting) | [`docs/operacion/`](docs/operacion/instalacion.md) | Instalación, actualización, respaldos, solución de problemas |
| 🧑‍💼 Administrador del negocio | [`docs/producto/`](docs/producto/puesta-en-marcha.md) | Puesta en marcha, catálogo y pedidos, sitio público, envíos/créditos, notificaciones y roles |
| 🛒 Cliente del sitio | [`docs/usuario/`](docs/usuario/como-pedir.md) | Cómo pedir, mi cuenta, créditos y descuentos |
| 👩‍💻 Desarrollo | [`docs/desarrollo/`](docs/desarrollo/arquitectura.md) | Arquitectura, tareas en segundo plano, pruebas |

Convenciones para agentes de IA (comandos exactos, gotchas): `CLAUDE.md`.

Los comentarios, docstrings y mensajes de la API se escriben en **español**.
