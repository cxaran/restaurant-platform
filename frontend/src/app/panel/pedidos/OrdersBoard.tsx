"use client";

// Cola operativa de pedidos (pantalla 1g): chips de filtro por estado, lista
// maestro a la izquierda y detalle del pedido seleccionado a la derecha.
// Estados reales del backend, transiciones por permiso. Ocultar botones NO es
// seguridad — el backend valida cada acción.

import { useCallback, useEffect, useState } from "react";

import { ApiRequestError } from "@/core/api/api-error";
import { browserApi } from "@/core/api/browser-client";
import type {
  OrderListItem,
  OrderRead,
  OrderTransitionRequest,
} from "@/core/restaurant-api/panel-contracts";
import { formatMoney } from "@/core/restaurant-api/theme";
import type { components } from "@/generated/openapi";

import { ApproveDialog } from "./ApproveDialog";
import { CancelDialog, type CancelResolution } from "./CancelDialog";
import { OrderDetail } from "./OrderDetail";
import { downloadOrdersCsv } from "./orders-export";
import {
  FULFILLMENT_LABELS,
  ORDER_FILTERS,
  PAYMENT_STATUS_LABELS,
  STATUS_BADGE_CLASS,
  STATUS_LABELS,
  relativeSince,
  type OrderFilterKey,
} from "./order-meta";

type PublicBusinessRead = components["schemas"]["PublicBusinessRead"];
type BusinessProfileRead = components["schemas"]["BusinessProfileRead"];
type BusinessProfileUpdate = components["schemas"]["BusinessProfileUpdate"];
type OrdersPage = components["schemas"]["OffsetPage_OrderListItem_"];

const PAGE_SIZE = 30;

type DatePreset = "hoy" | "7d" | "30d" | "todos" | "custom";

const DATE_PRESETS: ReadonlyArray<{ key: DatePreset; label: string }> = [
  { key: "hoy", label: "Hoy" },
  { key: "7d", label: "7 días" },
  { key: "30d", label: "30 días" },
  { key: "todos", label: "Todo" },
  { key: "custom", label: "Personalizado" },
];

/** created_from/created_to (ISO) según el preset; custom usa las fechas dadas
 * con el «hasta» exclusivo al día siguiente. */
function dateRangeParams(
  preset: DatePreset,
  customFrom: string,
  customTo: string,
): { created_from?: string; created_to?: string } {
  const now = new Date();
  if (preset === "hoy") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { created_from: start.toISOString() };
  }
  if (preset === "7d") return { created_from: new Date(now.getTime() - 7 * 86_400_000).toISOString() };
  if (preset === "30d") return { created_from: new Date(now.getTime() - 30 * 86_400_000).toISOString() };
  if (preset === "custom") {
    const out: { created_from?: string; created_to?: string } = {};
    if (customFrom) out.created_from = new Date(`${customFrom}T00:00:00`).toISOString();
    if (customTo) {
      const end = new Date(`${customTo}T00:00:00`);
      end.setDate(end.getDate() + 1);
      out.created_to = end.toISOString();
    }
    return out;
  }
  return {};
}

