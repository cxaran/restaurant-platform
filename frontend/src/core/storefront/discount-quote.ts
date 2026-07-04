// Lógica pura del código de descuento aplicado en el checkout web (sin React):
// construcción de líneas para cotizar/enviar, huella del carrito e invalidación.
//
// INVARIANTES de producto: los códigos SOLO aplican al checkout web en modo
// dinero (nunca credits, nunca panel/POS) y la UI JAMÁS calcula el importe —
// muestra lo que el backend cotizó. Si el carrito o el modo cambian después de
// cotizar, la cotización deja de ser válida y se descarta.

import type { OrderLineInput } from "@/core/restaurant-api/contracts";
import type { CartLine, CartMode } from "./cart-lines";

/** Cotización aceptada por el cliente, anclada al carrito EXACTO que se cotizó. */
export type AppliedDiscount = {
  code: string;
  name: string;
  /** Importe cotizado por el backend (texto decimal); la UI solo lo muestra. */
  discountAmount: string;
  /** Huella del carrito al momento de cotizar (ver `cartFingerprint`). */
  cartFingerprint: string;
};

/**
 * Convierte las líneas locales del carrito al contrato `OrderLineInput`.
 * La cotización y el checkout DEBEN usar esta misma función para garantizar
 * que se cotizan exactamente las líneas que luego se envían.
 */
export function buildOrderLineInputs(
  lines: readonly CartLine[],
  mode: CartMode,
): OrderLineInput[] {
  return lines.map((line) => ({
    product_id: line.product_id,
    quantity: line.quantity,
    purchase_mode: mode,
    modifiers: line.modifiers.map((modifier) => ({
      modifier_option_id: modifier.modifier_option_id,
      quantity: modifier.quantity,
    })),
    customer_note: line.customer_note ?? null,
  }));
}

/**
 * Huella económica del carrito: la `key` de cada línea ya captura producto +
 * modificadores (firma estable), y se añade la cantidad. Cualquier alta, baja
 * o cambio de cantidad/configuración produce una huella distinta.
 */
export function cartFingerprint(lines: readonly CartLine[]): string {
  return lines.map((line) => `${line.key}#${line.quantity}`).join("|");
}

/**
 * Devuelve la cotización aplicada solo si sigue siendo válida: modo dinero y
 * el carrito idéntico al cotizado. En cualquier otro caso devuelve `null`
 * (la UI debe descartar el código; NUNCA viaja en modo créditos).
 */
export function resolveActiveDiscount(
  applied: AppliedDiscount | null,
  mode: CartMode,
  lines: readonly CartLine[],
): AppliedDiscount | null {
  if (!applied) return null;
  if (mode !== "money") return null;
  if (lines.length === 0) return null;
  return applied.cartFingerprint === cartFingerprint(lines) ? applied : null;
}

/**
 * Estimación local SOLO informativa (subtotal del menú − descuento cotizado,
 * nunca negativa). El total real lo calcula el backend en el checkout.
 */
export function estimatedTotalAfterDiscount(
  subtotalHint: number,
  discountAmount: string,
): number {
  const discount = Number.parseFloat(discountAmount);
  if (!Number.isFinite(discount) || discount <= 0) return subtotalHint;
  return Math.max(0, subtotalHint - discount);
}
