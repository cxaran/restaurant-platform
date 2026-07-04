import { AccountEditor } from "@/components/account/AccountEditor";
import { getProfile } from "@/core/auth/account-client";
import { requireSession } from "@/core/auth/session";

export const dynamic = "force-dynamic";

// Identidad propia del EMPLEADO dentro del panel operativo: reusa el editor
// compartido de la plataforma (mismas reglas que /cuenta/editar y
// /admin/account) sin sacar al empleado de su shell.
export default async function PanelCuentaPage() {
  await requireSession();
  const profile = await getProfile();

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
      <header>
        <h1 className="tt-display" style={{ margin: 0, fontSize: 22 }}>Mi cuenta</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--tx3)" }}>
          Administra tus datos personales y tu contraseña.
        </p>
      </header>
      <AccountEditor profile={profile} />
    </div>
  );
}
