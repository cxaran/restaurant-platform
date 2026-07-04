// ViewModels del payload público del storefront.
//
// CONTRATO CERRADO: GET /api/v1/public/storefront/{page_key} ya está tipado en
// OpenAPI como `PublicStorefrontPage` (meta, layout, sections con media por
// slot y theme_tokens). Aquí NO se vuelve a declarar la forma del payload a
// mano: los tipos VM son aliases/derivaciones del tipo generado, y el único
// adaptador (`toStorefrontPageVM`) se limita a normalizar opcionales
// (defaults + orden de secciones). `theme_tokens` sigue siendo un dict de
// tokens en el contrato, así que conserva su parseo allowlist
// (`parseThemeTokens`: solo hex de 6 dígitos, jamás CSS arbitrario).

import type { components } from "@/generated/openapi";

export type PublicStorefrontPage = components["schemas"]["PublicStorefrontPage"];
export type PublicStorefrontSection = components["schemas"]["PublicStorefrontSection"];
export type PublicSectionMediaSlot = components["schemas"]["PublicSectionMediaSlot"];
export type PublicStorefrontMeta = components["schemas"]["PublicStorefrontMeta"];
export type PublicStorefrontLayout = components["schemas"]["PublicStorefrontLayout"];

export type ThemeTokens = {
  colors: Record<string, string>;
  typography: { font_family_key?: string; heading_weight?: string; body_weight?: string };
  shape: { button_radius?: string; card_radius?: string; image_radius?: string };
  effects: { card_shadow?: string; button_style?: string };
};

// VM = contrato generado con los opcionales resueltos (la UI no repite `??`).
export type SectionMediaSlotVM = Required<PublicSectionMediaSlot>;

export type StorefrontSectionVM = Omit<
  Required<PublicStorefrontSection>,
  "data" | "media"
> & {
  data: Record<string, unknown> | null;
  media: Record<string, SectionMediaSlotVM>;
};

export type StorefrontLayoutVM = Required<PublicStorefrontLayout> | null;

export type StorefrontPageVM = Omit<
  Required<PublicStorefrontPage>,
  "layout" | "meta" | "sections" | "theme_tokens"
> & {
  layout: StorefrontLayoutVM;
  meta: Required<PublicStorefrontMeta>;
  sections: StorefrontSectionVM[];
  theme_tokens: ThemeTokens | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function parseThemeTokens(value: unknown): ThemeTokens | null {
  if (!isRecord(value)) return null;
  const colors: Record<string, string> = {};
  for (const [key, raw] of Object.entries(asRecord(value.colors))) {
    // Solo hex de 6 dígitos: los tokens jamás inyectan CSS arbitrario.
    if (typeof raw === "string" && /^#[0-9a-fA-F]{6}$/.test(raw)) colors[key] = raw;
  }
  return {
    colors,
    typography: asRecord(value.typography) as ThemeTokens["typography"],
    shape: asRecord(value.shape) as ThemeTokens["shape"],
    effects: asRecord(value.effects) as ThemeTokens["effects"],
  };
}

function toMediaSlotVM(slot: PublicSectionMediaSlot): SectionMediaSlotVM {
  return {
    desktop_file_id: slot.desktop_file_id ?? null,
    mobile_file_id: slot.mobile_file_id ?? null,
    alt_text: slot.alt_text ?? null,
    focal_point_x: slot.focal_point_x ?? null,
    focal_point_y: slot.focal_point_y ?? null,
  };
}

function toSectionVM(section: PublicStorefrontSection): StorefrontSectionVM {
  const media: Record<string, SectionMediaSlotVM> = {};
  for (const [slot, raw] of Object.entries(section.media ?? {})) {
    media[slot] = toMediaSlotVM(raw);
  }
  return {
    template_key: section.template_key,
    template_version: section.template_version,
    sort_order: section.sort_order,
    content: section.content ?? {},
    style: section.style ?? {},
    behavior: section.behavior ?? {},
    data: section.data ?? null,
    media,
  };
}

/** Adapter type-safe del contrato generado al VM que consume la UI. */
export function toStorefrontPageVM(page: PublicStorefrontPage): StorefrontPageVM {
  const sections = (page.sections ?? []).map(toSectionVM);
  sections.sort((a, b) => a.sort_order - b.sort_order);
  return {
    page_key: page.page_key,
    slug: page.slug,
    layout: page.layout
      ? { header: page.layout.header ?? {}, footer: page.layout.footer ?? {} }
      : null,
    meta: {
      title: page.meta.title ?? null,
      description: page.meta.description ?? null,
      og_image_file_id: page.meta.og_image_file_id ?? null,
      favicon_file_id: page.meta.favicon_file_id ?? null,
    },
    sections,
    theme_tokens: parseThemeTokens(page.theme_tokens),
  };
}

// Espejo del preset neutro `calido` del backend (app/storefront/presets.py):
// fallback de arranque cuando aún no hay tema publicado. NO es Tony-Tony.
export const FALLBACK_TOKENS: ThemeTokens = {
  colors: {
    brand_primary: "#C2410C",
    brand_secondary: "#1C1917",
    accent: "#F59E0B",
    surface: "#FFFBF5",
    surface_muted: "#F5EFE6",
    text_primary: "#1C1917",
    text_inverse: "#FFFBF5",
    success: "#15803D",
  },
  typography: { font_family_key: "display_slab", heading_weight: "700", body_weight: "400" },
  shape: { button_radius: "pill", card_radius: "large", image_radius: "large" },
  effects: { card_shadow: "soft", button_style: "solid" },
};
