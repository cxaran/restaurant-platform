"use client";

// Cola de conciliación H5: pedidos cancelados con cobro cuya devolución sigue
// abierta. Solo se monta si la sesión tiene payments:read (lo decide la page);
// el backend vuelve a validar el permiso en el endpoint.

import { useEffect, useState } from "react";

import { ApiRequestError } from "@/core/api/api-error";
import { browserApi } from "@/core/api/browser-client";
import type { CancelledWithPaymentItem } from "@/core/restaurant-api/panel-contracts";
import { formatMoney } from "@/core/restaurant-api/theme";

const RESOLUTION_LABELS: Record<string, string> = {
  refund_now: "Reembolso registrado",
  refund_pending: "Reembolso pendiente",
  retain: "Pago retenido",
};

export function PendingRefunds() {
  const [items, setItems] = useState<CancelledWithPaymentItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await browserApi<CancelledWithPaymentItem[]>(
          "/api/v1/orders/cancellations/pending-refunds",
        );
        if (active) {
          setItems(data);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof ApiRequestError
              ? err.body.message
              : "No fue posible cargar la cola de devoluciones.",
          );
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <p role="alert" style={{ margin: 0, color: "#b3261e", fontSize: 13, fontWeight: 700 }}>
        {error}
      </p>
    );
  }
  if (items.length === 0) return null;

  return (
    <section
      aria-label="Cancelados con cobro pendiente de devolver"
      style={{
        border: "2px solid #b3261e", borderRadius: 12, padding: "12px 16px",
        background: "#b3261e0d", display: "flex", flexDirection: "column", gap: 8,
      }}
    >
      <h2 style={{ margin: 0, fontSize: 15, color: "#b3261e" }}>
        Cancelados con cobro pendiente de devolver ({items.length})
      </h2>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((item) => (
          <li
            key={item.order_id}
            style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "baseline", fontSize: 13 }}
          >
            <span style={{ fontWeight: 900, minWidth: 90 }}>{item.public_code}</span>
            <span style={{ fontWeight: 800 }}>
              Pendiente: {formatMoney(item.outstanding_amount)}
            </span>
            <span style={{ opacity: 0.8 }}>
              {item.cancellation_money_resolution
                ? RESOLUTION_LABELS[item.cancellation_money_resolution] ?? item.cancellation_money_resolution
                : "Sin resolución"}
              {item.cancellation_resolution_note ? ` · ${item.cancellation_resolution_note}` : ""}
            </span>
            {item.cancelled_at ? (
              <span style={{ fontSize: 12, opacity: 0.65 }}>
                {new Date(item.cancelled_at).toLocaleString("es-MX", {
                  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                })}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
