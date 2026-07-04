# GOALS.md — Roadmap de cierre funcional, operativo y de validación

> **Jerarquía:** la especificación completa de Release Candidate vive en
> `docs/release-candidate-spec.md` y **prevalece** sobre este roadmap en caso de
> conflicto. Ninguna fase puede declararse terminada si contradice ese documento.
> El estado factual de avance se lleva en `docs/release-candidate-plan.md`.

## Estado factual (cierre RC — 2026-07-04)

Las fases 0–9 de este roadmap están **implementadas y validadas** con la evidencia exigida
por el spec: suite backend 599/0 (también contra PostgreSQL real), frontend canónico verde,
migraciones reales en base virgen y reversibles, concurrencia con dos sesiones PG (5
carreras), `check:api` contra backend vivo sin drift, E2E integral HTTP (49 pasos), spec
Playwright A–G (8/8) sobre el stack Docker aislado, validación por roles/viewports con
Chrome DevTools MCP y revisión visual 4/5 contra el handoff con P0/P1 corregidos.
**Estado por fase y comandos:** `docs/release-candidate-plan.md` ·
**detalle:** `docs/implementation-completion-report.md`,
`docs/browser-e2e-validation-report.md`, `docs/tony-tony-visual-fidelity-review.md`.
**Decisión ajustada durante el cierre (documentada en decisions):** H10 — la venta
`counter/counter` aprobada y totalmente pagada SÍ se completa al verificar el pago (única
auto-transición; reversible); los canales operativos nunca se auto-completan. Riesgos
restantes: sección de riesgos del implementation report (brand_primary por contrato,
política de borrador único al cancelar programación, notificaciones a broker).

**Proyecto:** restaurant-platform / Tony-Tony  
**Estado:** instrucciones de producto y ejecución consolidadas.  
**Objetivo:** cerrar el flujo de compra, operación diaria, códigos de descuento simples y la validación integral sin convertir el proyecto en un motor de promociones ni duplicar reglas de backend.

---

## 0. Principios de autoridad y límites

1. **Backend es la fuente de verdad** para precios, disponibilidad, créditos, descuentos, pago, envío, transiciones y permisos.
2. **Frontend no calcula ni corrige silenciosamente** importes, créditos, descuentos, cantidades o estados.
3. **Storefront controla la presentación publicada**: tema, logo, favicon seguro, trade name, slogan, hero, secciones y CTAs permitidas.
4. **Handoff Tony-Tony Etapa 1 define intención visual**, no contratos ni lógica de negocio.
5. **No crear backend paralelo en Next.js.** No usar Server Actions como sustituto de operaciones de dominio.
6. **No crear mocks silenciosos en producción.** Todo demo debe ser explícito y estar desactivado por defecto.
7. Mantener tres entornos diferenciados:

```text
/        → cliente y storefront público
/panel   → operación diaria: caja, cocina, reparto, supervisor
/admin   → catálogo, negocio, finanzas, usuarios, roles, Storefront, auditoría
```

8. No cerrar una tarea diciendo que está “resuelta” si sólo pasó revisión estática. Usar siempre el estado correcto:

```text
Corregido estáticamente; pendiente de migración/prueba real.
Validado con pruebas unitarias.
Validado en stack integrado.
Validado E2E.
```

---

## 1. Decisiones de producto ya cerradas

### 1.1 Orden de trabajo y puerta de despliegue

- Seguir este orden principal:

```text
1. Detalle de producto y modificadores obligatorios.
2. Canje de créditos en carrito como flujo completo de orden.
3. /cuenta público real.
4. Correcciones de operación/pagos/cancelación H4, H5, H9 y H10.
5. Códigos de descuento fijo.
6. E2E integral de stack completo.
7. Documentación operativa, hardening y pendientes de plataforma.
8. Storefront programado y extensiones visuales posteriores.
```

- El E2E integral es **obligatorio antes del primer despliegue real**.
- No abrir a clientes externos hasta completar el E2E de la sección 10.

### 1.2 Producto configurable

- Si un producto tiene modificadores obligatorios, al presionar **Agregar** se abre inmediatamente un configurador modal/drawer.
- Productos sin modificadores obligatorios usan agregado rápido.
- Si existen extras opcionales, se puede ofrecer una acción secundaria **Personalizar**.
- Editar una línea ya agregada abre el mismo configurador, con selección actual precargada.
- En esta etapa no agregar notas libres por producto, salvo que el contrato backend ya soporte un campo auditable de observación por línea.
- Cantidades siempre son enteros positivos. Nunca truncar ni corregir decimales silenciosamente.

### 1.3 Canje de créditos: pedido íntegro por modo

