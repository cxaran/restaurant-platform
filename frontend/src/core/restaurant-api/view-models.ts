// ViewModels del payload público del storefront.
//
// GAP documentado (plan §4): GET /api/v1/public/storefront/{page_key} devuelve
// `dict` sin tipar en OpenAPI, así que este VM parsea defensivamente. Cuando el
// backend exponga response_model tipado, este archivo se reduce a aliases.

export type ThemeTokens = {
  colors: Record<string, string>;
  typography: { font_family_key?: string; heading_weight?: string; body_weight?: string };
  shape: { button_radius?: string; card_radius?: string; image_radius?: string };
  effects: { card_shadow?: string; button_style?: string };
};

export type SectionMediaSlotVM = {
  desktop_file_id: string | null;
  mobile_file_id: string | null;
  alt_text: string | null;
  focal_point_x: number | null;
  focal_point_y: number | null;
};

export type StorefrontSectionVM = {
  template_key: string;
  template_version: number;
  sort_order: number;
  content: Record<string, unknown>;
  style: Record<string, unknown>;
  behavior: Record<string, unknown>;
  data: Record<string, unknown> | null;
  media: Record<string, SectionMediaSlotVM>;
};

export type StorefrontLayoutVM = {
  header: Record<string, unknown>;
  footer: Record<string, unknown>;
} | null;

export type StorefrontPageVM = {
  page_key: string;
  slug: string;
  layout: StorefrontLayoutVM;
  meta: {
    title: string | null;
    description: string | null;
    og_image_file_id: string | null;
    favicon_file_id: string | null;
  };
  sections: StorefrontSectionVM[];
  theme_tokens: ThemeTokens | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
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

function parseSectionMedia(value: unknown): Record<string, SectionMediaSlotVM> {
  if (!isRecord(value)) return {};
  const media: Record<string, SectionMediaSlotVM> = {};
  for (const [slot, raw] of Object.entries(value)) {
    if (!isRecord(raw)) continue;
    media[slot] = {
      desktop_file_id: asStringOrNull(raw.desktop_file_id),
      mobile_file_id: asStringOrNull(raw.mobile_file_id),
      alt_text: asStringOrNull(raw.alt_text),
      focal_point_x: typeof raw.focal_point_x === "number" ? raw.focal_point_x : null,
      focal_point_y: typeof raw.focal_point_y === "number" ? raw.focal_point_y : null,
    };
  }
  return media;
}

export function parseStorefrontPage(value: unknown): StorefrontPageVM | null {
  if (!isRecord(value) || typeof value.page_key !== "string") return null;
  const meta = asRecord(value.meta);
  const sections: StorefrontSectionVM[] = [];
  if (Array.isArray(value.sections)) {
    for (const raw of value.sections) {
      if (!isRecord(raw) || typeof raw.template_key !== "string") continue;
      sections.push({
        template_key: raw.template_key,
        template_version: typeof raw.template_version === "number" ? raw.template_version : 1,
        sort_order: typeof raw.sort_order === "number" ? raw.sort_order : 0,
        content: asRecord(raw.content),
        style: asRecord(raw.style),
        behavior: asRecord(raw.behavior),
        data: isRecord(raw.data) ? raw.data : null,
        media: parseSectionMedia(raw.media),
      });
    }
  }
  sections.sort((a, b) => a.sort_order - b.sort_order);
  const layoutRaw = asRecord(value.layout);
  return {
    page_key: value.page_key,
    slug: typeof value.slug === "string" ? value.slug : "/",
    layout: isRecord(value.layout)
      ? { header: asRecord(layoutRaw.header), footer: asRecord(layoutRaw.footer) }
      : null,
    meta: {
      title: asStringOrNull(meta.title),
      description: asStringOrNull(meta.description),
      og_image_file_id: asStringOrNull(meta.og_image_file_id),
      favicon_file_id: asStringOrNull(meta.favicon_file_id),
    },
    sections,
    theme_tokens: parseThemeTokens(value.theme_tokens),
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
