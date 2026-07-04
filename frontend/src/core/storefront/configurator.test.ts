import test from "node:test";
import assert from "node:assert/strict";

import type { PublicModifierGroup, PublicProduct } from "@/core/restaurant-api/contracts";
import { lineSignature, replaceLineIn, type CartLine } from "./cart-lines.ts";
import {
  cartModifiersToSelection,
  estimatedUnitPrice,
  isCustomizable,
  isValidUnitCount,
  requiresConfiguration,
  selectionToCartModifiers,
  validateSelection,
  type ProductSelection,
} from "./configurator.ts";

// --- fixtures ---

function makeGroup(overrides: Partial<PublicModifierGroup> = {}): PublicModifierGroup {
  return {
    id: "g1",
    name: "Salsas",
    selection_type: "multiple",
    is_required: false,
    min_selections: 0,
    max_selections: null,
    options: [
      { id: "o1", name: "Verde", description: null, price_adjustment: "0.00" },
      { id: "o2", name: "Roja", description: null, price_adjustment: "5.50" },
      { id: "o3", name: "Chipotle", description: null, price_adjustment: "10.00" },
    ],
    ...overrides,
  };
}

function makeProduct(overrides: Partial<PublicProduct> = {}): PublicProduct {
  return {
    id: "p1",
    name: "Hamburguesa",
    description: null,
    money_price_amount: "100.00",
    is_money_purchase_available: true,
    credits_awarded_per_unit: 0,
    credit_redemption_price: null,
    is_featured: false,
    max_units_per_order: null,
    image_file_ids: [],
    inclusions: [],
    modifier_groups: [makeGroup()],
    ...overrides,
  };
}

function makeLine(overrides: Partial<CartLine> = {}): CartLine {
  const base: Omit<CartLine, "key"> = {
    product_id: "p1",
    name: "Hamburguesa",
    unit_price_hint: "100.00",
    quantity: 1,
    modifiers: [],
    ...overrides,
  };
  return { ...base, key: overrides.key ?? lineSignature(base.product_id, base.modifiers) };
}

// --- validateSelection ---

test("grupo requerido sin selección es inválido", () => {
  const product = makeProduct({
    modifier_groups: [makeGroup({ is_required: true, selection_type: "single" })],
  });
  const problems = validateSelection(product, {});
  assert.equal(problems.length, 1);
  assert.equal(problems[0].code, "requerido_sin_seleccion");
  assert.equal(problems[0].group_id, "g1");
});

test("min_selections se respeta (aunque el grupo no sea requerido)", () => {
  const product = makeProduct({ modifier_groups: [makeGroup({ min_selections: 2 })] });
  const short: ProductSelection = { g1: [{ option_id: "o1", quantity: 1 }] };
  assert.equal(validateSelection(product, short)[0]?.code, "bajo_minimo");
  const enough: ProductSelection = {
    g1: [
      { option_id: "o1", quantity: 1 },
      { option_id: "o2", quantity: 1 },
    ],
  };
  assert.deepEqual(validateSelection(product, enough), []);
});

test("max_selections se respeta", () => {
  const product = makeProduct({ modifier_groups: [makeGroup({ max_selections: 2 })] });
  const over: ProductSelection = {
    g1: [
      { option_id: "o1", quantity: 1 },
      { option_id: "o2", quantity: 1 },
      { option_id: "o3", quantity: 1 },
    ],
  };
  assert.equal(validateSelection(product, over)[0]?.code, "sobre_maximo");
});

test("single con más de una opción es inválido", () => {
  const product = makeProduct({
    modifier_groups: [makeGroup({ selection_type: "single" })],
  });
  const two: ProductSelection = {
    g1: [
      { option_id: "o1", quantity: 1 },
      { option_id: "o2", quantity: 1 },
    ],
  };
  assert.equal(validateSelection(product, two)[0]?.code, "single_con_varias");
});

test("multiple dentro de rango es válido", () => {
  const product = makeProduct({
    modifier_groups: [makeGroup({ min_selections: 1, max_selections: 2 })],
  });
  const selection: ProductSelection = {
    g1: [
      { option_id: "o1", quantity: 1 },
      { option_id: "o3", quantity: 1 },
    ],
  };
  assert.deepEqual(validateSelection(product, selection), []);
});

test("producto sin grupos siempre es válido", () => {
  const product = makeProduct({ modifier_groups: [] });
  assert.deepEqual(validateSelection(product, {}), []);
  assert.equal(requiresConfiguration(product), false);
  assert.equal(isCustomizable(product), false);
});

test("opciones desconocidas no cuentan para la validación", () => {
  const product = makeProduct({
    modifier_groups: [makeGroup({ is_required: true, selection_type: "single" })],
  });
  const ghost: ProductSelection = { g1: [{ option_id: "fantasma", quantity: 1 }] };
  assert.equal(validateSelection(product, ghost)[0]?.code, "requerido_sin_seleccion");
});

// --- round-trip selección ↔ modificadores de carrito ---

test("selectionToCartModifiers produce nombres y cartModifiersToSelection reconstruye", () => {
  const product = makeProduct();
  const selection: ProductSelection = {
    g1: [
      { option_id: "o2", quantity: 1 },
      { option_id: "o1", quantity: 1 },
    ],
  };
  const modifiers = selectionToCartModifiers(product, selection);
  // Orden determinista: el publicado en el producto (o1 antes que o2).
  assert.deepEqual(modifiers, [
    { modifier_option_id: "o1", name: "Verde", quantity: 1 },
    { modifier_option_id: "o2", name: "Roja", quantity: 1 },
  ]);
  const rebuilt = cartModifiersToSelection(product, modifiers);
  assert.deepEqual(selectionToCartModifiers(product, rebuilt), modifiers);
});

