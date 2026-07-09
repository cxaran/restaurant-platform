"use client";

// Tope de UNIDADES por pedido, leído de la config pública del negocio
// (GET /public/business). Lo consumen el carrito y el checkout para AVISAR al
// alcanzarlo y bloquear el CTA cuando se supera; el backend es la autoridad y
// rechaza igual con 422 limite_productos (esto es UX, no seguridad).
//
// Regla de UX pedida: no mostrar contador ni advertencia ANTES del tope; solo
// al alcanzarlo/superarlo. Por eso el hook devuelve el número crudo (o null =
// sin límite / cargando) y la vista decide cuándo mostrar el mensaje.

import { useEffect, useState } from "react";

import { browserApi } from "@/core/api/browser-client";
import type { PublicBusiness } from "@/core/restaurant-api/contracts";

/** Máximo de unidades por pedido, o `null` (sin límite, cargando o error). */
export function useMaxProductsPerOrder(): number | null {
  const [max, setMax] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const business = await browserApi<PublicBusiness>("/api/v1/public/business");
        if (active) setMax(business.max_products_per_order ?? null);
      } catch {
        if (active) setMax(null);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return max;
}
