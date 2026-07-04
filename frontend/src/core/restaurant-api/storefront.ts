import "server-only";

import { serverApi } from "@/core/api/server-client";
import {
  toHighlightVM,
  toSiteVM,
  type HighlightVM,
  type PublicHighlight,
  type PublicStorefrontSite,
  type SiteVM,
} from "./view-models";

/** Contenido configurable del sitio en UNA llamada (meta, tema, carrusel,
 * heros y footer). Cualquier fallo degrada a null: la portada nunca revienta
 * por el contenido editable. */
export async function getPublicStorefrontSite(): Promise<SiteVM | null> {
  try {
    const raw = await serverApi<PublicStorefrontSite>("/api/v1/public/storefront/site");
    return toSiteVM(raw);
  } catch {
    return null;
  }
}

/** Destacados ACTIVOS de una superficie (el backend ya filtró ventana/orden). */
export async function getPublicHighlights(surface: string): Promise<HighlightVM[]> {
  try {
    const raw = await serverApi<PublicHighlight[]>(
      `/api/v1/public/storefront/highlights?surface=${encodeURIComponent(surface)}`,
    );
    return raw.map(toHighlightVM);
  } catch {
    return [];
  }
}
