"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ProductConfigurator } from "@/components/storefront/ProductConfigurator";
import { QuantityStepper } from "@/components/storefront/QuantityStepper";
import type { PublicProduct } from "@/core/restaurant-api/contracts";
import { fetchPublicMenu } from "@/core/restaurant-api/menu";
import { formatMoney } from "@/core/restaurant-api/theme";
import { useCart, type CartLine } from "@/core/storefront/cart";
import { isCustomizable } from "@/core/storefront/configurator";

export default function CartPage() {
  const { lines, count, subtotalHint, setQuantity, removeLine } = useCart();
  const [catalog, setCatalog] = useState<Map<string, PublicProduct> | null>(null);
  const [editing, setEditing] = useState<CartLine | null>(null);

  // Catálogo público para reconstituir el PublicProduct de cada línea al
  // editar. Si el fetch falla solo se ocultan las acciones de edición.
  useEffect(() => {
    let cancelled = false;
    fetchPublicMenu()
      .then((categories) => {
        if (cancelled) return;
        const map = new Map<string, PublicProduct>();
        for (const category of categories) {
          for (const product of category.products) map.set(product.id, product);
        }
        setCatalog(map);
      })
      .catch(() => {
        // Silencioso: el carrito sigue funcionando sin edición de modificadores.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const editingProduct = editing ? (catalog?.get(editing.product_id) ?? null) : null;

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
            {lines.map((line) => {
              const product = catalog?.get(line.product_id) ?? null;
              const editable =
                product !== null && (line.modifiers.length > 0 || isCustomizable(product));
              return (
                <li key={line.key} className="sf-card" style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontWeight: 800 }}>{line.name}</div>
                    {line.modifiers.length > 0 ? (
                      <ul className="sf-muted" style={{ listStyle: "none", margin: "2px 0 0", padding: 0, fontSize: 13 }}>
                        {line.modifiers.map((modifier) => (
                          <li key={modifier.modifier_option_id}>
                            {modifier.name}
                            {modifier.quantity > 1 ? ` ×${modifier.quantity}` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
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
                  {editable ? (
                    <button
                      type="button"
                      className="sf-chip"
                      onClick={() => setEditing(line)}
                      aria-label={`Editar ${line.name}`}
                    >
                      Editar
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="sf-chip"
                    onClick={() => removeLine(line.key)}
                    aria-label={`Quitar ${line.name}`}
                  >
                    Quitar
                  </button>
                </li>
              );
            })}
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
      {editing && editingProduct ? (
        <ProductConfigurator
          product={editingProduct}
          editLine={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