El canje de créditos **no admite pedidos híbridos**.

```text
Un pedido es enteramente monetario
O
un pedido es enteramente pagado con créditos.

Nunca:
- una línea con dinero y otra con créditos;
- pagar una diferencia monetaria para completar un canje;
- usar créditos para envío;
- usar un descuento fijo en una orden de créditos.
```

Reglas obligatorias:

1. El carrito tiene un único modo explícito:

```text
money | credits
```

2. El modo por defecto es `money`.
3. `credits` sólo puede activarse de forma explícita por el cliente autenticado.
4. Para activar `credits`, **todos los productos del carrito** deben tener precio válido de canje.
5. Si existe un producto sin precio de créditos, no se puede agregar a un carrito que ya está en modo `credits`.
6. Si el carrito está en modo `credits`, el cliente debe quitar productos no canjeables o crear un pedido monetario separado.
7. Un pedido de créditos no permite envío. En v1, el modo `credits` sólo permite fulfillment sin costo de envío: pickup o counter.
8. No cambiar automáticamente un carrito de `credits` a `money`, ni viceversa.
9. Si no hay sesión o el saldo no alcanza, **ocultar** la opción de canje, no mostrarla deshabilitada.
10. Si por concurrencia u otra sesión el saldo deja de alcanzar, backend debe rechazar la operación y frontend debe mostrar el error recibido sin ajustar el carrito de forma silenciosa.
11. Backend debe seguir validando homogeneidad del modo, elegibilidad de todos los productos, saldo y ausencia de envío antes de crear el pedido.

### 1.4 Cuenta del cliente

Primera versión de `/cuenta`:

```text
Resumen de perfil
Mis pedidos
Mis direcciones
Mis créditos
Cerrar sesión
```

- Permitir editar únicamente datos no sensibles que el contrato existente soporte.
- Correo, contraseña y cambios de identidad siguen los flujos de platform-core; no duplicarlos.
- `/cuenta` no debe redirigir a `/admin/account`.

### 1.5 H10 y ciclo correcto de pago / fulfillment

**Decisión clave:** pago y cumplimiento son conceptos distintos. No se debe completar un pedido sólo porque un pago fue verificado.

#### Transferencia

```text
Verificación de transferencia
→ confirma que el dinero fue recibido/verificado.
→ puede marcar el pago como paid/verified.
→ NO completa automáticamente la orden.

La orden continúa por preparación, listo, reparto o entrega.
Sólo pasa a completed cuando se entrega realmente al cliente
(o se entrega en mostrador/pickup).
```

#### Terminal

```text
La autorización o confirmación de terminal confirma el pago.
No implica que el pedido ya fue preparado o entregado.
```

#### Efectivo contra entrega

```text
Antes de entrega: pago pendiente de cobro.
Al completar la entrega: repartidor/capturista confirma el cobro,
monto recibido y cambio cuando aplique.
La confirmación de cobro y completed ocurren atómicamente.
```

- No se debe completar una entrega de efectivo sin registrar el cobro, salvo excepción explícita de supervisor con motivo auditable.

#### Mostrador / pickup

```text
Si hay preparación:
payment puede quedar paid antes, pero completed sólo ocurre al entregar.

Si es venta inmediata de mostrador:
una acción explícita de “cobrar y entregar” puede registrar pago y
completed juntos.
```

#### Reglas generales

- Verificar transferencia no auto-completa POS ni pickup.
- `completed` significa fulfillment real: entrega al repartidor/cliente o entrega física en mostrador.
- Al congelar envío/totales, recomputar el estado de pago contra el total final (H4).
- Cuando envío sigue pendiente, UI debe mostrar **“Pago registrado; total final pendiente de confirmar”**, no “pagado por completo”.

### 1.6 Cancelación con dinero cobrado (H5)

Al cancelar un pedido con pagos cobrados, exigir una resolución explícita:

```text
1. Reembolso registrado ahora.
2. Reembolso pendiente de procesar.
3. Retener pago excepcionalmente, con motivo obligatorio.
```

- El panel debe destacar cancelaciones con cobro y reembolso pendiente.
- Cancelar no es sinónimo de reembolsar.
- No ocultar pagos/ingresos por el solo hecho de cancelar la orden.

### 1.7 Reparto

- Un repartidor puede tener múltiples entregas activas/asignadas.
- Una puede estar marcada como **en curso** para guiar la interfaz móvil.
- Nuevo endpoint de courier debe devolver sólo las entregas activas asignadas al repartidor autenticado, con datos mínimos necesarios:

```text
estado
contacto autorizado
ubicación/dirección
instrucciones
importe a cobrar cuando sea efectivo
prueba de entrega
```

