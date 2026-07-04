import "server-only";

import { cache } from "react";

import { serverApi } from "@/core/api/server-client";
import type { PublicLegalTerms } from "./contracts";

export type { PublicLegalTerms, PublicLegalCoupon } from "./contracts";

// Documento legal público (/terminos). El backend (GET
// /api/v1/public/legal/terms) es la fuente de verdad; los tipos salen del
// contrato generado.

/** Datos del documento legal autogenerado (memoizado por request). */
export const getPublicLegalTerms = cache(async (): Promise<PublicLegalTerms | null> => {
  try {
    return await serverApi<PublicLegalTerms>("/api/v1/public/legal/terms");
  } catch {
    // Sin negocio configurado aún (bootstrap): la página muestra un fallback.
    return null;
  }
});
