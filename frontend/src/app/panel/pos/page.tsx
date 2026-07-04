import Link from "next/link";

import { requireSession } from "@/core/auth/session";
import { PosView } from "./PosView";

export const dynamic = "force-dynamic";

// El cromo (sidebar café + header con el título del módulo) lo pone
// PanelShell; esta página solo renderiza el contenido del POS (pantalla 1h).
export default async function PanelPosPage() {
  const session = await requireSession();
  const permissions = new Set(session.permissions ?? []);
  const allowed = permissions.has("orders:capture") && permissions.has("payments:record");
  if (!allowed) {
    return (
      <div
        className="tt-card"
        style={{
          padding: "22px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        <p style={{ margin: 0, fontWeight: 700 }}>
          El POS requiere permisos de captura y cobro (orders:capture + payments:record).
        </p>
        <Link href="/panel" className="tt-btn tt-btn-ghost">
          Volver al panel
        </Link>
      </div>
    );
  }
  // El gate del POS ya exige payments:record (cobro encadenado permitido);
  // el costo de envío manual además requiere orders:adjust_shipping.
  return (
    <PosView
      sellerName={session.name}
      canAdjustShipping={permissions.has("orders:adjust_shipping")}
    />
  );
}
