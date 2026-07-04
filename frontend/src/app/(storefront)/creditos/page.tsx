import Link from "next/link";
import { cookies } from "next/headers";

import { serverApi } from "@/core/api/server-client";
import { getSession } from "@/core/auth/session";

export const dynamic = "force-dynamic";

// Tarjeta de créditos del cliente (§58.3): tres agregaciones QUE CALCULA EL
// BACKEND desde el ledger — este frontend jamás deriva saldos.
type CreditTotals = { available: number; earned: number; redeemed: number };
type CreditMovement = {
  id: string;
  entry_type: string;
  credit_delta: number;
  description?: string | null;
  occurred_at: string;
};

const ENTRY_LABELS: Record<string, string> = {
  earn: "Créditos ganados",
  redeem_reservation: "Canje reservado",
  redemption_release: "Canje liberado",
  earn_reversal: "Reverso por reembolso",
  redemption_refund: "Devolución de canje",
  manual_adjustment: "Ajuste",
};

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
  let totals: CreditTotals | null = null;
  let movements: CreditMovement[] = [];
  try {
    [totals, movements] = await Promise.all([
      serverApi<CreditTotals>("/api/v1/credits/me", { cookie: cookieHeader }),
      serverApi<CreditMovement[]>("/api/v1/credits/me/movements?limit=20", {
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
        <>
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
            {(
              [
                ["Disponibles", totals.available],
                ["Ganados", totals.earned],
                ["Canjeados", totals.redeemed],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="sf-card" style={{ padding: "18px 20px", textAlign: "center" }}>
                <div className="sf-display" style={{ fontSize: 30, color: "var(--sf-brand)" }}>
                  {value}
                </div>
                <div className="sf-muted" style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
              </div>
            ))}
          </div>
          <h2 className="sf-display" style={{ fontSize: 20, margin: "24px 0 10px" }}>Movimientos</h2>
          {movements.length === 0 ? (
            <p className="sf-muted" style={{ fontSize: 14 }}>
              Aún no tienes movimientos: gana créditos comprando en el menú.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {movements.map((movement) => (
                <li key={movement.id} className="sf-card" style={{ padding: "12px 16px", display: "flex", gap: 12, alignItems: "center", fontSize: 14 }}>
                  <span style={{ flex: 1 }}>
                    {ENTRY_LABELS[movement.entry_type] ?? movement.entry_type}
                    {movement.description ? (
                      <span className="sf-muted"> · {movement.description}</span>
                    ) : null}
                  </span>
                  <span className="sf-muted" style={{ fontSize: 12 }}>
                    {new Date(movement.occurred_at).toLocaleDateString("es-MX")}
                  </span>
                  <span style={{ fontWeight: 900, color: movement.credit_delta > 0 ? "var(--sf-success)" : "var(--sf-brand)" }}>
                    {movement.credit_delta > 0 ? "+" : ""}
                    {movement.credit_delta}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
