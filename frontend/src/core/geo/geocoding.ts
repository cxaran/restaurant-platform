// Geocodificación con Nominatim (OpenStreetMap) para la captura asistida de
// direcciones: punto → dirección sugerida (reverse) y dirección → coordenadas
// aproximadas (search). SOLO asistencia de captura en el cliente: la cobertura,
// tarifas y validación real siguen siendo del backend (PostGIS).
//
// Política de uso de Nominatim: volumen bajo (captura manual), llamadas
// debounced por el caller y máximo un resultado por consulta. Cualquier fallo
// (red, CORS, límite) degrada a null: el flujo manual nunca se bloquea.

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";

export type GeoCoordinates = { longitude: number; latitude: number };

/** Dirección sugerida por el mapa, en los campos que captura el POS/checkout. */
export type AddressSuggestion = {
  street: string;
  external_number: string;
  neighborhood: string;
  city: string;
  postal_code: string;
  /** Texto completo legible, para mostrar antes de aceptar la sugerencia. */
  label: string;
};

export type GeoSearchMatch = GeoCoordinates & { label: string };

function firstString(
  source: Record<string, unknown>,
  keys: readonly string[],
): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return "";
}

async function nominatim(path: string, params: URLSearchParams): Promise<unknown> {
  params.set("format", "jsonv2");
  params.set("accept-language", "es");
  const response = await fetch(`${NOMINATIM_BASE}${path}?${params.toString()}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  return (await response.json()) as unknown;
}

/**
 * Dirección aproximada de un punto (para PRE-llenar campos, nunca para
 * sobreescribir sin confirmación lo que ya escribió el operador).
 */
export async function reverseGeocode(
  point: GeoCoordinates,
): Promise<AddressSuggestion | null> {
  try {
    const data = (await nominatim(
      "/reverse",
      new URLSearchParams({
        lat: String(point.latitude),
        lon: String(point.longitude),
        zoom: "18",
        addressdetails: "1",
      }),
    )) as { display_name?: unknown; address?: Record<string, unknown> } | null;
    if (!data || typeof data !== "object" || !data.address) return null;
    const address = data.address;
    const street = firstString(address, ["road", "pedestrian", "footway", "residential"]);
    if (street === "") return null;
    return {
      street,
      external_number: firstString(address, ["house_number"]),
      neighborhood: firstString(address, ["neighbourhood", "suburb", "quarter", "hamlet"]),
      city: firstString(address, ["city", "town", "village", "municipality"]),
      postal_code: firstString(address, ["postcode"]),
      label: typeof data.display_name === "string" ? data.display_name : street,
    };
  } catch {
    return null;
  }
}

/**
 * Mejor coincidencia de una dirección escrita (para centrar el mapa cerca y
 * contrastarla contra el pin). null si no hay match razonable.
 */
export async function searchAddress(query: string): Promise<GeoSearchMatch | null> {
  try {
    const data = (await nominatim(
      "/search",
      new URLSearchParams({ q: query, limit: "1" }),
    )) as { lat?: unknown; lon?: unknown; display_name?: unknown }[] | null;
    const first = Array.isArray(data) ? data[0] : null;
    if (!first) return null;
    const latitude = Number.parseFloat(String(first.lat));
    const longitude = Number.parseFloat(String(first.lon));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return {
      latitude,
      longitude,
      label: typeof first.display_name === "string" ? first.display_name : query,
    };
  } catch {
    return null;
  }
}

/** Distancia haversine en metros (suficiente para validar capturas urbanas). */
export function distanceMeters(a: GeoCoordinates, b: GeoCoordinates): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
