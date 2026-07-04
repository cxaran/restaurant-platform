"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { logout } from "@/core/auth/account-mutation-client";

/**
 * Controles de identidad del shell autenticado: acceso a "Mi cuenta" y cierre de
 * sesión. El logout llama al backend (borra la cookie httponly) y redirige a login;
 * cualquier error igualmente termina en login para no dejar al usuario atrapado.
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
    <div className="flex items-center gap-3">
      <Link
        href="/admin/account"
        className="text-sm font-medium text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
      >
        Mi cuenta
      </Link>
      <button
        type="button"
        onClick={onLogout}
        disabled={pending}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Cerrando..." : "Cerrar sesión"}
      </button>
    </div>
  );
}
