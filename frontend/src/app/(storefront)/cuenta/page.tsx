import { redirect } from "next/navigation";

import { getSession } from "@/core/auth/session";

export const dynamic = "force-dynamic";

// Ruta pública canónica de la cuenta. TEMPORAL (documentado en el plan): la UI
// de perfil vive todavía en el shell administrativo (/admin/account); cuando
// se construya la cuenta del cliente en el shell público, esta redirección
// desaparece sin cambiar la URL canónica /cuenta.
export default async function CuentaPage() {
  const session = await getSession();
  redirect(session ? "/admin/account" : "/login?next=/cuenta");
}
