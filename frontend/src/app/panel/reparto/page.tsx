import Link from "next/link";

import { requireSession } from "@/core/auth/session";
import { RepartoView } from "./RepartoView";

export const dynamic = "force-dynamic";

export default async function PanelRepartoPage() {
  await requireSession();
  // La capacidad real (can_deliver) la valida el backend en cada endpoint del
  // courier; aquí solo se exige sesión para no filtrar nada por adelantado.
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Reparto</h1>
        <Link href="/panel" style={{ fontSize: 13, fontWeight: 700 }}>Panel</Link>
      </header>
      <RepartoView />
    </main>
  );
}