test("cartModifiersToSelection ignora modificadores que ya no existen", () => {
  const product = makeProduct();
  const rebuilt = cartModifiersToSelection(product, [
    { modifier_option_id: "extinto", name: "Viejo", quantity: 1 },
    { modifier_option_id: "o3", name: "Chipotle", quantity: 2 },
  ]);
  assert.deepEqual(rebuilt, { g1: [{ option_id: "o3", quantity: 2 }] });
});

// --- cantidades ---

test("cantidades 0, negativas y decimales se rechazan (nunca se truncan)", () => {
  const product = makeProduct();
  assert.equal(isValidUnitCount(product, 0), false);
  assert.equal(isValidUnitCount(product, -3), false);
  assert.equal(isValidUnitCount(product, 1.5), false);
  assert.equal(isValidUnitCount(product, Number.NaN), false);
  assert.equal(isValidUnitCount(product, 1), true);
});

test("max_units_per_order limita la cantidad si viene declarado", () => {
  const product = makeProduct({ max_units_per_order: 3 });
  assert.equal(isValidUnitCount(product, 3), true);
  assert.equal(isValidUnitCount(product, 4), false);
});

// --- precio estimado ---

test("estimatedUnitPrice suma base + ajustes (solo presentación)", () => {
  const product = makeProduct();
  const selection: ProductSelection = {
    g1: [
      { option_id: "o2", quantity: 1 },
      { option_id: "o3", quantity: 2 },
    ],
  };
  assert.equal(estimatedUnitPrice(product, selection), 100 + 5.5 + 20);
});

test("estimatedUnitPrice sin precio monetario base devuelve null", () => {
  const product = makeProduct({ money_price_amount: null });
  assert.equal(estimatedUnitPrice(product, {}), null);
});

// --- requiresConfiguration ---

test("requiresConfiguration detecta requeridos y mínimos > 0", () => {
  assert.equal(
    requiresConfiguration(makeProduct({ modifier_groups: [makeGroup({ is_required: true })] })),
    true,
  );
  assert.equal(
    requiresConfiguration(makeProduct({ modifier_groups: [makeGroup({ min_selections: 1 })] })),
    true,
  );
  assert.equal(requiresConfiguration(makeProduct()), false);
  assert.equal(isCustomizable(makeProduct()), true);
});

// --- firma y reemplazo de líneas del carrito ---

test("lineSignature es estable ante el orden de los modificadores", () => {
  const a = lineSignature("p1", [
    { modifier_option_id: "o1", name: "Verde", quantity: 1 },
    { modifier_option_id: "o2", name: "Roja", quantity: 1 },
  ]);
  const b = lineSignature("p1", [
    { modifier_option_id: "o2", name: "Roja", quantity: 1 },
    { modifier_option_id: "o1", name: "Verde", quantity: 1 },
  ]);
  assert.equal(a, b);
});

test("replaceLineIn reemplaza la línea con nueva firma sin duplicar", () => {
  const original = makeLine({ modifiers: [{ modifier_option_id: "o1", name: "Verde", quantity: 1 }] });
  const other = makeLine({ product_id: "p2", name: "Tacos" });
  const next = replaceLineIn(
    [original, other],
    original.key,
    {
      product_id: "p1",
      name: "Hamburguesa",
      unit_price_hint: "105.50",
      modifiers: [{ modifier_option_id: "o2", name: "Roja", quantity: 1 }],
    },
    2,
  );
  assert.equal(next.length, 2);
  assert.equal(next[0].key, lineSignature("p1", next[0].modifiers));
  assert.equal(next[0].quantity, 2);
  assert.deepEqual(next[0].modifiers, [{ modifier_option_id: "o2", name: "Roja", quantity: 1 }]);
  assert.equal(next[1], other);
});

test("replaceLineIn fusiona cantidades si la firma coincide con otra línea", () => {
  const plain = makeLine({ quantity: 2 });
  const withSauce = makeLine({
    modifiers: [{ modifier_option_id: "o1", name: "Verde", quantity: 1 }],
    quantity: 1,
  });
  // Editar la línea con salsa quitándole la salsa la vuelve idéntica a `plain`.
  const next = replaceLineIn(
    [plain, withSauce],
    withSauce.key,
    { product_id: "p1", name: "Hamburguesa", unit_price_hint: "100.00", modifiers: [] },
    3,
  );
  assert.equal(next.length, 1);
  assert.equal(next[0].key, plain.key);
  assert.equal(next[0].quantity, 5);
});

test("replaceLineIn rechaza cantidades inválidas devolviendo la misma lista", () => {
  const line = makeLine();
  const lines = [line];
  for (const bad of [0, -1, 1.2, Number.NaN]) {
    assert.equal(
      replaceLineIn(lines, line.key, { product_id: "p1", name: "Hamburguesa", unit_price_hint: null, modifiers: [] }, bad),
      lines,
    );
  }
});

test("replaceLineIn con key inexistente no toca la lista", () => {
  const line = makeLine();
  const lines = [line];
  assert.equal(
    replaceLineIn(lines, "no-existe", { product_id: "p9", name: "Otro", unit_price_hint: null, modifiers: [] }, 1),
    lines,
  );
});
