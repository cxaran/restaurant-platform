"use client";

// Cliente de la configuración del sistema (/admin/sistema). El singleton se lee
// en dos pasos porque el detalle SEGURO (flags *_configured, motivos derivados)
// vive en GET /{id}: la lista da el id, el detalle da el estado completo. El
// PATCH y las acciones devuelven ya el read completo, así que la vista se
// refresca con su respuesta sin volver a pedir la lista.

import { browserApi } from "@/core/api/browser-client";
import type {
  SendTestEmailRequest,
  SystemSettingsListItem,
  SystemSettingsRead,
  SystemSettingsUpdate,
  VerifyDomainRequest,
} from "@/core/restaurant-api/contracts";

type SystemSettingsListPage = { items: SystemSettingsListItem[] };

/** Lee el singleton completo: lista (una fila) → id → detalle seguro. */
export async function getSystemSettings(): Promise<SystemSettingsRead> {
  const page = await browserApi<SystemSettingsListPage>("/api/v1/system-settings");
  const id = page.items[0]?.id;
  if (!id) {
    throw new Error("No se encontró la configuración del sistema.");
  }
  return browserApi<SystemSettingsRead>(
    `/api/v1/system-settings/${encodeURIComponent(id)}`,
  );
}

export function updateSystemSettings(
  id: string,
  body: SystemSettingsUpdate,
): Promise<SystemSettingsRead> {
  return browserApi<SystemSettingsRead>(
    `/api/v1/system-settings/${encodeURIComponent(id)}`,
    { method: "PATCH", body },
  );
}

export function verifyDomain(
  id: string,
  body: VerifyDomainRequest,
): Promise<SystemSettingsRead> {
  return browserApi<SystemSettingsRead>(
    `/api/v1/system-settings/${encodeURIComponent(id)}/verify-domain`,
    { method: "POST", body },
  );
}

export function sendTestEmail(
  id: string,
  body: SendTestEmailRequest,
): Promise<SystemSettingsRead> {
  return browserApi<SystemSettingsRead>(
    `/api/v1/system-settings/${encodeURIComponent(id)}/send-test-email`,
    { method: "POST", body },
  );
}
