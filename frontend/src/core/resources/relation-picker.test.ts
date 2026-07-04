import test from "node:test";
import assert from "node:assert/strict";

import {
  relationItemId,
  relationItemLabel,
  relationItemSecondary,
  resolveRelationTarget,
} from "./relation-picker.ts";

// --- resolveRelationTarget (resolución campo FK -> recurso destino) ---
// El único mapeo vigente en la plataforma es user_id -> users; el resto de FK
// caen al input de texto manual (sin regresión) hasta que se registren.

test("resolveRelationTarget: user_id -> users (etiquetas y secundario)", () => {
  const target = resolveRelationTarget("user_id");
  assert.ok(target);
  assert.equal(target.resource, "users");
  assert.equal(target.field, "user_id");
  assert.deepEqual(target.labelFields, ["full_name", "name", "email"]);
  assert.deepEqual(target.secondaryFields, ["email"]);
});

test("resolveRelationTarget: campos de AUDITORÍA devuelven null (los fija el backend)", () => {
  assert.equal(resolveRelationTarget("created_by"), null);
  assert.equal(resolveRelationTarget("updated_by"), null);
  assert.equal(resolveRelationTarget("deleted_by"), null);
});

test("resolveRelationTarget: FK sin mapear y no-FK devuelven null (texto manual)", () => {
  // FK aún no registradas: caen al input de texto, sin selector de relación.
  assert.equal(resolveRelationTarget("customer_user_id"), null);
  assert.equal(resolveRelationTarget("category_id"), null);
  // No-FK / vacío.
  assert.equal(resolveRelationTarget("full_name"), null);
  assert.equal(resolveRelationTarget(""), null);
});

// --- relationItemId / label / secondary ---

test("relationItemId: lee id string y coacciona no-string; null si falta", () => {
  assert.equal(relationItemId({ id: "u-1" }), "u-1");
  assert.equal(relationItemId({ id: 42 }), "42");
  assert.equal(relationItemId({}), null);
  assert.equal(relationItemId({ id: null }), null);
});

test("relationItemLabel: usa el primer labelField con valor; cae al id", () => {
  const target = resolveRelationTarget("user_id")!;
  assert.equal(
    relationItemLabel({ id: "u-1", full_name: "Ana López" }, target),
    "Ana López",
  );
  // Sin full_name -> el siguiente candidato (name).
  assert.equal(relationItemLabel({ id: "u-1", full_name: "", name: "Ana" }, target), "Ana");
  // Sin ningún labelField -> cae al id.
  assert.equal(relationItemLabel({ id: "u-1" }, target), "u-1");
});

test("relationItemSecondary: primer secondaryField con valor; null si falta", () => {
  const target = resolveRelationTarget("user_id")!;
  assert.equal(
    relationItemSecondary({ id: "u-1", email: "ana@example.com" }, target),
    "ana@example.com",
  );
  // Sin email -> null.
  assert.equal(relationItemSecondary({ id: "u-1" }, target), null);
});
