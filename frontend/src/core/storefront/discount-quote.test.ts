import test from "node:test";
import assert from "node:assert/strict";

import { lineSignature, type CartLine } from "./cart-lines.ts";
import {
  buildOrderLineInputs,
  cartFingerprint,
  estimatedTotalAfterDiscount,
  resolveActiveDiscount,
  type AppliedDiscount,
} from "./discount-quote.ts";

// --- fixtures ---

function makeLine(overrides: Partial<CartLine> = {}): CartLine {
  const base: Omit<CartLine, "key"> = {
    product_id: "p1",
    name: "Hamburguesa",
    unit_price_hint: "100.00",
    quantity: 1,
    modifiers: [],
    ...overrides,
  };
  return { ...base, key: lineSignature(base.product_id, base.modifiers) };
}

function makeApplied(overrides: Partial<AppliedDiscount> = {}): AppliedDiscount {
  return {
    code: "VERANO10",
    name: "Verano",
    discountAmount: "10.00",
    cartFingerprint: cartFingerprint([makeLine()]),
    ...overrides,
  };
}

// --- buildOrderLineInputs ---

test("buildOrderLineInputs mapea producto, cantidad, modificadores y nota", () => {
  const line = makeLine({
    product_id: "p9",
    quantity: 3,
    modifiers: [{ modifier_option_id: "o2", name: "Roja", quantity: 2 }],
    customer_note: "sin cebolla",
  });
  assert.deepEqual(buildOrderLineInputs([line], "money"), [
    {
      product_id: "p9",
      quantity: 3,
      purchase_mode: "money",
      modifiers: [{ modifier_option_id: "o2", quantity: 2 }],
      customer_note: "sin cebolla",
    },
  ]);
});

test("buildOrderLineInputs estampa el modo en cada línea y normaliza nota ausente", () => {
  const lines = buildOrderLineInputs([makeLine(), makeLine({ product_id: "p2" })], "credits");
  assert.equal(lines.length, 2);
  for (const line of lines) {
    assert.equal(line.purchase_mode, "credits");
    assert.equal(line.customer_note, null);
  }
});

// --- cartFingerprint ---

test("cartFingerprint es estable para el mismo carrito", () => {
  const lines = [makeLine(), makeLine({ product_id: "p2", quantity: 2 })];
  assert.equal(cartFingerprint(lines), cartFingerprint([...lines]));
});

test("cartFingerprint cambia si cambia la cantidad", () => {
  const before = [makeLine({ quantity: 1 })];
  const after = [makeLine({ quantity: 2 })];
  assert.notEqual(cartFingerprint(before), cartFingerprint(after));
});

test("cartFingerprint cambia si se agrega o quita una línea", () => {
  const one = [makeLine()];
  const two = [makeLine(), makeLine({ product_id: "p2" })];
  assert.notEqual(cartFingerprint(one), cartFingerprint(two));
  assert.notEqual(cartFingerprint(two), cartFingerprint([]));
});

test("cartFingerprint cambia si cambian los modificadores (nueva firma)", () => {
  const plain = [makeLine()];
  const withMods = [
    makeLine({ modifiers: [{ modifier_option_id: "o1", name: "Verde", quantity: 1 }] }),
  ];
  assert.notEqual(cartFingerprint(plain), cartFingerprint(withMods));
});

// --- resolveActiveDiscount (invalidación) ---

test("resolveActiveDiscount conserva la cotización con modo dinero y carrito idéntico", () => {
  const lines = [makeLine()];
  const applied = makeApplied({ cartFingerprint: cartFingerprint(lines) });
  assert.equal(resolveActiveDiscount(applied, "money", lines), applied);
});

test("resolveActiveDiscount descarta la cotización en modo créditos", () => {
  const lines = [makeLine()];
  const applied = makeApplied({ cartFingerprint: cartFingerprint(lines) });
  assert.equal(resolveActiveDiscount(applied, "credits", lines), null);
});

test("resolveActiveDiscount descarta la cotización si el carrito cambió", () => {
  const applied = makeApplied({ cartFingerprint: cartFingerprint([makeLine({ quantity: 1 })]) });
  assert.equal(resolveActiveDiscount(applied, "money", [makeLine({ quantity: 2 })]), null);
});

test("resolveActiveDiscount descarta la cotización con carrito vacío o sin código", () => {
  assert.equal(resolveActiveDiscount(makeApplied(), "money", []), null);
  assert.equal(resolveActiveDiscount(null, "money", [makeLine()]), null);
});

// --- estimatedTotalAfterDiscount ---

test("estimatedTotalAfterDiscount resta el descuento cotizado", () => {
  assert.equal(estimatedTotalAfterDiscount(150, "10.00"), 140);
});

test("estimatedTotalAfterDiscount nunca es negativa", () => {
  assert.equal(estimatedTotalAfterDiscount(50, "80.00"), 0);
});

test("estimatedTotalAfterDiscount ignora descuentos no numéricos o no positivos", () => {
  assert.equal(estimatedTotalAfterDiscount(120, "abc"), 120);
  assert.equal(estimatedTotalAfterDiscount(120, "0"), 120);
  assert.equal(estimatedTotalAfterDiscount(120, "-5"), 120);
});
