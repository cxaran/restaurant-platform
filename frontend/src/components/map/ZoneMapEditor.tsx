"use client";

// Editor de cobertura de una zona de entrega: dibuja y edita polígonos
// (MultiPolygon GeoJSON) sobre Leaflet, mostrando las demás zonas como
// contexto para VISUALIZAR solapes. El editor solo produce GeoJSON: la
// validación geométrica (shapely) y la resolución de solapes por prioridad
// las hace el backend — aquí no se calcula cobertura ni tarifa alguna.
//
// Modelo de edición: cada "parte" es un polígono; se dibuja con clics
// (mínimo 3 vértices) y se ajusta arrastrando vértices. Doble clic en un
// vértice lo elimina. Los anillos interiores (hoyos) de una geometría
// existente se conservan sin editarse.

import { useEffect, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";

import {
  coverageBounds,
  coverageToParts,
  partsToMultiPolygon,
  type LonLat,
  type MultiPolygonGeoJSON,
} from "@/core/geo/geojson";
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  loadLeaflet,
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
  zoneColor,
  type LeafletModule,
} from "./leaflet-loader";

export type ZoneOverlay = {
  id: string;
  name: string;
  priority: number;
  isActive: boolean;
  coverage: unknown;
};

const EDIT_COLOR = "#e11d48";

