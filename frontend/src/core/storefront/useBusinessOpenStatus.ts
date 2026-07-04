"use client";

// Estado abierto/cerrado del negocio para el flujo de compra del sitio.
// «Bloqueado» = el switch «Pedidos web solo en horario de atención» está
// encendido Y el horario efectivo dice cerrado: el carrito y el checkout
// avisan y deshabilitan el pago (el backend rechaza igual con 409
// negocio_cerrado — esto es UX, no seguridad).

import { useEffect, useState } from "react";

import { browserApi } from "@/core/api/browser-client";
import type { PublicBusiness } from "@/core/restaurant-api/contracts";

export type BusinessOpenStatus = {
  /** El checkout web está bloqueado por horario en este momento. */
  blockedBySchedule: boolean;
  /** Rangos de HOY ("12:00–22:00 h") para explicar cuándo sí se puede. */
  todayLabel: string | null;
};

function slotLabel(business: PublicBusiness): string | null {
  const slots = business.today_slots ?? [];
  if (slots.length === 0) return null;
  const fmt = (value: string) => value.slice(0, 5);
  return slots.map((slot) => `${fmt(slot.opens_at)}–${fmt(slot.closes_at)}`).join(" y ");
}

/** null mientras carga o si el endpoint falla (en duda NO se bloquea nada). */
export function useBusinessOpenStatus(): BusinessOpenStatus | null {
  const [status, setStatus] = useState<BusinessOpenStatus | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const business = await browserApi<PublicBusiness>("/api/v1/public/business");
        if (!active) return;
        setStatus({
          blockedBySchedule:
            business.online_orders_require_open_hours && !business.is_open_now,
          todayLabel: slotLabel(business),
        });
      } catch {
        // Sin datos no se bloquea: el backend es la autoridad al confirmar.
        if (active) setStatus(null);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return status;
}

/** Banner reutilizable de «cerrado por horario» para carrito y checkout. */
export function closedBannerText(status: BusinessOpenStatus): string {
  return status.todayLabel
    ? `Estamos cerrados en este momento. Horario de hoy: ${status.todayLabel} h.`
    : "Estamos cerrados en este momento. Consulta nuestro horario de atención.";
}
