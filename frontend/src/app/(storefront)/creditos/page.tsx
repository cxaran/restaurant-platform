import Link from "next/link";
import { cookies } from "next/headers";

import { serverApi } from "@/core/api/server-client";
import { getSession } from "@/core/auth/session";
import type {
  CreditMovementRead,
  CreditTotalsRead,
} from "@/core/restaurant-api/contracts";

import { CreditMovementsList } from "./CreditMovementsList";
import { CreditsHero } from "./CreditsHero";

export const dynamic = "force-dynamic";

// Créditos del cliente alineados al bloque de créditos de la escena 3a:
// tarjeta de saldo grande en display + movimientos con signo/color. Las tres
// agregaciones las CALCULA EL BACKEND desde el ledger — este frontend jamás
// deriva saldos. Tipos: los generados del OpenAPI (contracts.ts).

export default async function CreditosPage() {
  const session = await getSession();
  if (!session) {
    return (
      <div className="sf-container" style={{ paddingBlock: 40, maxWidth: 620 }}>
        <div className="sf-card" style={{ padding: 26, textAlign: "center" }}>
          <p style={{ fontWeight: 700, marginBottom: 14 }}>
            Inicia sesión para ver tus créditos.
          </p>
          <Link className="sf-btn" href="/login?next=/creditos">Iniciar sesión</Link>
        </div>
      </div>
    );
  }

  const cookieHeader = (await cookies()).toString();
  let totals: CreditTotalsRead | null = null;
  let movements: CreditMovementRead[] = [];
  try {
    [totals, movements] = await Promise.all([
      serverApi<CreditTotalsRead>("/api/v1/credits/me", { cookie: cookieHeader }),
      serverApi<CreditMovementRead[]>("/api/v1/credits/me/movements?limit=20", {
        cookie: cookieHeader,
      }),
    ]);
  } catch {
    totals = null;
  }

  return (
    <div className="sf-container" style={{ paddingBlock: 28, maxWidth: 680 }}>
      <h1 className="sf-display" style={{ fontSize: 30, margin: "0 0 18px" }}>Mis créditos</h1>
      {totals === null ? (
        <div className="sf-card" style={{ padding: 24 }}>
          <p className="sf-muted" style={{ margin: 0, fontSize: 14 }}>
            No fue posible consultar tus créditos en este momento.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <CreditsHero totals={totals} />
          <section>
            <h2 className="sf-section-label" style={{ margin: "0 0 8px" }}>
              Movimientos de créditos
            </h2>
            <CreditMovementsList movements={movements} />
          </section>
        </div>
      )}
    </div>
  );
}
