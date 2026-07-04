"use client";

import Link from "next/link";

import { QuantityStepper } from "@/components/storefront/QuantityStepper";
import { formatMoney } from "@/core/restaurant-api/theme";
import { useCart } from "@/core/storefront/cart";

export default function CartPage() {
  const { lines, count, subtotalHint, setQuantity, removeLine } = useCart();

  return (
    <div className="sf-container" style={{ paddingBlock: 28, maxWidth: 760 }}>
      <h1 className="sf-display" style={{ fontSize: 30, margin: "0 0 18px" }}>Tu carrito</h1>
      {lines.length === 0 ? (
        <div className="sf-card" style={{ padding: 28, textAlign: "center" }}>
          <p style={{ fontWeight: 700, marginBottom: 12 }}>Tu carrito está vacío.</p>
          <Link className="sf-btn" href="/menu">Ver menú</Link>
        </div>
      ) : (
        <>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }} aria-live="polite">
            {lines.map((line) => (
              <li key={line.key} className="sf-card" style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 800 }}>{line.name}</div>
                  <div className="sf-muted" style={{ fontSize: 13 }}>
                    {line.unit_price_hint ? `${formatMoney(line.unit_price_hint)} c/u` : "Precio al confirmar"}
                  </div>
                </div>
                <QuantityStepper
                  value={line.quantity}
                  onChange={(next) => setQuantity(line.key, next)}
                />
                <div style={{ fontWeight: 900, minWidth: 76, textAlign: "right" }}>
                  {line.unit_price_hint
                    ? formatMoney(Number.parseFloat(line.unit_price_hint) * line.quantity)
                    : "—"}
                </div>
                <button
                  type="button"
                  className="sf-chip"
                  onClick={() => removeLine(line.key)}
                  aria-label={`Quitar ${line.name}`}
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
          <div className="sf-card" style={{ marginTop: 18, padding: "18px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 800 }}>
                {count} producto{count === 1 ? "" : "s"} · {formatMoney(subtotalHint)}
              </div>
              <div className="sf-muted" style={{ fontSize: 12 }}>
                Subtotal estimado del menú; el total final (incluido el envío) lo confirma la
                cocina al procesar tu pedido.
              </div>
            </div>
            <Link className="sf-btn" href="/checkout">Continuar</Link>
          </div>
        </>
      )}
    </div>
  );
}
