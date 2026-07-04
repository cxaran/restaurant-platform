import { notFound } from "next/navigation";

import { requireSession } from "@/core/auth/session";
import { ReportsView } from "./ReportsView";

// Reportes (admin): módulo de navegación especializado ("reportes"), fuera de
// la tabla genérica de recursos, con gate finances:read (mismo patrón que
// /admin/codigos-descuento). Las cifras son VENTAS REGISTRADAS por el sistema
// (dinero cobrado en pedidos), no utilidad ni contabilidad.

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const session = await requireSession();
  const permissions = session.permissions ?? [];
  if (!permissions.includes("finances:read")) {
    notFound();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h1 style={{ margin: 0 }}>Reportes</h1>
      <p style={{ margin: 0, fontSize: 14, opacity: 0.75 }}>
        Ventas registradas por el sistema en el rango elegido. No es utilidad ni
        reporte contable.
      </p>
      <ReportsView />
    </div>
  );
}