// Pill "Aceptando pedidos / Pausado": lee el flag público del negocio y, con
// business:update, lo alterna vía PATCH /business/profile (is_accepting_orders
// vive en el perfil del negocio, no en /business/settings).
function AcceptingOrdersPill({ canToggle }: Readonly<{ canToggle: boolean }>) {
  const [accepting, setAccepting] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await browserApi<PublicBusinessRead>("/api/v1/public/business");
        if (active) setAccepting(data.is_accepting_orders);
      } catch {
        if (active) setAccepting(null);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function toggle() {
    if (accepting === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await browserApi<BusinessProfileRead>("/api/v1/business/profile", {
        method: "PATCH",
        body: { is_accepting_orders: !accepting } satisfies BusinessProfileUpdate,
      });
      setAccepting(data.is_accepting_orders);
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.body.message : "No fue posible cambiar el estado.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (accepting === null) return null;
  const label = accepting ? "Aceptando pedidos" : "Pausado";
  const badgeClass = accepting ? "tt-badge-ok" : "tt-badge-new";

  if (!canToggle) {
    return (
      <span className={`tt-badge ${badgeClass}`} style={{ padding: "8px 14px" }}>
        ● {label}
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        className={`tt-badge ${badgeClass}`}
        onClick={() => void toggle()}
        disabled={busy}
        aria-pressed={accepting}
        title={accepting ? "Pausar la recepción de pedidos" : "Reanudar la recepción de pedidos"}
        style={{
          border: "none", cursor: busy ? "wait" : "pointer",
          padding: "8px 14px", font: "inherit", fontSize: 12, fontWeight: 800,
        }}
      >
        ● {label}
      </button>
      {error ? (
        <span role="alert" style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>
          {error}
        </span>
      ) : null}
    </>
  );
}

function OrderCard({
  order,
  selected,
  onSelect,
}: Readonly<{
  order: OrderListItem;
  selected: boolean;
  onSelect: () => void;
}>) {
  const isIntake = order.status === "submitted" || order.status === "pending_approval";
  const isTerminal = order.status === "completed" || order.status === "cancelled";
  const statusLabel = (STATUS_LABELS[order.status] ?? order.status).toUpperCase();
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{
        background: "var(--panel)",
        border: selected ? "2px solid var(--accent)" : "1px solid var(--border)",
        boxShadow: selected ? "0 6px 16px rgba(193,39,45,0.12)" : "none",
        borderRadius: 16,
        padding: selected ? "13px 15px" : "14px 16px",
        display: "flex", flexDirection: "column", gap: 8,
        font: "inherit", color: "var(--tx)", textAlign: "left", cursor: "pointer",
        opacity: isTerminal ? 0.7 : 1, width: "100%",
      }}
    >
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 900, fontSize: 15 }}>{order.public_code}</span>
        <span className={`tt-badge ${STATUS_BADGE_CLASS[order.status] ?? "tt-badge-done"}`}>
          {statusLabel}
          {isIntake ? ` · ${relativeSince(order.created_at)}` : ""}
        </span>
      </span>
      <span style={{ fontSize: 13, color: "var(--tx2)", fontWeight: 600 }}>
        {order.customer_name_snapshot ?? "Sin cliente"}
        {" · "}
        {FULFILLMENT_LABELS[order.fulfillment_type] ?? order.fulfillment_type}
      </span>
      <span
        style={{
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
          gap: 8, fontSize: 13, color: "var(--muted-btn-tx)",
        }}
      >
        <span>{PAYMENT_STATUS_LABELS[order.payment_status] ?? order.payment_status}</span>
        {order.purchase_mode === "credits" ? (
          // Pedido por créditos: el chip sustituye al total monetario como
          // dato principal (jamás se mezclan dinero y créditos).
          <span className="tt-badge tt-badge-done">Créditos</span>
        ) : (
          <span style={{ fontWeight: 900, color: "var(--tx)", fontSize: 15 }}>
            {formatMoney(order.total_money_amount ?? order.items_subtotal_amount)}
          </span>
        )}
      </span>
    </button>
  );
}

