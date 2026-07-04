"use client";

// POS de mostrador: venta en UNA llamada real (POST /pos/sales). Cantidades
// enteras, precios y cambio calculados por el backend — aquí solo se captura.

import { useEffect, useMemo, useState } from "react";

import { QuantityStepper } from "@/components/storefront/QuantityStepper";
import { ApiRequestError } from "@/core/api/api-error";
import { browserApi } from "@/core/api/browser-client";
import type { PublicMenuCategory } from "@/core/restaurant-api/contracts";
import { formatMoney } from "@/core/restaurant-api/theme";

type PosLine = { product_id: string; name: string; price: string | null; quantity: number };

type PosResult = {
  order: { id: string; public_code: string; status: string; total_money_amount?: string | null };
  payment: { status: string; change_amount?: string | null };
};

export function PosView() {
  const [menu, setMenu] = useState<PublicMenuCategory[]>([]);
  const [lines, setLines] = useState<PosLine[]>([]);
  const [billAmount, setBillAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PosResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await browserApi<PublicMenuCategory[]>("/api/v1/public/menu");
        if (active) setMenu(data);
      } catch {
        if (active) setMenu([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const subtotal = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const price = Number.parseFloat(line.price ?? "");
        return Number.isFinite(price) ? sum + price * line.quantity : sum;
      }, 0),
    [lines],
  );

  function add(productId: string, name: string, price: string | null) {
    setLines((current) => {
      const existing = current.find((line) => line.product_id === productId);
      if (existing) {
        return current.map((line) =>
          line.product_id === productId ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [...current, { product_id: productId, name, price, quantity: 1 }];
    });
  }

  async function charge() {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        lines: lines.map((line) => ({
          product_id: line.product_id,
          quantity: line.quantity,
          purchase_mode: "money",
        })),
        payment: {
          method_code: "cash_counter",
          ...(billAmount ? { change_requested_for_amount: billAmount } : {}),
        },
      };
      const sale = await browserApi<PosResult>("/api/v1/pos/sales", {
        method: "POST",
        body: payload,
      });
      setResult(sale);
      setLines([]);
      setBillAmount("");
    } catch (err) {
      // H6: sin reintentos automáticos en operaciones económicas.
      setError(
        err instanceof ApiRequestError && err.status === 409
          ? "No se pudo confirmar por una actualización simultánea. Revisa y vuelve a intentar."
          : err instanceof ApiRequestError
            ? err.body.message
            : "No fue posible cobrar.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(260px, 1fr)", gap: 18, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {menu.map((category) => (
          <section key={category.id}>
            <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>{category.name}</h2>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
              {category.products
                .filter((product) => product.is_money_purchase_available)
                .map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => add(product.id, product.name, product.money_price_amount ?? null)}
                    style={{
                      border: "1px solid rgba(0,0,0,0.2)", borderRadius: 10,
                      padding: "10px 12px", textAlign: "left", cursor: "pointer",
                      background: "transparent",
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: 13 }}>{product.name}</div>
                    <div style={{ fontSize: 13 }}>{formatMoney(product.money_price_amount)}</div>
                  </button>
                ))}
            </div>
          </section>
        ))}
        {menu.length === 0 ? <p style={{ opacity: 0.7 }}>Sin productos disponibles.</p> : null}
      </div>

      <aside style={{ border: "1px solid rgba(0,0,0,0.2)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 10, position: "sticky", top: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Venta</h2>
        {lines.length === 0 ? (
          <p style={{ fontSize: 13, opacity: 0.7, margin: 0 }}>Toca productos para agregarlos.</p>
        ) : (
          lines.map((line) => (
            <div key={line.product_id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <span style={{ flex: 1, fontWeight: 700 }}>{line.name}</span>
              <QuantityStepper
                value={line.quantity}
                onChange={(next) =>
                  setLines((current) =>
                    current.map((item) =>
                      item.product_id === line.product_id ? { ...item, quantity: next } : item,
                    ),
                  )
                }
              />
              <button
                type="button"
                aria-label={`Quitar ${line.name}`}
                onClick={() => setLines((current) => current.filter((item) => item.product_id !== line.product_id))}
                style={{ border: "none", background: "transparent", cursor: "pointer", fontWeight: 800 }}
              >
                ×
              </button>
            </div>
          ))
        )}
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, borderTop: "1px solid rgba(0,0,0,0.15)", paddingTop: 8 }}>
          <span>Total (referencia)</span>
          <span>{formatMoney(subtotal)}</span>
        </div>
        <label style={{ fontSize: 13, fontWeight: 700 }}>
          Paga con (opcional, para cambio)
          <input
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={billAmount}
            onChange={(event) => setBillAmount(event.target.value)}
            style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.25)" }}
          />
        </label>
        {error ? <p role="alert" style={{ margin: 0, color: "#b3261e", fontSize: 13, fontWeight: 700 }}>{error}</p> : null}
        <button
          type="button"
          disabled={busy || lines.length === 0}
          onClick={() => void charge()}
          style={{ padding: "12px 16px", borderRadius: 10, fontWeight: 900, fontSize: 15, cursor: "pointer" }}
        >
          {busy ? "Cobrando…" : "Cobrar en efectivo"}
        </button>
        {result ? (
          <div role="status" style={{ fontSize: 13, borderTop: "1px solid rgba(0,0,0,0.15)", paddingTop: 8 }}>
            <div style={{ fontWeight: 900 }}>{result.order.public_code} · {result.order.status}</div>
            <div>Total: {formatMoney(result.order.total_money_amount)}</div>
            {result.payment.change_amount ? (
              <div style={{ fontWeight: 800 }}>Cambio: {formatMoney(result.payment.change_amount)}</div>
            ) : null}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
