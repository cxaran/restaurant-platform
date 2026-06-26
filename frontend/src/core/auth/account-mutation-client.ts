"use client";

import type { UserProfileRead } from "@/core/api/contracts";
import { browserApi } from "@/core/api/browser-client";

/** Actualiza campos propios de perfil (name/last_name/email). */
export function updateProfile(payload: {
  name?: string;
  last_name?: string;
  email?: string;
}): Promise<UserProfileRead> {
  return browserApi<UserProfileRead>("/api/v1/users/me", {
    method: "PATCH",
    body: payload,
  });
}

/** Cambia la contraseña propia (exige la actual). */
export function changePassword(payload: {
  current_password: string;
  password: string;
  confirm_password: string;
}): Promise<unknown> {
  return browserApi<unknown>("/api/v1/users/me/password", {
    method: "POST",
    body: payload,
  });
}

/** Cierra la sesión actual (borra la cookie httponly en el backend). */
export function logout(): Promise<unknown> {
  return browserApi<unknown>("/api/v1/auth/logout", { method: "POST" });
}
