import { redirect } from "next/navigation";

import { AuthLink, PublicAuthShell } from "@/features/auth/PublicAuthShell";
import { RegisterCompleteForm } from "@/features/auth/RegisterCompleteForm";
import { getAuthPolicy } from "@/core/auth/policy-client";
import { getSession } from "@/core/auth/session";

export const dynamic = "force-dynamic";

/**
 * Acepta ``?token=`` (el enlace del correo lo trae) para prellenar el campo;
 * pegar el token a mano sigue funcionando igual.
 */
export default async function RegisterCompletePage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ token?: string }> }>) {
  if (await getSession()) {
    redirect("/");
  }
  const policy = await getAuthPolicy();
  if (!policy.registration_enabled) {
    redirect("/login");
  }
  const { token } = await searchParams;

  return (
    <PublicAuthShell
      title="Confirmar registro"
      description="Ingresa el token que recibiste por correo y crea tu contraseña."
      footer={<AuthLink href="/login">Volver a iniciar sesión</AuthLink>}
    >
      <RegisterCompleteForm initialToken={token ?? ""} />
    </PublicAuthShell>
  );
}