- Nunca mostrar entregas de otros repartidores.
- Mantener una cola separada sólo si ya existe contrato para “tomar” entrega.

### 1.8 Códigos de descuento: alcance final e inmutable

El sistema no tendrá un motor de promociones. Sólo tendrá **códigos de descuento fijo**.

Regla única:

> “Usa un código para descontar X pesos si la compra monetaria elegible alcanza o supera Y pesos.”

Soportar:

```text
- código alfanumérico único, case-insensitive;
- nombre y descripción;
- descuento fijo monetario X;
- compra mínima monetaria Y;
- valid_from opcional;
- valid_until opcional;
- activo/inactivo;
- código general o dirigido a un customer_user_id específico;
- un uso por usuario por código;
- un código activo por pedido;
- reserva al crear/confirmar el pedido online;
- consumo al completar el pedido;
- liberación al cancelar o expirar antes de completed;
- snapshots históricos;
- relación con order_adjustments;
- historial administrativo de reservado/consumido/liberado.
```

Nunca implementar, preparar campos ni abstraer para:

```text
percentage_discount
free_shipping
max_discount
global_usage_limit
usage_count
segmentación
productos específicos
categorías específicas
horarios
productos gratis
compra X recibe Y
primera compra automática
múltiples promociones
acumulación de códigos
motor genérico de promociones
```

#### Reglas comerciales de códigos

1. Aplican **sólo en pedidos web (`source=online`)**.
2. No se aplican desde POS, teléfono, WhatsApp, social, manual o counter.
3. Requieren `customer_user_id`; nunca aplican a invitado o pedido sin cliente.
4. Aplican sólo al subtotal monetario de productos y modificadores monetarios.
5. No cuentan ni descuentan envío.
6. No cuentan ni descuentan líneas compradas con créditos.
7. No aplican a un pedido en modo `credits`.
8. El descuento final es:

```text
min(discount_amount, eligible_monetary_items_subtotal)
```

9. Validar `discount_amount > 0`, `minimum_order_amount >= 0` y `discount_amount <= minimum_order_amount`.
10. Si `target_customer_user_id` es NULL, código general: cada cliente registrado puede usarlo una vez.
11. Si `target_customer_user_id` tiene valor, sólo ese cliente puede usarlo una vez.
12. Códigos se escriben manualmente. No generar código automático.
13. Un reembolso posterior a una orden completed no reactiva el código. Para compensar, crear otro código, opcionalmente personalizado.
14. La administración de códigos corresponde a administrador o supervisor con permiso específico. Cajero no crea ni administra campañas.

#### Edición posterior de códigos

Todos los campos de `discount_codes` pueden editarse y los cambios afectan **sólo redenciones futuras**.

```text
Redenciones reserved o consumed:
- conservan code_snapshot;
- conservan name_snapshot;
- conservan discount_amount_snapshot;
- conservan minimum_order_amount_snapshot;
- conservan target/eligibility ya resuelta;
- no cambian cuando se modifica o desactiva el código.
```

Si un pedido que ya tiene redención `reserved` cambia sus líneas antes de aprobación, reevaluar contra **el snapshot de esa redención**, no contra la definición editada actual. Si ya no cumple el mínimo snapshot, liberar la redención, eliminar el ajuste asociado y recalcular totales.

#### Modelo mínimo de códigos

```text
discount_codes
discount_code_redemptions
```

No llamar al módulo `promotions` ni `promotion engine`.

`discount_codes` debe incluir, como mínimo:

```text
id
name
description
code
code_normalized (UNIQUE)
discount_amount
minimum_order_amount
valid_from
valid_until
target_customer_user_id NULL
is_active
created_by
created_at
updated_at
```

`discount_code_redemptions` debe incluir, como mínimo:

```text
id
discount_code_id
order_id
customer_user_id
code_snapshot
name_snapshot
discount_amount_snapshot
minimum_order_amount_snapshot
status: reserved | consumed | released
reserved_at
consumed_at
released_at
release_reason
created_at
updated_at
```

Índices/constraints obligatorios:

```sql
UNIQUE (discount_code_id, customer_user_id)
WHERE status IN ('reserved', 'consumed');

UNIQUE (order_id)
WHERE status IN ('reserved', 'consumed');
```

La redención debe crear un `order_adjustment` histórico, por ejemplo:

```text
adjustment_type = discount_code
amount = descuento final aplicado
reason = “Código {code_snapshot}”
discount_code_redemption_id = referencia única a la redención
```

El frontend sólo envía:

```json
{ "discount_code": "VERANO100" }
```

Nunca acepta ni envía desde cliente:

```text
discount_amount
total final
minimum editable
eligibility final
```

