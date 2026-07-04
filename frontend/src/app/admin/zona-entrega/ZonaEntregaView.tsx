"use client";

// Pantalla especializada de zonas de entrega y tarifas (spec /admin/zona-entrega):
//  · dibujar/editar la cobertura (GeoJSON) sobre mapa, viendo las demás zonas
//    para VISUALIZAR solapes (en un solape gana la prioridad MAYOR — backend);
//  · administrar las reglas de tarifa de cada zona;
//  · previsualizar cotizaciones con la MISMA cotización pública del checkout.
// El frontend no calcula cobertura ni tarifas: todo lo decide el backend
// (shapely/PostGIS + shipping_service); editar revalida shipping:manage.

import { useCallback, useEffect, useMemo, useState } from "react";

import { LocationPicker, type PickedPoint } from "@/components/map/LocationPicker";
import { ZoneMapEditor, type ZoneOverlay } from "@/components/map/ZoneMapEditor";
import { zoneColor } from "@/components/map/leaflet-loader";
import { useShippingQuote } from "@/components/shipping/use-shipping-quote";
import { CapabilityGate } from "@/components/storefront/CapabilityGate";
import { ApiRequestError } from "@/core/api/api-error";
import type { MultiPolygonGeoJSON } from "@/core/geo/geojson";
import type {
  DeliveryZoneRead,
  ShippingRateRead,
} from "@/core/restaurant-api/contracts";
import {
  createDeliveryZone,
  createShippingRate,
  deleteDeliveryZone,
  fetchDeliveryZone,
  listDeliveryZones,
  updateDeliveryZone,
  updateShippingRate,
} from "@/core/restaurant-api/shipping";
import { formatMoney } from "@/core/restaurant-api/theme";

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiRequestError ? err.body.message : fallback;
}

const BTN = "tt-btn tt-btn-outline";

// ---------------------------------------------------------------------------
// Vista principal
// ---------------------------------------------------------------------------

type Mode = { kind: "idle" } | { kind: "create" } | { kind: "edit"; zoneId: string };

