import Link from "next/link";
import { cookies } from "next/headers";

import { serverApi } from "@/core/api/server-client";
import { getSession } from "@/core/auth/session";
import type { MyOrderRead } from "@/core/restaurant-api/contracts";

import { OrderCard } from "./OrderCard";

export const dynamic = "force-dynamic";

// «Mis pedidos»: tarjetas con el lenguaje del historial de compras (3a) —
// código · fecha, chip de estado suave, resumen de productos y total.
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
    <div className="sf-container" style={{ paddingBlock: 28, maxWidth: 720 }}>
      <h1 className="sf-display" style={{ fontSize: 30, margin: "0 0 18px" }}>Mis pedidos</h1>
      {orders.length === 0 ? (
        <div className="sf-card" style={{ padding: 26, textAlign: "center" }}>
          <p style={{ fontWeight: 700, marginBottom: 14 }}>Todavía no tienes pedidos.</p>
          <Link className="sf-btn" href="/menu">Ver menú</Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
}