export function OrdersBoard({ permissions }: Readonly<{ permissions: string[] }>) {
  const perms = new Set(permissions);
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [pageInfo, setPageInfo] = useState<OrdersPage["pagination"] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<OrderFilterKey>("activos");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("todos");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ id: string; data: OrderRead } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<OrderListItem | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<OrderListItem | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [refreshTick, setRefreshTick] = useState(0);
  const load = useCallback(() => setRefreshTick((tick) => tick + 1), []);

  // Búsqueda con debounce: el input escribe qInput; q (el que consulta) se
  // actualiza 400 ms después y regresa a la primera página.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(qInput.trim());
      setOffset(0);
    }, 400);
    return () => clearTimeout(timer);
  }, [qInput]);

  const activeFilter = ORDER_FILTERS.find((option) => option.key === filter) ?? ORDER_FILTERS[0];
  const statusesCsv = activeFilter.statuses === null ? "" : activeFilter.statuses.join(",");

  // Sincronización con el backend: filtros/búsqueda/fechas/página se resuelven
  // del lado del servidor (envelope paginado) y los chips usan /status-counts
  // con los MISMOS filtros; todo setState ocurre tras el await.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const range = dateRangeParams(datePreset, customFrom, customTo);
        const params = new URLSearchParams();
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(offset));
        if (statusesCsv) params.set("status", statusesCsv);
        if (q) params.set("q", q);
        if (range.created_from) params.set("created_from", range.created_from);
        if (range.created_to) params.set("created_to", range.created_to);

        const countParams = new URLSearchParams();
        if (q) countParams.set("q", q);
        if (range.created_from) countParams.set("created_from", range.created_from);
        if (range.created_to) countParams.set("created_to", range.created_to);

        const [page, countsData] = await Promise.all([
          browserApi<OrdersPage>(`/api/v1/orders?${params.toString()}`),
          browserApi<Record<string, number>>(
            `/api/v1/orders/status-counts?${countParams.toString()}`,
          ),
        ]);
        if (!active) return;
        setOrders(page.items);
        setPageInfo(page.pagination);
        setCounts(countsData);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof ApiRequestError ? err.body.message : "Error al cargar pedidos.");
      }
    })();
    const timer = setInterval(() => setRefreshTick((tick) => tick + 1), 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [refreshTick, statusesCsv, q, datePreset, customFrom, customTo, offset]);

  const visible = orders;

  // Selección efectiva: lo elegido si sigue visible; si no, el primero de la
  // lista (así el panel derecho nunca queda apuntando a un pedido oculto).
  const selected = visible.find((order) => order.id === selectedId) ?? visible[0] ?? null;
  const selectedOrderId = selected?.id ?? null;

  // El detalle (OrderRead con líneas, envío y entrega) se pide aparte y se
  // vuelve a pedir en cada tick para reflejar transiciones de otros equipos.
  useEffect(() => {
    // Sin selección no hay nada que pedir; el render ya ignora un detalle de
    // otro pedido (compara detail.id), así que no hace falta limpiarlo aquí.
    if (!selectedOrderId) return;
    let active = true;
    (async () => {
      try {
        const data = await browserApi<OrderRead>(`/api/v1/orders/${selectedOrderId}`);
        if (!active) return;
        setDetail({ id: selectedOrderId, data });
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof ApiRequestError ? err.body.message : "No fue posible cargar el detalle.",
        );
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedOrderId, refreshTick]);

  async function transition(order: OrderListItem, to: string) {
    if (to === "cancelled") {
      // La cancelación pasa por el diálogo de resolución (H5).
      setCancelError(null);
      setCancelTarget(order);
      return;
    }
    if (to === "approved") {
      // Aprobar pasa por el diálogo de aclaraciones (visible + interna).
      setApproveError(null);
      setApproveTarget(order);
      return;
    }
    setBusyId(order.id);
    try {
      await browserApi(`/api/v1/orders/${order.id}/transition`, {
        method: "POST",
        body: { new_status: to } satisfies OrderTransitionRequest,
      });
      load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.body.message : "No fue posible.");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmApprove(visibleNote: string | null, internalNote: string | null) {
    if (!approveTarget) return;
    setBusyId(approveTarget.id);
    setApproveError(null);
    try {
      await browserApi(`/api/v1/orders/${approveTarget.id}/transition`, {
        method: "POST",
        body: {
          new_status: "approved",
          ...(visibleNote ? { customer_visible_note: visibleNote } : {}),
          ...(internalNote ? { internal_note: internalNote } : {}),
        } satisfies OrderTransitionRequest,
      });
      setApproveTarget(null);
      load();
    } catch (err) {
      setApproveError(
        err instanceof ApiRequestError ? err.body.message : "No fue posible aprobar.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function confirmCancel(resolution: CancelResolution | null, reason: string | null) {
    if (!cancelTarget) return;
    setBusyId(cancelTarget.id);
    setCancelError(null);
    try {
      await browserApi(`/api/v1/orders/${cancelTarget.id}/transition`, {
        method: "POST",
        body: {
          new_status: "cancelled",
          ...(resolution ? { payment_resolution: resolution } : {}),
          ...(reason ? { resolution_reason: reason } : {}),
        } satisfies OrderTransitionRequest,
      });
      setCancelTarget(null);
      load();
    } catch (err) {
      // Los 409 del backend (resolucion_requerida / motivo_requerido) se
      // muestran tal cual dentro del diálogo.
      setCancelError(err instanceof ApiRequestError ? err.body.message : "No fue posible cancelar.");
    } finally {
      setBusyId(null);
    }
  }

  // Export CSV (1.5): pagina GET /orders con los MISMOS filtros vigentes (chip
  // de estado, búsqueda y rango de fechas) y descarga el listado enriquecido.
  // Tope duro de 5 000 filas para no colgar el navegador con historiales enormes.
  async function exportCsv() {
    if (exporting) return;
    setExporting(true);
    setError(null);
    try {
      const range = dateRangeParams(datePreset, customFrom, customTo);
      const all: OrderListItem[] = [];
      const CAP = 5000;
      const EXPORT_PAGE = 100;
      let exportOffset = 0;
      while (all.length < CAP) {
        const params = new URLSearchParams();
        params.set("limit", String(EXPORT_PAGE));
        params.set("offset", String(exportOffset));
        if (statusesCsv) params.set("status", statusesCsv);
        if (q) params.set("q", q);
        if (range.created_from) params.set("created_from", range.created_from);
        if (range.created_to) params.set("created_to", range.created_to);
        const page = await browserApi<OrdersPage>(`/api/v1/orders?${params.toString()}`);
        all.push(...page.items);
        if (!page.pagination.has_next || page.items.length === 0) break;
        exportOffset += page.items.length;
      }
      if (all.length === 0) {
        setError("No hay pedidos que exportar con los filtros actuales.");
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      downloadOrdersCsv(all.slice(0, CAP), `pedidos-${stamp}.csv`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.body.message : "No fue posible exportar.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {ORDER_FILTERS.map((option) => {
          const count =
            option.statuses === null
              ? Object.values(counts).reduce((sum, value) => sum + value, 0)
              : option.statuses.reduce((sum, status) => sum + (counts[status] ?? 0), 0);
          return (
            <button
              key={option.key}
              type="button"
              className="tt-chip tt-chip-accent"
              data-active={filter === option.key ? "1" : "0"}
              onClick={() => {
                setFilter(option.key);
                setOffset(0);
              }}
            >
              {option.label}
              {` · ${count}`}
            </button>
          );
        })}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <AcceptingOrdersPill canToggle={perms.has("business:update")} />
          <button
            type="button"
            className="tt-btn tt-btn-ghost"
            onClick={() => void exportCsv()}
            disabled={exporting}
            style={{ padding: "8px 14px", fontSize: 13 }}
            title="Exportar el listado filtrado a CSV"
          >
            {exporting ? "Exportando…" : "Exportar CSV"}
          </button>
          <button
            type="button"
            className="tt-btn tt-btn-ghost"
            onClick={load}
            style={{ padding: "8px 14px", fontSize: 13 }}
          >
            Actualizar
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="search"
          className="tt-input"
          value={qInput}
          onChange={(event) => setQInput(event.target.value)}
          placeholder="Buscar por folio, cliente, quien recibe o dirección…"
          aria-label="Buscar pedidos"
          style={{ flex: "1 1 260px", maxWidth: 380, padding: "8px 12px", fontSize: 13 }}
        />
        {DATE_PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            className="tt-chip"
            data-active={datePreset === preset.key ? "1" : "0"}
            onClick={() => {
              setDatePreset(preset.key);
              setOffset(0);
            }}
          >
            {preset.label}
          </button>
        ))}
        {datePreset === "custom" ? (
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13 }}>
            <input
              type="date"
              className="tt-input"
              value={customFrom}
              max={customTo || undefined}
              onChange={(event) => {
                setCustomFrom(event.target.value);
                setOffset(0);
              }}
              aria-label="Desde"
              style={{ padding: "6px 10px", fontSize: 13 }}
            />
            —
            <input
              type="date"
              className="tt-input"
              value={customTo}
              min={customFrom || undefined}
              onChange={(event) => {
                setCustomTo(event.target.value);
                setOffset(0);
              }}
              aria-label="Hasta"
              style={{ padding: "6px 10px", fontSize: 13 }}
            />
          </span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" style={{ margin: 0, color: "var(--accent)", fontWeight: 700, fontSize: 13 }}>
          {error}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <div className="tt-card" style={{ padding: "18px 20px" }}>
          <p style={{ margin: 0, fontSize: 14, color: "var(--tx3)" }}>
            Sin pedidos en «{activeFilter.label}»
            {q ? ` para «${q}»` : ""}
            {datePreset !== "todos" ? " en el rango de fechas elegido" : ""}.
          </p>
        </div>
      ) : (
        // flex-grow desbalanceado: en pantalla ancha la lista queda ~350px y el
        // detalle toma el resto; en móvil ambos envuelven (lista arriba).
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
          <ul
            style={{
              listStyle: "none", margin: 0, padding: 0,
              flex: "1 1 300px", maxWidth: "100%",
              display: "flex", flexDirection: "column", gap: 12,
            }}
          >
            {visible.map((order) => (
              <li key={order.id}>
                <OrderCard
                  order={order}
                  selected={selected?.id === order.id}
                  onSelect={() => setSelectedId(order.id)}
                />
              </li>
            ))}
          </ul>
          <OrderDetail
            detail={detail && detail.id === selectedOrderId ? detail.data : null}
            loading={detail?.id !== selectedOrderId}
            perms={perms}
            busy={busyId === selectedOrderId}
            onTransition={(to) => {
              if (selected) void transition(selected, to);
            }}
            onRefresh={load}
          />
        </div>
      )}

      {pageInfo && pageInfo.total > 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, color: "var(--tx2)" }}>
          <button
            type="button"
            className="tt-btn tt-btn-ghost"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            style={{ padding: "6px 12px", fontSize: 13 }}
          >
            ← Anterior
          </button>
          <span>
            {pageInfo.total === 0 ? "0" : `${offset + 1}–${offset + visible.length}`} de {pageInfo.total}
          </span>
          <button
            type="button"
            className="tt-btn tt-btn-ghost"
            disabled={!pageInfo.has_next}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            style={{ padding: "6px 12px", fontSize: 13 }}
          >
            Siguiente →
          </button>
        </div>
      ) : null}

      {cancelTarget ? (
        <CancelDialog
          key={cancelTarget.id}
          order={cancelTarget}
          busy={busyId === cancelTarget.id}
          error={cancelError}
          onClose={() => setCancelTarget(null)}
          onConfirm={(resolution, reason) => void confirmCancel(resolution, reason)}
        />
      ) : null}

      {approveTarget ? (
        <ApproveDialog
          key={approveTarget.id}
          order={approveTarget}
          busy={busyId === approveTarget.id}
          error={approveError}
          onClose={() => setApproveTarget(null)}
          onConfirm={(visibleNote, internalNote) => void confirmApprove(visibleNote, internalNote)}
        />
      ) : null}
    </div>
  );
}
