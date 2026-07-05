# Solución de problemas

Formato: síntoma → causa probable → arreglo. Los errores de la API usan un
sobre estable `{code, message}` — el `code` es la pista principal.

## La app no arranca / el contenedor backend se reinicia

**Causa**: `.env` incompleto — no hay defaults para secretos; la app no importa
sin el entorno completo (el log muestra los campos faltantes de Pydantic).
**Arreglo**: comparar el `.env` con el que genera `scripts/install.sh`. Nunca
regenerar sobre uno existente (perderías `APP_ENCRYPTION_KEY` y con ella los
secretos cifrados).

## 403 en toda mutación desde el navegador (CSRF)

**Causa**: el origen del navegador no está en la allowlist — dominio nuevo, o
el dominio guardado en `/setup` quedó mal.
**Arreglo**: entrar por el dominio correcto; si quedaste fuera, define el
override de emergencia `TRUSTED_BROWSER_ORIGINS=https://tu-dominio.com` en el
`.env`, reinicia el backend, corrige el dominio en la configuración del sistema
y retira el override. El dominio verificado por reto HMAC solo **añade**
orígenes en runtime, nunca reemplaza los del entorno.

## Los correos no salen

1. Revisa el **checklist del dashboard** — muestra la causa exacta del
   transporte (misma regla que aplica el envío).
2. Modo `environment` en producción **se niega** a usar hosts de desarrollo
   (mailpit/localhost): configura SMTP o Resend desde la configuración del
   sistema y usa el **correo de prueba**.
3. Notificaciones (campana): la fila queda con `email_status=failed` y un
   resumen seguro del error; el tick `notifications.tick` reintenta los
   pendientes cada minuto **si el worker corre** (siguiente sección).

## «Nada programado ocurre» (pedidos no expiran, correos pendientes, sin respaldos)

**Causa**: el worker/scheduler Taskiq no corre — son servicios opt-in.
**Arreglo**:
```bash
docker compose --profile taskiq up -d taskiq-worker taskiq-scheduler
docker logs <proyecto>-taskiq-scheduler-1 | tail   # debe registrar ticks por minuto
```
Nota del primer arranque: si worker y scheduler crean la tabla del broker a la
vez, PostgreSQL puede lanzar un `UniqueViolation` transitorio; el
`restart: unless-stopped` lo absorbe.

## Respaldos en `needs_reauth` o `failed`

- `needs_reauth`: Google invalidó la credencial → **Conectar Google Drive** de
  nuevo desde backup_settings. No habrá más ventanas hasta reconectar.
- `failed` con alerta persistente: el resumen del error está en la fila de
  backup_settings; corrige (recipient inválido, credenciales, disco) y usa
  **Respaldar ahora** para verificar. Detalle: [respaldos.md](respaldos.md).

## 413 al subir imágenes

**Causa**: `client_max_body_size` de nginx menor que el archivo.
**Arreglo**: subir el límite en `nginx/nginx.conf` (y considerar los tamaños
máximos por perfil de archivo del backend, que validan por contenido).

## Una migración falla al actualizar

Las migraciones con precondiciones fallan **explícitamente** cuando hay datos
inválidos: el mensaje dice qué corregir. Corrige los datos y reintenta. Jamás
truncar tablas a mano. Rollback: [actualizacion.md](actualizacion.md).

## Cuenta de administrador bloqueada

Tras N intentos fallidos la cuenta se bloquea con backoff exponencial y se
envía un **token de desbloqueo** por correo (`/unlock`). Si el correo saliente
está roto, corrígelo primero (arriba) — el token se reenvía al reintentar login.

## El sitio público muestra «mantenimiento»

Es el interruptor del propio negocio: editor del sitio → **Apariencia** →
«Sitio público encendido». No es un error del despliegue.

## Diagnóstico rápido

```bash
docker compose ps                      # ¿todo arriba?
docker logs <backend> --tail 50        # errores de arranque / requests
curl -s localhost/api/health           # 200 esperado
docker compose exec postgres pg_isready
```
