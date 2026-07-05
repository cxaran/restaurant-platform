import { redirect } from "next/navigation";

import { AuthLink, PublicAuthShell } from "@/features/auth/PublicAuthShell";
import { ResetPasswordForm } from "@/features/auth/ResetPasswordForm";
import { getAuthPolicy } from "@/core/auth/policy-client";
import { getSession } from "@/core/auth/session";

export const dynamic = "force-dynamic";

/**
 * Acepta ``?token=`` (el enlace del correo lo trae) para prellenar el campo;
 * pegar el token a mano sigue funcionando igual.
 */
export default async function ResetPasswordPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ token?: string }> }>) {
  if (await getSession()) {
    redirect("/");
  }
  const policy = await getAuthPolicy();
  if (!policy.password_reset_enabled) {
    redirect("/login");
  }
  const { token } = await searchParams;

  return (
    <PublicAuthShell
      title="Restablecer contraseña"
      description="Ingresa el token que recibiste por correo y tu nueva contraseña."
      footer={<AuthLink href="/login">Volver a iniciar sesión</AuthLink>}
    >
      <ResetPasswordForm initialToken={token ?? ""} />
    </PublicAuthShell>
  );
}
