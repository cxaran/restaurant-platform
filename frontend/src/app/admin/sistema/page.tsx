import { notFound } from "next/navigation";

import { requireSession } from "@/core/auth/session";
import { SistemaView } from "./SistemaView";

// Configuración del sistema (admin): página especializada del singleton
// system_settings, fuera de la tabla genérica de recursos. Registro/acceso,
// sesiones, transporte de correo, analítica (GA4), inicio de sesión con Google y
// dominio, cada uno con su explicación. La edición exige system_settings:configure.

export const dynamic = "force-dynamic";

export default async function SistemaPage() {
  const session = await requireSession();
  const permissions = session.permissions ?? [];
  if (!permissions.includes("system_settings:read")) {
    notFound();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h1 style={{ margin: 0 }}>Sistema</h1>
      <p style={{ margin: 0, fontSize: 14, opacity: 0.75 }}>
        Política del sistema: registro y acceso, duración de sesiones, correo
        saliente, analítica del sitio, inicio de sesión con Google y dominio.
        Cada bloque se guarda por separado.
      </p>
      <SistemaView canEdit={permissions.includes("system_settings:configure")} />
    </div>
  );
}
