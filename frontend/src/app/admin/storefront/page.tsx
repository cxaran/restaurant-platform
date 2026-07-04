import { requireSession } from "@/core/auth/session";
import { StorefrontAdminView } from "./StorefrontAdminView";

export const dynamic = "force-dynamic";

// Nota (plan §2): esta página no aparece en la navegación del shell porque la
// nav es contract-driven y el dominio aún no registra ResourceDefinition.
export default async function StorefrontAdminPage() {
  const session = await requireSession();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h1 style={{ margin: 0 }}>Sitio público</h1>
      <p style={{ margin: 0, fontSize: 14, opacity: 0.75 }}>
        Editor visual: secciones con formularios generados desde los contratos del backend,
        imágenes por slot, orden, layout, tema, preview y publicación.
      </p>
      <StorefrontAdminView permissions={session.permissions ?? []} />
    </div>
  );
}
