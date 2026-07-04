"use client";

// Configurador de producto con modificadores: bottom-sheet en móvil y modal
// centrado en desktop. La validación local solo guía al cliente; el backend
// recalcula precios y vuelve a validar grupos en el checkout.

import { useEffect, useId, useRef, useState } from "react";

import type { PublicModifierGroup, PublicProduct } from "@/core/restaurant-api/contracts";
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
  type GroupSelection,
  type ProductSelection,
} from "@/core/storefront/configurator";
import { QuantityStepper } from "./QuantityStepper";

function groupCounterLabel(group: PublicModifierGroup, count: number): string {
  if (group.selection_type === "single") {
    return group.is_required ? `${count} de 1 · obligatorio` : `${count} de 1`;
  }
  if (group.max_selections !== null && group.max_selections !== undefined) {
    return `${count} de ${group.min_selections}–${group.max_selections}`;
  }
  return group.min_selections > 0
    ? `${count} seleccionadas · mínimo ${group.min_selections}`
    : `${count} seleccionadas`;
}

function GroupControls({
  group,
  entries,
  creditsMode,
  onChange,
}: Readonly<{
  group: PublicModifierGroup;
  entries: GroupSelection;
  /** En canje con créditos los modificadores con costo monetario no se pueden elegir. */
  creditsMode: boolean;
  onChange: (next: GroupSelection) => void;
}>) {
  const single = group.selection_type === "single";
  const atMax =
    !single &&
    group.max_selections !== null &&
    group.max_selections !== undefined &&
    entries.length >= group.max_selections;
  const inputName = useId();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {single && !group.is_required ? (
        <label className="sf-option" data-checked={entries.length === 0}>
          <input
            type="radio"
            name={inputName}
            checked={entries.length === 0}
            onChange={() => onChange([])}
          />
          <span style={{ fontWeight: 600 }}>Sin selección</span>
        </label>
      ) : null}
      {group.options.map((option) => {
        const checked = entries.some((entry) => entry.option_id === option.id);
        const adjustment = Number.parseFloat(option.price_adjustment);
        const monetary = Number.isFinite(adjustment) && adjustment !== 0;
        // En canje: opción con costo bloqueada. Si venía marcada (línea previa)
        // se deja QUITAR — solo se impide elegirla, nunca quedar atrapado.
        const creditsBlocked = creditsMode && monetary;
        const blocked = (!single && atMax && !checked) || (creditsBlocked && !checked);
        return (
          <label
            key={option.id}
            className="sf-option"
            data-checked={checked}
            data-disabled={blocked}
          >
            <input
              type={single ? "radio" : "checkbox"}
              name={single ? inputName : undefined}
              checked={checked}
              disabled={blocked}
              onChange={() => {
                if (single) {
                  onChange([{ option_id: option.id, quantity: 1 }]);
                } else if (checked) {
                  onChange(entries.filter((entry) => entry.option_id !== option.id));
                } else {
                  onChange([...entries, { option_id: option.id, quantity: 1 }]);
                }
              }}
            />
            <span style={{ flex: 1 }}>
              <span style={{ fontWeight: 700 }}>{option.name}</span>
              {option.description ? (
                <span className="sf-muted" style={{ display: "block", fontSize: 13 }}>
                  {option.description}
                </span>
              ) : null}
            </span>
            {monetary ? (
              <span style={{ fontWeight: 700, whiteSpace: "nowrap", textAlign: "right" }}>
                {adjustment > 0 ? "+" : "−"}
                {formatMoney(Math.abs(adjustment))}
                {creditsBlocked ? (
                  <span className="sf-muted" style={{ display: "block", fontSize: 11, fontWeight: 600 }}>
                    No disponible en canje
                  </span>
                ) : null}
              </span>
            ) : null}
          </label>
        );
      })}
    </div>
  );
}

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
  const problemByGroup = new Map(problems.map((problem) => [problem.group_id, problem]));
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
          {product.modifier_groups.map((group) => {
            const entries = selection[group.id] ?? [];
            const problem = problemByGroup.get(group.id);
            return (
              <fieldset
                key={group.id}
                style={{ border: "none", margin: "0 0 18px", padding: 0 }}
              >
                <legend
                  style={{
                    display: "flex",
                    width: "100%",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: 0,
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontWeight: 800, fontSize: 15 }}>
                    {group.name}
                    {group.is_required ? (
                      <span style={{ color: "var(--sf-brand)" }}> *</span>
                    ) : null}
                  </span>
                  <span className="sf-muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                    {groupCounterLabel(group, entries.length)}
                  </span>
                </legend>
                <GroupControls
                  group={group}
                  entries={entries}
                  creditsMode={creditsMode}
                  onChange={(next) =>
                    setSelection((current) => ({ ...current, [group.id]: next }))
                  }
                />
                {problem ? (
                  <p className="sf-error" role="alert" style={{ margin: "8px 0 0", fontSize: 13 }}>
                    {problem.message}
                  </p>
                ) : null}
              </fieldset>
            );
          })}

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
