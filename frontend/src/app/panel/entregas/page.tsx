import Link from "next/link";

import { requireSession } from "@/core/auth/session";
import { EntregasView } from "./EntregasView";

export const dynamic = "force-dynamic";

// Pantalla de DESPACHO para supervisor: cola global de envíos listos y
// asignación manual de repartidor. Ocultar acciones no es seguridad: el
// backend valida deliveries:read / deliveries:assign / profiles:read en cada
// endpoint.
export default async function PanelEntregasPage() {
  const session = await requireSession();
  const permissions = session.permissions ?? [];
  if (!permissions.includes("deliveries:read")) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 20px" }}>
        <p style={{ fontWeight: 700 }}>No tienes permiso para ver la cola de entregas.</p>
        <Link href="/panel">Volver al panel</Link>
      </main>
    );
  }
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "24px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Entregas</h1>
        <Link href="/panel" style={{ fontSize: 13, fontWeight: 700 }}>Panel</Link>
        <Link href="/panel/pedidos" style={{ fontSize: 13, fontWeight: 700 }}>Pedidos</Link>
      </header>
      <EntregasView
        canAssign={permissions.includes("deliveries:assign")}
        canListStaff={permissions.includes("profiles:read")}
      />
    </main>
  );
}
