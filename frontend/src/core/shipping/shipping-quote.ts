// Lógica pura de la cotización ESTIMADA de envío (sin React): construcción de
// la petición, clave de recotización e interpretación del resultado.
//
// INVARIANTES de producto: el backend es la ÚNICA autoridad de cobertura,
// zona, tarifa, envío gratis y monto. El frontend nunca calcula un costo de
// envío ni lo persiste: cotiza contra POST /public/shipping-quote, muestra la
// decisión (calculated | pending_review) y al crear el pedido el backend
// recalcula por su cuenta. Un pedido con cotización pending_review se muestra
// SIEMPRE como "costo de envío por confirmar", jamás con un total final falso.

import type {
  PublicShippingQuoteRequest,
  PublicShippingQuoteResult,
} from "@/core/restaurant-api/contracts";

export type QuotePoint = { longitude: number; latitude: number };

/** Estado de la cotización que la UI pinta tal cual. */
export type ShippingQuoteState =
  | { kind: "idle" } // no aplica (pickup/counter) o aún sin punto
  | { kind: "loading" }
  | {
      kind: "calculated";
      /** Texto decimal del backend; la UI solo lo formatea. */
      amount: string;
      isFreeShipping: boolean;
      zoneName: string | null;
      estimatedMinutes: number | null;
    }
  | { kind: "pending_review"; zoneName: string | null }
  | { kind: "error" };

/** Subtotal como texto decimal estable (el contrato acepta Decimal). */
export function quoteSubtotal(subtotalHint: number): string {
  return (Number.isFinite(subtotalHint) && subtotalHint > 0 ? subtotalHint : 0).toFixed(2);
}

/**
 * Cuerpo de la cotización. La cotización SIEMPRE lleva punto: sin punto el
 * resultado es conocido por contrato (`pending_review`) y no se gasta la
 * llamada — ver `shouldQuote`.
 */
export function buildQuoteRequest(
  subtotalHint: number,
  point: QuotePoint,
): PublicShippingQuoteRequest {
  return {
    subtotal: quoteSubtotal(subtotalHint),
    location: { type: "Point", coordinates: [point.longitude, point.latitude] },
  };
}

/** Solo se cotiza en entregas a domicilio y con un punto colocado. */
export function shouldQuote(
  fulfillment: string,
  point: QuotePoint | null,
): point is QuotePoint {
  return fulfillment === "delivery" && point !== null;
}

/**
 * Clave de recotización: cambia si cambia el fulfillment, el subtotal o el
 * punto. La UI recotiza cuando esta clave cambia (y descarta respuestas de
 * claves viejas para no pintar cotizaciones obsoletas).
 */
export function quoteKey(
  fulfillment: string,
  subtotalHint: number,
  point: QuotePoint | null,
): string | null {
  if (!shouldQuote(fulfillment, point)) return null;
  // 6 decimales ≈ 0.1 m: suficiente para no recotizar por ruido de arrastre.
  return `${quoteSubtotal(subtotalHint)}@${point.longitude.toFixed(6)},${point.latitude.toFixed(6)}`;
}

/** Traduce la respuesta del backend al estado que pinta la UI. */
export function interpretQuote(result: PublicShippingQuoteResult): ShippingQuoteState {
  if (result.status === "calculated" && result.amount != null) {
    return {
      kind: "calculated",
      amount: String(result.amount),
      isFreeShipping: result.is_free_shipping ?? false,
      zoneName: result.zone_name ?? null,
      estimatedMinutes: result.estimated_minutes ?? null,
    };
  }
  // Cualquier cosa que no sea un cálculo completo se trata como revisión
  // manual: fuera de zona, zona sin tarifa aplicable o respuesta inesperada.
  return { kind: "pending_review", zoneName: result.zone_name ?? null };
}

/**
 * Total estimado a mostrar: solo existe un número cuando la cotización está
 * calculada; en cualquier otro caso el total queda abierto ("+ envío por
 * confirmar") y NUNCA se presenta como total final.
 */
export function estimatedOrderTotal(
  subtotalAfterDiscount: number,
  state: ShippingQuoteState,
): number | null {
  if (state.kind !== "calculated") return null;
  const shipping = Number.parseFloat(state.amount);
  if (!Number.isFinite(shipping) || shipping < 0) return null;
  return subtotalAfterDiscount + shipping;
}