### 1.9 Publicación programada Storefront

- Implementar publicación programada junto con la corrección H7 de fechas aware UTC.
- Si una revisión programada intenta publicarse y existe una publicación más reciente que se publicó después de que esa revisión fue programada, **cancelar automáticamente la publicación programada**.
- Registrar auditoría y dejar estado/razón legible en administración.
- No dejar que campañas antiguas pisen cambios recientes.

### 1.10 Header/Footer y plantillas Storefront

Primera versión editable de header/footer:

```text
Logo
Nombre y slogan
Teléfonos
WhatsApp
Horario
Redes sociales
Enlaces externos HTTPS
Enlaces internos predefinidos
Texto de footer
```

Nunca permitir HTML/CSS/JS libre.

Orden de plantillas de Fase 1:

```text
1. storefront.catalog.categories
2. storefront.banner.delivery
3. storefront.banner.credits
```

Luego, y no antes de necesidad real:

```text
content.image_text
info_cards
faq
```

### 1.11 Perfiles y usuarios internos

- Crear/editar perfil de repartidor: sólo administrador o supervisor con permiso explícito de personal.
- `can_deliver` no es autoeditable por repartidores.
- Para pedidos manuales, primera versión permite buscar/seleccionar sólo un cliente **ya registrado**.
- Si no existe cliente, el pedido sigue sin cliente; no crear cuenta automática ni temporal.
- Búsqueda por teléfono permitida sólo a personal autorizado y con retorno mínimo: nombre, teléfono parcialmente oculto y referencia de cliente.

### 1.12 Órdenes submitted abandonadas

- Expirar pedidos web `submitted` a los **60 minutos** si no se convierten en una ruta válida posterior.
- Al expirar:

```text
status = cancelled
reason_code = expired
liberar créditos reservados
liberar código reservado
liberar cupo diario
no crear reembolso automático
generar auditoría
```

- Si posteriormente se necesita pago por transferencia pendiente, debe modelarse en una ruta/estado explícito, no mediante `submitted` eterno.

### 1.13 Notificaciones prioritarias

Implementar primero sólo:

```text
A. Cliente: pedido recibido.
C. Cliente: pedido listo / en camino.
G. Administrador: pedido cancelado con pago sin reembolso.
```

Agregar reparto asignado y otras notificaciones sólo cuando el ciclo de reparto esté estable.

### 1.14 Rate limiting

Aplicar límites moderados de checkout por:

```text
IP + usuario autenticado + sesión
```

- No limitar la navegación pública del menú.
- Mostrar error entendible.
- No usar rate limiting como sustituto de idempotencia o constraints de BD.

### 1.15 Seguridad de SVG público

Política vigente:

```text
No permitir SVG público por ahora.
Logo/favicons dinámicos: PNG, WEBP, JPEG o ICO.
```

No permitir SVG público hasta que exista política de entrega segura validada en servidor.

---

## 2. Fases de implementación

### Fase 0 — Preparación y baseline

**Objetivo:** asegurar que el repositorio, contratos y docs permiten trabajar sin introducir deuda invisible.

Implementar:

- Actualizar `CLAUDE.md` con el dominio restaurante, estructura de rutas `/`, `/panel`, `/admin`, Storefront, módulos y reglas operativas.
- Crear/actualizar runbook de deploy:
  - PostGIS externo;
  - `APP_ENCRYPTION_KEY`;
  - reconciliación de permisos;
  - migraciones;
  - backups;
  - verificación post-deploy;
  - rollback.
- Confirmar `check:api` y generación de tipos sin drift.
- Mantener commits separados por preocupación:

```text
fix(restaurant): ... integridad/reglas backend
feat(storefront): ... UI pública y renderer
feat(orders): ... configurador/modificadores
feat(credits): ... canje íntegro de orden
feat(discounts): ... códigos fijos
```

**Se considera aplicada cuando:** documentación es suficiente para que una nueva sesión pueda entender módulos, rutas, contratos críticos y cómo levantar integración sin adivinar.

**Pruebas:** no requiere E2E. Ejecutar chequeos de markdown/links si existen.

---

### Fase 1 — Detalle de producto y modificadores

**Objetivo:** cerrar el hueco funcional del flujo de compra: ningún producto con selección requerida debe poder agregarse sin configurarse.

Implementar:

1. Configurador reutilizable de producto para público:
   - modal/drawer responsive;
   - selección de grupos requeridos y opcionales;
   - min/max por grupo;
   - precio mostrado como estimado/servidor según contrato;
   - control de cantidad entero positivo;
   - editar línea existente;
   - estados de error claros para `seleccion_incompleta` u otros errores backend.
