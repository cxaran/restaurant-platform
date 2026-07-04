import Link from "next/link";
import { cookies } from "next/headers";

import { requireSession } from "@/core/auth/session";
import type { NavigationModule, ResourceCatalog } from "@/core/api/contracts";
import { serverApi } from "@/core/api/server-client";

export const dynamic = "force-dynamic";

// /panel: entorno OPERATIVO diario (cajero, cocina, reparto, supervisor).
// No es un admin reducido ni una app por rol: los módulos vienen del catálogo
// de navegación del backend (GET /api/v1/resources → navigation_modules con
// section === "panel"), ya proyectados por permisos. El cliente NO decide
// permisos ni conoce URLs especializadas: si el backend lo devuelve, se
// muestra; la autorización real sigue siendo del backend en cada llamada.

// Descripciones puramente COSMÉTICAS por nombre de módulo (no autorizan ni
// enrutan nada); un módulo nuevo del backend se muestra igual sin detalle.
const MODULE_DETAILS: Record<string, string> = {
  pedidos: "Cola en vivo con transiciones por permiso.",
  pos: "Venta de mostrador en una llamada.",
  entregas: "Despacho: cola de envíos listos y asignación manual de repartidor.",
  reparto: "Cola de envíos, entrega en curso y resumen del día.",
  tickets: "Reimpresión de tickets con bitácora.",
};

async function getPanelModules(): Promise<NavigationModule[] | null> {
  try {
    const catalog = await serverApi<ResourceCatalog>("/api/v1/resources", {
      cookie: (await cookies()).toString(),
    });
    return catalog.navigation_modules.filter((module_) => module_.section === "panel");
  } catch {
    // Sin catálogo no se inventa una lista local: se informa el error.
    return null;
  }
}

export default async function PanelPage() {
  const session = await requireSession();
  const modules = await getPanelModules();

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <header>
        <h1 className="tt-display" style={{ margin: 0, fontSize: 26 }}>Panel de operación</h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--tx3)" }}>
          {session.name} · módulos según tus permisos
        </p>
      </header>

      {modules === null ? (
        <div role="alert" className="tt-card" style={{ borderColor: "var(--accent-bd)", padding: 22 }}>
          <p style={{ margin: "0 0 10px", fontWeight: 600 }}>
            No fue posible cargar el catálogo de módulos. Intenta de nuevo más tarde.
          </p>
          <Link href="/panel" style={{ fontWeight: 700, color: "var(--accent)" }}>Reintentar</Link>
        </div>
      ) : modules.length === 0 ? (
        <div className="tt-card" style={{ padding: 22 }}>
          <p style={{ margin: "0 0 10px", fontWeight: 600 }}>
            Tu cuenta no tiene módulos operativos asignados.
          </p>
          <Link href="/" style={{ fontWeight: 700, color: "var(--accent)" }}>Ir al sitio</Link>
        </div>
      ) : (
        modules.map((module_) => (
          <Link
            key={module_.name}
            href={module_.href}
            className="tt-card"
            style={{ padding: "16px 18px", textDecoration: "none", color: "inherit", display: "block" }}
          >
            <span style={{ fontWeight: 800 }}>{module_.label}</span>
            {MODULE_DETAILS[module_.name] ? (
              <span style={{ display: "block", fontSize: 13, color: "var(--tx3)" }}>
                {MODULE_DETAILS[module_.name]}
              </span>
            ) : null}
          </Link>
        ))
      )}

      <nav style={{ display: "flex", gap: 16, fontSize: 14, fontWeight: 600 }}>
        <Link href="/" style={{ color: "var(--tx2)" }}>Sitio público</Link>
        <Link href="/admin" style={{ color: "var(--tx2)" }}>Administración</Link>
      </nav>
    </div>
  );
}
