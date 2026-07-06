# Respaldos cifrados a Google Drive

Respaldo **diario configurable** de la base de datos, subido a una cuenta de
Google Drive del administrador, con retención diaria/mensual/anual y rotación
que nunca borra copias protegidas. Apagado por defecto.

## Cómo funciona (una vista)

```
Taskiq scheduler ── cada minuto (cron fijo, UTC) ──► backups.tick
                                                        │
                              PostgreSQL = fuente de verdad del horario
                              backup_settings.next_run_at   (editable en la UI)
                              backup_runs.next_attempt_at   (reintentos)
                                                        │
                                            solo procesa trabajo VENCIDO
                                                        │
        pg_dump -Fc ─► verificación (pg_restore --list) ─► manifest ─► tar ─► age (opcional) ─► Drive
```

- El horario real vive en la base (`backup_settings`), editable desde la UI
  **sin reiniciar nada**; el tick por minuto solo consulta si hay trabajo vencido.
- El worker reclama ejecuciones con lease (`FOR UPDATE SKIP LOCKED`): dos
  workers no procesan el mismo respaldo y uno muerto se recupera al expirar.
- Subida **resumible e idempotente**: si la carga terminó pero la respuesta se
  perdió, el reintento reconcilia por run id + checksum en vez de duplicar.
- Carpeta visible en Drive: **"Restaurant Platform Backups"** (scope OAuth
  `drive.file`: la app solo ve archivos que ella creó, nunca todo el Drive).

## Cifrado — dos capas, dos propósitos

| Qué | Con qué | Dónde vive la clave |
|---|---|---|
| El **archivo** del respaldo (opcional) | binario `age`, clave pública (recipient) | La identidad privada la custodia el administrador. «Generar clave de cifrado» crea el par EN el sistema, guarda la privada cifrada (Fernet) y **la envía por correo** al administrador; cada cambio de configuración reenvía el resumen con la clave |
| El **refresh token** de Google (siempre) | Fernet (clave maestra del despliegue) | Solo en el `.env`; nunca en texto plano en PostgreSQL |

⚠️ Sin recipient configurado el respaldo sube **sin cifrar** (`.tar`): cualquiera
con acceso a la cuenta de Drive puede leer la base completa. Recomendado: cifrar.

## Puesta en marcha

1. En el `.env`: `BACKUPS_ENABLED=true` (kill-switch del tick) y la clave
   maestra `APP_ENCRYPTION_KEY`. Las credenciales OAuth **no** van en el
   entorno: se capturan en la UI (paso 3).
2. Workers Taskiq arriba (`--profile taskiq`) y dominio de la instalación
   **verificado** (`/admin/sistema`): el redirect URI del OAuth se deriva de él
   (`…/api/v1/backups/google-drive/callback` — la UI lo muestra para copiarlo
   al crear el cliente en Google Cloud).
3. En la UI (recurso **backup_settings**, permiso `backups:configure`):
   capturar **client ID + client secret** del cliente OAuth de Google Cloud
   (app tipo "web"; el secret se guarda cifrado y nunca vuelve a mostrarse) →
   **Conectar Google Drive** → consentimiento → ajustar hora diaria, zona IANA,
   prefijo y retenciones → **activar**. Opcional: **Generar clave de cifrado**
   (o pegar un recipient age propio — en ese caso la privada la conservas tú).
4. Probar con **Respaldar ahora** y revisar el historial (**backup_runs**,
   permiso `backups:read`).
5. La página **/backups** lista los archivos reales de la carpeta de Drive
   (respaldo y exploración) con descarga en streaming, y **/backups/explore**
   abre el artefacto de exploración en el navegador con descifrado **local**
   (la clave privada nunca sale del dispositivo).

## Estados, reintentos y alertas

`backup_runs.status`: `queued → running → succeeded | retrying | failed`, más
`skipped` (ventana saltada, p. ej. Drive desconectado) y `pruned` (archivo
rotado por retención; el historial se conserva).

- Error **temporal** (red, 5xx/429): reintenta con backoff +5 min → +30 min;
  al agotar los intentos → `failed`.
- **`needs_reauth`** (Google revocó la credencial): falla terminal y no hay más
  ventanas hasta **reconectar Drive** desde la UI.
- Todo desenlace fallido deja una **alerta persistente** en `backup_settings`
  (código + resumen seguro, sin tokens ni rutas); el primer éxito la despeja.

## Retención

Cada éxito recibe roles en fechas locales: `daily` siempre; `monthly` si es el
primero de su mes; `yearly` si es el primero de su año. La rotación protege los
N más recientes de cada rol y solo borra de Drive lo que ningún rol protege.
Desconectar Drive **nunca** borra archivos remotos.

## Artefacto de exploración (opcional)

Además del archivo restaurable, cada respaldo puede generar un **SQLite
legible** del mismo snapshot exacto (columnas sensibles excluidas), pensado
para explorar históricos desde `/backups/explore` sin restaurar nada. Un
explorador fallido jamás invalida un restore correcto.

**Apagado por defecto.** Se activa con la casilla **«Artefacto de exploración
(SQLite)»** en la configuración de **/backups** (permiso `backups:configure`);
a partir del siguiente respaldo aparece el botón **«Explorar»** junto al archivo
en la lista de Drive. Si el respaldo va cifrado, el explorador se cifra con la
**misma** clave age, así que para abrirlo necesitas la clave privada (igual que
para restaurar); el descifrado ocurre **local** en el navegador.

## Restauración (manual)

```bash
# 1. Descargar el archivo desde /backups (o Drive directamente)
age --decrypt -i clave-privada.txt respaldo.tar.age > respaldo.tar   # si está cifrado
tar -xf respaldo.tar            # → database.dump + manifest.json
pg_restore -d <base_destino> database.dump
```

Probar un restore en un entorno aislado **al menos una vez por release**.
