# Platform Core Roadmap

## Alcance

Platform Core es una base administrativa reusable sobre FastAPI y Next.js. Su
responsabilidad es ofrecer autenticacion, sesiones, RBAC, recursos
administrativos, capacidades declarativas, formularios, relaciones, acciones,
auditoria y operacion minima para productos futuros.

Quedan fuera del core los dominios de producto. No se implementan pacientes,
doctores, consultas, historias clinicas, flujos medicos ni cumplimiento clinico.

La decision vigente es single installation / single organization. No se agregan
`tenant_id`, `organization_id` ni multitenancy hasta que un producto consumidor
lo requiera explicitamente.

## Objetivo MVP

Una instalacion nueva debe poder:

- arrancar con base vacia;
- abrir `/setup`;
- crear el administrador inicial;
- crear roles iniciales y permisos;
- iniciar sesion;
- administrar usuarios, roles y permisos;
- asignar roles a usuarios;
- asignar permisos a roles;
- listar, buscar, filtrar, ordenar y paginar recursos;
- crear y editar recursos declarativos;
- ejecutar acciones seguras declarativas;
- preservar siempre capacidad administrativa;
- invalidar sesiones cuando cambian privilegios relevantes;
- ejecutar E2E reproducibles;
- desplegar con migraciones, configuracion segura y observabilidad minima.

## Hitos

1. Bootstrap backend de producto.
2. Bootstrap frontend en `/setup`.
3. E2E instalacion limpia -> setup -> login.
4. Validacion E2E de create generico autenticado.
5. Contratos de relaciones y options para users <-> roles y roles <-> permissions.
6. UI de relaciones y renderer `grouped_catalog` para permisos.
7. Supervivencia administrativa e invalidacion de sesiones por privilegios.
8. `item_reference`, detail contract y update generico.
9. Acciones declarativas seguras con confirmacion accesible.
10. Auditoria administrativa append-only.
11. Filtros y UX madura.
12. Rate limiting y hardening de password reset.
13. CI, operacion y despliegue production-ready.

## Bootstrap De Producto

El flujo publico de producto usa endpoints `bootstrap`:

- `GET /api/v1/bootstrap/status`
- `GET /api/v1/bootstrap/catalog`
- `POST /api/v1/bootstrap/initialize`

El estado persistente vive en una tabla singleton `platform_setup`. La ruta
frontend publica es `/setup`.

El Bootstrap HTTP se cierra permanentemente despues de completar la instalacion.
No se reabre si luego se borran usuarios. Si una instalacion existente ya tiene
usuarios antes de introducir `platform_setup`, la migracion debe marcarla como
completada con origen legacy y nunca ofrecer takeover publico.

El Bootstrap crea un rol fundacional de administrador de plataforma, referenciado
por `platform_setup.system_admin_role_id`. Ese rol contiene todos los permisos
declarados por backend y se asigna obligatoriamente al usuario inicial. No se
crea automaticamente un rol generico `Usuario` sin proposito ni permisos.

`BOOTSTRAP_SETUP_TOKEN` autoriza el flujo HTTP de Bootstrap. En production es
obligatorio; en development/test es opcional, pero si esta definido debe
exigirse mediante `X-Bootstrap-Token`. No se acepta en body, no se guarda, no se
devuelve y no se loguea.

## Seed Operativo CLI

El comando basado en `BOOTSTRAP_ADMIN_*` es un seed operativo para desarrollo,
tests o recuperacion controlada. No es el wizard de producto, no se ejecuta al
arrancar contenedores y no se expone por HTTP.

Si el CLI crea datos iniciales sobre una instalacion pending, debe reconciliar
`platform_setup` como completed. El estado publico debe fallar seguro ante
inconsistencias: `platform_setup.pending` con usuarios existentes no debe ofrecer
`setup_required=true`, e `initialize` debe rechazar la operacion.

## Supervivencia Administrativa

Despues del Bootstrap debe existir siempre al menos un usuario activo con
cobertura efectiva de todos los permisos declarados actuales:

```text
usuario activo -> roles activos asignados -> RoleAccess activos -> declared_permissions()
```

Ademas, el rol `system_admin_role_id` debe existir, permanecer activo y conservar
cobertura completa del catalogo. Backend debe validar transaccionalmente antes de
permitir operaciones que puedan romper ese invariante:

- desactivar o eliminar usuario;
- sustituir roles de usuario;
- desactivar o eliminar rol;
- sustituir permisos de rol;
- quitar permisos al rol administrador fundacional.

El error estable es `admin_coverage_required` y no debe revelar cual usuario o
rol era el ultimo administrador efectivo.

## Relaciones

Las relaciones no se deducen por nombres de rutas o campos. Backend debe publicar
contratos explicitos de relation/options para users <-> roles y roles <->
permissions. El frontend no infiere endpoints ni replica reglas de permisos.

Los options deben respetar permisos backend, exponer valores y labels publicos,
y soportar limites, busqueda o paginacion cuando el volumen lo requiera.

## Update Y Acciones

Update generico requiere tres piezas publicadas por backend antes de crear UI:

- `item_reference`;
- detail/read endpoint;
- `forms.update`.

Las acciones seguras se publican con capability declarativa y confirmacion. Las
acciones destructivas no usan `window.confirm`; requieren componente accesible.

No se implementan update ni acciones antes de completar Bootstrap y E2E minimo.

## Auditoria

La madurez administrativa requiere una tabla append-only `audit_events` para
operaciones sensibles. Nunca se registran passwords, cookies, bearer tokens,
setup token, headers completos, bodies completos ni datos sensibles no
allowlisted.

Eventos minimos:

- `bootstrap_completed`;
- `bootstrap_rejected`;
- `login_success`;
- `login_failure`;
- `user_created`;
- `user_updated`;
- `user_deactivated`;
- `role_created`;
- `role_updated`;
- `role_deleted`;
- `user_role_changed`;
- `role_permissions_changed`;
- `sessions_revoked`;
- `csrf_origin_rejected`.

## E2E

El E2E minimo no es opcional. Debe ejecutar en base aislada y descartable:

```text
base limpia -> /setup -> crear administrador -> /login -> login -> dashboard
```

No se usan seeds automaticos de produccion ni bases locales del desarrollador.
Playwright es la herramienta preferida si se agrega dependencia de navegador.

## Operacion

Antes de declarar el core production-ready se requiere:

- HTTPS real;
- cookies `Secure=True` en production;
- `TRUSTED_BROWSER_ORIGINS` obligatorio en production;
- `BOOTSTRAP_SETUP_TOKEN` obligatorio en production;
- migraciones reproducibles;
- OpenAPI drift bloqueante;
- backend canonical suite;
- frontend canonical suite;
- E2E en CI o entorno controlado;
- health/readiness documentados;
- logs estructurados y redaccion de secretos;
- backups y restore PostgreSQL documentados y probados;
- rotacion de secretos documentada;
- procedimiento explicito de recovery administrativo.

## Exclusion De Dominio

El core no implementa dominios clinicos ni verticales de negocio. Productos
consumidores podran agregar esos modulos sobre esta base cuando tengan
requisitos propios.
