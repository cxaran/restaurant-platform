"use client";

// Cola operativa de pedidos: estados reales del backend, transiciones por
// permiso. Ocultar botones NO es seguridad — el backend valida cada acción.

import { useCallback, useEffect, useState } from "react";

import { ApiRequestError } from "@/core/api/api-error";
import { browserApi } from "@/core/api/browser-client";
import { formatMoney } from "@/core/restaurant-api/theme";

type OrderRow = {
  id: string;
  public_code: string;
  source: string;
  fulfillment_type: string;
  status: string;
  payment_status: string;
  customer_name_snapshot?: string | null;
  total_money_amount?: string | null;
  items_subtotal_amount: string;
  created_at: string;
};

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

export function OrdersBoard({ permissions }: Readonly<{ permissions: string[] }>) {
  const perms = new Set(permissions);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("activos");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [refreshTick, setRefreshTick] = useState(0);
  const load = useCallback(() => setRefreshTick((tick) => tick + 1), []);

  // Sincronización con el backend: todo setState ocurre tras el await; el
  // refresco manual/periódico solo mueve el tick (callback, no cuerpo síncrono).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await browserApi<OrderRow[]>("/api/v1/orders?limit=100");
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

  async function transition(order: OrderRow, to: string) {
    // H5: cancelar con cobro exige confirmación humana explícita.
    let acknowledge = false;
    if (to === "cancelled") {
      const paid = order.payment_status !== "unpaid";
      const message = paid
        ? "Este pedido tiene pagos registrados. Cancelar NO reembolsa automáticamente: deberás resolver el reembolso por separado. ¿Cancelar de todas formas?"
        : "¿Cancelar este pedido?";
      if (!window.confirm(message)) return;
      acknowledge = paid;
    }
    setBusyId(order.id);
    try {
      await browserApi(`/api/v1/orders/${order.id}/transition`, {
        method: "POST",
        body: { new_status: to, acknowledge_paid_payments: acknowledge },
      });
      load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.body.message : "No fue posible.");
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
              <span style={{ fontWeight: 900, minWidth: 80, textAlign: "right" }}>
                {formatMoney(order.total_money_amount ?? order.items_subtotal_amount)}
              </span>
              <span style={{ display: "flex", gap: 6 }}>
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
    </div>
  );
}
