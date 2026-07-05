import Link from "next/link";

/**
 * Marco visual común a las páginas públicas de auth — re-skin del LOGIN del
 * handoff de diseño (Turno 8, escenas 8a/8b): la MARCA vive en el layout del
 * grupo (public) (panel oscuro con identidad dinámica del negocio); aquí solo
 * queda la columna del formulario sobre la superficie del tema — título en
 * tipografía display y contenido directo, sin tarjeta ni orbes. SÓLO
 * presentación (tokens `--sf-*` remapeados en `.sf-auth`, sin lógica de auth):
 * cada página inyecta su formulario como ``children`` sin cambios de
 * comportamiento.
 */
export function PublicAuthShell({
  title,
  badge,
  description,
  children,
  footer,
}: Readonly<{
  title: string;
  badge?: React.ReactNode;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}>) {
  return (
    <section className="sf-auth-card">
      <header className="sf-auth-head">
        <h1 className="sf-display sf-auth-title">{title}</h1>
        {badge ? <span className="sf-auth-badge">{badge}</span> : null}
        {description ? <p className="sf-auth-desc">{description}</p> : null}
      </header>
      {children}
      {footer ? <div className="sf-auth-footer">{footer}</div> : null}
    </section>
  );
}

/**
 * Separador con texto de las escenas 8a/10a («o», «o con tus datos»). Solo
 * decorativo: los lectores de pantalla no lo necesitan para entender el flujo.
 */
export function AuthDivider({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="my-4 flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-[var(--border2)]" />
      <span className="text-xs font-bold text-[var(--tx3)]">{children}</span>
      <span className="h-px flex-1 bg-[var(--border2)]" />
    </div>
  );
}

/**
 * Botón «Continuar con Google» (escenas 8a/10a): navegación completa (no fetch),
 * el backend responde 302 a Google. Compartido por login y registro; mostrarlo
 * SOLO cuando la política publica google_login_enabled.
 */
export function GoogleAuthButton() {
  return (
    <a
      href="/api/v1/auth/google/start"
      className="flex w-full items-center justify-center gap-2.5 rounded-[13px] border border-[var(--border2)] bg-[var(--bg2)] px-4 py-2.5 text-sm font-medium text-[var(--tx)] transition hover:border-[var(--accent-bd)]"
    >
      <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.25 1.05-3.72 1.05-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38z"
        />
      </svg>
      Continuar con Google
    </a>
  );
}

export function AuthLink({ href, children }: Readonly<{ href: string; children: React.ReactNode }>) {
  return (
    <Link
      href={href}
      className="font-semibold text-[var(--accent-tx)] underline-offset-2 hover:underline"
    >
      {children}
    </Link>
  );
}

/**
 * Mensaje de estado en bloque (error/ok) con tokens de tema. Reutilizable por los
 * formularios públicos para no duplicar estilos; soporta light y dark.
 */
export function AuthAlert({
  tone,
  role = "status",
  children,
}: Readonly<{ tone: "danger" | "ok"; role?: "alert" | "status"; children: React.ReactNode }>) {
  const toneClass =
    tone === "danger"
      ? "border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-[var(--danger)]"
      : "border-[color-mix(in_srgb,var(--ok)_35%,transparent)] bg-[color-mix(in_srgb,var(--ok)_13%,transparent)] text-[var(--ok)]";
  return (
    <div role={role} className={`rounded-[11px] border px-4 py-3 text-sm ${toneClass}`}>
      {children}
    </div>
  );
}

/** Label estándar de los formularios públicos. */
export function AuthLabel({
  htmlFor,
  children,
}: Readonly<{ htmlFor: string; children: React.ReactNode }>) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium text-[var(--tx2)]">
      {children}
    </label>
  );
}
