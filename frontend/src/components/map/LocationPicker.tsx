"use client";

// Selector de UN punto de ubicación sobre mapa (Leaflet + OSM). Se reutiliza
// en checkout web, direcciones de /cuenta y captura interna del POS: mismo
// contrato ({longitude, latitude}) que el GeoPoint del backend. El componente
// NUNCA decide cobertura ni tarifas: solo captura el punto.
//
// La geolocalización del navegador se pide EXCLUSIVAMENTE al tocar el botón
// (concesión explícita, §direcciones) en los flujos públicos. Los flujos
// INTERNOS (POS) pueden optar por `autoLocate`: al abrir, el mapa se CENTRA en
// la posición del operador (nunca coloca pin ni bloquea nada si se niega).

import { useEffect, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap, Marker } from "leaflet";

import { coverageBounds } from "@/core/geo/geojson";
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  loadLeaflet,
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
  type LeafletModule,
} from "./leaflet-loader";

export type PickedPoint = { longitude: number; latitude: number };

export type MapOverlay = {
  coverage: unknown;
  color: string;
  label?: string;
  dashed?: boolean;
};

const PIN_HTML =
  '<svg width="26" height="34" viewBox="0 0 26 34" aria-hidden="true">' +
  '<path d="M13 0C5.8 0 0 5.8 0 13c0 9.8 13 21 13 21s13-11.2 13-21C26 5.8 20.2 0 13 0z" fill="#e11d48"/>' +
  '<circle cx="13" cy="13" r="5" fill="#fff"/></svg>';

