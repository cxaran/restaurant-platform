"use client";

import type {
  HttpMethod,
  ResourceFormCapability,
} from "@/core/api/contracts";
import type { ApiRequestError } from "@/core/api/api-error";
import { browserApi } from "@/core/api/browser-client";

/**
 * Mensaje para un 403 en una MUTACIÓN. Nunca se traga en silencio: un 403 aquí
 * puede ser pérdida real de permiso, pero también un rechazo CSRF por origen no
 * confiable (``csrf_origin_invalid``) — si se redirige sin avisar, el usuario
 * cree que guardó y el cambio jamás se aplicó.
 */
export function forbiddenMutationMessage(error: ApiRequestError): string {
  if (error.body.code === "csrf_origin_invalid") {
    return (
      "El servidor rechazó el origen de la solicitud (CSRF). Recarga la página; " +
      "si persiste, el dominio desde el que navegas no está en los orígenes " +
      "confiables del backend (TRUSTED_BROWSER_ORIGINS)."
    );
  }
  return "No tienes permiso para realizar esta acción.";
}

function assertInternalApiPath(path: string): void {
  if (
    !path.startsWith("/api/") ||
    path.startsWith("//") ||
    path.includes("://") ||
    path.includes("?") ||
    path.includes("#")
  ) {
    throw new Error("Ruta de mutación inválida.");
  }
}

export function createResource(
  form: ResourceFormCapability,
  payload: Record<string, unknown> | FormData,
): Promise<unknown> {
  assertInternalApiPath(form.url_template);
  // El request layer envía ``FormData`` como ``multipart/form-data`` (sin fijar el
  // content-type, dejando el boundary al navegador) y el resto como JSON.
  return browserApi<unknown>(form.url_template, {
    method: form.method,
    body: payload,
  });
}

/**
 * Actualización de un recurso: envía el payload allowlisted con el método y la URL
 * declarados por el contrato. La URL ya viene resuelta (placeholder sustituido).
 */
export function updateResource(
  url: string,
  method: HttpMethod,
  payload: Record<string, unknown>,
): Promise<unknown> {
  assertInternalApiPath(url);
  return browserApi<unknown>(url, {
    method,
    body: payload,
  });
}

/**
 * Reemplazo atómico de una relación: envía la lista completa de valores objetivo en
 * el campo declarado por el contrato. La ruta ya viene resuelta (``{id}`` sustituido)
 * y se valida como path interno antes de usarse.
 */
export function replaceRelation(
  url: string,
  method: HttpMethod,
  requestField: string,
  values: readonly string[],
): Promise<unknown> {
  assertInternalApiPath(url);
  return browserApi<unknown>(url, {
    method,
    body: { [requestField]: values },
  });
}
