# Catálogo y pedidos

## Catálogo (`/admin/catalogo`, permisos `catalog:*`)

- **Categorías** ordenables (reorden atómico, pasos de 10).
- **Productos**: precio en dinero y/o canje por créditos, descripción, imágenes
  (banco de archivos validado por contenido), **destacado** (`is_featured`),
  disponible hoy (`is_available`) y créditos que otorga por unidad.
- **Grupos de modificadores** (única/múltiple selección, mínimos/máximos,
  requeridos) con opciones y ajuste de precio; se vinculan por producto.
- Los cambios se publican **al instante** en el sitio — el menú de la portada y
  `/menu` siempre son el catálogo real.
- Las **cantidades son enteros positivos estrictos** en todas las capas
  (formulario, servicio y base de datos): jamás se truncan fracciones.

## Ciclo del pedido (panel `/panel/pedidos`)

Estados y significado (la máquina de estados vive en el backend; el panel solo
ofrece las transiciones válidas):

```
draft → submitted → [pending_shipping_review] → [pending_payment_verification]
      → pending_approval → approved → preparing → ready
      → out_for_delivery (solo domicilio) → completed
  (cancelled es posible en todo estado no terminal)
```

- **submitted**: llegó del sitio web. Dispara la campana «pedido web nuevo» a
  quien tiene el permiso de alertas. Si nadie lo atiende en **60 minutos** y no
  tiene cobros, se cancela solo (libera créditos, código y cupo).
- **approved**: los **totales se congelan** (incluido el envío final). Un
  pedido a domicilio no puede aprobarse sin costo de envío definido.
- **ready**: listo. En pickup/mostrador puede completarse directo; a domicilio
  sigue con el reparto.
- **completed**: **entrega real**. Aquí — y solo aquí — se acreditan los
  créditos ganados y se consumen definitivamente canjes y códigos.

El cliente recibe una notificación (campana + correo) en cada cambio relevante:
confirmado, preparando, listo, en camino, entregado, cancelado.

## Pagos — reglas no negociables

- **Pago confirmado ≠ pedido completado**: verificar una transferencia jamás
  completa el pedido (la única excepción es la venta de mostrador cobrada al
  momento). Completar significa entrega real.
- **Contra-entrega** se cobra atómicamente al completar.
- Cada **método de pago** se configura (permiso `payments:manage_methods`) con
  «requiere verificación manual» (transferencias) y «permite cambio en
  efectivo».
- Reembolsos **por línea** con topes acumulados (permiso `payments:refund`);
  un reembolso nunca reactiva códigos ya consumidos.

## Cancelar un pedido con dinero cobrado (decisión humana)

Cancelar **no reembolsa**. Si hay cobros, el sistema exige elegir una
resolución explícita:

| Resolución | Efecto |
|---|---|
| Reembolso registrado ahora | El dinero ya se devolvió; queda registrado |
| Reembolso pendiente | Entra a la **cola de conciliación** |
| Retener el pago (excepcional) | Requiere motivo obligatorio auditable |

Los pendientes viven en el icono **⚠ con contador** de la barra del título de
Pedidos: ábrelo, expande el pedido y registra el reembolso; al cubrir el monto
sale de la cola. También llega un correo de alerta al correo del negocio.

## Venta de mostrador (POS, `/panel/pos`, permiso `orders:capture`)

Captura con el mismo catálogo y modificadores, cobro inmediato y ticket. Los
pedidos de mostrador no generan notificaciones de cliente (no hay cuenta web
asociada).

## Entregas y reparto

- `/panel/entregas` (permiso `deliveries:*`): asignación de repartidores.
- `/panel/reparto`: el repartidor con `deliveries:self_assign` ve pendientes,
  toma envíos, inicia («en camino») y completa — el cobro contra-entrega se
  registra al completar. El cliente puede seguir el envío en su página de
  pedido.
