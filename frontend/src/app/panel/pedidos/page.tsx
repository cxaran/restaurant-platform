import Link from "next/link";

import { requireSession } from "@/core/auth/session";
import { OrdersBoard } from "./OrdersBoard";
import { PendingRefunds } from "./PendingRefunds";

export const dynamic = "force-dynamic";

// El cromo (sidebar café + header con el título "Pedidos") lo pone PanelShell;
// esta página solo renderiza el contenido del módulo (pantalla 1g).
export default async function PanelOrdersPage() {
  const session = await requireSession();
  const permissions = session.permissions ?? [];
  if (!permissions.includes("orders:read")) {
    return (
      <div className="tt-card" style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
        <p style={{ margin: 0, fontWeight: 700 }}>No tienes permiso para ver pedidos.</p>
        <Link href="/panel" className="tt-btn tt-btn-ghost">
          Volver al panel
        </Link>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {permissions.includes("payments:read") ? (
        <PendingRefunds canRefund={permissions.includes("payments:refund")} />
      ) : null}
      <OrdersBoard permissions={permissions} />
    </div>
  );
}
