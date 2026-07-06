import "server-only";

import { cache } from "react";

import { serverApi } from "@/core/api/server-client";
import type {
  PublicBusiness,
  PublicMenuCategory,
  PublicWeeklySchedule,
} from "./contracts";

/** Perfil público del negocio (memoizado por request). */
export const getPublicBusiness = cache(async (): Promise<PublicBusiness | null> => {
  try {
    return await serverApi<PublicBusiness>("/api/v1/public/business");
  } catch {
    // Sin negocio configurado aún (bootstrap): el sitio muestra fallback.
    return null;
  }
});

/** Horario de atención semanal (7 días) para la página de horario. */
export const getPublicSchedule = cache(
  async (): Promise<PublicWeeklySchedule | null> => {
    try {
      return await serverApi<PublicWeeklySchedule>("/api/v1/public/business/schedule");
    } catch {
      return null;
    }
  },
);

export const getPublicMenu = cache(async (): Promise<PublicMenuCategory[]> => {
  try {
    return await serverApi<PublicMenuCategory[]>("/api/v1/public/menu");
  } catch {
    return [];
  }
});
