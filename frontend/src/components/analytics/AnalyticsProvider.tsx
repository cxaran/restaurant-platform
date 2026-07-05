"use client";

// Punto ÚNICO de arranque de la analítica en el árbol público (storefront +
// login/registro; /admin y /panel jamás se miden). Recibe la config pública
// del layout (server) por props — cero fetch en el cliente — e inicializa el
// adaptador central. Registra page_view en la carga inicial y en cada cambio
// de ruta del App Router; usePathname NO incluye query string, así que rutas
// con tokens (reset-password) o redirecciones (login?next=) nunca se filtran.

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { initAnalytics, trackPageView } from "@/core/analytics/analytics";
import type { PublicAnalyticsConfig } from "@/core/restaurant-api/contracts";

import { ConsentBanner } from "./ConsentBanner";

export function AnalyticsProvider({
  config,
}: Readonly<{ config: PublicAnalyticsConfig | null }>) {
  const pathname = usePathname();
  const enabled = config?.enabled === true && Boolean(config.measurement_id);

  useEffect(() => {
    if (!enabled || !config?.measurement_id) return;
    initAnalytics({
      measurementId: config.measurement_id,
      requireConsent: config.require_consent ?? true,
      debugMode: config.debug_mode ?? false,
    });
  }, [enabled, config]);

  useEffect(() => {
    if (!enabled) return;
    trackPageView(pathname);
  }, [enabled, pathname]);

  if (!enabled) return null;
  return <ConsentBanner />;
}
