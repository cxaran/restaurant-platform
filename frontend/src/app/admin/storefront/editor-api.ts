"use client";

// Cliente del editor del storefront: envuelve los endpoints reales del
// backend (nunca inventa contratos) sobre browserApi (cookie de sesión).

import { browserApi } from "@/core/api/browser-client";
import type { JsonSchema } from "./SchemaForm";

export type PageSummary = {
  page_key: string;
  slug: string;
  published_revision_number: number | null;
  published_at: string | null;
  has_draft: boolean;
  draft_revision_number: number | null;
};

export type TemplateInfo = {
  key: string;
  version: number;
  label: string;
  content_schema: JsonSchema;
  style_schema: JsonSchema;
  data_binding_schema: JsonSchema;
  behavior_schema: JsonSchema;
};

export type DraftSection = {
  id: string;
  template_key: string;
  template_version: number;
  section_name: string | null;
  sort_order: number;
  is_visible: boolean;
  visible_from: string | null;
  visible_until: string | null;
  content_config: Record<string, unknown>;
  style_config: Record<string, unknown>;
  data_binding_config: Record<string, unknown>;
  behavior_config: Record<string, unknown>;
};

export type DraftRevision = {
  id: string;
  revision_number: number;
  status: string;
  page_title: string | null;
  meta_description: string | null;
  sections: DraftSection[];
};

export type MediaSlots = Record<
  string,
  {
    desktop_file_id: string | null;
    mobile_file_id: string | null;
    alt_text: string | null;
  }
>;

export type LayoutConfig = {
  version_number: number | null;
  header_config: Record<string, unknown>;
  footer_config: Record<string, unknown>;
};

export type ThemePreset = { name: string; tokens: Record<string, unknown>; is_default: boolean };

export const getPages = () => browserApi<PageSummary[]>("/api/v1/storefront/pages");
export const getTemplates = () => browserApi<TemplateInfo[]>("/api/v1/storefront/templates");
export const getDraft = (pageKey: string) =>
  browserApi<DraftRevision>(`/api/v1/storefront/pages/${encodeURIComponent(pageKey)}/draft`);

export const patchDraftMeta = (pageKey: string, meta: { page_title?: string | null; meta_description?: string | null }) =>
  browserApi<DraftRevision>(`/api/v1/storefront/pages/${encodeURIComponent(pageKey)}/draft`, {
    method: "PATCH",
    body: meta,
  });

export type SectionInput = {
  template_key: string;
  template_version: number;
  section_name?: string | null;
  sort_order: number;
  is_visible: boolean;
  visible_from?: string | null;
  visible_until?: string | null;
  content_config: Record<string, unknown>;
  style_config: Record<string, unknown>;
  data_binding_config: Record<string, unknown>;
  behavior_config: Record<string, unknown>;
};

export const addSection = (pageKey: string, section: SectionInput) =>
  browserApi<DraftRevision>(
    `/api/v1/storefront/pages/${encodeURIComponent(pageKey)}/draft/sections`,
    { method: "POST", body: section },
  );

export const updateSection = (sectionId: string, section: SectionInput) =>
  browserApi<DraftSection>(`/api/v1/storefront/sections/${sectionId}`, {
    method: "PUT",
    body: section,
  });

export const deleteSection = (sectionId: string) =>
  browserApi<void>(`/api/v1/storefront/sections/${sectionId}`, { method: "DELETE" });

export const sortSections = (pageKey: string, sectionIds: string[]) =>
  browserApi<{ id: string; sort_order: number }[]>(
    `/api/v1/storefront/pages/${encodeURIComponent(pageKey)}/draft/sections/sort`,
    { method: "POST", body: { section_ids: sectionIds } },
  );

export const publishPage = (pageKey: string) =>
  browserApi(`/api/v1/storefront/pages/${encodeURIComponent(pageKey)}/publish`, {
    method: "POST",
  });

export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", "image");
  const stored = await browserApi<{ id: string }>("/api/v1/files", {
    method: "POST",
    body: form,
  });
  return stored.id;
}

export const upsertMedia = (
  sectionId: string,
  slot: string,
  body: { desktop_file_id?: string | null; mobile_file_id?: string | null; alt_text?: string | null },
) =>
  browserApi<MediaSlots>(`/api/v1/storefront/sections/${sectionId}/media/${slot}`, {
    method: "PUT",
    body,
  });

export const deleteMedia = (sectionId: string, slot: string) =>
  browserApi<void>(`/api/v1/storefront/sections/${sectionId}/media/${slot}`, {
    method: "DELETE",
  });

export const getLayout = () => browserApi<LayoutConfig>("/api/v1/storefront/layout");
export const putLayout = (header: Record<string, unknown>, footer: Record<string, unknown>) =>
  browserApi<LayoutConfig>("/api/v1/storefront/layout", {
    method: "PUT",
    body: { header_config: header, footer_config: footer },
  });

export const getThemePresets = () => browserApi<ThemePreset[]>("/api/v1/storefront/theme-presets");
export const applyTheme = (preset: string, accent?: string) =>
  browserApi("/api/v1/storefront/theme", {
    method: "POST",
    body: { preset, ...(accent ? { accent } : {}) },
  });
