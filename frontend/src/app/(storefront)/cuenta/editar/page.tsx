import Link from "next/link";
import { redirect } from "next/navigation";

import { AccountEditor } from "@/components/account/AccountEditor";
import { getProfile } from "@/core/auth/account-client";
import { getSession } from "@/core/auth/session";

export const dynamic = "force-dynamic";

// Edición de identidad del CLIENTE en el shell público (misma banda visual de
// /cuenta): reusa el editor compartido de la plataforma — el cliente nunca
// aterriza en /admin para cambiar su correo o contraseña.
export default async function CuentaEditarPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/cuenta/editar");
  }
  const profile = await getProfile();

  return (
    <div className="sf-container" style={{ paddingBlock: 28, maxWidth: 720 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <nav aria-label="Regresar">
          <Link className="sf-band-link" href="/cuenta">
            ← Mi cuenta
          </Link>
        </nav>
        <h1 className="sf-display" style={{ fontSize: 22, margin: 0 }}>
          Editar mis datos
        </h1>
        <AccountEditor profile={profile} />
      </div>
    </div>
  );
}
