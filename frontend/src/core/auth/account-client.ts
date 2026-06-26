import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ApiRequestError } from "@/core/api/api-error";
import type { UserProfileRead } from "@/core/api/contracts";
import { serverApi } from "@/core/api/server-client";

/**
 * Perfil del usuario autenticado resuelto en servidor (cookie reenviada, no-store).
 * 401 → ``/login``; el resto se propaga a la error boundary.
 */
export async function getProfile(): Promise<UserProfileRead> {
  try {
    return await serverApi<UserProfileRead>("/api/v1/users/me", {
      cookie: (await cookies()).toString(),
    });
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      redirect("/login");
    }
    throw error;
  }
}
