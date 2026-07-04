import { requireSession } from "@/core/auth/session";
import { StorefrontAdminView } from "./StorefrontAdminView";

export const dynamic = "force-dynamic";

// Nota (plan §2): esta página no aparece en la navegación del shell porque la
// nav es contract-driven y el dominio aún no registra ResourceDefinition.
export default async function StorefrontAdminPage() {
  const session = await requireSession();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <h1 className="tt-display" style={{ margin: 0, fontSize: 24 }}>Editor del sitio</h1>
        <p style={{ margin: 0, fontSize: 13, color: "var(--tx2)" }}>
          Banners, heros y elementos por plantilla · los cambios se ven en la vista previa
          antes de publicar.
        </p>
      </div>
      <StorefrontAdminView permissions={session.permissions ?? []} />
    </div>
  );
}
