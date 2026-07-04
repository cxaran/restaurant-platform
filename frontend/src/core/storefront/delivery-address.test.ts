import test from "node:test";
import assert from "node:assert/strict";

import type { UserAddressRead } from "@/core/restaurant-api/contracts";
import {
  addressPoint,
  addressSummary,
  resolveSelectedAddress,
} from "./delivery-address.ts";

function makeAddress(overrides: Partial<UserAddressRead> = {}): UserAddressRead {
  return {
    id: "a1",
    label: null,
    street: "Calle Uno",
    external_number: "12",
    internal_number: null,
    neighborhood: "Centro",
    city: null,
    postal_code: null,
    references: null,
    location: { type: "Point", coordinates: [-99.1, 19.4] },
    is_default: false,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as UserAddressRead;
}

// --- resolveSelectedAddress ---

test("sin direcciones no hay selección", () => {
  assert.equal(resolveSelectedAddress([], null), null);
  assert.equal(resolveSelectedAddress([], "a1"), null);
});

test("con UNA dirección se usa esa aunque el recuerdo apunte a otra", () => {
  const only = makeAddress();
  assert.equal(resolveSelectedAddress([only], null), only);
  assert.equal(resolveSelectedAddress([only], "otra"), only);
});

test("con varias gana la recordada si sigue existiendo", () => {
  const a = makeAddress({ id: "a1" });
  const b = makeAddress({ id: "b2", street: "Calle Dos" });
  assert.equal(resolveSelectedAddress([a, b], "b2"), b);
});

test("recuerdo inválido cae a la predeterminada y luego a la primera", () => {
  const a = makeAddress({ id: "a1" });
  const b = makeAddress({ id: "b2", is_default: true });
  assert.equal(resolveSelectedAddress([a, b], "borrada"), b);
  const c = makeAddress({ id: "c3" });
  assert.equal(resolveSelectedAddress([a, c], "borrada"), a);
});

// --- addressPoint ---

test("addressPoint traduce [lon, lat] y tolera direcciones sin ubicación", () => {
  assert.deepEqual(addressPoint(makeAddress()), { longitude: -99.1, latitude: 19.4 });
  assert.equal(addressPoint(makeAddress({ location: null })), null);
  assert.equal(addressPoint(null), null);
});

// --- addressSummary ---

test("addressSummary arma etiqueta, calle+número y colonia", () => {
  assert.equal(
    addressSummary(makeAddress({ label: "Casa" })),
    "Casa · Calle Uno 12 · Centro",
  );
  assert.equal(
    addressSummary(makeAddress({ label: null, neighborhood: null, external_number: null })),
    "Calle Uno",
  );
});
