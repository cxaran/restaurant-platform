import Link from "next/link";

import { requireSession } from "@/core/auth/session";
import { TicketView } from "./TicketView";

export const dynamic = "force-dynamic";

export default async function PanelTicketsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ order?: string }> }>) {
  const session = await requireSession();
  const { order } = await searchParams;
  const allowed = (session.permissions ?? []).includes("tickets:print");
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Tickets</h1>
        <Link href="/panel/pedidos" style={{ fontSize: 13, fontWeight: 700 }}>Pedidos</Link>
      </header>
      {!allowed ? (
        <p style={{ fontWeight: 700 }}>Se requiere el permiso tickets:print.</p>
      ) : order ? (
        <TicketView orderId={order} />
      ) : (
        <p style={{ fontSize: 14, opacity: 0.8 }}>
          Abre un ticket desde la cola de <Link href="/panel/pedidos">pedidos</Link> (botón
          «Ticket» en cada pedido).
        </p>
      )}
    </main>
  );
}
