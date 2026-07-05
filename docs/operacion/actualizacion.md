# Actualización y rollback

## Actualizar a una versión nueva

```text
1. Respaldo verificado reciente (o pg_dump manual) — ver respaldos.md.
2. Desplegar las imágenes nuevas SIN recrear el contenedor de la base de datos.
3. Migraciones:  docker compose --profile migrate run --rm migrate
   Las migraciones con precondiciones FALLAN explícitamente si hay datos
   inválidos: leer el error, corregir los datos, reintentar. Jamás truncar a mano.
4. Reconciliación de permisos: los permisos se declaran en código; tras un deploy
   con permisos nuevos el rol fundacional los recibe automáticamente
   (sincronización del rol admin del sistema). Verificar en el editor de roles que
   el rol administrador conserva cobertura completa — la «supervivencia
   administrativa» impide de todos modos dejar el sistema sin ella.
5. Reiniciar los workers Taskiq (toman el código nuevo):
   docker compose --profile taskiq up -d --force-recreate taskiq-worker taskiq-scheduler
6. Verificación post-deploy (abajo).
```

## Verificación post-deploy

```text
- GET /api/health                → 200
- GET /api/openapi.json          → 200 (el frontend se construyó contra este contrato)
- Login de un administrador      → dashboard y checklist cargan
- Portada pública /              → heros y menú del catálogo se sirven
- Probar el correo de prueba desde la configuración del sistema
- Logs del scheduler Taskiq      → ticks corriendo (backups, orders, notifications, deliveries)
```

## Rollback

```text
1. Volver a las imágenes anteriores (usa tags versionados, no :latest).
2. Si la migración nueva ya corrió y el código viejo no la tolera:
   alembic -c backend/alembic.ini downgrade <revision_anterior>
   Todas las migraciones tienen downgrade; si el downgrade destruye datos de la
   feature nueva (tablas recién creadas), preferir roll-forward con hotfix.
3. Restaurar respaldo solo como último recurso (pg_restore del artefacto
   verificado — ver respaldos.md).
```

## Traer mejoras de la base upstream

La plataforma deriva de `platform-core`, configurado como remoto `upstream`:

```bash
git fetch upstream
git merge upstream/main    # resolver conflictos priorizando el dominio restaurante
```

Después del merge: correr ambas suites canónicas y validar las migraciones
combinadas contra un PostGIS desechable antes de desplegar
(ver [`desarrollo/pruebas.md`](../desarrollo/pruebas.md)).
