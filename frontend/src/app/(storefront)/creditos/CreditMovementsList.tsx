import type { CreditMovementRead } from "@/core/restaurant-api/contracts";

// Movimientos del ledger de créditos (3a): renglones divididos con signo y
// color por dirección. El delta viene del backend; jamás se deriva aquí.

const ENTRY_LABELS: Record<string, string> = {
  earn: "Créditos ganados",
  redeem_reservation: "Canje reservado",
  redemption_release: "Canje liberado",
  earn_reversal: "Reverso por reembolso",
  redemption_refund: "Devolución de canje",
  manual_adjustment: "Ajuste",
};

export function CreditMovementsList({
  movements,
}: Readonly<{ movements: CreditMovementRead[] }>) {
  if (movements.length === 0) {
    return (
      <p className="sf-muted" style={{ margin: 0, fontSize: 14 }}>
        Aún no tienes movimientos: gana créditos comprando en el menú.
      </p>
    );
  }
  return (
    <div className="sf-rowlist">
      {movements.map((movement) => (
        <div key={movement.id} className="sf-rowlist-row">
          <span style={{ flex: 1, minWidth: 0 }}>
            {ENTRY_LABELS[movement.entry_type] ?? movement.entry_type}
            {movement.description ? (
              <span className="sf-muted"> · {movement.description}</span>
            ) : null}
          </span>
          <span className="sf-muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
            {new Date(movement.occurred_at).toLocaleDateString("es-MX", {
              day: "numeric",
              month: "short",
            })}
          </span>
          <span className="sf-delta" data-dir={movement.credit_delta >= 0 ? "pos" : "neg"}>
            {movement.credit_delta >= 0
              ? `+${movement.credit_delta}`
              : `−${Math.abs(movement.credit_delta)}`}
          </span>
        </div>
      ))}
    </div>
  );
}
