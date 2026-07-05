import "server-only";

import { cache } from "react";

import { serverApi } from "@/core/api/server-client";
import type { PublicAnalyticsConfig } from "./contracts";

// Config pública de analítica (GA4). El backend solo expone el ID de medición
// cuando la analítica está habilitada; apagada devuelve {enabled:false}.

/** Config de analítica del sitio (memoizada por request); null si falla. */
export const getPublicAnalyticsConfig = cache(
  async (): Promise<PublicAnalyticsConfig | null> => {
    try {
      return await serverApi<PublicAnalyticsConfig>("/api/v1/public/site/analytics");
    } catch {
      // Sin backend o sin configurar: el sitio funciona sin medición.
      return null;
    }
  },
);
