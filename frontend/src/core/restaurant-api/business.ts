import "server-only";

import { cache } from "react";

import { serverApi } from "@/core/api/server-client";
import type { PublicBusiness, PublicMenuCategory } from "./contracts";

/** Perfil público del negocio (memoizado por request). */
export const getPublicBusiness = cache(async (): Promise<PublicBusiness | null> => {
  try {
    return await serverApi<PublicBusiness>("/api/v1/public/business");
  } catch {
    // Sin negocio configurado aún (bootstrap): el sitio muestra fallback.
    return null;
  }
});

export const getPublicMenu = cache(async (): Promise<PublicMenuCategory[]> => {
  try {
    return await serverApi<PublicMenuCategory[]>("/api/v1/public/menu");
  } catch {
    return [];
  }
});
