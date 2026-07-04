import Link from "next/link";

import { requireSession } from "@/core/auth/session";
import { EntregasView } from "./EntregasView";

export const dynamic = "force-dynamic";

// Pantalla de DESPACHO para supervisor: cola global de envíos listos y
// asignación manual de repartidor. Ocultar acciones no es seguridad: el
// backend valida deliveries:read / deliveries:assign / profiles:read en cada
// endpoint. El shell del panel (TTShell) ya aporta <main>, sidebar y título.
export default async function PanelEntregasPage() {
  const session = await requireSession();
  const permissions = session.permissions ?? [];
  if (!permissions.includes("deliveries:read")) {
    return (
      <div className="mx-auto w-full max-w-xl">
        <div
          className="tt-card"
          style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}
        >
          <p style={{ margin: 0, fontWeight: 800 }}>
            No tienes permiso para ver la cola de entregas.
          </p>
          <Link href="/panel" className="tt-btn tt-btn-ghost">
            Volver al panel
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="sr-only">Entregas</h1>
      <EntregasView
        canAssign={permissions.includes("deliveries:assign")}
        canListStaff={permissions.includes("profiles:read")}
        canManageStaff={permissions.includes("profiles:manage_staff")}
      />
    </div>
  );
}
