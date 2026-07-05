# Documentación de Restaurant Platform

La documentación está organizada **por audiencia**: encuentra tu carpeta y ahí está todo lo tuyo.

| ¿Quién eres? | Carpeta | Empieza por |
|---|---|---|
| 🔧 Hospedas/operas el servidor | [`operacion/`](operacion/) | [Instalación](operacion/instalacion.md) |
| 🧑‍💼 Administras el negocio en la plataforma | [`producto/`](producto/) | [Puesta en marcha](producto/puesta-en-marcha.md) |
| 🛒 Eres cliente del sitio (o das soporte a clientes) | [`usuario/`](usuario/) | [Cómo pedir](usuario/como-pedir.md) |
| 👩‍💻 Tocas el código | [`desarrollo/`](desarrollo/) | [Arquitectura](desarrollo/arquitectura.md) |

## Índice completo

**Operación** (self-hosting)
- [Instalación](operacion/instalacion.md) — requisitos, variables de entorno, primer despliegue y checklist de preproducción.
- [Actualización](operacion/actualizacion.md) — actualizar versión, migraciones, verificación y rollback.
- [Respaldos](operacion/respaldos.md) — respaldos cifrados a Google Drive: puesta en marcha, retención y restauración.
- [Solución de problemas](operacion/solucion-problemas.md) — síntoma → causa → arreglo.

**Producto** (administración del negocio)
- [Puesta en marcha](producto/puesta-en-marcha.md) — del asistente `/setup` al sitio operando: correo, dominio, marca, horario, analytics.
- [Catálogo y pedidos](producto/catalogo-y-pedidos.md) — productos, modificadores, ciclo del pedido, pagos y cancelaciones.
- [Sitio público](producto/sitio-publico.md) — heros, destacados, footer y tema: qué controla cada cosa.
- [Envíos, créditos y descuentos](producto/envios-creditos-descuentos.md) — zonas de entrega, programa de créditos y códigos.
- [Notificaciones y roles](producto/notificaciones-y-roles.md) — campana + correo, difusión y permisos por puesto.

**Usuario** (cliente del sitio público)
- [Cómo pedir](usuario/como-pedir.md) — del menú al pedido confirmado.
- [Mi cuenta](usuario/mi-cuenta.md) — registro, direcciones, seguimiento y notificaciones.
- [Créditos y descuentos](usuario/creditos-y-descuentos.md) — cómo se ganan, cómo se canjean y cómo usar un código.

**Desarrollo**
- [Arquitectura](desarrollo/arquitectura.md) — mapa técnico: módulos, invariantes de dominio y decisiones estructurales.
- [Tareas en segundo plano](desarrollo/tareas-en-segundo-plano.md) — Taskiq sobre PostgreSQL: ticks, worker y cómo añadir tareas.
- [Pruebas](desarrollo/pruebas.md) — suites canónicas, OpenAPI sin drift y validación de migraciones.

> Convenciones para agentes de IA (comandos exactos, gotchas): `CLAUDE.md` en la raíz del repositorio.
> Qué es el producto y arranque rápido: `README.md` de la raíz del repositorio.
