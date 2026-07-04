import Link from "next/link";

import type { CreditTotalsRead } from "@/core/restaurant-api/contracts";

// Tarjeta de saldo de créditos (3a): saldo grande en display sobre color de
// marca, mini-estadísticas Ganados/Canjeados y CTA al menú (donde se canjea).
// Las tres cifras las calcula el BACKEND desde el ledger; aquí solo se pintan.
export function CreditsHero({ totals }: Readonly<{ totals: CreditTotalsRead }>) {
  return (
    <section className="sf-credits-hero">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <span className="sf-credits-hero-label">Créditos disponibles</span>
        <span className="sf-credits-hero-hint">canjeables por productos</span>
      </div>
      <div className="sf-display" style={{ fontSize: 38, lineHeight: 1 }}>
        {totals.available}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div className="sf-credit-stat">
          <span>Ganados</span>
          <strong>{totals.earned}</strong>
        </div>
        <div className="sf-credit-stat">
          <span>Canjeados</span>
          <strong>{totals.redeemed}</strong>
        </div>
        <Link className="sf-credit-cta" href="/menu">
          Canjear en el menú
        </Link>
      </div>
      <p className="sf-credits-hero-hint" style={{ margin: 0 }}>
        Gana créditos con tus compras y canjéalos por productos del menú.
      </p>
    </section>
  );
}
