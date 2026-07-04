"use client";

// Cliente TIPADO del editor plano del storefront. Todos los tipos salen de
// src/generated/openapi.ts (contratos Pydantic reales) — sin espejos a mano.
// Guardar es publicar: no hay borradores, revisiones ni programación.

import { browserApi } from "@/core/api/browser-client";
import type { components } from "@/generated/openapi";

export type StorefrontConfig = components["schemas"]["StorefrontConfig"];
export type SettingsRead = components["schemas"]["SettingsRead"];
export type FooterRead = components["schemas"]["FooterRead"];
export type HeroRead = components["schemas"]["HeroRead"];
export type HighlightRead = components["schemas"]["HighlightRead"];
export type ThemePresetRead = components["schemas"]["ThemePresetRead"];
export type HeroWrite = components["schemas"]["HeroWrite"];
export type HighlightWrite = components["schemas"]["HighlightWrite"];
export type FooterPatch = components["schemas"]["FooterPatch"];
export type ThemePatch = components["schemas"]["ThemePatch"];
export type SettingsPatch = components["schemas"]["SettingsPatch"];
export type SocialLink = components["schemas"]["SocialLink"];
export type Cta = components["schemas"]["Cta"];

export type StoredFileRead = components["schemas"]["StoredFileRead"];

export function getConfig(): Promise<StorefrontConfig> {
  return browserApi<StorefrontConfig>("/api/v1/storefront/config");
}

/** Sube una imagen al banco de archivos (perfil `image`: magic bytes + tamaño
 * validados en backend, SVG bloqueado por H8) y devuelve su registro. El hero
 * guarda el id — al subir una nueva, la referencia se REEMPLAZA al guardar. */
export function uploadImage(file: File): Promise<StoredFileRead> {
  const body = new FormData();
  body.append("file", file);
  body.append("kind", "image");
  return browserApi<StoredFileRead>("/api/v1/files", { method: "POST", body });
}

export function createHero(payload: HeroWrite): Promise<HeroRead> {
  return browserApi<HeroRead>("/api/v1/storefront/heros", {
    method: "POST",
    body: payload,
  });
}

export function updateHero(id: string, payload: HeroWrite): Promise<HeroRead> {
  return browserApi<HeroRead>(`/api/v1/storefront/heros/${id}`, {
    method: "PUT",
    body: payload,
  });
}

export function deleteHero(id: string): Promise<void> {
  return browserApi<void>(`/api/v1/storefront/heros/${id}`, { method: "DELETE" });
}

export function sortHeros(heroIds: string[]): Promise<{ id: string; sort_order: number }[]> {
  return browserApi<{ id: string; sort_order: number }[]>(
    "/api/v1/storefront/heros/sort",
    { method: "POST", body: { hero_ids: heroIds } },
  );
}

export function createHighlight(payload: HighlightWrite): Promise<HighlightRead> {
  return browserApi<HighlightRead>("/api/v1/storefront/highlights", {
    method: "POST",
    body: payload,
  });
}

export function updateHighlight(
  id: string,
  payload: HighlightWrite,
): Promise<HighlightRead> {
  return browserApi<HighlightRead>(`/api/v1/storefront/highlights/${id}`, {
    method: "PUT",
    body: payload,
  });
}

export function deleteHighlight(id: string): Promise<void> {
  return browserApi<void>(`/api/v1/storefront/highlights/${id}`, { method: "DELETE" });
}

export function patchFooter(payload: FooterPatch): Promise<FooterRead> {
  return browserApi<FooterRead>("/api/v1/storefront/footer", {
    method: "PATCH",
    body: payload,
  });
}

export function patchTheme(
  payload: ThemePatch,
): Promise<{ theme_preset: string; theme_accent: string | null; tokens: Record<string, unknown> }> {
  return browserApi("/api/v1/storefront/theme", { method: "PATCH", body: payload });
}

export function patchSettings(payload: SettingsPatch): Promise<SettingsRead> {
  return browserApi<SettingsRead>("/api/v1/storefront/settings", {
    method: "PATCH",
    body: payload,
  });
}
