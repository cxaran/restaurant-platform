import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { ApiRequestError } from "@/core/api/api-error";
import { serverApi } from "@/core/api/server-client";
import { getSession } from "@/core/auth/session";
import type { MyOrderRead } from "@/core/restaurant-api/contracts";
import { formatMoney } from "@/core/restaurant-api/theme";

export const dynamic = "force-dynamic";

export default async function MyOrderDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  const session = await getSession();
  if (!session) {
    return (
      <div className="sf-container" style={{ paddingBlock: 40, maxWidth: 620 }}>
        <div className="sf-card" style={{ padding: 26, textAlign: "center" }}>
          <p style={{ fontWeight: 700, marginBottom: 14 }}>Inicia sesión para ver tu pedido.</p>
          <Link className="sf-btn" href={`/login?next=/pedidos/${id}`}>Iniciar sesión</Link>
        </div>
      </div>
    );
  }

  const cookieHeader = (await cookies()).toString();
  let order: MyOrderRead;
  try {
    order = await serverApi<MyOrderRead>(`/api/v1/orders/mine/${encodeURIComponent(id)}`, {
      cookie: cookieHeader,
    });
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }

  const total = order.total_money_amount ?? order.items_subtotal_amount;

  return (
    <div className="sf-container" style={{ paddingBlock: 28, maxWidth: 680 }}>
      <h1 className="sf-display" style={{ fontSize: 28, margin: "0 0 6px" }}>
        Pedido {order.public_code}
      </h1>
      <p className="sf-muted" style={{ margin: "0 0 18px", fontSize: 13 }}>
        {new Date(order.created_at).toLocaleString("es-MX")}
      </p>

      <div className="sf-card" style={{ padding: "18px 20px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="sf-chip" data-active="true">{order.status_label}</span>
          {order.shipping_pending_review ? (
            <span className="sf-muted" style={{ fontSize: 13 }}>
              El costo de envío está por confirmarse; el total puede cambiar.
            </span>
          ) : null}
        </div>
      </div>

      {/* Repartidor: el backend SOLO lo incluye en camino (privacidad §19.2). */}
      {order.courier ? (
        <div className="sf-card" style={{ padding: "18px 20px", marginBottom: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>Tu pedido va en camino</div>
          <div style={{ fontSize: 14 }}>
            {order.courier.name}
            {order.courier.public_phone ? ` · ${order.courier.public_phone}` : ""}
          </div>
          {order.courier.public_note ? (
            <div className="sf-muted" style={{ fontSize: 13, marginTop: 4 }}>
              {order.courier.public_note}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="sf-card" style={{ padding: "18px 20px" }}>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {(order.lines ?? []).map((line) => (
            <li key={line.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
              <span>
                {line.quantity} × {line.product_name_snapshot}
              </span>
              <span style={{ fontWeight: 700 }}>{formatMoney(line.money_line_total_amount)}</span>
            </li>
          ))}
        </ul>
        <hr style={{ border: "none", borderTop: "1px solid color-mix(in srgb, var(--sf-text) 14%, transparent)", margin: "12px 0" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
          <span>Subtotal</span>
          <span style={{ fontWeight: 700 }}>{formatMoney(order.items_subtotal_amount)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
          <span>Envío</span>
          <span style={{ fontWeight: 700 }}>
            {order.shipping_pending_review ? "Por confirmar" : formatMoney(order.shipping_amount ?? "0")}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 17, marginTop: 6 }}>
          <span style={{ fontWeight: 900 }}>Total</span>
          <span style={{ fontWeight: 900 }}>{formatMoney(total)}</span>
        </div>
        {order.credits_earned_total_snapshot > 0 ? (
          <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: "var(--sf-brand)" }}>
            Este pedido te dará {order.credits_earned_total_snapshot} créditos al completarse.
          </div>
        ) : null}
      </div>
    </div>
  );
}
