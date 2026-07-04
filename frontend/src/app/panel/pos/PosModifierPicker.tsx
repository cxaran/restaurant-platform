"use client";

// Picker de modificadores PROPIO del POS (no reutiliza el configurador visual
// del storefront): modal con tokens tt-*, opciones single/multi con las
// validaciones reales de min/max (core/storefront/configurator.ts, lógica
// pura compartida), cantidad y nota de cocina. El backend revalida todo.

import { useEffect, useId, useRef, useState } from "react";

import type { PublicModifierGroup, PublicProduct } from "@/core/restaurant-api/contracts";
import { formatMoney, publicFileUrl } from "@/core/restaurant-api/theme";
import type { CartModifier } from "@/core/storefront/cart-lines";
import {
  estimatedUnitPrice,
  isValidUnitCount,
  selectionToCartModifiers,
  validateSelection,
  type ProductSelection,
} from "@/core/storefront/configurator";

function groupRuleText(group: PublicModifierGroup): string {
  const parts: string[] = [];
  if (group.selection_type === "single") {
    parts.push(group.is_required ? "Obligatorio · elige 1" : "Opcional · elige 1");
  } else {
    if (group.is_required || group.min_selections > 0) {
      parts.push(`Elige al menos ${Math.max(group.min_selections, 1)}`);
    } else {
      parts.push("Opcional");
    }
    if (group.max_selections !== null && group.max_selections !== undefined) {
      parts.push(`máximo ${group.max_selections}`);
    }
  }
  return parts.join(" · ");
}

export function PosModifierPicker({
  product,
  onClose,
  onConfirm,
}: Readonly<{
  product: PublicProduct;
  onClose: () => void;
  onConfirm: (line: {
    modifiers: CartModifier[];
    quantity: number;
    note: string | null;
    unitPriceHint: number | null;
  }) => void;
}>) {
  const [selection, setSelection] = useState<ProductSelection>({});
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Overlay accesible: foco inicial, Escape cierra, el fondo no se desplaza.
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
  const validQuantity = isValidUnitCount(product, quantity);
  const unitEstimate = estimatedUnitPrice(product, selection);
  const canConfirm = problems.length === 0 && validQuantity;
  const imageUrl = publicFileUrl(product.image_file_ids[0] ?? null);
  const maxUnits = product.max_units_per_order ?? null;

  function toggleOption(group: PublicModifierGroup, optionId: string) {
    setSelection((current) => {
      const entries = current[group.id] ?? [];
      const has = entries.some((entry) => entry.option_id === optionId);
      if (group.selection_type === "single") {
        // Tocar la elegida la quita; tocar otra la reemplaza (nunca 2 en single).
        return { ...current, [group.id]: has ? [] : [{ option_id: optionId, quantity: 1 }] };
      }
      return {
        ...current,
        [group.id]: has
          ? entries.filter((entry) => entry.option_id !== optionId)
          : [...entries, { option_id: optionId, quantity: 1 }],
      };
    });
  }

  function confirm() {
    if (!canConfirm) return;
    onConfirm({
      modifiers: selectionToCartModifiers(product, selection),
      quantity,
      note: note.trim() ? note.trim() : null,
      unitPriceHint: unitEstimate,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="tt-card flex max-h-[88dvh] w-full max-w-[540px] flex-col overflow-hidden rounded-b-none rounded-t-2xl sm:rounded-2xl"
      >
        <div className="flex items-start gap-3 border-b border-[var(--border)] px-5 py-4">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- media dinámica del backend
            <img src={imageUrl} alt="" className="h-14 w-14 shrink-0 object-contain" />
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="tt-display m-0 text-[19px]">
              {product.name}
            </h2>
            <p className="m-0 text-[13px] font-black text-[var(--accent)]">
              {formatMoney(product.money_price_amount)}
            </p>
          </div>
          <button
            type="button"
            className="tt-btn tt-btn-ghost shrink-0 px-3 py-1.5"
            onClick={onClose}
            aria-label="Cerrar sin agregar"
          >
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {product.modifier_groups.map((group) => {
            const chosen = new Set(
              (selection[group.id] ?? []).map((entry) => entry.option_id),
            );
            const problem = problemByGroup.get(group.id);
            return (
              <fieldset key={group.id} className="m-0 border-0 p-0">
                <legend className="mb-1 flex w-full items-baseline justify-between gap-2 p-0">
                  <span className="text-sm font-extrabold">{group.name}</span>
                  <span className="tt-label">{groupRuleText(group)}</span>
                </legend>
                <div className="flex flex-wrap gap-2">
                  {group.options.map((option) => {
                    const adjustment = Number.parseFloat(option.price_adjustment);
                    const active = chosen.has(option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className="tt-chip"
                        data-active={active ? "1" : "0"}
                        aria-pressed={active}
                        onClick={() => toggleOption(group, option.id)}
                      >
                        {option.name}
                        {Number.isFinite(adjustment) && adjustment !== 0 ? (
                          <span className="text-xs font-extrabold">
                            {adjustment > 0 ? "+" : "−"}
                            {formatMoney(Math.abs(adjustment))}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                {problem ? (
                  <p role="alert" className="m-0 mt-1 text-xs font-bold text-[var(--accent)]">
                    {problem.message}
                  </p>
                ) : null}
              </fieldset>
            );
          })}

          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-bold">Cantidad</span>
            <div className="flex items-center gap-3 rounded-[10px] border border-[var(--border2)] bg-[var(--bg)] px-3 py-1.5 text-[14px] font-extrabold">
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent text-[16px] font-black text-[var(--accent)]"
                aria-label="Quitar una unidad"
                onClick={() => setQuantity((current) => Math.max(1, current - 1))}
              >
                −
              </button>
              <span aria-live="polite">{quantity}</span>
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent text-[16px] font-black text-[var(--accent)]"
                aria-label="Agregar una unidad"
                onClick={() => setQuantity((current) => current + 1)}
              >
                +
              </button>
            </div>
          </div>
          {maxUnits !== null && !validQuantity ? (
            <p role="alert" className="m-0 text-xs font-bold text-[var(--accent)]">
              Máximo {maxUnits} por pedido; reduce la cantidad para continuar.
            </p>
          ) : null}

          <label className="flex flex-col gap-1 text-sm font-bold">
            Nota para cocina (opcional)
            <textarea
              className="tt-input"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Ej. sin cebolla, salsa aparte…"
            />
          </label>
        </div>

        <div className="border-t border-[var(--border)] px-5 py-4">
          <button
            type="button"
            className="tt-btn tt-btn-primary w-full text-[15px]"
            disabled={!canConfirm}
            onClick={confirm}
          >
            Agregar
            {unitEstimate !== null && validQuantity
              ? ` · ${formatMoney(unitEstimate * quantity)}`
              : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
