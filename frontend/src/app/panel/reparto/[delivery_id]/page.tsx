import Link from "next/link";

import { requireSession } from "@/core/auth/session";
import { DeliveryDetail } from "./DeliveryDetail";

export const dynamic = "force-dynamic";

// Detalle de UNA entrega del repartidor autenticado. Permite recuperar la
// entrega activa tras un refresh o al compartir el link; el backend solo
// devuelve entregas propias en /courier/deliveries/mine, así que esta ruta
// jamás revela datos ajenos. El shell del panel (TTShell) ya aporta <main>.
export default async function PanelRepartoDetailPage({
  params,
}: Readonly<{ params: Promise<{ delivery_id: string }> }>) {
  await requireSession();
  const { delivery_id } = await params;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
      <h1 className="sr-only">Entrega</h1>
      <Link href="/panel/reparto" className="tt-btn tt-btn-ghost self-start">
        ← Mi cola de reparto
      </Link>
      <DeliveryDetail deliveryId={delivery_id} />
    </div>
  );
}