2. Producto sin grupo requerido:
   - agregado rápido;
   - acceso secundario a personalizar si tiene opciones opcionales.
3. Carrito:
   - mostrar resumen de modificadores;
   - editar y eliminar líneas;
   - no usar inputs decimales;
   - no enviar datos económicos derivados como verdad.
4. No agregar notas libres si no existe contrato backend ya aprobado.

**Se considera aplicada cuando:**

- Un producto con grupo requerido no puede llegar al checkout sin selección completa desde UI.
- El backend sigue rechazando payload inválido como defensa final.
- Una línea agregada puede editarse con los valores actuales precargados.
- Un producto simple se agrega rápidamente sin fricción.
- Móvil y desktop muestran configurador usable y consistente con el handoff.

**Pruebas a crear/actualizar:**

- componente: grupo requerido, mínimo/máximo, opción única/múltiple;
- componente: editar línea conserva selección;
- componente: cantidad rechaza/evita 0, negativos y decimal;
- integración de cliente API: error `seleccion_incompleta` se presenta de forma entendible;
- backend: tests existentes/dirigidos de validación de modificadores deben mantenerse.

**Cuándo ejecutar:** al terminar la fase, ejecutar pruebas unitarias dirigidas, typecheck, lint y build frontend.

---

### Fase 2 — Canje íntegro con créditos

**Objetivo:** hacer usable el sistema de créditos sin permitir mezcla dinero/créditos ni envío financiado por créditos.

Implementar en backend y frontend, con una única semántica de carrito:

```text
money cart   → todas las líneas se compran con dinero.
credits cart → todas las líneas se canjean con créditos.
```

Backend:

- Rechazar pedido mixto, aun si frontend fuera manipulado.
- Rechazar pedido `credits` con shipping/delivery o importe de envío distinto de cero.
- Rechazar pedido `credits` si alguna línea no tiene precio de canje.
- Rechazar pedido `credits` sin cliente autenticado o con saldo insuficiente.
- Mantener locks, reserva y lifecycle actual de créditos.
- No permitir códigos de descuento en modo `credits`.

Frontend:

- Dinero como modo por defecto.
- Mostrar la opción de canje sólo a cliente autenticado con saldo suficiente y sólo cuando el carrito completo sea elegible.
- Cuando no hay sesión o saldo suficiente: ocultar la opción de canje.
- Si backend rechaza por saldo concurrente u otra sesión, conservar el carrito y mostrar mensaje claro; no recortar cantidades ni cambiar modo automáticamente.
- En modo `credits`, bloquear/explicar productos no canjeables y delivery.
- Dar una salida clara: “Quitar producto no canjeable” o “Crear pedido separado con dinero”.

**Se considera aplicada cuando:**

- No existe combinación monetaria + créditos en un mismo pedido.
- No se permite pagar diferencia monetaria.
- No se permite envío en orden de créditos.
- Todos los productos de un pedido de créditos tienen `credit_redemption_price` válido.
- El backend impide bypass de UI.
- La UI no muestra canje a usuarios sin sesión/saldo, pero maneja correctamente un rechazo por carrera.

**Pruebas a crear/actualizar:**

- backend: mixed purchase modes → rechazado;
- backend: credits + shipping/delivery → rechazado;
- backend: product without redemption price in credits cart → rechazado;
- backend: insufficient credits after concurrent reservation → rechazado;
- frontend: opción de canje oculta sin sesión o saldo;
- frontend: carrito credits no permite agregar no canjeable;
- frontend: error backend por saldo muestra feedback y no muta carrito;
- regresión de H1–H3 y lifecycle de créditos.

**Cuándo ejecutar:** pruebas unitarias backend y frontend al terminar. Pruebas de concurrencia reales se reservan para Fase 8, pero debe existir la prueba dirigida preparada.

---

### Fase 3 — Cuenta pública

**Objetivo:** ofrecer al cliente un área propia separada de administración.

Implementar:

- `/cuenta` con resumen, pedidos, direcciones, créditos y cierre de sesión.
- Enlaces a rutas específicas de pedido/credit ledger/direcciones si el contrato ya existe.
- Editar sólo datos no sensibles soportados.
- Guardas de sesión y tratamiento uniforme de 401/404.

**Se considera aplicada cuando:**

- El cliente no termina en `/admin/account`.
- Ningún cliente puede navegar o inferir pedidos/direcciones de otro usuario.
- UI pública conserva identidad Storefront y no parece panel administrativo.

**Pruebas:** ruta protegida, estados de sesión, estado vacío de pedidos/créditos/direcciones, errores de propiedad no reveladores.

---

### Fase 4 — Operación, pagos, cancelación y reparto

**Objetivo:** cerrar riesgos operativos antes del despliegue real.

