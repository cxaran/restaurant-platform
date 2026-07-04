import { redirect } from "next/navigation";

import {
  AuthDivider,
  AuthLink,
  GoogleAuthButton,
  PublicAuthShell,
} from "@/features/auth/PublicAuthShell";
import { RequestTokenForm } from "@/features/auth/RequestTokenForm";
import { getAuthPolicy } from "@/core/auth/policy-client";
import { getSession } from "@/core/auth/session";

export const dynamic = "force-dynamic";

/**
 * Registro de cliente según el handoff Tony-Tony (Turno 10, escenas 10a móvil /
 * 10b web): título display, insignia de créditos, «Continuar con Google» primero
 * (solo si la política lo publica) y el formulario debajo. El flujo real sigue
 * siendo el de la plataforma (token por correo, dos pasos) — la escena es
 * referencia visual, no un cambio de contrato.
 */
export default async function RegisterPage() {
  if (await getSession()) {
    redirect("/");
  }
  const policy = await getAuthPolicy();
  if (!policy.registration_enabled) {
    redirect("/login");
  }

  return (
    <PublicAuthShell
      title="Crea tu cuenta"
      badge="Gana créditos en cada pedido"
      description="Te enviaremos un token por correo para confirmar tu registro."
      footer={
        <>
          ¿Ya tienes cuenta? <AuthLink href="/login">Inicia sesión</AuthLink>
        </>
      }
    >
      {policy.google_login_enabled ? (
        <>
          <GoogleAuthButton />
          <AuthDivider>o con tu correo</AuthDivider>
        </>
      ) : null}
      <RequestTokenForm mode="register" />
    </PublicAuthShell>
  );
}
