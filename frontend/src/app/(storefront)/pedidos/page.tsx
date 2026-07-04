import Link from "next/link";

import { getSession } from "@/core/auth/session";
import { serverApi } from "@/core/api/server-client";
import type { MyOrderRead } from "@/core/restaurant-api/contracts";
import { formatMoney } from "@/core/restaurant-api/theme";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function MyOrdersPage() {
  const session = await getSession();
  if (!session) {
    return (
      <div className="sf-container" style={{ paddingBlock: 40, maxWidth: 620 }}>
        <div className="sf-card" style={{ padding: 26, textAlign: "center" }}>
          <p style={{ fontWeight: 700, marginBottom: 14 }}>Inicia sesión para ver tus pedidos.</p>
          <Link className="sf-btn" href="/login?next=/pedidos">Iniciar sesión</Link>
        </div>
      </div>
    );
  }

  const cookieHeader = (await cookies()).toString();
  let orders: MyOrderRead[] = [];
  try {
    orders = await serverApi<MyOrderRead[]>("/api/v1/orders/mine", { cookie: cookieHeader });
  } catch {
    orders = [];
  }

  return (
    <div className="sf-container" style={{ paddingBlock: 28, maxWidth: 760 }}>
      <h1 className="sf-display" style={{ fontSize: 30, margin: "0 0 18px" }}>Mis pedidos</h1>
      {orders.length === 0 ? (
        <div className="sf-card" style={{ padding: 26, textAlign: "center" }}>
          <p style={{ fontWeight: 700, marginBottom: 14 }}>Todavía no tienes pedidos.</p>
          <Link className="sf-btn" href="/menu">Ver menú</Link>
        </div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/pedidos/${order.id}`}
                className="sf-card"
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", color: "inherit", textDecoration: "none", flexWrap: "wrap" }}
              >
                <span style={{ fontWeight: 900 }}>{order.public_code}</span>
                <span className="sf-chip" data-active="true" style={{ fontSize: 12, padding: "4px 12px" }}>
                  {order.status_label}
                </span>
                <span className="sf-muted" style={{ flex: 1, fontSize: 13 }}>
                  {new Date(order.created_at).toLocaleString("es-MX")}
                </span>
                <span style={{ fontWeight: 900 }}>
                  {formatMoney(order.total_money_amount ?? order.items_subtotal_amount)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
