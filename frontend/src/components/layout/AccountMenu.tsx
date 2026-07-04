"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { logout } from "@/core/auth/account-mutation-client";

function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

/**
 * Controles de identidad del shell autenticado: acceso a "Mi cuenta" y cierre de
 * sesión. Viven en el pie de la sidebar café oscura (TTShell), por eso usan los
 * tokens --side-* como iconos compactos. El logout llama al backend (borra la
 * cookie httponly) y redirige a login; cualquier error igualmente termina en
 * login para no dejar al usuario atrapado.
 */
export function AccountMenu() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onLogout() {
    if (pending) return;
    setPending(true);
    try {
      await logout();
    } catch {
      // El logout es idempotente desde la perspectiva del usuario: ante cualquier
      // error igual se le envía a login.
    }
    router.replace("/login");
  }

  return (
    <div className="flex items-center gap-1">
      <Link
        href="/admin/account"
        title="Mi cuenta"
        aria-label="Mi cuenta"
        className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--side-border)] text-[var(--side-tx)] transition hover:bg-white/10 hover:text-[var(--side-strong)]"
      >
        <UserIcon />
      </Link>
      <button
        type="button"
        onClick={onLogout}
        disabled={pending}
        title={pending ? "Cerrando..." : "Cerrar sesión"}
        aria-label="Cerrar sesión"
        className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--side-border)] text-[var(--side-tx)] transition hover:bg-white/10 hover:text-[var(--side-strong)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <LogoutIcon />
      </button>
    </div>
  );
}