Implementar en este orden:

1. **H4:** recomputar estado de pago al congelar monto final de envío/aprobación.
2. **H5:** cancelación con resolución de dinero obligatoria y cola/alerta para reembolsos pendientes.
3. **H9:** `collection_instruction` sólo para método explícitamente efectivo/cobro contra entrega.
4. **H10:** verificar transferencia no auto-completa la orden; completar significa fulfillment real.
5. GET de entregas activas para repartidor autenticado, de modo que la entrega en curso sobreviva refresh y cambio de dispositivo.
6. UI `/panel` consistente:
   - cajero: POS/pedidos/tickets;
   - cocina: preparación/listo;
   - repartidor: asignadas/en curso/completar;
   - supervisor: aprobar/asignar/verificar/resolver;
   - admin: puede entrar a panel y admin según capability.

**Se considera aplicada cuando:**

- Una transferencia verificada muestra pago confirmado, pero el pedido no se completa hasta entrega/handoff.
- Una venta inmediata de counter puede registrar cobro y completed juntos mediante acción explícita.
- Cash on delivery sólo queda pagado al registrarse cobro en la entrega.
- Un pedido delivery con envío pendiente nunca se presenta como liquidado final.
- Cancelar con cobro deja una resolución financiera visible y auditable.
- Repartidor puede recargar y recuperar sus entregas activas desde backend.

**Pruebas a crear/actualizar:**

- pago transfer verificado no cambia order a completed;
- cash delivery completed exige o registra cobro;
- counter immediate sale cobra+y completa explícitamente;
- total final de delivery recalcula payment status;
- cancel con pago exige ruta de resolución;
- H9 transferencia pendiente jamás produce instrucción de cobrar efectivo;
- endpoint courier no filtra datos de otros repartidores;
- frontend panel renderiza acción sólo si capability y transición backend lo permiten.

---

### Fase 5 — Códigos de descuento fijo web-only

**Objetivo:** agregar promociones sencillas, trazables y no acumulables sin motor genérico.

#### Backend

1. Crear modelos, schemas, servicios, routers, permisos, migración reversible y auditoría mínima para:

```text
discount_codes
discount_code_redemptions
```

2. Crear endpoint de validación/cotización de código para carrito web.
3. Revalidar y reservar dentro de la transacción de creación/confirmación de pedido online.
4. Crear `order_adjustment` enlazado a la redención.
5. Consumir redención sólo en `completed`.
6. Liberar redención en cancelación/expiración antes de `completed`.
7. Mantener snapshots inmutables para redenciones existentes.
8. Permitir edición total del código sólo para redenciones futuras.
9. No permitir endpoint de aplicación desde POS/panel manual.
10. Añadir permisos administrativos específicos, por ejemplo:

```text
discount_codes:read
discount_codes:manage
```

Ajustar nombres a convenciones reales de platform-core.

#### Frontend

- Sólo en carrito/checkout público online.
- Campo de texto para código y acción Aplicar.
- Mostrar estado válido, mínimo requerido, descuento real, error o liberado.
- No mostrar ni ofrecer código en `/panel/pos`, pedidos manuales ni counter.
- No permitir que UI controle importe de descuento.
- En ticket/pedido público, mostrar snapshot de código y descuento histórico.
- Admin: CRUD simple de códigos, vigencia, cliente objetivo y redenciones; no construir “campañas” complejas.
- No incluir botón de generación automática de código.

**Se considera aplicada cuando:**

- `VERANO100`, con mínimo $1,000 y descuento $100, se aplica una vez por cliente web elegible.
- El mismo cliente no puede reservar/consumir el mismo código desde dos sesiones.
- Una redención se libera al cancelar o expirar antes de completed.
- Una redención completed no se reactiva por reembolso.
- Cambiar el descuento o vigencia de un código no cambia snapshots/reservas existentes.
- Un pedido credit-only, manual o POS no puede aplicar el código.
- Pedido editado antes de aprobación se revalida contra snapshots de la redención y libera si ya no alcanza mínimo.

**Pruebas a crear/actualizar:**

- código case-insensitive;
- activo/inactivo;
- fechas exactas de inicio y fin;
- mínimo basado sólo en productos/modificadores monetarios;
- envío no cuenta para mínimo;
- credit lines no cuentan;
- no descuento para credits cart;
- code general una vez por usuario;
- target_customer_user_id correcto/incorrecto;
- doble pestaña/concurrencia: único reservado/consumido;
- one active code per order;
- edit code only affects future redemptions;
- snapshot se conserva en ticket/order;
- cancel/expire release;
- completed/refund remains consumed;
- POS/manual endpoints rechazan aplicación;
- código no puede hacer subtotal negativo;
- migración upgrade/downgrade limpia.

