import Link from "next/link";

import { requireSession } from "@/core/auth/session";
import { DeliveryDetail } from "./DeliveryDetail";

export const dynamic = "force-dynamic";

// Detalle de UNA entrega del repartidor autenticado. Permite recuperar la
// entrega activa tras un refresh o al compartir el link; el backend solo
// devuelve entregas propias en /courier/deliveries/mine, así que esta ruta
// jamás revela datos ajenos.
export default async function PanelRepartoDetailPage({
  params,
}: Readonly<{ params: Promise<{ delivery_id: string }> }>) {
  await requireSession();
  const { delivery_id } = await params;
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Entrega</h1>
        <Link href="/panel/reparto" style={{ fontSize: 13, fontWeight: 700 }}>Reparto</Link>
        <Link href="/panel" style={{ fontSize: 13, fontWeight: 700 }}>Panel</Link>
      </header>
      <DeliveryDetail deliveryId={delivery_id} />
    </main>
  );
}
