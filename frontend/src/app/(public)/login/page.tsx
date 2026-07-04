import { redirect } from "next/navigation";

import {
  AuthAlert,
  AuthDivider,
  AuthLink,
  GoogleAuthButton,
  PublicAuthShell,
} from "@/features/auth/PublicAuthShell";
import { HighlightBanner } from "@/components/storefront/Highlights";
import { LoginForm } from "@/features/auth/LoginForm";
import { getAuthPolicy } from "@/core/auth/policy-client";
import { getSession } from "@/core/auth/session";
import { getBootstrapStatus } from "@/core/bootstrap/bootstrap-server";
import { getPublicHighlights } from "@/core/restaurant-api/storefront";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ error?: string }> }>) {
  const session = await getSession();
  if (session) {
    redirect("/");
  }

  const status = await getBootstrapStatus();
  if (status.setup_required) {
    redirect("/setup");
  }

  // El frontend no asume signup público: muestra los enlaces solo si el backend
  // publica que el flujo correspondiente está habilitado.
  const policy = await getAuthPolicy();
  // Marcador genérico del callback de Google (la causa real queda en los logs).
  const { error } = await searchParams;
  // Destacado configurable del login (slot fijo sobre el formulario).
  const highlights = await getPublicHighlights("login");

  return (
    <PublicAuthShell title="Iniciar sesión">
      {highlights.length > 0 ? (
        <div className="mb-4">
          <HighlightBanner highlight={highlights[0]} variant="card" />
        </div>
      ) : null}
      {error === "google" ? (
        <div className="mb-4">
          <AuthAlert tone="danger">
            No se pudo iniciar sesión con Google. Intenta de nuevo o entra con tu
            contraseña.
          </AuthAlert>
        </div>
      ) : null}
      <LoginForm />
      {policy.google_login_enabled ? (
        <>
          <AuthDivider>o</AuthDivider>
          <GoogleAuthButton />
        </>
      ) : null}
      <div className="mt-6 space-y-2 text-sm text-[var(--tx2)]">
        {policy.password_reset_enabled ? (
          <p>
            <AuthLink href="/forgot-password">¿Olvidaste tu contraseña?</AuthLink>
          </p>
        ) : null}
        {policy.registration_enabled ? (
          <p>
            ¿No tienes cuenta? <AuthLink href="/register">Crear cuenta</AuthLink>
          </p>
        ) : null}
        {/* El desbloqueo no depende de la política: el correo de bloqueo siempre envía token. */}
        <p>
          ¿Cuenta bloqueada? <AuthLink href="/unlock">Desbloquear con token</AuthLink>
        </p>
      </div>
    </PublicAuthShell>
  );
}