**Cuándo ejecutar:** unit/integration tests dirigidos al terminar la fase; pruebas de concurrencia reales en Fase 8; E2E completo en Fase 9.

---

### Fase 6 — Storefront programado y capacidades administrativas pequeñas

**Objetivo:** completar funciones de Storefront que sí corresponden a Fase 1/2, sin fingir configurabilidad inexistente.

Implementar:

1. H7: normalizar fechas a aware UTC o fijar política conexión UTC consistente.
2. Job Taskiq para `scheduled_publish_at`.
3. Regla de supersesión: una revisión programada se cancela si una versión más reciente fue publicada después de su programación.
4. Auditoría y UI de estado de programación.
5. Exponer JSON Schema de `HeaderConfig`/`FooterConfig` y tipar `/public/storefront/{page_key}`.
6. Quitar espejos locales defensivos del editor cuando el contrato tipado exista.
7. Implementar media por slot de sección antes de prometer edición de hero/banner real.
8. Implementar header/footer editable con whitelist de enlaces.
9. Implementar templates en orden:

```text
catalog.categories
banner.delivery
banner.credits
```

10. Endpoint de reorder atómico antes de drag-and-drop persistente.
11. ResourceDefinition del dominio para que navegación admin sea contract-driven y módulos nuevos no dependan de URL manual.

**Se considera aplicada cuando:**

- Ninguna publicación programada vieja pisa cambios posteriores.
- Storefront renderiza metadata/payload mediante contrato tipado.
- Editor no mantiene un schema paralelo.
- Hero/banner usa media persistida real, no fixture.
- Navegación/admin descubre módulos por registro/capabilities reales.

**Pruebas:** timezone del servidor ≠ UTC, job programado, cancelación por supersesión, JSON Schema, media permissions, reorder concurrente, templates nuevos, CTAs seguros y category binding válido.

---

### Fase 7 — Perfiles, pedidos abandonados, notificaciones, límites y reportes

Implementar:

1. APIs de `customer_profiles` y `staff_profiles` necesarias para operación.
2. Búsqueda de cliente por teléfono con permiso y datos mínimos.
3. Gestión de repartidores y `can_deliver` sólo por roles autorizados.
4. Expiración de submitted a 60 minutos.
5. Notificaciones A/C/G priorizadas.
6. Rate limiting checkout por IP+user+session.
7. Reportes iniciales: ventas por hora y más vendidos, usando históricos/snapshots.

**Se considera aplicada cuando:** módulos no simulan perfiles ni búsquedas, pedidos abandonados no bloquean cupos/códigos/créditos, y alertas de cancelación con dinero tienen destinatario responsable.

---

### Fase 8 — Concurrencia y hardening de datos

Implementar/verificar:

- H6: locks de productos/líneas siempre en orden ascendente de ID.
- H8: política de SVG público ya definida: bloquear SVG público; permitir sólo formatos raster/ICO para branding público.
- Test de comparación CHECK modelo ↔ migración si cabe en convenciones del proyecto.
- Pruebas con dos sesiones PostgreSQL reales para:

```text
reserva de créditos
límite diario
tomar entrega
redención de código
reembolso de misma línea
```

**Se considera aplicada cuando:** las carreras controladas terminan con un resultado correcto o conflicto controlado, nunca duplicación de crédito, cupo, entrega, devolución o redención.

---

### Fase 9 — E2E integral pre-deploy

**No ejecutar contra datos de producción.** Usar stack integrado descartable y datos/seed aislados.

Preparación:

1. Iniciar stack completo siguiendo runbook.
2. Aplicar todas las migraciones, incluidas pendientes como `e8b2c47f91a3` y las que se creen después.
3. Ejecutar reconciliación de permisos/seed requerido.
4. Ejecutar `check:api` contra backend vivo.
5. Usar el flujo E2E Playwright canónico existente; extenderlo, no crear otro framework paralelo.

Escenarios mínimos obligatorios:

### A. Bootstrap + Storefront

```text
bootstrap
→ configurar negocio
→ cargar logo/favicons permitidos
→ crear catálogo y modificadores
→ configurar Storefront
→ publicar portada
→ verificar / con metadata, tema, secciones y media real
```

### B. Pedido monetario web configurable

```text
visitante abre /
→ menú
→ producto con modificador requerido
→ configurador
→ carrito
→ login/registro
→ checkout
→ envío/cotización si aplica
→ crear pedido online
→ verificar detalle/ticket/historial cliente
```

### C. Pedido créditos (sin mezcla)