export function LocationPicker({
  value,
  onChange,
  overlays,
  height = 260,
  disabled = false,
  buttonClassName = "",
  testId = "location-picker",
  autoLocate = false,
  focus = null,
}: Readonly<{
  value: PickedPoint | null;
  onChange: (point: PickedPoint | null) => void;
  /** Coberturas GeoJSON de contexto (solo lectura), p. ej. zonas en el admin. */
  overlays?: readonly MapOverlay[];
  height?: number;
  disabled?: boolean;
  /** Clase de los botones para integrarse al design system del caller. */
  buttonClassName?: string;
  testId?: string;
  /**
   * Centrar el mapa en la posición del usuario al abrir (pide el permiso de
   * ubicación). SOLO centra: no coloca pin y falla en silencio (permiso negado,
   * contexto no seguro o timeout → queda el centro por defecto). Pensado para
   * flujos internos como el POS; los flujos públicos mantienen el botón.
   */
  autoLocate?: boolean;
  /**
   * Punto de interés externo (p. ej. la dirección escrita geocodificada): el
   * mapa se ACERCA ahí mientras no haya pin, sin seleccionar ubicación.
   */
  focus?: PickedPoint | null;
}>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const overlayGroupRef = useRef<LayerGroup | null>(null);
  const onChangeRef = useRef(onChange);
  const disabledRef = useRef(disabled);
  const [ready, setReady] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Los handlers de Leaflet leen los valores frescos por ref (patrón oficial:
  // el ref se actualiza en un efecto, nunca durante el render).
  useEffect(() => {
    onChangeRef.current = onChange;
    disabledRef.current = disabled;
  });

  // Inicialización única del mapa (Leaflet solo existe en el navegador).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = await loadLeaflet();
      if (cancelled || containerRef.current === null || mapRef.current !== null) return;
      const map = L.map(containerRef.current, {
        center: [DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude],
        zoom: DEFAULT_ZOOM,
      });
      L.tileLayer(OSM_TILE_URL, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(map);
      map.on("click", (event) => {
        if (disabledRef.current) return;
        setGeoError(null);
        onChangeRef.current({
          longitude: event.latlng.lng,
          latitude: event.latlng.lat,
        });
      });
      leafletRef.current = L;
      mapRef.current = map;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      markerRef.current = null;
      overlayGroupRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Auto-centrado inicial (opt-in): centra el mapa en la posición del usuario
  // sin colocar pin. Cualquier negativa/fallo deja el centro por defecto.
  const focusAppliedRef = useRef(false);
  useEffect(() => {
    if (!autoLocate || !ready || value !== null) return;
    let cancelled = false;
    void (async () => {
      try {
        // Permissions API (Chrome/Edge/Firefox/Safari 16+): si ya está negado,
        // no se vuelve a pedir. Donde no exista, se intenta directamente.
        const status = await navigator.permissions?.query?.({ name: "geolocation" });
        if (status?.state === "denied") return;
      } catch {
        // Sin Permissions API: continuar con getCurrentPosition.
      }
      if (cancelled || typeof navigator === "undefined" || !navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // Si mientras tanto ya hay pin o el mapa siguió a una dirección
          // escrita, la posición del operador ya no manda.
          if (cancelled || focusAppliedRef.current) return;
          const map = mapRef.current;
          if (map === null || markerRef.current !== null) return;
          map.setView([position.coords.latitude, position.coords.longitude], 15);
        },
        () => {
          // Silencio: el botón "Usar mi ubicación" sigue disponible.
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
      );
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir el mapa
  }, [autoLocate, ready]);

  // Punto de interés externo (dirección escrita): el mapa se acerca sin pin;
  // cuando ya hay pin, el encuadre lo gobierna el pin.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || map === null || focus === null || value !== null) return;
    focusAppliedRef.current = true;
    map.setView(
      [focus.latitude, focus.longitude],
      Math.max(map.getZoom(), 15),
    );
  }, [ready, focus, value]);

  // Sincroniza el pin con `value` (crea, mueve o quita el marcador).
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!ready || L === null || map === null) return;
    if (value === null) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    const position: [number, number] = [value.latitude, value.longitude];
    if (markerRef.current === null) {
      const marker = L.marker(position, {
        draggable: !disabledRef.current,
        icon: L.divIcon({
          className: "",
          html: PIN_HTML,
          iconSize: [26, 34],
          iconAnchor: [13, 32],
        }),
        keyboard: false,
      }).addTo(map);
      marker.on("dragend", () => {
        const point = marker.getLatLng();
        onChangeRef.current({ longitude: point.lng, latitude: point.lat });
      });
      markerRef.current = marker;
      map.setView(position, Math.max(map.getZoom(), 15));
    } else {
      markerRef.current.setLatLng(position);
      if (!map.getBounds().contains(position)) map.panTo(position);
    }
  }, [ready, value]);

  // Coberturas de contexto (zonas): capa de solo lectura.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!ready || L === null || map === null) return;
    overlayGroupRef.current?.remove();
    overlayGroupRef.current = null;
    if (!overlays || overlays.length === 0) return;
    const group = L.layerGroup();
    for (const overlay of overlays) {
      try {
        const layer = L.geoJSON(overlay.coverage as never, {
          style: {
            color: overlay.color,
            weight: 2,
            fillOpacity: 0.12,
            ...(overlay.dashed ? { dashArray: "6 6" } : {}),
          },
        });
        if (overlay.label) layer.bindTooltip(overlay.label, { sticky: true });
        group.addLayer(layer);
      } catch {
        // Cobertura no dibujable: se ignora (el backend sigue siendo la autoridad).
      }
    }
    group.addTo(map);
    // Sin pin, encuadra las coberturas para dar contexto inmediato.
    if (value === null) {
      const bounds = coverageBounds(overlays.map((overlay) => overlay.coverage));
      if (bounds !== null) {
        map.fitBounds(
          [
            [bounds.minLat, bounds.minLon],
            [bounds.maxLat, bounds.maxLon],
          ],
          { padding: [16, 16] },
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- value solo decide el encuadre inicial
  }, [ready, overlays]);

  function locate() {
    if (disabled || locating) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Este navegador no permite geolocalización; coloca el pin manualmente.");
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onChangeRef.current({
          longitude: position.coords.longitude,
          latitude: position.coords.latitude,
        });
      },
      () => {
        setLocating(false);
        setGeoError("No fue posible obtener tu ubicación; coloca el pin manualmente.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div data-testid={testId} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        ref={containerRef}
        role="application"
        aria-label="Mapa para elegir la ubicación"
        data-testid={`${testId}-map`}
        style={{
          height,
          width: "100%",
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid rgba(128,128,128,.35)",
          // Leaflet necesita un alto fijo; sin teselas (offline) queda gris.
          background: "#e8e6e1",
        }}
      />
      {!disabled ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            className={buttonClassName}
            onClick={locate}
            disabled={locating}
            data-testid={`${testId}-locate`}
          >
            {locating ? "Obteniendo ubicación…" : "Usar mi ubicación"}
          </button>
          {value !== null ? (
            <button
              type="button"
              className={buttonClassName}
              onClick={() => onChange(null)}
              data-testid={`${testId}-clear`}
            >
              Quitar pin
            </button>
          ) : null}
          <span style={{ fontSize: 12, opacity: 0.75 }} data-testid={`${testId}-coords`}>
            {value !== null
              ? `Pin: ${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}`
              : "Toca el mapa para colocar el pin."}
          </span>
        </div>
      ) : null}
      {geoError !== null ? (
        <span role="alert" style={{ fontSize: 12, color: "#dc2626" }}>
          {geoError}
        </span>
      ) : null}
    </div>
  );
}
