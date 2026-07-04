"use client";

import { browserApi } from "@/core/api/browser-client";
import type { PublicMenuCategory } from "./contracts";

/**
 * Menú público desde el navegador (misma fuente que `business.ts::getPublicMenu`,
 * que es server-only). Lo usa el carrito para reconstituir el `PublicProduct`
 * de una línea al editar sus modificadores.
 */
export function fetchPublicMenu(): Promise<PublicMenuCategory[]> {
  return browserApi<PublicMenuCategory[]>("/api/v1/public/menu");
}