```text
cliente con saldo
→ carrito sólo con productos canjeables
→ pickup/counter, sin envío
→ modo credits explícito
→ crear pedido
→ no permitir producto no canjeable/money/shipping
→ completar
→ créditos acreditados/consumidos correctamente
```

### D. Código fijo web

```text
cliente con pedido monetario elegible
→ aplicar código
→ comprobar descuento fijo y mínimo
→ confirmar reserva
→ completar pedido
→ código consumed
→ segundo uso del mismo usuario rechazado
```

Incluir cancelación/expiración que libera código reservado.

### E. Operación en /panel

```text
supervisor/cajero aprueba
→ cocina prepara
→ listo
→ asignar/tomar reparto
→ repartidor entrega
→ cash on delivery se cobra al completar
→ completed
→ ticket
→ créditos acreditados cuando proceda
```

### F. Transferencia y POS

```text
registrar transferencia
→ verificar pago
→ confirmar que NO auto-completa orden
→ preparar/entregar
→ completed explícito
```

### G. Cancelación con dinero

```text
pedido pagado
→ cancelar
→ seleccionar resolución financiera
→ verificar alerta/reembolso pendiente según elección
```

**Criterio de aprobación E2E:** todos los escenarios pasan, ninguna acción revela datos ajenos, no existe pedido híbrido dinero/créditos y no se observa una automatización falsa de pago, envío, descuento o publicación.

---

## 3. Reglas de pruebas y ejecución

### 3.1 Regla por cambio

Cada cambio de comportamiento debe incluir o actualizar pruebas en la misma tarea.

```text
Cambios backend:
- unitarios de servicio;
- tests de router/contrato cuando corresponda;
- test de migración cuando se agregue migración;
- concurrencia si toca reservas/locks.

Cambios frontend:
- test de componente cuando haya lógica visual;
- test de flujo/hook para estado de carrito/sesión;
- typecheck;
- lint;
- build.
```

### 3.2 Cuándo ejecutar qué

| Momento | Ejecutar |
|---|---|
| Durante implementación de una fase | Tests dirigidos de los módulos modificados. |
| Al cerrar una fase frontend | Typecheck, lint, build y tests frontend relacionados. |
| Al cerrar una fase backend con migración | Tests backend dirigidos + migración en BD limpia de integración. |
| Antes de merge de bloque grande | Suite relevante completa y check:api si cambia OpenAPI. |
| Antes de deploy | Fase 9 E2E integral completa + pruebas de concurrencia de Fase 8. |

No ejecutar migraciones en producción como parte de pruebas. No usar datos reales para E2E.

### 3.3 Manejo de fallas

- No ocultar fallo con skip nuevo salvo que exista razón documentada y ticket/pendiente explícito.
- No actualizar snapshots/fixtures a ciegas.
- No reducir cobertura para forzar verde.
- Un test de backend que cubra una invariante crítica tiene prioridad sobre un test puramente visual.

---

## 4. Pendientes que el agente puede resolver sin nueva decisión

1. H6: ordenar locks por ID ascendente.
2. H7: fechas aware UTC consistentes.
3. H8: bloquear SVG público para branding.
4. H9: instrucción de efectivo sólo para métodos cash explícitos.
5. Tipar respuesta pública Storefront y exponer schemas Header/Footer.
6. ResourceDefinition de módulos restaurante en registry.
7. `CLAUDE.md` y runbook de deploy.
8. Comparación de CHECKs modelos/migraciones, si encaja con infraestructura de tests.
9. Tests skipped que dependan de infraestructura, cuando exista el entorno definido.

---

## 5. No hacer sin decisión explícita futura

```text
- promociones porcentuales o complejas;
- código de descuento aplicado en panel/POS/manual;
- mezclas dinero/créditos;
- pago parcial de diferencia en canje;
- créditos para envío;
- SVG público;
- publicar cambios por tiempo desde frontend;
- editor Storefront con HTML/CSS/JS libre;
- cuentas automáticas por teléfono;
- role === 'admin' como autorización única;
- reembolso que reactive automáticamente un código consumido.
```

---

## 6. Entrega esperada por cada fase

Al terminar una fase, el agente debe entregar:

1. Decisiones aplicadas y reglas de negocio respetadas.
2. Archivos creados/modificados/eliminados.
3. Migraciones creadas, sin ocultar si fueron o no ejecutadas.
4. Tests creados/actualizados.
5. Validaciones ejecutadas y resultado exacto.
6. Riesgos/pendientes que permanecen.
7. Cambios de contrato/API, si existen, y resultado de `check:api`.
8. Capturas o recorrido visual cuando afecte Storefront, público o panel.
9. Un commit o conjunto de commits separados por preocupación, no un mega-commit sin revisión.

