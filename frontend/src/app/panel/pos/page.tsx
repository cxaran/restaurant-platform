import Link from "next/link";

import { requireSession } from "@/core/auth/session";
import { PosView } from "./PosView";

export const dynamic = "force-dynamic";

export default async function PanelPosPage() {
  const session = await requireSession();
  const permissions = new Set(session.permissions ?? []);
  const allowed = permissions.has("orders:capture") && permissions.has("payments:record");
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Punto de venta</h1>
        <Link href="/panel" style={{ fontSize: 13, fontWeight: 700 }}>Panel</Link>
        <Link href="/panel/pedidos" style={{ fontSize: 13, fontWeight: 700 }}>Pedidos</Link>
      </header>
      {allowed ? (
        <PosView />
      ) : (
        <p style={{ fontWeight: 700 }}>
          El POS requiere permisos de captura y cobro (orders:capture + payments:record).
        </p>
      )}
    </main>
  );
}
