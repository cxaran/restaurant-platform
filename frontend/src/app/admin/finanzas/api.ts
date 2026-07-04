"use client";

// Cliente del módulo Finanzas (/admin/finanzas). Contratos SOLO de
// src/generated/openapi.ts; los errores llegan como ApiRequestError con el
// envelope {code, message, errors}.

import { browserApi } from "@/core/api/browser-client";
import type { components } from "@/generated/openapi";

export type FinancialEntry = components["schemas"]["FinancialEntryRead"];
export type FinancialEntryCreate = components["schemas"]["FinancialEntryCreate"];
export type FinancialEntryAttachmentCreate =
  components["schemas"]["FinancialEntryAttachmentCreate"];
export type BusinessSummary = components["schemas"]["BusinessSummaryRead"];
export type FinanceCategory = components["schemas"]["FinancialCategoryListItem"];
type CategoriesPage = components["schemas"]["OffsetPage_FinancialCategoryListItem_"];

export type EntryFilters = {
  fromIso?: string;
  toIso?: string;
  direction?: string;
  entryType?: string;
};

function entryParams(filters: EntryFilters, limit: number, offset: number): string {
  const params = new URLSearchParams();
  if (filters.fromIso) params.set("from", filters.fromIso);
  if (filters.toIso) params.set("to", filters.toIso);
  if (filters.direction) params.set("direction", filters.direction);
  if (filters.entryType) params.set("entry_type", filters.entryType);
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  return params.toString();
}

export function listEntries(
  filters: EntryFilters,
  limit: number,
  offset: number,
): Promise<FinancialEntry[]> {
  return browserApi<FinancialEntry[]>(`/api/v1/finances/entries?${entryParams(filters, limit, offset)}`);
}

export function getSummary(fromIso: string, toIso: string): Promise<BusinessSummary> {
  const params = new URLSearchParams({ from: fromIso, to: toIso });
  return browserApi<BusinessSummary>(`/api/v1/finances/summary?${params.toString()}`);
}

export function createEntry(body: FinancialEntryCreate): Promise<FinancialEntry> {
  return browserApi<FinancialEntry>("/api/v1/finances/entries", { method: "POST", body });
}

export function voidEntry(entryId: string, reason: string): Promise<FinancialEntry> {
  return browserApi<FinancialEntry>(
    `/api/v1/finances/entries/${encodeURIComponent(entryId)}/void`,
    { method: "POST", body: { reason } },
  );
}

/** Comprobante como archivo almacenado (perfil ``document``: pdf/xml/imagen). */
export async function uploadEvidence(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", "document");
  const stored = await browserApi<{ id: string }>("/api/v1/files", {
    method: "POST",
    body: form,
  });
  return stored.id;
}

export function attachEvidence(
  entryId: string,
  body: FinancialEntryAttachmentCreate,
): Promise<FinancialEntry> {
  return browserApi<FinancialEntry>(
    `/api/v1/finances/entries/${encodeURIComponent(entryId)}/attachments`,
    { method: "POST", body },
  );
}

/** Categorías ACTIVAS para el alta manual (el listado genérico completo vive
 * en /admin/resources/finance_categories). */
export async function listActiveCategories(): Promise<FinanceCategory[]> {
  const page = await browserApi<CategoriesPage>(
    "/api/v1/finances/categories?limit=100&is_active=true",
  );
  return page.items;
}
