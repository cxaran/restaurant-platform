"use client";

// Cola operativa de pedidos: estados reales del backend, transiciones por
// permiso. Ocultar botones NO es seguridad — el backend valida cada acción.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiRequestError } from "@/core/api/api-error";
import { browserApi } from "@/core/api/browser-client";
import type {
  OrderListItem,
  OrderTransitionRequest,
} from "@/core/restaurant-api/panel-contracts";
import { formatMoney } from "@/core/restaurant-api/theme";

type CancelResolution = NonNullable<OrderTransitionRequest["payment_resolution"]>;

// Espejo visual de ORDER_TRANSITIONS del backend (la autoridad es el backend:
// una transición no permitida responde 409 y se muestra el mensaje real).
const NEXT_ACTIONS: Record<string, { to: string; label: string; permission: string }[]> = {
  submitted: [{ to: "pending_approval", label: "Tomar", permission: "orders:transition" }],
  pending_approval: [
    { to: "approved", label: "Aprobar", permission: "orders:approve" },
    { to: "cancelled", label: "Cancelar", permission: "orders:cancel" },
  ],
  approved: [
    { to: "preparing", label: "A cocina", permission: "orders:transition" },
    { to: "cancelled", label: "Cancelar", permission: "orders:cancel" },
  ],
  preparing: [{ to: "ready", label: "Listo", permission: "orders:transition" }],
  ready: [
    { to: "out_for_delivery", label: "En camino", permission: "orders:transition" },
    { to: "completed", label: "Entregado", permission: "orders:transition" },
  ],
  out_for_delivery: [{ to: "completed", label: "Entregado", permission: "orders:transition" }],
};

const STATUS_LABELS: Record<string, string> = {
  submitted: "Nuevo",
  pending_approval: "Por aprobar",
  approved: "Aprobado",
  preparing: "En preparación",
  ready: "Listo",
  out_for_delivery: "En camino",
  completed: "Entregado",
  cancelled: "Cancelado",
};

const FILTERS = ["activos", "todos"] as const;
const ACTIVE_STATUSES = new Set(Object.keys(NEXT_ACTIONS));

const RESOLUTION_OPTIONS: { value: CancelResolution; label: string; detail: string }[] = [
  {
    value: "refund_now",
    label: "Reembolso registrado ahora",
    detail: "El dinero ya se devolvió y queda registrado en este momento.",
  },
  {
    value: "refund_pending",
    label: "Reembolso pendiente de procesar",
    detail: "La devolución queda abierta en la cola de conciliación.",
  },
  {
    value: "retain",
    label: "Retener el pago (excepcional)",
    detail: "El negocio conserva el cobro; requiere motivo obligatorio.",
  },
];

