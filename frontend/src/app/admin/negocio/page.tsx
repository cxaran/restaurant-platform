import { notFound } from "next/navigation";

import { requireSession } from "@/core/auth/session";
import { NegocioView } from "./NegocioView";

// Configuración del negocio (admin): página especializada (como /admin/backups
// y /admin/codigos-descuento, fuera de la tabla genérica de recursos). Perfil,
// política de pedidos, teléfonos, horario semanal y fechas especiales.

export const dynamic = "force-dynamic";

export default async function NegocioPage() {
  const session = await requireSession();
  const permissions = session.permissions ?? [];
  if (!permissions.includes("business:read")) {
    notFound();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h1 style={{ margin: 0 }}>Negocio</h1>
      <p style={{ margin: 0, fontSize: 14, opacity: 0.75 }}>
        Configuración base del negocio: identidad pública, política de pedidos,
        teléfonos de contacto, horario semanal y fechas especiales.
      </p>
      <NegocioView canEdit={permissions.includes("business:update")} />
    </div>
  );
}
