import test from "node:test";
import assert from "node:assert/strict";

import type { PublicModifierGroup, PublicProduct } from "@/core/restaurant-api/contracts";
import {
  lineSignature,
  normalizeStoredCart,
  type CartLine,
  type CartState,
} from "./cart-lines.ts";
import {
  cartEligibleForCredits,
  creditsTotal,
  isRedeemableProduct,
  lineCreditsTotal,
  nonRedeemableLines,
  redemptionPrice,
} from "./credits-cart.ts";

// --- fixtures (mismo patrón que configurator.test.ts) ---

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
    credit_redemption_price: 40,
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

function catalog(...products: PublicProduct[]): Map<string, PublicProduct> {
  return new Map(products.map((product) => [product.id, product]));
}

// --- redemptionPrice / isRedeemableProduct ---

test("redemptionPrice: precio positivo → canjeable; null/0/desconocido → no", () => {
  assert.equal(redemptionPrice(makeProduct({ credit_redemption_price: 40 })), 40);
  assert.equal(redemptionPrice(makeProduct({ credit_redemption_price: null })), null);
  assert.equal(redemptionPrice(makeProduct({ credit_redemption_price: 0 })), null);
  assert.equal(redemptionPrice(undefined), null);
  assert.equal(isRedeemableProduct(makeProduct({ credit_redemption_price: 25 })), true);
  assert.equal(isRedeemableProduct(makeProduct({ credit_redemption_price: null })), false);
});

// --- elegibilidad del carrito ---

test("carrito todo canjeable → elegible y sin líneas señaladas", () => {
  const products = catalog(
    makeProduct({ id: "p1", credit_redemption_price: 40 }),
    makeProduct({ id: "p2", credit_redemption_price: 15 }),
  );
  const lines = [makeLine({ product_id: "p1" }), makeLine({ product_id: "p2", quantity: 3 })];
  assert.equal(cartEligibleForCredits(lines, products), true);
  assert.deepEqual(nonRedeemableLines(lines, products), []);
});

test("un producto no canjeable → no elegible con la línea señalada", () => {
  const products = catalog(
    makeProduct({ id: "p1", credit_redemption_price: 40 }),
    makeProduct({ id: "p2", name: "Refresco", credit_redemption_price: null }),
  );
  const blockedLine = makeLine({ product_id: "p2", name: "Refresco" });
  const lines = [makeLine({ product_id: "p1" }), blockedLine];
  assert.equal(cartEligibleForCredits(lines, products), false);
  const problems = nonRedeemableLines(lines, products);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].line.key, blockedLine.key);
  assert.equal(problems[0].reason, "producto_no_canjeable");
});

test("producto fuera del catálogo publicado → no canjeable (no se adivina)", () => {
  const products = catalog(makeProduct({ id: "p1" }));
  const lines = [makeLine({ product_id: "fantasma", name: "Retirado" })];
  assert.equal(cartEligibleForCredits(lines, products), false);
  assert.equal(nonRedeemableLines(lines, products)[0].reason, "producto_no_canjeable");
});

test("modificador con costo monetario bloquea el canje de esa línea", () => {
  const products = catalog(makeProduct({ id: "p1", credit_redemption_price: 40 }));
  const withCost = makeLine({
    modifiers: [{ modifier_option_id: "o2", name: "Roja", quantity: 1 }],
  });
  const problems = nonRedeemableLines([withCost], products);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].reason, "modificador_con_costo");
  assert.equal(cartEligibleForCredits([withCost], products), false);
});

test("modificador gratuito (ajuste 0) NO bloquea el canje", () => {
  const products = catalog(makeProduct({ id: "p1", credit_redemption_price: 40 }));
  const free = makeLine({
    modifiers: [{ modifier_option_id: "o1", name: "Verde", quantity: 2 }],
  });
  assert.equal(cartEligibleForCredits([free], products), true);
});

test("modificador que ya no existe en el producto publicado bloquea (no se garantiza gratuito)", () => {
  const products = catalog(makeProduct({ id: "p1", credit_redemption_price: 40 }));
  const stale = makeLine({
    modifiers: [{ modifier_option_id: "borrada", name: "Vieja", quantity: 1 }],
  });
  assert.equal(nonRedeemableLines([stale], products)[0].reason, "modificador_con_costo");
});

// --- totales en créditos ---

test("total en créditos correcto: precio de canje × cantidad, sumado por línea", () => {
  const products = catalog(
    makeProduct({ id: "p1", credit_redemption_price: 40 }),
    makeProduct({ id: "p2", credit_redemption_price: 15 }),
  );
  const lines = [
    makeLine({ product_id: "p1", quantity: 2 }),
    makeLine({ product_id: "p2", quantity: 3 }),
  ];
  assert.equal(creditsTotal(lines, products), 40 * 2 + 15 * 3);
  assert.equal(lineCreditsTotal(lines[0], products.get("p1")), 80);
  assert.equal(lineCreditsTotal(lines[0], products.get("inexistente")), null);
});

test("líneas no canjeables no aportan al total (la UI las señala aparte)", () => {
  const products = catalog(
    makeProduct({ id: "p1", credit_redemption_price: 40 }),
    makeProduct({ id: "p2", credit_redemption_price: null }),
  );
  const lines = [makeLine({ product_id: "p1" }), makeLine({ product_id: "p2" })];
  assert.equal(creditsTotal(lines, products), 40);
});

test("carrito vacío → elegible trivial pero sin canje (total 0)", () => {
  const products = catalog(makeProduct());
  assert.equal(cartEligibleForCredits([], products), true);
  assert.deepEqual(nonRedeemableLines([], products), []);
  assert.equal(creditsTotal([], products), 0);
});

// --- migración tolerante del almacenamiento ---

test("normalizeStoredCart: el array v1 se interpreta como modo money", () => {
  const line = makeLine();
  const state = normalizeStoredCart([line, { basura: true }, null]);
  assert.equal(state.mode, "money");
  assert.equal(state.lines.length, 1);
  assert.equal(state.lines[0].key, line.key);
});

test("normalizeStoredCart: forma nueva {mode, lines} se respeta; modo inválido degrada a money", () => {
  const line = makeLine();
  const credits: CartState = normalizeStoredCart({ mode: "credits", lines: [line] });
  assert.equal(credits.mode, "credits");
  assert.equal(credits.lines.length, 1);

  const invalid = normalizeStoredCart({ mode: "regalos", lines: [line] });
  assert.equal(invalid.mode, "money");

  const garbage = normalizeStoredCart("no-json-esperado");
  assert.deepEqual(garbage, { mode: "money", lines: [] });
});
