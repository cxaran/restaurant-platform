"use client";

// Interruptor del programa de créditos/puntos, leído de la config pública del
// negocio (GET /public/business, cacheado 60 s). Lo consumen el carrito y el
// checkout para no ofrecer el canje cuando está apagado; el backend es la
// autoridad y rechaza igual el canje con 422 (esto es UX, no seguridad).

import { useEffect, useState } from "react";

import { browserApi } from "@/core/api/browser-client";
import type { PublicBusiness } from "@/core/restaurant-api/contracts";

/**
 * `true`/`false` según la config del negocio; `null` mientras carga o si el
 * endpoint falla (en duda NO se oculta nada). Trata `null` como «no ocultar».
 */
export function useCreditsEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const business = await browserApi<PublicBusiness>("/api/v1/public/business");
        if (active) setEnabled(business.credits_enabled);
      } catch {
        if (active) setEnabled(null);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return enabled;
}
