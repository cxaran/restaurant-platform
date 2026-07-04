"use client";

// Campos de grupos de modificadores COMPARTIDOS entre la página de detalle de
// producto (1b) y el diálogo de edición del carrito. La lógica de validación
// vive en src/core/storefront/configurator.ts; aquí solo se pinta y se
// respetan los bloqueos (máximos de grupo y opciones con costo en canje).

import { useId } from "react";

import type { PublicModifierGroup, PublicProduct } from "@/core/restaurant-api/contracts";
import { formatMoney } from "@/core/restaurant-api/theme";
import type {
  GroupSelection,
  ProductSelection,
  SelectionProblem,
} from "@/core/storefront/configurator";

export function groupCounterLabel(group: PublicModifierGroup, count: number): string {
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

/**
 * Todos los grupos del producto como fieldsets, con su contador y el problema
 * de validación (si lo hay) debajo. `variant="page"` usa el encabezado en
 * versales del diseño 1b; `variant="dialog"` conserva el del diálogo.
 */
export function ModifierGroupFields({
  product,
  selection,
  problems,
  creditsMode,
  variant = "dialog",
  onGroupChange,
}: Readonly<{
  product: PublicProduct;
  selection: ProductSelection;
  problems: readonly SelectionProblem[];
  creditsMode: boolean;
  variant?: "dialog" | "page";
  onGroupChange: (groupId: string, next: GroupSelection) => void;
}>) {
  const problemByGroup = new Map(problems.map((problem) => [problem.group_id, problem]));
  return (
    <>
      {product.modifier_groups.map((group) => {
        const entries = selection[group.id] ?? [];
        const problem = problemByGroup.get(group.id);
        return (
          <fieldset key={group.id} style={{ border: "none", margin: "0 0 18px", padding: 0 }}>
            <legend
              className={variant === "page" ? "sf-pd-grouphead" : undefined}
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
              <span style={variant === "page" ? undefined : { fontWeight: 800, fontSize: 15 }}>
                {group.name}
                {group.is_required ? <span style={{ color: "var(--sf-brand)" }}> *</span> : null}
              </span>
              <span className="sf-muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                {groupCounterLabel(group, entries.length)}
              </span>
            </legend>
            <GroupControls
              group={group}
              entries={entries}
              creditsMode={creditsMode}
              onChange={(next) => onGroupChange(group.id, next)}
            />
            {problem ? (
              <p className="sf-error" role="alert" style={{ margin: "8px 0 0", fontSize: 13 }}>
                {problem.message}
              </p>
            ) : null}
          </fieldset>
        );
      })}
    </>
  );
}
