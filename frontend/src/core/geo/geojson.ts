// Helpers puros de GeoJSON para los mapas (editor de zonas y selector de
// ubicación). El frontend SOLO transforma representaciones para dibujar: la
// validación geométrica real (shapely/PostGIS) y toda decisión de cobertura
// viven en el backend.

export type LonLat = [number, number];

export type MultiPolygonGeoJSON = {
  type: "MultiPolygon";
  coordinates: LonLat[][][];
};

export type GeoPointGeoJSON = {
  type: "Point";
  coordinates: LonLat;
};

/** Punto GeoJSON con el orden [longitud, latitud] que espera el backend. */
export function toGeoPoint(longitude: number, latitude: number): GeoPointGeoJSON {
  return { type: "Point", coordinates: [longitude, latitude] };
}

function isLonLat(value: unknown): value is LonLat {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function ringPositions(value: unknown): LonLat[] | null {
  if (!Array.isArray(value)) return null;
  const positions: LonLat[] = [];
  for (const position of value) {
    if (!isLonLat(position)) return null;
    positions.push([position[0], position[1]]);
  }
  return positions;
}

/** Quita el punto de cierre duplicado (GeoJSON cierra anillos repitiendo el primero). */
function openRing(ring: LonLat[]): LonLat[] {
  if (ring.length >= 2) {
    const [first, last] = [ring[0], ring[ring.length - 1]];
    if (first[0] === last[0] && first[1] === last[1]) return ring.slice(0, -1);
  }
  return ring;
}

/** Cierra un anillo para exportar GeoJSON válido (primero === último). */
function closeRing(ring: LonLat[]): LonLat[] {
  if (ring.length === 0) return ring;
  const [first, last] = [ring[0], ring[ring.length - 1]];
  if (first[0] === last[0] && first[1] === last[1]) return ring.map((p) => [p[0], p[1]]);
  return [...ring.map((p): LonLat => [p[0], p[1]]), [first[0], first[1]]];
}

/**
 * Normaliza una cobertura GeoJSON (Polygon o MultiPolygon) a la forma editable:
 * partes → anillos → posiciones SIN el duplicado de cierre. Devuelve null si el
 * dict no es un polígono reconocible (el editor arranca vacío).
 */
export function coverageToParts(coverage: unknown): LonLat[][][] | null {
  if (typeof coverage !== "object" || coverage === null) return null;
  const geo = coverage as { type?: unknown; coordinates?: unknown };
  const polygons: unknown[] =
    geo.type === "Polygon"
      ? [geo.coordinates]
      : geo.type === "MultiPolygon" && Array.isArray(geo.coordinates)
        ? geo.coordinates
        : [];
  if (polygons.length === 0) return null;

  const parts: LonLat[][][] = [];
  for (const polygon of polygons) {
    if (!Array.isArray(polygon)) return null;
    const rings: LonLat[][] = [];
    for (const ring of polygon) {
      const positions = ringPositions(ring);
      if (positions === null) return null;
      rings.push(openRing(positions));
    }
    if (rings.length === 0 || rings[0].length < 3) return null;
    parts.push(rings);
  }
  return parts;
}

/**
 * Exporta las partes editadas como MultiPolygon GeoJSON con anillos cerrados.
 * Devuelve null si no hay ninguna parte con al menos 3 vértices.
 */
export function partsToMultiPolygon(parts: LonLat[][][]): MultiPolygonGeoJSON | null {
  const coordinates = parts
    .filter((rings) => rings.length > 0 && rings[0].length >= 3)
    .map((rings) => rings.map(closeRing));
  if (coordinates.length === 0) return null;
  return { type: "MultiPolygon", coordinates };
}

export type GeoBounds = {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
};

/** Caja envolvente de una o varias coberturas, para encuadrar el mapa. */
export function coverageBounds(coverages: unknown[]): GeoBounds | null {
  let bounds: GeoBounds | null = null;
  for (const coverage of coverages) {
    const parts = coverageToParts(coverage);
    if (parts === null) continue;
    for (const rings of parts) {
      for (const ring of rings) {
        for (const [lon, lat] of ring) {
          if (bounds === null) {
            bounds = { minLon: lon, minLat: lat, maxLon: lon, maxLat: lat };
          } else {
            bounds.minLon = Math.min(bounds.minLon, lon);
            bounds.minLat = Math.min(bounds.minLat, lat);
            bounds.maxLon = Math.max(bounds.maxLon, lon);
            bounds.maxLat = Math.max(bounds.maxLat, lat);
          }
        }
      }
    }
  }
  return bounds;
}
