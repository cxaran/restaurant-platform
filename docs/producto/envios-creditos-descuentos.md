# Envíos, créditos y descuentos

## Zonas de entrega (`/admin/zona-entrega`, permisos `shipping:*`)

- Cada **zona** es un polígono dibujado sobre el mapa (PostGIS real) con sus
  **tarifas** por rango de subtotal y un tiempo estimado opcional.
- El checkout **cotiza solo**: con la dirección del cliente (punto en el mapa)
  resuelve zona → tarifa → costo; fuera de toda zona, el envío no procede.
- **Envío gratis** por umbral global (perfil del negocio) — el sitio lo anuncia
  y el carrito muestra «te faltan $X».
- **Compra mínima a domicilio** opcional.
- El costo de envío se **congela al aprobar** el pedido; ajustarlo después
  requiere el permiso `orders:adjust_shipping` y queda en la bitácora.

## Programa de créditos (permisos `credits:*`)

- Cada producto define cuántos **créditos otorga por unidad**; se acreditan
  **solo cuando el pedido se completa** (entrega real, no al pagar).
- Un producto puede ser **canjeable**: precio en créditos
  (`credit_redemption_price`).
- Reglas de canje (invariantes del backend, no configurables):
  - Un pedido es **100 % dinero o 100 % créditos** — sin mezclas ni
    complemento monetario.
  - El canje **no permite envío a domicilio** (solo recoger) y **no acepta
    códigos de descuento**.
  - Al enviar el pedido los créditos quedan **reservados**; se consumen al
    completar y se **liberan** si se cancela o expira.
- El saldo es un **libro mayor inmutable** (saldo = suma de movimientos);
  los ajustes manuales (`credits:manual_adjust`) quedan como asientos con
  descripción, jamás editando saldos.
- Puedes apagar el programa completo (perfil del negocio): el sitio deja de
  mostrar saldos y canjes; los saldos se conservan.

## Códigos de descuento (`/admin/codigos-descuento`, permisos `discount_codes:*`)

Descuentos de **monto fijo** deliberadamente simples — no hay motor de
promociones:

| Regla | Valor |
|---|---|
| Tipo | Monto fijo $X con **compra mínima** $Y |
| Canal | Solo pedidos **web** de un cliente **autenticado**, pagados con dinero |
| Límite | **Un uso por usuario** (además del cupo total y vigencia del código) |
| Ciclo | Se **reserva** al usarse en un pedido; se **consume** al completar; se **libera** si el pedido se cancela o expira |
| Registro | Cada redención guarda un snapshot inmutable (código, monto, pedido) |

Un reembolso posterior **no** reactiva una redención consumida.