export function ZonaEntregaView({ permissions }: Readonly<{ permissions: string[] }>) {
  const canRead =
    permissions.includes("shipping:read") || permissions.includes("shipping:manage");
  const canManage = permissions.includes("shipping:manage");

  const [zones, setZones] = useState<DeliveryZoneRead[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [reloadTick, setReloadTick] = useState(0);

  // Recarga por contador: el efecto consulta y setea estado en callbacks
  // asíncronos; los hijos piden recargar tras cada mutación.
  const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);

  useEffect(() => {
    if (!canRead) return;
    let active = true;
    listDeliveryZones()
      .then((page) =>
        // El listado genérico no trae cobertura ni tarifas: se piden los
        // detalles (pocas decenas de zonas; una llamada por zona).
        Promise.all(page.items.map((item) => fetchDeliveryZone(item.id))),
      )
      .then((details) => {
        if (!active) return;
        setZones(details);
        setLoadError(null);
      })
      .catch((err) => {
        if (active) setLoadError(errorText(err, "No fue posible cargar las zonas."));
      });
    return () => {
      active = false;
    };
  }, [canRead, reloadTick]);

  const selected =
    mode.kind === "edit" ? (zones ?? []).find((zone) => zone.id === mode.zoneId) ?? null : null;

  const overlays = useMemo(
    () =>
      (zones ?? []).map((zone, index) => ({
        coverage: zone.coverage,
        color: zoneColor(index),
        label: `${zone.name} · prioridad ${zone.priority}${zone.is_active ? "" : " · inactiva"}`,
        dashed: !zone.is_active,
      })),
    [zones],
  );

  // Prioridades repetidas entre zonas ACTIVAS: el backend desempata por fecha
  // de creación, pero conviene avisar que el solape queda ambiguo a la vista.
  const duplicatedPriorities = useMemo(() => {
    const seen = new Map<number, number>();
    for (const zone of zones ?? []) {
      if (zone.is_active) seen.set(zone.priority, (seen.get(zone.priority) ?? 0) + 1);
    }
    return new Set([...seen.entries()].filter(([, count]) => count > 1).map(([p]) => p));
  }, [zones]);

  if (!canRead) {
    return (
      <CapabilityGate state={{ kind: "no_permission" }} title="Zonas de entrega">
        <span />
      </CapabilityGate>
    );
  }

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
      {/* ── Izquierda: listado de zonas ─────────────────────────────────── */}
      <section className="tt-card flex flex-col gap-3 p-5" aria-label="Listado de zonas">
        <div className="flex items-center justify-between gap-2">
          <span className="tt-display text-[17px]">Zonas</span>
          {canManage ? (
            <button
              type="button"
              className="tt-btn tt-btn-primary"
              onClick={() => setMode({ kind: "create" })}
              data-testid="zone-new"
            >
              Nueva zona
            </button>
          ) : null}
        </div>
        {loadError !== null ? (
          <p role="alert" className="m-0 text-[13px] font-bold text-[var(--accent)]">
            {loadError}
          </p>
        ) : null}
        {zones === null ? (
          <p className="m-0 text-sm text-[var(--tx3)]">Cargando zonas…</p>
        ) : zones.length === 0 ? (
          <p className="m-0 text-sm text-[var(--tx3)]">
            Sin zonas: dibuja la primera para empezar a cotizar envíos.
          </p>
        ) : (
          <div className="flex flex-col gap-2" data-testid="zone-list">
            {zones.map((zone, index) => (
              <button
                key={zone.id}
                type="button"
                onClick={() => setMode({ kind: "edit", zoneId: zone.id })}
                data-testid={`zone-item-${zone.code}`}
                className="tt-card flex cursor-pointer items-center gap-3 border border-[var(--border)] p-3 text-left"
                style={
                  mode.kind === "edit" && mode.zoneId === zone.id
                    ? { outline: "2px solid var(--accent)" }
                    : undefined
                }
              >
                <span
                  aria-hidden
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 4,
                    flexShrink: 0,
                    background: zoneColor(index),
                    opacity: zone.is_active ? 1 : 0.4,
                  }}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-extrabold leading-tight">{zone.name}</span>
                  <span className="text-xs text-[var(--tx3)]">
                    {zone.code} · {(zone.rates ?? []).length} tarifa
                    {(zone.rates ?? []).length === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="tt-badge">
                    prioridad {zone.priority}
                    {duplicatedPriorities.has(zone.priority) && zone.is_active ? " ⚠" : ""}
                  </span>
                  {zone.is_active ? (
                    <span className="tt-badge tt-badge-ok">Activa</span>
                  ) : (
                    <span className="tt-badge tt-badge-warn">Inactiva</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
        <p className="m-0 text-xs text-[var(--tx3)]">
          Si dos zonas se solapan, el backend aplica la de prioridad MAYOR.
          {duplicatedPriorities.size > 0
            ? " ⚠ Hay zonas activas con la misma prioridad: en un solape el desempate no es visible aquí."
            : ""}
        </p>
      </section>

      {/* ── Derecha: editor / mapa general / cotización de prueba ───────── */}
      <div className="flex min-w-0 flex-col gap-5">
        {mode.kind === "create" ? (
          <ZoneForm
            key="create"
            zone={null}
            otherZones={zonesToOverlayList(zones ?? [], null)}
            canManage={canManage}
            onDone={async () => {
              await reload();
              setMode({ kind: "idle" });
            }}
            onCancel={() => setMode({ kind: "idle" })}
          />
        ) : selected !== null ? (
          <>
            <ZoneForm
              key={selected.id}
              zone={selected}
              otherZones={zonesToOverlayList(zones ?? [], selected.id)}
              canManage={canManage}
              onDone={reload}
              onCancel={() => setMode({ kind: "idle" })}
            />
            <RatesPanel zone={selected} canManage={canManage} onChanged={reload} />
          </>
        ) : (
          <section className="tt-card flex flex-col gap-3 p-5" aria-label="Mapa de cobertura">
            <span className="tt-display text-[17px]">Cobertura actual</span>
            <LocationPicker
              value={null}
              onChange={() => undefined}
              overlays={overlays}
              disabled
              height={340}
              testId="coverage-overview"
            />
            <p className="m-0 text-xs text-[var(--tx3)]">
              Selecciona una zona para editar su cobertura y tarifas
              {canManage ? ", o crea una nueva" : ""}.
            </p>
          </section>
        )}

        <QuotePreview overlays={overlays} />
      </div>
    </div>
  );
}

function zonesToOverlayList(zones: DeliveryZoneRead[], excludeId: string | null): ZoneOverlay[] {
  return zones
    .filter((zone) => zone.id !== excludeId)
    .map((zone) => ({
      id: zone.id,
      name: zone.name,
      priority: zone.priority,
      isActive: zone.is_active,
      coverage: zone.coverage,
    }));
}

// ---------------------------------------------------------------------------
// Formulario de zona (crear / editar campos simples + cobertura)
// ---------------------------------------------------------------------------

function ZoneForm({
  zone,
  otherZones,
  canManage,
  onDone,
  onCancel,
}: Readonly<{
  zone: DeliveryZoneRead | null;
  otherZones: ZoneOverlay[];
  canManage: boolean;
  onDone: () => Promise<void> | void;
  onCancel: () => void;
}>) {
  const [code, setCode] = useState(zone?.code ?? "");
  const [name, setName] = useState(zone?.name ?? "");
  const [description, setDescription] = useState(zone?.description ?? "");
  const [priority, setPriority] = useState(String(zone?.priority ?? 0));
  const [coverage, setCoverage] = useState<MultiPolygonGeoJSON | null>(
    (zone?.coverage as MultiPolygonGeoJSON | undefined) ?? null,
  );
  const [coverageDirty, setCoverageDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Eliminación definitiva en dos pasos (sin window.confirm): el primer clic
  // arma la confirmación, el segundo ejecuta.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const readOnly = !canManage;
  const priorityValue = Number.parseInt(priority, 10);
  const priorityValid = Number.isInteger(priorityValue);
  const canSave =
    canManage && !busy && code.trim() !== "" && name.trim() !== "" && priorityValid &&
    coverage !== null;

  async function save() {
    if (!canSave || coverage === null) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      if (zone === null) {
        await createDeliveryZone({
          code: code.trim(),
          name: name.trim(),
          description: description.trim() === "" ? null : description.trim(),
          coverage,
          priority: priorityValue,
        });
      } else {
        await updateDeliveryZone(zone.id, {
          ...(code.trim() !== zone.code ? { code: code.trim() } : {}),
          ...(name.trim() !== zone.name ? { name: name.trim() } : {}),
          ...(description.trim() !== (zone.description ?? "")
            ? { description: description.trim() === "" ? null : description.trim() }
            : {}),
          ...(priorityValue !== zone.priority ? { priority: priorityValue } : {}),
          ...(coverageDirty ? { coverage } : {}),
        });
        setSaved(true);
      }
      setCoverageDirty(false);
      await onDone();
    } catch (err) {
      setError(errorText(err, "No fue posible guardar la zona."));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    if (zone === null || !canManage || busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateDeliveryZone(zone.id, { is_active: !zone.is_active });
      await onDone();
    } catch (err) {
      setError(errorText(err, "No fue posible cambiar el estado de la zona."));
    } finally {
      setBusy(false);
    }
  }

  async function removeZone() {
    if (zone === null || !canManage || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Definitivo: la zona y sus tarifas se borran; los pedidos existentes
      // conservan monto y nombre de zona (snapshots del backend).
      await deleteDeliveryZone(zone.id);
      await onDone();
      onCancel();
    } catch (err) {
      setConfirmingDelete(false);
      setError(errorText(err, "No fue posible eliminar la zona."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="tt-card flex flex-col gap-3 p-5" aria-label="Datos de la zona">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="tt-display text-[17px]">
          {zone === null ? "Nueva zona" : `Zona · ${zone.name}`}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {zone !== null && canManage ? (
            <button
              type="button"
              className={BTN}
              onClick={() => void toggleActive()}
              disabled={busy}
              data-testid="zone-toggle-active"
            >
              {zone.is_active ? "Desactivar" : "Activar"}
            </button>
          ) : null}
          {zone !== null && canManage ? (
            confirmingDelete ? (
              <>
                <span className="text-xs font-bold text-[var(--accent)]">
                  Se borra con sus tarifas, definitivo.
                </span>
                <button
                  type="button"
                  className="tt-btn tt-btn-primary"
                  onClick={() => void removeZone()}
                  disabled={busy}
                  data-testid="zone-delete-confirm"
                >
                  {busy ? "Eliminando…" : "Sí, eliminar"}
                </button>
                <button
                  type="button"
                  className="tt-btn tt-btn-ghost"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={busy}
                >
                  No
                </button>
              </>
            ) : (
              <button
                type="button"
                className="tt-btn tt-btn-outline-accent"
                onClick={() => setConfirmingDelete(true)}
                disabled={busy}
                data-testid="zone-delete"
              >
                Eliminar
              </button>
            )
          ) : null}
          <button type="button" className="tt-btn tt-btn-ghost" onClick={onCancel}>
            Cerrar
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="tt-label">Código</span>
          <input
            className="tt-input"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            maxLength={40}
            disabled={readOnly}
            data-testid="zone-code"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="tt-label">Nombre</span>
          <input
            className="tt-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            disabled={readOnly}
            data-testid="zone-name"
          />
        </label>
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="tt-label">Descripción</span>
          <input
            className="tt-input"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={readOnly}
            data-testid="zone-description"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="tt-label">Prioridad</span>
          <input
            className="tt-input"
            type="number"
            step="1"
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
            disabled={readOnly}
            data-testid="zone-priority"
          />
          <span className="text-xs text-[var(--tx3)]">
            En un solape entre zonas gana la prioridad MAYOR.
          </span>
        </label>
      </div>

      <div className="flex flex-col gap-1">
        <span className="tt-label">Cobertura</span>
        <ZoneMapEditor
          value={coverage}
          onChange={(next) => {
            setCoverage(next);
            setCoverageDirty(true);
          }}
          otherZones={otherZones}
          disabled={readOnly}
          buttonClassName={BTN}
          height={380}
        />
      </div>

      {error !== null ? (
        <p role="alert" className="m-0 text-[13px] font-bold text-[var(--accent)]">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="m-0 text-[13px] font-bold text-[var(--ok,#16a34a)]">
          Zona guardada.
        </p>
      ) : null}

      {canManage ? (
        <div className="flex gap-2">
          <button
            type="button"
            className="tt-btn tt-btn-primary"
            onClick={() => void save()}
            disabled={!canSave}
            data-testid="zone-save"
          >
            {busy ? "Guardando…" : zone === null ? "Crear zona" : "Guardar cambios"}
          </button>
          {coverage === null ? (
            <span className="self-center text-xs text-[var(--tx3)]">
              Falta la cobertura: dibuja al menos un polígono.
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Tarifas de la zona
// ---------------------------------------------------------------------------

type RateFormState = {
  name: string;
  base_fee: string;
  minimum_order_amount: string;
  free_shipping_from_amount: string;
  estimated_minutes: string;
  priority: string;
};

const EMPTY_RATE: RateFormState = {
  name: "",
  base_fee: "",
  minimum_order_amount: "",
  free_shipping_from_amount: "",
  estimated_minutes: "",
  priority: "0",
};

function rateToForm(rate: ShippingRateRead): RateFormState {
  return {
    name: rate.name,
    base_fee: String(rate.base_fee),
    minimum_order_amount: rate.minimum_order_amount != null ? String(rate.minimum_order_amount) : "",
    free_shipping_from_amount:
      rate.free_shipping_from_amount != null ? String(rate.free_shipping_from_amount) : "",
    estimated_minutes: rate.estimated_minutes != null ? String(rate.estimated_minutes) : "",
    priority: String(rate.priority),
  };
}

function RatesPanel({
  zone,
  canManage,
  onChanged,
}: Readonly<{
  zone: DeliveryZoneRead;
  canManage: boolean;
  onChanged: () => Promise<void> | void;
}>) {
  const [editing, setEditing] = useState<{ rateId: string | null; form: RateFormState } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rates = zone.rates ?? [];

  function formPayload(form: RateFormState) {
    return {
      name: form.name.trim(),
      base_fee: form.base_fee.trim(),
      minimum_order_amount:
        form.minimum_order_amount.trim() === "" ? null : form.minimum_order_amount.trim(),
      free_shipping_from_amount:
        form.free_shipping_from_amount.trim() === "" ? null : form.free_shipping_from_amount.trim(),
      estimated_minutes:
        form.estimated_minutes.trim() === ""
          ? null
          : Number.parseInt(form.estimated_minutes, 10),
      priority: Number.parseInt(form.priority, 10) || 0,
    };
  }

  function formValid(form: RateFormState): boolean {
    const fee = Number.parseFloat(form.base_fee);
    return form.name.trim() !== "" && Number.isFinite(fee) && fee >= 0;
  }

  async function saveRate() {
    if (editing === null || busy || !formValid(editing.form)) return;
    setBusy(true);
    setError(null);
    try {
      if (editing.rateId === null) {
        await createShippingRate(zone.id, formPayload(editing.form));
      } else {
        await updateShippingRate(editing.rateId, formPayload(editing.form));
      }
      setEditing(null);
      await onChanged();
    } catch (err) {
      setError(errorText(err, "No fue posible guardar la tarifa."));
    } finally {
      setBusy(false);
    }
  }

  async function toggleRate(rate: ShippingRateRead) {
    if (busy || !canManage) return;
    setBusy(true);
    setError(null);
    try {
      await updateShippingRate(rate.id, { is_active: !rate.is_active });
      await onChanged();
    } catch (err) {
      setError(errorText(err, "No fue posible cambiar el estado de la tarifa."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="tt-card flex flex-col gap-3 p-5" aria-label="Tarifas de la zona">
      <div className="flex items-center justify-between gap-2">
        <span className="tt-display text-[17px]">Tarifas de {zone.name}</span>
        {canManage && editing === null ? (
          <button
            type="button"
            className="tt-btn tt-btn-primary"
            onClick={() => setEditing({ rateId: null, form: { ...EMPTY_RATE } })}
            data-testid="rate-new"
          >
            Nueva tarifa
          </button>
        ) : null}
      </div>

      {rates.length === 0 && editing === null ? (
        <p className="m-0 text-sm text-[var(--tx3)]">
          Sin tarifas: la zona cubre el punto pero no puede cotizar — los pedidos quedarán en
          revisión manual hasta definir una tarifa.
        </p>
      ) : null}

      {rates.map((rate) => (
        <div
          key={rate.id}
          className="flex flex-wrap items-center gap-3 rounded-[12px] border border-[var(--border)] bg-[var(--bg)] px-4 py-3"
          data-testid={`rate-row-${rate.name}`}
        >
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="font-extrabold leading-tight">
              {rate.name} · {formatMoney(rate.base_fee)}
            </span>
            <span className="text-xs text-[var(--tx3)]">
              {rate.minimum_order_amount != null
                ? `compra mínima ${formatMoney(rate.minimum_order_amount)}`
                : "sin compra mínima"}
              {rate.free_shipping_from_amount != null
                ? ` · gratis desde ${formatMoney(rate.free_shipping_from_amount)}`
                : ""}
              {rate.estimated_minutes != null ? ` · ~${rate.estimated_minutes} min` : ""}
              {` · prioridad ${rate.priority}`}
            </span>
          </div>
          {rate.is_active ? (
            <span className="tt-badge tt-badge-ok">Activa</span>
          ) : (
            <span className="tt-badge tt-badge-warn">Inactiva</span>
          )}
          {canManage ? (
            <div className="flex gap-2">
              <button
                type="button"
                className={BTN}
                onClick={() => setEditing({ rateId: rate.id, form: rateToForm(rate) })}
                disabled={busy}
              >
                Editar
              </button>
              <button
                type="button"
                className={BTN}
                onClick={() => void toggleRate(rate)}
                disabled={busy}
                data-testid={`rate-toggle-${rate.name}`}
              >
                {rate.is_active ? "Desactivar" : "Activar"}
              </button>
            </div>
          ) : null}
        </div>
      ))}

      {editing !== null ? (
        <div
          className="flex flex-col gap-3 rounded-[12px] border border-dashed border-[var(--border2)] p-4"
          data-testid="rate-form"
        >
          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="tt-label">Nombre</span>
              <input
                className="tt-input"
                value={editing.form.name}
                onChange={(event) =>
                  setEditing({ ...editing, form: { ...editing.form, name: event.target.value } })
                }
                data-testid="rate-name"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="tt-label">Costo base</span>
              <input
                className="tt-input"
                type="number"
                min="0"
                step="0.01"
                value={editing.form.base_fee}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    form: { ...editing.form, base_fee: event.target.value },
                  })
                }
                data-testid="rate-base-fee"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="tt-label">Compra mínima (opcional)</span>
              <input
                className="tt-input"
                type="number"
                min="0"
                step="0.01"
                value={editing.form.minimum_order_amount}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    form: { ...editing.form, minimum_order_amount: event.target.value },
                  })
                }
                data-testid="rate-minimum"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="tt-label">Gratis desde (opcional)</span>
              <input
                className="tt-input"
                type="number"
                min="0"
                step="0.01"
                value={editing.form.free_shipping_from_amount}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    form: { ...editing.form, free_shipping_from_amount: event.target.value },
                  })
                }
                data-testid="rate-free-from"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="tt-label">Minutos estimados</span>
              <input
                className="tt-input"
                type="number"
                min="0"
                step="1"
                value={editing.form.estimated_minutes}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    form: { ...editing.form, estimated_minutes: event.target.value },
                  })
                }
                data-testid="rate-minutes"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="tt-label">Prioridad</span>
              <input
                className="tt-input"
                type="number"
                step="1"
                value={editing.form.priority}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    form: { ...editing.form, priority: event.target.value },
                  })
                }
                data-testid="rate-priority"
              />
              <span className="text-xs text-[var(--tx3)]">
                Entre tarifas aplicables gana la prioridad MAYOR.
              </span>
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="tt-btn tt-btn-primary"
              onClick={() => void saveRate()}
              disabled={busy || !formValid(editing.form)}
              data-testid="rate-save"
            >
              {busy ? "Guardando…" : editing.rateId === null ? "Crear tarifa" : "Guardar tarifa"}
            </button>
            <button
              type="button"
              className="tt-btn tt-btn-ghost"
              onClick={() => setEditing(null)}
              disabled={busy}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {error !== null ? (
        <p role="alert" className="m-0 text-[13px] font-bold text-[var(--accent)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Cotización de prueba (misma API pública que el checkout)
// ---------------------------------------------------------------------------

function QuotePreview({
  overlays,
}: Readonly<{ overlays: { coverage: unknown; color: string; label?: string; dashed?: boolean }[] }>) {
  const [subtotalText, setSubtotalText] = useState("150");
  const [point, setPoint] = useState<PickedPoint | null>(null);
  const subtotal = Number.parseFloat(subtotalText);
  const quote = useShippingQuote("delivery", Number.isFinite(subtotal) ? subtotal : 0, point);

  return (
    <section className="tt-card flex flex-col gap-3 p-5" aria-label="Cotización de prueba">
      <span className="tt-display text-[17px]">Cotización de prueba</span>
      <p className="m-0 text-xs text-[var(--tx3)]">
        Usa la MISMA cotización pública del checkout: coloca un punto y un subtotal de ejemplo
        para ver qué zona y tarifa aplicaría el backend.
      </p>
      <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
        <label className="flex flex-col gap-1 self-start">
          <span className="tt-label">Subtotal de ejemplo</span>
          <input
            className="tt-input"
            type="number"
            min="0"
            step="0.01"
            value={subtotalText}
            onChange={(event) => setSubtotalText(event.target.value)}
            data-testid="preview-subtotal"
          />
          <div aria-live="polite" data-testid="preview-result" className="mt-2 text-sm">
            {quote.kind === "idle" ? (
              <span className="text-[var(--tx3)]">Coloca un punto en el mapa.</span>
            ) : quote.kind === "loading" ? (
              <span className="text-[var(--tx3)]">Cotizando…</span>
            ) : quote.kind === "error" ? (
              <span className="font-bold text-[var(--accent)]">
                No fue posible cotizar; intenta de nuevo.
              </span>
            ) : quote.kind === "calculated" ? (
              <span className="flex flex-col gap-1">
                <span className="tt-badge tt-badge-ok self-start">Cotiza</span>
                <span className="font-extrabold">
                  {quote.isFreeShipping ? "Envío gratis" : formatMoney(quote.amount)}
                  {quote.zoneName ? ` · ${quote.zoneName}` : ""}
                </span>
                {quote.estimatedMinutes != null ? (
                  <span className="text-xs text-[var(--tx3)]">
                    ~{quote.estimatedMinutes} min estimados
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="flex flex-col gap-1">
                <span className="tt-badge tt-badge-warn self-start">Revisión manual</span>
                <span className="text-xs text-[var(--tx3)]">
                  {quote.zoneName
                    ? `El punto cae en ${quote.zoneName}, pero sin tarifa aplicable al subtotal.`
                    : "El punto queda fuera de toda zona activa: el pedido se recibiría con costo por confirmar."}
                </span>
              </span>
            )}
          </div>
        </label>
        <LocationPicker
          value={point}
          onChange={setPoint}
          overlays={overlays}
          height={280}
          buttonClassName={BTN}
          testId="preview-picker"
        />
      </div>
    </section>
  );
}