export function ZoneMapEditor({
  value,
  onChange,
  otherZones = [],
  height = 420,
  disabled = false,
  buttonClassName = "",
  testId = "zone-map-editor",
}: Readonly<{
  /** Cobertura actual (GeoJSON Polygon/MultiPolygon) o null para empezar vacío. */
  value: unknown | null;
  onChange: (coverage: MultiPolygonGeoJSON | null) => void;
  /** Las demás zonas, para ver solapes; la editada se pinta en rojo. */
  otherZones?: readonly ZoneOverlay[];
  height?: number;
  disabled?: boolean;
  buttonClassName?: string;
  testId?: string;
}>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const layersRef = useRef<LayerGroup | null>(null);
  const onChangeRef = useRef(onChange);
  const drawingRef = useRef(false);
  const disabledRef = useRef(disabled);
  const fittedRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [parts, setParts] = useState<LonLat[][][]>([]);
  const [draft, setDraft] = useState<LonLat[]>([]);
  const [drawing, setDrawing] = useState(false);
  // Última cobertura sincronizada (entrante o emitida), para no re-parsear lo
  // que este mismo editor acaba de emitir. Es estado de render: vive en state.
  const [syncedJson, setSyncedJson] = useState<string>("__init__");

  // Los handlers de Leaflet leen los valores frescos por ref (patrón oficial:
  // el ref se actualiza en un efecto, nunca durante el render).
  useEffect(() => {
    onChangeRef.current = onChange;
    drawingRef.current = drawing;
    disabledRef.current = disabled;
  });

  // Sincroniza la cobertura entrante (solo cuando difiere de lo último
  // emitido/sincronizado). Ajuste de estado DURANTE el render — patrón
  // documentado para derivar estado de props sin efectos.
  const incomingJson = JSON.stringify(value ?? null);
  if (incomingJson !== syncedJson) {
    setSyncedJson(incomingJson);
    setParts(coverageToParts(value) ?? []);
    setDraft([]);
    setDrawing(false);
  }

  // Mapa una sola vez.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = await loadLeaflet();
      if (cancelled || containerRef.current === null || mapRef.current !== null) return;
      const map = L.map(containerRef.current, {
        center: [DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude],
        zoom: DEFAULT_ZOOM,
        // El doble clic elimina vértices; el zoom por doble clic estorba aquí.
        doubleClickZoom: false,
      });
      L.tileLayer(OSM_TILE_URL, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(map);
      map.on("click", (event) => {
        if (disabledRef.current || !drawingRef.current) return;
        setDraft((current) => [...current, [event.latlng.lng, event.latlng.lat]]);
      });
      leafletRef.current = L;
      mapRef.current = map;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      layersRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Encuadre inicial: cobertura editada + zonas de contexto.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || map === null || fittedRef.current) return;
    fittedRef.current = true;
    const bounds = coverageBounds([
      partsToMultiPolygon(parts),
      ...otherZones.map((zone) => zone.coverage),
    ]);
    if (bounds !== null) {
      map.fitBounds(
        [
          [bounds.minLat, bounds.minLon],
          [bounds.maxLat, bounds.maxLon],
        ],
        { padding: [24, 24] },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo el primer encuadre
  }, [ready]);

  function emit(next: LonLat[][][]) {
    setParts(next);
    const multiPolygon = partsToMultiPolygon(next);
    setSyncedJson(JSON.stringify(multiPolygon ?? null));
    onChangeRef.current(multiPolygon);
  }

  function moveVertex(partIndex: number, vertexIndex: number, position: LonLat) {
    emit(
      parts.map((rings, p) =>
        p !== partIndex
          ? rings
          : rings.map((ring, r) =>
              r !== 0 ? ring : ring.map((vertex, v) => (v === vertexIndex ? position : vertex)),
            ),
      ),
    );
  }

  function removeVertex(partIndex: number, vertexIndex: number) {
    const ring = parts[partIndex]?.[0];
    if (!ring || ring.length <= 3) return; // un polígono necesita 3 vértices
    emit(
      parts.map((rings, p) =>
        p !== partIndex
          ? rings
          : rings.map((r, i) => (i !== 0 ? r : r.filter((_, v) => v !== vertexIndex))),
      ),
    );
  }

  function removePart(partIndex: number) {
    emit(parts.filter((_, index) => index !== partIndex));
  }

  function commitDraft() {
    if (draft.length < 3) return;
    emit([...parts, [draft]]);
    setDraft([]);
    setDrawing(false);
  }

  function cancelDraft() {
    setDraft([]);
    setDrawing(false);
  }

  // Redibuja capas: zonas de contexto + partes editadas + trazo en curso.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!ready || L === null || map === null) return;
    layersRef.current?.remove();
    const group = L.layerGroup().addTo(map);
    layersRef.current = group;

    otherZones.forEach((zone, index) => {
      try {
        const layer = L.geoJSON(zone.coverage as never, {
          style: {
            color: zoneColor(index),
            weight: 2,
            fillOpacity: 0.1,
            ...(zone.isActive ? {} : { dashArray: "6 6" }),
          },
        });
        layer.bindTooltip(
          `${zone.name} · prioridad ${zone.priority}${zone.isActive ? "" : " · inactiva"}`,
          { sticky: true },
        );
        group.addLayer(layer);
      } catch {
        // Cobertura de contexto no dibujable: se omite.
      }
    });

    parts.forEach((rings, partIndex) => {
      const outer = rings[0].map(([lon, lat]): [number, number] => [lat, lon]);
      group.addLayer(
        L.polygon(outer, { color: EDIT_COLOR, weight: 2, fillOpacity: 0.18 }),
      );
      if (disabled || drawing) return;
      rings[0].forEach(([lon, lat], vertexIndex) => {
        const marker = L.marker([lat, lon], {
          draggable: true,
          keyboard: false,
          icon: L.divIcon({
            className: "",
            html:
              '<span style="display:block;width:12px;height:12px;border-radius:50%;' +
              `background:#fff;border:3px solid ${EDIT_COLOR};box-sizing:border-box;"></span>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6],
          }),
        });
        marker.on("dragend", () => {
          const point = marker.getLatLng();
          moveVertex(partIndex, vertexIndex, [point.lng, point.lat]);
        });
        marker.on("dblclick", (event) => {
          L.DomEvent.stop(event);
          removeVertex(partIndex, vertexIndex);
        });
        group.addLayer(marker);
      });
    });

    if (drawing && draft.length > 0) {
      group.addLayer(
        L.polyline(
          draft.map(([lon, lat]): [number, number] => [lat, lon]),
          { color: EDIT_COLOR, weight: 2, dashArray: "4 6" },
        ),
      );
      for (const [lon, lat] of draft) {
        group.addLayer(
          L.circleMarker([lat, lon], {
            radius: 4,
            color: EDIT_COLOR,
            fillColor: EDIT_COLOR,
            fillOpacity: 1,
          }),
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- funciones locales estables por render
  }, [ready, parts, draft, drawing, disabled, otherZones]);

  return (
    <div data-testid={testId} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        ref={containerRef}
        role="application"
        aria-label="Mapa para dibujar la cobertura de la zona"
        data-testid={`${testId}-map`}
        style={{
          height,
          width: "100%",
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid rgba(128,128,128,.35)",
          background: "#e8e6e1",
        }}
      />
      {!disabled ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {!drawing ? (
            <button
              type="button"
              className={buttonClassName}
              onClick={() => setDrawing(true)}
              data-testid={`${testId}-draw`}
            >
              {parts.length === 0 ? "Dibujar cobertura" : "Agregar otra parte"}
            </button>
          ) : (
            <>
              <button
                type="button"
                className={buttonClassName}
                onClick={commitDraft}
                disabled={draft.length < 3}
                data-testid={`${testId}-close-polygon`}
              >
                Cerrar polígono ({draft.length} vértices)
              </button>
              <button
                type="button"
                className={buttonClassName}
                onClick={cancelDraft}
                data-testid={`${testId}-cancel-draft`}
              >
                Cancelar trazo
              </button>
            </>
          )}
          {parts.map((rings, index) => (
            <button
              key={`part-${index}-${rings[0].length}`}
              type="button"
              className={buttonClassName}
              onClick={() => removePart(index)}
              disabled={drawing}
              data-testid={`${testId}-remove-part-${index}`}
            >
              Quitar parte {index + 1} ({rings[0].length} vértices)
            </button>
          ))}
          <span style={{ fontSize: 12, opacity: 0.75 }}>
            {drawing
              ? "Toca el mapa para agregar vértices (mínimo 3) y cierra el polígono."
              : parts.length === 0
                ? "Sin cobertura: dibuja al menos un polígono."
                : "Arrastra los vértices para ajustar; doble clic en un vértice lo elimina."}
          </span>
        </div>
      ) : null}
    </div>
  );
}
