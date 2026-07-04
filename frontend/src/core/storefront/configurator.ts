// Lógica pura del configurador de producto con modificadores (sin React).
// El backend recalcula y valida TODO en el checkout: aquí solo se guía al
// cliente antes de agregar al carrito. Los precios son estimados de
// presentación, nunca verdad económica.

import type {
  PublicModifierGroup,
  PublicProduct,
} from "@/core/restaurant-api/contracts";
import type { CartModifier } from "./cart-lines";

/** Opciones elegidas dentro de un grupo (cantidad entera >= 1 por opción). */
export type GroupSelection = { option_id: string; quantity: number }[];

/** Selección completa del producto: id de grupo → opciones elegidas. */
export type ProductSelection = Record<string, GroupSelection>;

export type SelectionProblemCode =
  | "requerido_sin_seleccion"
  | "bajo_minimo"
  | "sobre_maximo"
  | "single_con_varias";

export type SelectionProblem = {
  group_id: string;
  group_name: string;
  code: SelectionProblemCode;
  message: string;
};

function isValidOptionQuantity(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

/** Entradas de un grupo limpiadas: solo opciones que existen y cantidades válidas. */
function knownEntries(group: PublicModifierGroup, selection: ProductSelection): GroupSelection {
  const optionIds = new Set(group.options.map((option) => option.id));
  return (selection[group.id] ?? []).filter(
    (entry) => optionIds.has(entry.option_id) && isValidOptionQuantity(entry.quantity),
  );
}

/**
 * Valida la selección contra las reglas de cada grupo. Devuelve un problema
 * por grupo incumplido; lista vacía = selección confirmable.
 * `min_selections` aplica aunque el grupo no sea requerido (con mínimo > 0
 * el producto exige configuración explícita).
 */
export function validateSelection(
  product: PublicProduct,
  selection: ProductSelection,
): SelectionProblem[] {
  const problems: SelectionProblem[] = [];
  for (const group of product.modifier_groups) {
    const count = knownEntries(group, selection).length;
    if (group.selection_type === "single" && count > 1) {
      problems.push({
        group_id: group.id,
        group_name: group.name,
        code: "single_con_varias",
        message: `Elige solo una opción en «${group.name}».`,
      });
      continue;
    }
    if (group.is_required && count === 0) {
      problems.push({
        group_id: group.id,
        group_name: group.name,
        code: "requerido_sin_seleccion",
        message: `Elige una opción en «${group.name}» para continuar.`,
      });
      continue;
    }
    if (count < group.min_selections) {
      problems.push({
        group_id: group.id,
        group_name: group.name,
        code: "bajo_minimo",
        message: `Elige al menos ${group.min_selections} en «${group.name}».`,
      });
      continue;
    }
    if (group.max_selections !== null && group.max_selections !== undefined && count > group.max_selections) {
      problems.push({
        group_id: group.id,
        group_name: group.name,
        code: "sobre_maximo",
        message: `Elige máximo ${group.max_selections} en «${group.name}».`,
      });
    }
  }
  return problems;
}

/**
 * Convierte la selección en modificadores de carrito (con nombre para mostrar).
 * Orden determinista: grupos y opciones en el orden publicado del producto.
 * Entradas que no correspondan a opciones del producto se descartan.
 */
export function selectionToCartModifiers(
  product: PublicProduct,
  selection: ProductSelection,
): CartModifier[] {
  const modifiers: CartModifier[] = [];
  for (const group of product.modifier_groups) {
    const entries = knownEntries(group, selection);
    for (const option of group.options) {
      const entry = entries.find((item) => item.option_id === option.id);
      if (entry) {
        modifiers.push({
          modifier_option_id: option.id,
          name: option.name,
          quantity: entry.quantity,
        });
      }
    }
  }
  return modifiers;
}

/**
 * Reconstruye la selección desde los modificadores de una línea existente
 * (para precargar el configurador al editar). Modificadores que ya no existen
 * en el producto publicado se ignoran.
 */
export function cartModifiersToSelection(
  product: PublicProduct,
  modifiers: readonly CartModifier[],
): ProductSelection {
  const groupByOption = new Map<string, string>();
  for (const group of product.modifier_groups) {
    for (const option of group.options) {
      groupByOption.set(option.id, group.id);
    }
  }
  const selection: ProductSelection = {};
  for (const modifier of modifiers) {
    const groupId = groupByOption.get(modifier.modifier_option_id);
    if (!groupId || !isValidOptionQuantity(modifier.quantity)) continue;
    selection[groupId] ??= [];
    selection[groupId].push({ option_id: modifier.modifier_option_id, quantity: modifier.quantity });
  }
  return selection;
}

/**
 * Precio unitario ESTIMADO: precio base del menú + ajustes de las opciones
 * elegidas. Solo presentación — el total real siempre lo confirma el backend.
 * Sin precio monetario base devuelve null.
 */
export function estimatedUnitPrice(
  product: PublicProduct,
  selection: ProductSelection,
): number | null {
  const base = Number.parseFloat(product.money_price_amount ?? "");
  if (!Number.isFinite(base)) return null;
  let total = base;
  for (const group of product.modifier_groups) {
    const entries = knownEntries(group, selection);
    for (const option of group.options) {
      const entry = entries.find((item) => item.option_id === option.id);
      if (!entry) continue;
      const adjustment = Number.parseFloat(option.price_adjustment);
      if (Number.isFinite(adjustment)) total += adjustment * entry.quantity;
    }
  }
  return total;
}

/** ¿Alguna opción elegida tiene ajuste de precio distinto de cero? */
export function hasPriceAdjustments(
  product: PublicProduct,
  selection: ProductSelection,
): boolean {
  for (const group of product.modifier_groups) {
    const entries = knownEntries(group, selection);
    for (const option of group.options) {
      if (!entries.some((item) => item.option_id === option.id)) continue;
      const adjustment = Number.parseFloat(option.price_adjustment);
      if (Number.isFinite(adjustment) && adjustment !== 0) return true;
    }
  }
  return false;
}

/**
 * Cantidad de unidades válida: entero >= 1 y dentro de `max_units_per_order`
 * si el producto lo declara. Nunca se trunca: lo inválido se rechaza.
 */
export function isValidUnitCount(product: PublicProduct, quantity: unknown): quantity is number {
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1) return false;
  const max = product.max_units_per_order;
  return max === null || max === undefined || quantity <= max;
}

/** ¿El producto exige pasar por el configurador antes de agregarse? */
export function requiresConfiguration(product: PublicProduct): boolean {
  return product.modifier_groups.some((group) => group.is_required || group.min_selections > 0);
}

/** ¿El producto tiene grupos de modificadores (aunque sean opcionales)? */
export function isCustomizable(product: PublicProduct): boolean {
  return product.modifier_groups.length > 0;
}
