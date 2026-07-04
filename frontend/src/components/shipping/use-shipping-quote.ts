"use client";

// Hook compartido de cotización de envío (checkout web, POS y cualquier
// captura interna): observa (fulfillment, subtotal, punto) y recotiza contra
// el backend cuando la clave cambia, con debounce para el arrastre del pin.
// El estado resultante se pinta tal cual: el frontend jamás decide el monto.

import { useEffect, useState } from "react";

import { requestShippingQuote } from "@/core/restaurant-api/shipping";
import {
  buildQuoteRequest,
  interpretQuote,
  quoteKey,
  type QuotePoint,
  type ShippingQuoteState,
} from "@/core/shipping/shipping-quote";

const DEBOUNCE_MS = 350;

export function useShippingQuote(
  fulfillment: string,
  subtotalHint: number,
  point: QuotePoint | null,
): ShippingQuoteState {
  // Se guarda la respuesta ANCLADA a su clave: una respuesta de una clave
  // vieja (pin movido, subtotal cambiado) jamás se pinta.
  const [result, setResult] = useState<{ key: string; state: ShippingQuoteState } | null>(null);
  const key = quoteKey(fulfillment, subtotalHint, point);

  useEffect(() => {
    if (key === null || point === null) return;
    const body = buildQuoteRequest(subtotalHint, point);
    const timer = window.setTimeout(() => {
      requestShippingQuote(body)
        .then((response) => setResult({ key, state: interpretQuote(response) }))
        .catch(() => setResult({ key, state: { kind: "error" } }));
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [key, subtotalHint, point]);

  if (key === null) return { kind: "idle" };
  if (result !== null && result.key === key) return result.state;
  return { kind: "loading" };
}
