"use client";

// Cierre de sesión desde la cuenta PÚBLICA: mismo flujo que el panel (POST
// /api/v1/auth/logout vía account-mutation-client, borra la cookie httponly),
// pero con la identidad visual del sitio (tokens --sf-*, jamás paleta admin).

import { useRouter } from "next/navigation";
import { useState } from "react";

import { logout } from "@/core/auth/account-mutation-client";

export function CuentaLogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onLogout() {
    if (pending) return;
    setPending(true);
    try {
      await logout();
    } catch {
      // El logout es idempotente desde la perspectiva del usuario: ante
      // cualquier error igual se le regresa a la portada como visitante.
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      className="sf-btn-outline"
      onClick={onLogout}
      disabled={pending}
      style={{ fontSize: 14, padding: "10px 20px" }}
    >
      {pending ? "Cerrando…" : "Cerrar sesión"}
    </button>
  );
}