// H5: cancelar con cobro exige decisión humana explícita sobre el dinero.
// Diálogo accesible propio: role="dialog", aria-modal, foco inicial y Escape.
function CancelDialog({
  order,
  busy,
  error,
  onClose,
  onConfirm,
}: Readonly<{
  order: OrderListItem;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (resolution: CancelResolution | null, reason: string | null) => void;
}>) {
  const hasPayments = order.payment_status !== "unpaid";
  const [resolution, setResolution] = useState<CancelResolution | null>(null);
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  function confirm() {
    if (hasPayments && resolution === null) {
      setLocalError("Elige cómo se resuelve el cobro antes de cancelar.");
      return;
    }
    if (resolution === "retain" && reason.trim().length === 0) {
      setLocalError("El motivo es obligatorio para retener el pago.");
      return;
    }
    setLocalError(null);
    onConfirm(
      hasPayments ? resolution : null,
      resolution === "retain" ? reason.trim() : null,
    );
  }

  const shownError = error ?? localError;

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, zIndex: 50,
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-dialog-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !busy) onClose();
        }}
        style={{
          background: "var(--surface, #fff)", color: "inherit",
          borderRadius: 14, border: "1px solid rgba(0,0,0,0.25)",
          padding: "18px 20px", maxWidth: 460, width: "100%",
          display: "flex", flexDirection: "column", gap: 12, outline: "none",
        }}
      >
        <h2 id="cancel-dialog-title" style={{ margin: 0, fontSize: 17 }}>
          Cancelar pedido {order.public_code}
        </h2>
        <p style={{ margin: 0, fontSize: 13.5 }}>
          Cancelar <b>no reembolsa</b> automáticamente: la devolución del dinero
          es una decisión aparte y queda registrada.
        </p>

        {hasPayments ? (
          <fieldset style={{ border: "1px solid rgba(0,0,0,0.2)", borderRadius: 10, padding: "10px 12px", margin: 0 }}>
            <legend style={{ fontSize: 13, fontWeight: 800, padding: "0 6px" }}>
              Este pedido tiene pagos registrados. ¿Qué pasa con el cobro?
            </legend>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {RESOLUTION_OPTIONS.map((option) => (
                <label key={option.value} style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "flex-start" }}>
                  <input
                    type="radio"
                    name="payment-resolution"
                    value={option.value}
                    checked={resolution === option.value}
                    onChange={() => setResolution(option.value)}
                    style={{ marginTop: 2 }}
                  />
                  <span>
                    <span style={{ fontWeight: 800, display: "block" }}>{option.label}</span>
                    <span style={{ opacity: 0.75 }}>{option.detail}</span>
                  </span>
                </label>
              ))}
              {resolution === "retain" ? (
                <label style={{ fontSize: 13, fontWeight: 700, display: "block" }}>
                  Motivo (obligatorio)
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={3}
                    style={{
                      width: "100%", marginTop: 4, padding: "8px 10px",
                      borderRadius: 8, border: "1px solid rgba(0,0,0,0.25)",
                      font: "inherit", fontWeight: 400, resize: "vertical",
                    }}
                  />
                </label>
              ) : null}
            </div>
          </fieldset>
        ) : (
          <p style={{ margin: 0, fontSize: 13.5 }}>
            Este pedido no tiene pagos registrados. ¿Cancelarlo?
          </p>
        )}

        {shownError ? (
          <p role="alert" style={{ margin: 0, color: "#b3261e", fontSize: 13, fontWeight: 700 }}>
            {shownError}
          </p>
        ) : null}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            style={{
              padding: "8px 14px", borderRadius: 8, fontWeight: 800, fontSize: 13,
              border: "1px solid rgba(0,0,0,0.3)", background: "transparent",
            }}
          >
            Volver
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={confirm}
            style={{
              padding: "8px 14px", borderRadius: 8, fontWeight: 800, fontSize: 13,
              border: "1px solid #b3261e", background: "#b3261e18", color: "#b3261e",
            }}
          >
            {busy ? "Cancelando…" : "Cancelar pedido"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function OrdersBoard({ permissions }: Readonly<{ permissions: string[] }>) {
  const perms = new Set(permissions);
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("activos");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<OrderListItem | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const [refreshTick, setRefreshTick] = useState(0);
  const load = useCallback(() => setRefreshTick((tick) => tick + 1), []);

  // Sincronización con el backend: todo setState ocurre tras el await; el
  // refresco manual/periódico solo mueve el tick (callback, no cuerpo síncrono).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await browserApi<OrderListItem[]>("/api/v1/orders?limit=100");
        if (!active) return;
        setOrders(data);
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
  }, [refreshTick]);

  async function transition(order: OrderListItem, to: string) {
    if (to === "cancelled") {
      // La cancelación pasa por el diálogo de resolución (H5).
      setCancelError(null);
      setCancelTarget(order);
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

  const visible = orders.filter(
    (order) => filter === "todos" || ACTIVE_STATUSES.has(order.status),
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {FILTERS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setFilter(option)}
            style={{
              padding: "6px 14px", borderRadius: 999, fontWeight: 700, fontSize: 13,
              border: "1px solid rgba(0,0,0,0.25)",
              background: filter === option ? "var(--accent, #444)" : "transparent",
              color: filter === option ? "var(--on-accent, #fff)" : "inherit",
            }}
          >
            {option === "activos" ? "Activos" : "Todos"}
          </button>
        ))}
        <button type="button" onClick={load} style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700 }}>
          Actualizar
        </button>
      </div>
      {error ? <p role="alert" style={{ margin: 0, color: "#b3261e", fontWeight: 600 }}>{error}</p> : null}
      {visible.length === 0 ? (
        <p style={{ opacity: 0.7, fontSize: 14 }}>Sin pedidos {filter === "activos" ? "activos" : ""}.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {visible.map((order) => (
            <li
              key={order.id}
              style={{
                border: "1px solid rgba(0,0,0,0.18)", borderRadius: 12,
                padding: "12px 16px", display: "flex", flexWrap: "wrap",
                gap: 12, alignItems: "center",
              }}
            >
              <div style={{ minWidth: 130 }}>
                <div style={{ fontWeight: 900 }}>{order.public_code}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  {new Date(order.created_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                  {" · "}
                  {order.fulfillment_type}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 140, fontSize: 13 }}>
                {order.customer_name_snapshot ?? "Sin cliente"}
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  Pago: {order.payment_status}
                </div>
              </div>
              <span
                style={{
                  fontSize: 12, fontWeight: 800, padding: "4px 12px", borderRadius: 999,
                  background: order.status === "cancelled" ? "#b3261e22" : "rgba(0,0,0,0.08)",
                }}
              >
                {STATUS_LABELS[order.status] ?? order.status}
              </span>
              {order.purchase_mode === "credits" ? (
                // Pedido por créditos: el chip sustituye al total monetario
                // como dato principal.
                <span
                  style={{
                    fontSize: 12, fontWeight: 800, padding: "4px 12px", borderRadius: 999,
                    border: "1px solid rgba(0,0,0,0.3)", background: "rgba(0,0,0,0.04)",
                    minWidth: 80, textAlign: "center",
                  }}
                >
                  Créditos
                </span>
              ) : (
                <span style={{ fontWeight: 900, minWidth: 80, textAlign: "right" }}>
                  {formatMoney(order.total_money_amount ?? order.items_subtotal_amount)}
                </span>
              )}
              <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {perms.has("tickets:print") ? (
                  <Link
                    href={`/panel/tickets?order=${order.id}`}
                    style={{ fontSize: 12, fontWeight: 800, color: "inherit" }}
                  >
                    Ticket
                  </Link>
                ) : null}
                {(NEXT_ACTIONS[order.status] ?? [])
                  .filter((action) => perms.has(action.permission))
                  .map((action) => (
                    <button
                      key={action.to}
                      type="button"
                      disabled={busyId === order.id}
                      onClick={() => void transition(order, action.to)}
                      style={{
                        padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 800,
                        border: "1px solid rgba(0,0,0,0.3)",
                        background: action.to === "cancelled" ? "#b3261e18" : "transparent",
                      }}
                    >
                      {action.label}
                    </button>
                  ))}
              </span>
            </li>
          ))}
        </ul>
      )}
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
    </div>
  );
}
