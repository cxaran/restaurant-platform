"use client";

// Cliente de la configuración del negocio (/admin/negocio). Contratos
// generados (aliases en restaurant-api/contracts.ts); los errores llegan como
// ApiRequestError con el envelope {code, message, errors}.

import { browserApi } from "@/core/api/browser-client";
import type {
  BusinessPhoneCreate,
  BusinessPhoneRead,
  BusinessPhoneUpdate,
  BusinessProfileRead,
  BusinessProfileUpdate,
  BusinessSettingsRead,
  BusinessSettingsUpdate,
  SpecialDateCreate,
  SpecialDateRead,
  WeeklyHourRead,
  WeeklyHoursReplace,
} from "@/core/restaurant-api/contracts";

// --- Perfil (singleton) ---

export function getBusinessProfile(): Promise<BusinessProfileRead> {
  return browserApi<BusinessProfileRead>("/api/v1/business/profile");
}

export function updateBusinessProfile(
  body: BusinessProfileUpdate,
): Promise<BusinessProfileRead> {
  return browserApi<BusinessProfileRead>("/api/v1/business/profile", {
    method: "PATCH",
    body,
  });
}

/**
 * Sube el logo como archivo almacenado (perfil ``image``: png/webp/jpeg, 5 MB;
 * el backend valida por contenido) y regresa el id para ``logo_file_id``.
 */
export async function uploadBusinessLogo(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", "image");
  const stored = await browserApi<{ id: string }>("/api/v1/files", {
    method: "POST",
    body: form,
  });
  return stored.id;
}

// --- Política operativa (singleton) ---

export function getBusinessSettings(): Promise<BusinessSettingsRead> {
  return browserApi<BusinessSettingsRead>("/api/v1/business/settings");
}

export function updateBusinessSettings(
  body: BusinessSettingsUpdate,
): Promise<BusinessSettingsRead> {
  return browserApi<BusinessSettingsRead>("/api/v1/business/settings", {
    method: "PATCH",
    body,
  });
}

// --- Teléfonos ---

export function listBusinessPhones(): Promise<BusinessPhoneRead[]> {
  return browserApi<BusinessPhoneRead[]>("/api/v1/business/phones");
}

export function createBusinessPhone(
  body: BusinessPhoneCreate,
): Promise<BusinessPhoneRead> {
  return browserApi<BusinessPhoneRead>("/api/v1/business/phones", {
    method: "POST",
    body,
  });
}

export function updateBusinessPhone(
  phoneId: string,
  body: BusinessPhoneUpdate,
): Promise<BusinessPhoneRead> {
  return browserApi<BusinessPhoneRead>(
    `/api/v1/business/phones/${encodeURIComponent(phoneId)}`,
    { method: "PATCH", body },
  );
}

/** El DELETE del contrato desactiva el teléfono (soft delete). */
export function deactivateBusinessPhone(phoneId: string): Promise<BusinessPhoneRead> {
  return browserApi<BusinessPhoneRead>(
    `/api/v1/business/phones/${encodeURIComponent(phoneId)}`,
    { method: "DELETE" },
  );
}

// --- Horario semanal (el PUT reemplaza el set completo) ---

export function listWeeklyHours(): Promise<WeeklyHourRead[]> {
  return browserApi<WeeklyHourRead[]>("/api/v1/business/weekly-hours");
}

export function replaceWeeklyHours(
  body: WeeklyHoursReplace,
): Promise<WeeklyHourRead[]> {
  return browserApi<WeeklyHourRead[]>("/api/v1/business/weekly-hours", {
    method: "PUT",
    body,
  });
}

// --- Fechas especiales ---

export function listSpecialDates(): Promise<SpecialDateRead[]> {
  return browserApi<SpecialDateRead[]>("/api/v1/business/special-dates");
}

export function createSpecialDate(body: SpecialDateCreate): Promise<SpecialDateRead> {
  return browserApi<SpecialDateRead>("/api/v1/business/special-dates", {
    method: "POST",
    body,
  });
}

export function deleteSpecialDate(specialDateId: string): Promise<void> {
  return browserApi<void>(
    `/api/v1/business/special-dates/${encodeURIComponent(specialDateId)}`,
    { method: "DELETE" },
  );
}
