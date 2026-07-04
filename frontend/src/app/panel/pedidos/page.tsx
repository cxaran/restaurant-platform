import Link from "next/link";

import { requireSession } from "@/core/auth/session";
import { OrdersBoard } from "./OrdersBoard";

export const dynamic = "force-dynamic";

export default async function PanelOrdersPage() {
  const session = await requireSession();
  const permissions = session.permissions ?? [];
  if (!permissions.includes("orders:read")) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 20px" }}>
        <p style={{ fontWeight: 700 }}>No tienes permiso para ver pedidos.</p>
        <Link href="/panel">Volver al panel</Link>
      </main>
    );
  }
  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "24px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Pedidos</h1>
        <Link href="/panel" style={{ fontSize: 13, fontWeight: 700 }}>Panel</Link>
        <Link href="/panel/pos" style={{ fontSize: 13, fontWeight: 700 }}>POS</Link>
      </header>
      <OrdersBoard permissions={permissions} />
    </main>
  );
}
