// Lógica pura de elegibilidad del carrito para canje con créditos (sin React).
// INVARIANTES del producto (el backend las revalida SIEMPRE en el checkout):
// un pedido es 100% dinero o 100% créditos; en canje no hay envío, ni códigos
// de descuento, ni modificadores con costo monetario. Aquí solo se guía al
// cliente ANTES de enviar; nada de esto es verdad económica.

import type { PublicProduct } from "@/core/restaurant-api/contracts";
import type { CartLine } from "./cart-lines";

/** Por qué una línea bloquea el modo créditos. */
export type CreditsBlockReason = "producto_no_canjeable" | "modificador_con_costo";

export type NonRedeemableLine = { line: CartLine; reason: CreditsBlockReason };

export const CREDITS_BLOCK_MESSAGES: Record<CreditsBlockReason, string> = {
  producto_no_canjeable: "Solo con dinero — crea un pedido separado.",
  modificador_con_costo: "Tiene modificadores con costo; no disponibles en canje.",
};

/**
 * Precio de canje efectivo de un producto: entero positivo o null si el
 * producto no es canjeable. Producto desconocido (no publicado) → null.
 */
export function redemptionPrice(product: PublicProduct | null | undefined): number | null {
  const price = product?.credit_redemption_price;
  return typeof price === "number" && Number.isFinite(price) && price > 0 ? price : null;
}

export function isRedeemableProduct(product: PublicProduct | null | undefined): boolean {
  return redemptionPrice(product) !== null;
}

/**
 * ¿La línea incluye algún modificador con costo monetario? Una opción que ya
 * no existe en el producto publicado también bloquea: no se puede garantizar
 * que sea gratuita (el backend la rechazaría de todos modos).
 */
function lineHasMonetaryModifier(line: CartLine, product: PublicProduct): boolean {
  if (line.modifiers.length === 0) return false;
  const adjustmentByOption = new Map<string, string>();
  for (const group of product.modifier_groups) {
    for (const option of group.options) {
      adjustmentByOption.set(option.id, option.price_adjustment);
    }
  }
  return line.modifiers.some((modifier) => {
    const raw = adjustmentByOption.get(modifier.modifier_option_id);
    if (raw === undefined) return true;
    const adjustment = Number.parseFloat(raw);
    return !Number.isFinite(adjustment) || adjustment !== 0;
  });
}

/**
 * Líneas que impiden canjear el carrito completo con créditos, con la razón.
 * Producto fuera del catálogo publicado → no canjeable (no se adivina).
 */
export function nonRedeemableLines(
  lines: readonly CartLine[],
  productsById: ReadonlyMap<string, PublicProduct>,
): NonRedeemableLine[] {
  const problems: NonRedeemableLine[] = [];
  for (const line of lines) {
    const product = productsById.get(line.product_id);
    if (!product || !isRedeemableProduct(product)) {
      problems.push({ line, reason: "producto_no_canjeable" });
      continue;
    }
    if (lineHasMonetaryModifier(line, product)) {
      problems.push({ line, reason: "modificador_con_costo" });
    }
  }
  return problems;
}

/**
 * ¿El carrito completo puede canjearse con créditos? Carrito vacío → elegible
 * trivialmente (no hay nada que viole la invariante), aunque no haya canje.
 */
export function cartEligibleForCredits(
  lines: readonly CartLine[],
  productsById: ReadonlyMap<string, PublicProduct>,
): boolean {
  return nonRedeemableLines(lines, productsById).length === 0;
}

/** Créditos de UNA línea (precio de canje × cantidad) o null si no es canjeable. */
export function lineCreditsTotal(
  line: CartLine,
  product: PublicProduct | null | undefined,
): number | null {
  const price = redemptionPrice(product);
  return price === null ? null : price * line.quantity;
}

/**
 * Total en créditos del carrito: suma de `credit_redemption_price × cantidad`
 * de las líneas canjeables. Solo presentación: el backend recalcula y valida
 * el saldo al confirmar. Líneas no canjeables no aportan (la UI las señala
 * por separado vía `nonRedeemableLines`).
 */
export function creditsTotal(
  lines: readonly CartLine[],
  productsById: ReadonlyMap<string, PublicProduct>,
): number {
  return lines.reduce((sum, line) => {
    const total = lineCreditsTotal(line, productsById.get(line.product_id));
    return total === null ? sum : sum + total;
  }, 0);
}
