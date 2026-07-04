import test from "node:test";
import assert from "node:assert/strict";

import {
  coverageBounds,
  coverageToParts,
  partsToMultiPolygon,
  toGeoPoint,
  type LonLat,
} from "./geojson.ts";

// Triángulo abierto (sin duplicado de cierre) alrededor del centro de CDMX.
const TRIANGLE: LonLat[] = [
  [-99.2, 19.4],
  [-99.1, 19.4],
  [-99.15, 19.5],
];

test("toGeoPoint arma el Point [lon, lat] del contrato", () => {
  assert.deepEqual(toGeoPoint(-99.1, 19.4), {
    type: "Point",
    coordinates: [-99.1, 19.4],
  });
});

test("un Polygon se normaliza a partes y se quita el duplicado de cierre", () => {
  const closed = [...TRIANGLE, TRIANGLE[0]];
  const parts = coverageToParts({ type: "Polygon", coordinates: [closed] });
  assert.deepEqual(parts, [[TRIANGLE]]);
});

test("un MultiPolygon conserva partes y anillos interiores", () => {
  const closed = [...TRIANGLE, TRIANGLE[0]];
  const hole: LonLat[] = [
    [-99.17, 19.42],
    [-99.13, 19.42],
    [-99.15, 19.46],
    [-99.17, 19.42],
  ];
  const parts = coverageToParts({
    type: "MultiPolygon",
    coordinates: [[closed, hole], [closed]],
  });
  assert.ok(parts !== null);
  assert.equal(parts.length, 2);
  assert.equal(parts[0].length, 2); // exterior + hoyo preservado
  assert.equal(parts[0][1].length, 3); // el hoyo también se abre
});

test("coberturas no reconocibles devuelven null (el editor arranca vacío)", () => {
  assert.equal(coverageToParts(null), null);
  assert.equal(coverageToParts({}), null);
  assert.equal(coverageToParts({ type: "Point", coordinates: [0, 0] }), null);
  assert.equal(coverageToParts({ type: "Polygon", coordinates: [["x"]] }), null);
  // Un anillo exterior con menos de 3 vértices no es un polígono.
  assert.equal(
    coverageToParts({ type: "Polygon", coordinates: [[TRIANGLE[0], TRIANGLE[1]]] }),
    null,
  );
});

test("partsToMultiPolygon cierra anillos y descarta partes incompletas", () => {
  const multi = partsToMultiPolygon([[TRIANGLE], [[TRIANGLE[0], TRIANGLE[1]]]]);
  assert.ok(multi !== null);
  assert.equal(multi.type, "MultiPolygon");
  assert.equal(multi.coordinates.length, 1); // la parte de 2 vértices se descarta
  const ring = multi.coordinates[0][0];
  assert.equal(ring.length, 4);
  assert.deepEqual(ring[0], ring[ring.length - 1]); // anillo cerrado
});

test("sin partes válidas no hay geometría que enviar", () => {
  assert.equal(partsToMultiPolygon([]), null);
  assert.equal(partsToMultiPolygon([[[TRIANGLE[0]]]]), null);
});

test("ida y vuelta: partes → MultiPolygon → partes es estable", () => {
  const multi = partsToMultiPolygon([[TRIANGLE]]);
  assert.ok(multi !== null);
  assert.deepEqual(coverageToParts(multi), [[TRIANGLE]]);
});

test("coverageBounds encuadra varias coberturas e ignora las inválidas", () => {
  const bounds = coverageBounds([
    partsToMultiPolygon([[TRIANGLE]]),
    null,
    { type: "Polygon", coordinates: [[[-99.3, 19.3], [-99.25, 19.3], [-99.28, 19.35], [-99.3, 19.3]]] },
  ]);
  assert.deepEqual(bounds, {
    minLon: -99.3,
    minLat: 19.3,
    maxLon: -99.1,
    maxLat: 19.5,
  });
  assert.equal(coverageBounds([null, {}]), null);
});
