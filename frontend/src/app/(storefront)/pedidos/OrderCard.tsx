import Link from "next/link";

import type { MyOrderRead } from "@/core/restaurant-api/contracts";

import {
  formatOrderDate,
  orderLinesSummary,
  orderTotalDisplay,
  statusTone,
} from "./order-presentation";

// Tarjeta de pedido del historial (3a): código · fecha + chip de estado,
// resumen de productos y total con acceso al seguimiento.
export function OrderCard({ order }: Readonly<{ order: MyOrderRead }>) {
  const summary = orderLinesSummary(order);
  return (
    <article
      className="sf-card"
      style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          fontSize: 13,
        }}
      >
        <span style={{ fontWeight: 800 }}>
          {order.public_code} · {formatOrderDate(order.created_at)}
        </span>
        <span className="sf-status-chip" data-tone={statusTone(order.status)}>
          {order.status_label}
        </span>
      </div>
      {summary ? (
        <div className="sf-muted" style={{ fontSize: 12 }}>
          {summary}
        </div>
      ) : null}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          marginTop: 4,
        }}
      >
        <span style={{ fontWeight: 900, fontSize: 14 }}>{orderTotalDisplay(order)}</span>
        <Link
          className="sf-btn"
          href={`/pedidos/${order.id}`}
          style={{ fontSize: 12, padding: "8px 16px" }}
        >
          Ver pedido
        </Link>
      </div>
    </article>
  );
}
