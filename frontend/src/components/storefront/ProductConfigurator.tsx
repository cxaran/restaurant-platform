"use client";

// Diálogo para EDITAR una línea ya agregada al carrito sin salir de él:
// bottom-sheet en móvil y modal centrado en desktop. Agregar desde el menú
// ocurre en la página de detalle del producto (/menu/[productId]); ambos
// comparten la misma lógica de validación (core/storefront/configurator.ts)
// y los mismos campos de grupos (ModifierGroupFields). El backend recalcula
// precios y vuelve a validar grupos en el checkout.

import { useEffect, useId, useRef, useState } from "react";

import type { PublicProduct } from "@/core/restaurant-api/contracts";
import { formatMoney, publicFileUrl } from "@/core/restaurant-api/theme";
import { useCart, type CartLine, type CartMode } from "@/core/storefront/cart";
import { redemptionPrice } from "@/core/storefront/credits-cart";
import {
  cartModifiersToSelection,
  estimatedUnitPrice,
  hasPriceAdjustments,
  isValidUnitCount,
  selectionToCartModifiers,
  validateSelection,
  type ProductSelection,
} from "@/core/storefront/configurator";
import { ModifierGroupFields } from "./ModifierGroupFields";
import { QuantityStepper } from "./QuantityStepper";

export function ProductConfigurator({
  product,
  editLine = null,
  mode = "money",
  onClose,
}: Readonly<{
  product: PublicProduct;
  /** Línea del carrito a editar: precarga selección/cantidad y REEMPLAZA al confirmar. */
  editLine?: CartLine | null;
  /** Modo del carrito: en "credits" los modificadores con costo quedan bloqueados. */
  mode?: CartMode;
  onClose: () => void;
}>) {
  const { addLine, replaceLine } = useCart();
  const [selection, setSelection] = useState<ProductSelection>(() =>
    editLine ? cartModifiersToSelection(product, editLine.modifiers) : {},
  );
  const [quantity, setQuantity] = useState(() => editLine?.quantity ?? 1);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Overlay accesible: foco inicial en el diálogo, Escape cierra y el fondo
  // no se desplaza mientras el configurador está abierto.
  useEffect(() => {
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const problems = validateSelection(product, selection);
  const unitEstimate = estimatedUnitPrice(product, selection);
  const withAdjustments = hasPriceAdjustments(product, selection);
  const imageUrl = publicFileUrl(product.image_file_ids[0] ?? null);
  const maxUnits = product.max_units_per_order ?? undefined;
  // Rechazo, no corrección: una cantidad fuera de política (p. ej. una línea
  // guardada antes de bajar max_units_per_order) bloquea el confirmar.
  const validQuantity = isValidUnitCount(product, quantity);
  const creditsMode = mode === "credits";
  const redeemPrice = redemptionPrice(product);
  // Invariantes de canje: producto canjeable y CERO modificadores con costo
  // (el backend rechazaría con producto_no_canjeable / modificador_monetario_en_canje).
  const creditsConflict = creditsMode && (redeemPrice === null || withAdjustments);
  const canConfirm = problems.length === 0 && validQuantity && !creditsConflict;

  function confirm() {
    if (!canConfirm) return;
    const modifiers = selectionToCartModifiers(product, selection);
    const line = {
      product_id: product.id,
      name: product.name,
      // Hint de presentación (incluye ajustes estimados); nunca se envía al backend.
      unit_price_hint:
        unitEstimate !== null ? unitEstimate.toFixed(2) : (product.money_price_amount ?? null),
      modifiers,
      customer_note: editLine?.customer_note,
    };
    if (editLine) {
      replaceLine(editLine.key, line, quantity);
    } else {
      addLine(line, quantity);
    }
    onClose();
  }

  return (
    <div
      className="sf-modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="sf-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            padding: "18px 20px 12px",
          }}
        >
          {imageUrl ? (
            <div className="sf-imgbox" style={{ width: 72, height: 72, flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- media dinámica del backend */}
              <img
                src={imageUrl}
                alt=""
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
              />
            </div>
          ) : null}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id={titleId} className="sf-display" style={{ fontSize: 22, margin: 0 }}>
              {product.name}
            </h2>
            {product.description ? (
              <p className="sf-muted" style={{ margin: "4px 0 0", fontSize: 13, lineHeight: 1.45 }}>
                {product.description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="sf-chip"
            onClick={onClose}
            aria-label="Cerrar configurador"
            style={{ padding: "6px 12px", flexShrink: 0 }}
          >
            ✕
          </button>
        </div>

        <div className="sf-modal-body">
          <ModifierGroupFields
            product={product}
            selection={selection}
            problems={problems}
            creditsMode={creditsMode}
            onGroupChange={(groupId, next) =>
              setSelection((current) => ({ ...current, [groupId]: next }))
            }
          />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Cantidad</span>
            <QuantityStepper value={quantity} onChange={setQuantity} max={maxUnits} />
          </div>
          {maxUnits !== undefined ? (
            <p className="sf-muted" style={{ margin: "6px 0 0", fontSize: 12 }}>
              Máximo {maxUnits} por pedido.
            </p>
          ) : null}
          {!validQuantity && maxUnits !== undefined ? (
            <p className="sf-error" role="alert" style={{ margin: "8px 0 0", fontSize: 13 }}>
              La cantidad supera el máximo de {maxUnits} por pedido; redúcela para continuar.
            </p>
          ) : null}
        </div>

        <div
          style={{
            padding: "14px 20px 18px",
            borderTop: "1px solid color-mix(in srgb, var(--sf-text) 12%, transparent)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {!creditsMode && unitEstimate !== null && withAdjustments ? (
            <p className="sf-muted" style={{ margin: 0, fontSize: 12 }}>
              Precio estimado; el total final lo confirma la cocina.
            </p>
          ) : null}
          {creditsConflict ? (
            <p className="sf-error" role="alert" style={{ margin: 0, fontSize: 13 }}>
              {redeemPrice === null
                ? "Este producto no es canjeable: solo con dinero — crea un pedido separado."
                : "Hay modificadores con costo seleccionados; no están disponibles en canje. Quítalos para continuar."}
            </p>
          ) : null}
          <button type="button" className="sf-btn" disabled={!canConfirm} onClick={confirm}>
            {editLine ? "Guardar cambios" : "Agregar al carrito"}
            {creditsMode
              ? redeemPrice !== null && validQuantity
                ? ` · ${redeemPrice * quantity} créditos`
                : ""
              : unitEstimate !== null
                ? ` · ${formatMoney(unitEstimate * quantity)}`
                : ""}
          </button>
          {!canConfirm && !creditsConflict ? (
            <p className="sf-muted" style={{ margin: 0, fontSize: 12, textAlign: "center" }}>
              Completa las opciones marcadas para continuar.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
