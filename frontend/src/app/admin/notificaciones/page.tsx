import Link from "next/link";

import { requireSession } from "@/core/auth/session";
import { NotificationsAdminView } from "./NotificationsAdminView";

export const dynamic = "force-dynamic";

// Panel de difusión del administrador: envía una notificación (campana +
// correo) a la audiencia elegida. El backend revalida notifications:send.
export default async function NotificacionesAdminPage() {
  const session = await requireSession();
  const permissions = session.permissions ?? [];
  if (!permissions.includes("notifications:send")) {
    return (
      <div className="tt-card" style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
        <p style={{ margin: 0, fontWeight: 700 }}>
          No tienes permiso para enviar notificaciones.
        </p>
        <Link href="/admin" className="tt-btn tt-btn-ghost">
          Volver al resumen
        </Link>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <h1 className="tt-display" style={{ margin: 0, fontSize: 24 }}>Notificaciones</h1>
        <p style={{ margin: 0, fontSize: 13, color: "var(--tx2)" }}>
          Envía promociones y avisos a tus usuarios · cada envío llega a la campana
          del sitio y al correo de cada persona.
        </p>
      </div>
      <NotificationsAdminView />
    </div>
  );
}
