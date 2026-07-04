"use client";

// Saldo de créditos del cliente autenticado para la UI de canje. El saldo lo
// CALCULA el backend desde el ledger; aquí solo se consulta. Sin sesión no se
// consulta nada (el sitio público admite visitantes anónimos).

import { useEffect, useState } from "react";

import { browserApi } from "@/core/api/browser-client";
import type { CreditTotalsRead } from "@/core/restaurant-api/contracts";
import { usePublicSession } from "./PublicSessionProvider";

export function useMyCredits(): CreditTotalsRead | null {
  const session = usePublicSession();
  const [totals, setTotals] = useState<CreditTotalsRead | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    browserApi<CreditTotalsRead>("/api/v1/credits/me")
      .then((result) => {
        if (!cancelled) setTotals(result);
      })
      .catch(() => {
        // Silencioso: sin saldo consultable no se ofrece nada de créditos.
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  // Derivado, no reseteado en el efecto: sin sesión nunca se expone saldo.
  return session ? totals : null;
}
