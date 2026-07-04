import { redirect } from "next/navigation";

import {
  AuthDivider,
  AuthLink,
  GoogleAuthButton,
  PublicAuthShell,
} from "@/features/auth/PublicAuthShell";
import { HighlightBanner } from "@/components/storefront/Highlights";
import { RequestTokenForm } from "@/features/auth/RequestTokenForm";
import { getAuthPolicy } from "@/core/auth/policy-client";
import { getSession } from "@/core/auth/session";
import { getPublicHighlights } from "@/core/restaurant-api/storefront";

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
  // Destacado configurable del registro (slot fijo sobre el formulario).
  const highlights = await getPublicHighlights("register");

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
      {highlights.length > 0 ? (
        <div className="mb-4">
          <HighlightBanner highlight={highlights[0]} variant="card" />
        </div>
      ) : null}
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
