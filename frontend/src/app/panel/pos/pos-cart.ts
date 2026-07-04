// Estado LOCAL del carrito de mostrador (pantalla 1h). Los nombres y precios
// solo pintan la UI: el contrato real de envío es OrderLineInput y el backend
// recalcula y valida precios, modificadores y cantidades al cobrar/capturar.

import type { OrderLineInput } from "@/core/restaurant-api/contracts";
import type { CartModifier } from "@/core/storefront/cart-lines";

export type PosLine = {
  /** Identidad local: producto + modificadores + nota (líneas iguales se funden). */
  key: string;
  product_id: string;
  name: string;
  /** Precio unitario ESTIMADO (base + ajustes); null si el menú no lo publica. */
  unit_price_hint: number | null;
  quantity: number;
  modifiers: CartModifier[];
  note: string | null;
  max_units: number | null;
};

/** Clave determinista de línea: mismo producto+opciones+nota = misma línea. */
export function posLineKey(
  productId: string,
  modifiers: readonly CartModifier[],
  note: string | null,
): string {
  const signature = modifiers
    .map((modifier) => `${modifier.modifier_option_id}x${modifier.quantity}`)
    .sort()
    .join("|");
  return `${productId}::${signature}::${note ?? ""}`;
}

/** Subtotal ESTIMADO de presentación (solo suma líneas con precio conocido). */
export function posSubtotal(lines: readonly PosLine[]): number {
  return lines.reduce((sum, line) => {
    return line.unit_price_hint !== null && Number.isFinite(line.unit_price_hint)
      ? sum + line.unit_price_hint * line.quantity
      : sum;
  }, 0);
}

/** Proyección al contrato real: el POS siempre vende en dinero (§16). */
export function toOrderLineInputs(lines: readonly PosLine[]): OrderLineInput[] {
  return lines.map((line) => ({
    product_id: line.product_id,
    quantity: line.quantity,
    purchase_mode: "money" as const,
    ...(line.modifiers.length > 0
      ? {
          modifiers: line.modifiers.map((modifier) => ({
            modifier_option_id: modifier.modifier_option_id,
            quantity: modifier.quantity,
          })),
        }
      : {}),
    ...(line.note ? { customer_note: line.note } : {}),
  }));
}

const BILL_DENOMINATIONS = [50, 100, 200, 500, 1000];

/**
 * Botones rápidos de efectivo: el total exacto y los siguientes billetes
 * comunes por encima (como en el diseño: $205 · $300 · $500). Para totales
 * grandes completa con múltiplos de 500.
 */
export function cashSuggestions(total: number): number[] {
  if (!Number.isFinite(total) || total <= 0) return [];
  const exact = Math.ceil(total * 100) / 100;
  const suggestions = [exact];
  for (const bill of BILL_DENOMINATIONS) {
    if (suggestions.length >= 3) break;
    if (bill > exact) suggestions.push(bill);
  }
  let next = Math.ceil(exact / 500) * 500;
  while (suggestions.length < 3) {
    if (next > exact && !suggestions.includes(next)) suggestions.push(next);
    next += 500;
  }
  return suggestions;
}
