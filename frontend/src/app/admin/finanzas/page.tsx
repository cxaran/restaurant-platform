import { notFound } from "next/navigation";

import { requireSession } from "@/core/auth/session";
import { FinanzasView } from "./FinanzasView";

// Finanzas (admin): resumen del periodo, libro de movimientos con filtros,
// alta de gastos/ingresos manuales con comprobante y anulación con motivo.
// Gate finances:read (módulo de navegación "finanzas"); registrar y anular
// revalidan finances:record / finances:void en el backend.

export const dynamic = "force-dynamic";

export default async function FinanzasPage() {
  const session = await requireSession();
  const permissions = session.permissions ?? [];
  if (!permissions.includes("finances:read")) {
    notFound();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <header>
        <h1 className="tt-display" style={{ margin: 0, fontSize: 24 }}>
          Finanzas
        </h1>
        <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--muted-btn-tx)" }}>
          Libro de movimientos del negocio: cobros del sistema, gastos e
          ingresos manuales y devoluciones. Anular deja historial, nunca borra.
        </p>
      </header>
      <FinanzasView
        canRecord={permissions.includes("finances:record")}
        canVoid={permissions.includes("finances:void")}
      />
    </div>
  );
}
