"use client";

// Selector del modo de compra del carrito: dinero XOR créditos (invariante de
// producto; el backend revalida en el checkout). Solo se ofrece con sesión y
// saldo positivo — sin sesión o sin saldo NO se muestra nada de créditos.
// Excepción deliberada: si el carrito YA está en modo créditos (persistido),
// el control sigue visible para poder volver a dinero (el modo nunca cambia
// solo, jamás hay fallback automático).

import { useState } from "react";

import type { PublicProduct } from "@/core/restaurant-api/contracts";
import { useCart } from "@/core/storefront/cart";
import {
  CREDITS_BLOCK_MESSAGES,
  nonRedeemableLines,
} from "@/core/storefront/credits-cart";
import { usePublicSession } from "@/core/storefront/PublicSessionProvider";

export function CartModeToggle({
  productsById,
  availableCredits,
}: Readonly<{
  /** Catálogo publicado (id → producto) para validar elegibilidad; null = aún cargando. */
  productsById: ReadonlyMap<string, PublicProduct> | null;
  /** Saldo disponible según el backend; null = sin sesión o sin dato. */
  availableCredits: number | null;
}>) {
  const session = usePublicSession();
  const { mode, lines, setMode, removeLine } = useCart();
  const [showBlockers, setShowBlockers] = useState(false);

  const offerCredits = session !== null && availableCredits !== null && availableCredits > 0;
  // Ocultar (no deshabilitar) cuando no hay nada que ofrecer; pero si el modo
  // persistido ya es credits, el cliente necesita el control para volver a dinero.
  if (!offerCredits && mode !== "credits") return null;

  const blockers = productsById ? nonRedeemableLines(lines, productsById) : null;

  function activateCredits() {
    if (mode === "credits") return;
    if (blockers === null) return; // catálogo aún no disponible: no se adivina
    if (blockers.length > 0) {
      setShowBlockers(true);
      return;
    }
    setShowBlockers(false);
    setMode("credits");
  }

  return (
    <div className="sf-card" style={{ padding: "14px 16px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 800, fontSize: 14, flex: 1, minWidth: 140 }}>
          ¿Cómo quieres pagar?
        </span>
        <button
          type="button"
          className="sf-chip"
          data-active={mode === "money"}
          aria-pressed={mode === "money"}
          onClick={() => {
            setShowBlockers(false);
            setMode("money");
          }}
        >
          Con dinero
        </button>
        {offerCredits || mode === "credits" ? (
          <button
            type="button"
            className="sf-chip"
            data-active={mode === "credits"}
            aria-pressed={mode === "credits"}
            onClick={activateCredits}
          >
            Canjear créditos
          </button>
        ) : null}
      </div>
      {mode === "credits" && availableCredits !== null ? (
        <p className="sf-muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
          Saldo disponible: <strong>{availableCredits} créditos</strong>. El pedido completo se
          canjea con créditos, solo para recoger en tienda.
        </p>
      ) : null}
      {showBlockers && blockers !== null && blockers.length > 0 ? (
        <div className="sf-error" role="alert" style={{ marginTop: 10 }}>
          <p style={{ margin: "0 0 8px", fontWeight: 700 }}>
            Para canjear con créditos, todos los productos del carrito deben ser canjeables:
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {blockers.map(({ line, reason }) => (
              <li
                key={line.key}
                style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
              >
                <span style={{ flex: 1, minWidth: 140 }}>
                  <strong>{line.name}</strong>
                  <span className="sf-muted"> · {CREDITS_BLOCK_MESSAGES[reason]}</span>
                </span>
                <button
                  type="button"
                  className="sf-chip"
                  onClick={() => removeLine(line.key)}
                  aria-label={`Quitar ${line.name} del carrito`}
                >
                  Quitar producto
                </button>
              </li>
            ))}
          </ul>
          <p className="sf-muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
            Quita los productos señalados y vuelve a elegir «Canjear créditos», o deja tu pedido
            en dinero.
          </p>
        </div>
      ) : null}
    </div>
  );
}
