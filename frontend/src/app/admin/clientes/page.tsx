import { notFound } from "next/navigation";

import { requireSession } from "@/core/auth/session";
import { ClientesView } from "./ClientesView";

// Clientes (admin): búsqueda por nombre/teléfono y ficha 360 — contacto,
// notas internas, créditos (saldo/movimientos/ajuste manual) y sus pedidos.
// Gate profiles:read; editar notas y ajustar créditos revalidan
// profiles:manage_customers / credits:manual_adjust en el backend.

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const session = await requireSession();
  const permissions = session.permissions ?? [];
  if (!permissions.includes("profiles:read")) {
    notFound();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <header>
        <h1 className="tt-display" style={{ margin: 0, fontSize: 24 }}>
          Clientes
        </h1>
        <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--muted-btn-tx)" }}>
          Busca por nombre o teléfono. Las notas internas jamás las ve el
          cliente; el saldo de créditos sale del ledger (nunca se edita directo).
        </p>
      </header>
      <ClientesView
        canManage={permissions.includes("profiles:manage_customers")}
        canSeeCredits={permissions.includes("credits:read_all")}
        canAdjustCredits={permissions.includes("credits:manual_adjust")}
        canSeeOrders={permissions.includes("orders:read")}
      />
    </div>
  );
}
