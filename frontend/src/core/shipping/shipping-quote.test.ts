import test from "node:test";
import assert from "node:assert/strict";

import type { PublicShippingQuoteResult } from "@/core/restaurant-api/contracts";
import {
  buildQuoteRequest,
  estimatedOrderTotal,
  interpretQuote,
  quoteKey,
  quoteSubtotal,
  shouldQuote,
  type ShippingQuoteState,
} from "./shipping-quote.ts";

const POINT = { longitude: -99.1332, latitude: 19.4326 };

function makeResult(
  overrides: Partial<PublicShippingQuoteResult> = {},
): PublicShippingQuoteResult {
  return {
    status: "calculated",
    zone_name: "Centro",
    amount: "35.00",
    is_free_shipping: false,
    estimated_minutes: 40,
    ...overrides,
  };
}

// --- quoteSubtotal / buildQuoteRequest ---

test("quoteSubtotal produce texto decimal estable y nunca negativo", () => {
  assert.equal(quoteSubtotal(150), "150.00");
  assert.equal(quoteSubtotal(99.999), "100.00");
  assert.equal(quoteSubtotal(0), "0.00");
  assert.equal(quoteSubtotal(-5), "0.00");
  assert.equal(quoteSubtotal(Number.NaN), "0.00");
});

test("buildQuoteRequest arma GeoJSON Point con [longitud, latitud]", () => {
  const body = buildQuoteRequest(120.5, POINT);
  assert.equal(body.subtotal, "120.50");
  assert.deepEqual(body.location, {
    type: "Point",
    coordinates: [POINT.longitude, POINT.latitude],
  });
});

// --- shouldQuote / quoteKey ---

test("solo se cotiza en delivery y con punto colocado", () => {
  assert.equal(shouldQuote("delivery", POINT), true);
  assert.equal(shouldQuote("delivery", null), false);
  assert.equal(shouldQuote("pickup", POINT), false);
  assert.equal(shouldQuote("counter", POINT), false);
});

test("quoteKey cambia con subtotal y punto, y es null cuando no aplica", () => {
  const base = quoteKey("delivery", 100, POINT);
  assert.ok(base !== null);
  assert.notEqual(quoteKey("delivery", 101, POINT), base);
  assert.notEqual(
    quoteKey("delivery", 100, { ...POINT, latitude: POINT.latitude + 0.001 }),
    base,
  );
  // Mismos datos → misma clave (no recotiza por re-render).
  assert.equal(quoteKey("delivery", 100, { ...POINT }), base);
  assert.equal(quoteKey("pickup", 100, POINT), null);
  assert.equal(quoteKey("delivery", 100, null), null);
});

// --- interpretQuote ---

test("calculated con monto mapea costo, zona, gratis y minutos", () => {
  const state = interpretQuote(makeResult());
  assert.deepEqual(state, {
    kind: "calculated",
    amount: "35.00",
    isFreeShipping: false,
    zoneName: "Centro",
    estimatedMinutes: 40,
  });
});

test("envío gratis conserva la marca is_free_shipping del backend", () => {
  const state = interpretQuote(makeResult({ amount: "0.00", is_free_shipping: true }));
  assert.equal(state.kind, "calculated");
  assert.equal((state as Extract<ShippingQuoteState, { kind: "calculated" }>).isFreeShipping, true);
});

test("pending_review (fuera de zona) queda como revisión manual", () => {
  const state = interpretQuote(
    makeResult({ status: "pending_review", zone_name: null, amount: null }),
  );
  assert.deepEqual(state, { kind: "pending_review", zoneName: null });
});

test("zona sin tarifa: pending_review conserva el nombre de la zona", () => {
  const state = interpretQuote(
    makeResult({ status: "pending_review", zone_name: "Centro", amount: null }),
  );
  assert.deepEqual(state, { kind: "pending_review", zoneName: "Centro" });
});

test("calculated SIN monto se degrada a revisión manual (nunca total falso)", () => {
  const state = interpretQuote(makeResult({ amount: null }));
  assert.equal(state.kind, "pending_review");
});

// --- estimatedOrderTotal ---

test("el total estimado solo existe con cotización calculada", () => {
  const calculated: ShippingQuoteState = {
    kind: "calculated",
    amount: "35.00",
    isFreeShipping: false,
    zoneName: "Centro",
    estimatedMinutes: null,
  };
  assert.equal(estimatedOrderTotal(100, calculated), 135);
  assert.equal(estimatedOrderTotal(100, { kind: "pending_review", zoneName: null }), null);
  assert.equal(estimatedOrderTotal(100, { kind: "loading" }), null);
  assert.equal(estimatedOrderTotal(100, { kind: "idle" }), null);
  assert.equal(estimatedOrderTotal(100, { kind: "error" }), null);
});

test("un monto no numérico del backend nunca produce total", () => {
  assert.equal(
    estimatedOrderTotal(100, {
      kind: "calculated",
      amount: "no-numérico",
      isFreeShipping: false,
      zoneName: null,
      estimatedMinutes: null,
    }),
    null,
  );
});
