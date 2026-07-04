import { requireSession } from "@/core/auth/session";
import { ZonaEntregaView } from "./ZonaEntregaView";

export const dynamic = "force-dynamic";

// Pantalla ESPECIALIZADA de zonas de entrega (spec: /admin/zona-entrega): el
// recurso delivery_zones sigue declarado en el registry (tabla genérica y
// permisos contract-driven); aquí vive lo que la tabla no puede hacer —
// dibujar cobertura en mapa, tarifas por zona y previsualizar cotizaciones.
// La navegación llega por el módulo "zona-entrega" de GET /api/v1/resources.
export default async function ZonaEntregaPage() {
  const session = await requireSession();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <h1 className="tt-display" style={{ margin: 0, fontSize: 24 }}>Zonas de entrega</h1>
        <p style={{ margin: 0, fontSize: 13, color: "var(--tx2)" }}>
          Cobertura sobre mapa, tarifas por zona y cotización de prueba · el costo final de
          cada pedido siempre lo decide el backend.
        </p>
      </div>
      <ZonaEntregaView permissions={session.permissions ?? []} />
    </div>
  );
}
