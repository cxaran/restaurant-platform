// Carga perezosa de Leaflet SOLO en el navegador: el módulo toca `window` al
// importarse, así que los componentes de mapa lo piden dentro de useEffect.
// El CSS sí puede importarse estáticamente (se sirve con el bundle).
import "leaflet/dist/leaflet.css";

import type * as Leaflet from "leaflet";

export type LeafletModule = typeof Leaflet;

let leafletPromise: Promise<LeafletModule> | null = null;

export function loadLeaflet(): Promise<LeafletModule> {
  if (leafletPromise === null) {
    leafletPromise = import("leaflet").then(
      (mod) => (mod as { default?: LeafletModule }).default ?? (mod as LeafletModule),
    );
  }
  return leafletPromise;
}

// Teselas OSM estándar (atribución obligatoria). Si no hay red, el mapa queda
// en gris pero pin y polígonos siguen funcionando: nada del flujo depende de
// que las imágenes carguen.
export const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** Centro por defecto cuando no hay pin ni zonas que encuadrar (CDMX). */
export const DEFAULT_CENTER: { latitude: number; longitude: number } = {
  latitude: 19.4326,
  longitude: -99.1332,
};
export const DEFAULT_ZOOM = 12;

/** Paleta para distinguir zonas superpuestas en el mapa administrativo. */
export const ZONE_COLORS = [
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#9333ea",
  "#0891b2",
  "#dc2626",
  "#4d7c0f",
  "#c026d3",
] as const;

export function zoneColor(index: number): string {
  return ZONE_COLORS[index % ZONE_COLORS.length];
}
