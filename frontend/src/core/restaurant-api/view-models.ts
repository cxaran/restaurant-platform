// ViewModels del payload público del storefront plano.
//
// CONTRATO CERRADO: GET /api/v1/public/storefront/site ya está tipado en
// OpenAPI como `PublicStorefrontSite` (meta, theme_tokens, carousel, heros y
// footer) y GET /public/storefront/highlights como `PublicHighlight[]`. Aquí
// NO se re-declara la forma del payload: los VM son derivaciones del tipo
// generado y el adaptador solo normaliza opcionales. `theme_tokens` sigue
// siendo un dict en el contrato, así que conserva su parseo allowlist
// (`parseThemeTokens`: solo hex de 6 dígitos, jamás CSS arbitrario).

import type { components } from "@/generated/openapi";

export type PublicStorefrontSite = components["schemas"]["PublicStorefrontSite"];
export type PublicHero = components["schemas"]["PublicHero"];
export type PublicHeroProduct = components["schemas"]["PublicHeroProduct"];
export type PublicCarousel = components["schemas"]["PublicCarousel"];
export type PublicFooter = components["schemas"]["PublicFooter"];
export type PublicFooterPhone = components["schemas"]["PublicFooterPhone"];
export type PublicSocialLink = components["schemas"]["PublicSocialLink"];
export type PublicHighlight = components["schemas"]["PublicHighlight"];
export type PublicCta = components["schemas"]["PublicCta"];

export type ThemeTokens = {
  colors: Record<string, string>;
  typography: { font_family_key?: string; heading_weight?: string; body_weight?: string };
  shape: { button_radius?: string; card_radius?: string; image_radius?: string };
  effects: { card_shadow?: string; button_style?: string };
};

// VM = contrato generado con los opcionales resueltos (la UI no repite `??`).
export type HeroVM = Required<Omit<PublicHero, "image" | "product">> & {
  image: Required<NonNullable<PublicHero["image"]>>;
  product: PublicHeroProduct | null;
};

export type CarouselVM = Required<PublicCarousel>;

export type FooterVM = Omit<Required<PublicFooter>, "schedule"> & {
  schedule: { is_open_now: boolean; today_slots: { opens_at?: string; closes_at?: string }[] } | null;
};

export type HighlightVM = Required<PublicHighlight>;

export type SiteVM = {
  enabled: boolean;
  maintenance_message: string | null;
  meta: {
    title: string | null;
    description: string | null;
    favicon_file_id: string | null;
    social_image_file_id: string | null;
  };
  // Texto del panel lateral de las páginas de acceso; null = el front usa su default.
  auth: {
    headline: string | null;
    subcopy: string | null;
  };
  theme_tokens: ThemeTokens | null;
  carousel: CarouselVM;
  heros: HeroVM[];
  footer: FooterVM;
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

export function toHeroVM(hero: PublicHero): HeroVM {
  return {
    id: hero.id,
    template: hero.template ?? "split",
    eyebrow: hero.eyebrow ?? null,
    title: hero.title,
    title_accent: hero.title_accent ?? null,
    description: hero.description ?? null,
    primary_cta: hero.primary_cta ?? null,
    secondary_cta: hero.secondary_cta ?? null,
    product: hero.product ?? null,
    image: {
      desktop_file_id: hero.image?.desktop_file_id ?? null,
      mobile_file_id: hero.image?.mobile_file_id ?? null,
      alt_text: hero.image?.alt_text ?? null,
      focal_x: hero.image?.focal_x ?? null,
      focal_y: hero.image?.focal_y ?? null,
    },
    height: hero.height ?? "regular",
    alignment: hero.alignment ?? "left",
    color_scheme: hero.color_scheme ?? "surface",
    button_variant: hero.button_variant ?? "solid",
    overlay: hero.overlay ?? "soft",
    image_position: hero.image_position ?? "right",
    image_frame: hero.image_frame ?? true,
  };
}

export function toHighlightVM(row: PublicHighlight): HighlightVM {
  return {
    id: row.id,
    surface: row.surface,
    icon: row.icon ?? null,
    eyebrow: row.eyebrow ?? null,
    title: row.title,
    subtitle: row.subtitle ?? null,
    cta: row.cta ?? null,
    animation: row.animation ?? "fade_in",
    color_scheme: row.color_scheme ?? "brand",
  };
}

function toFooterVM(footer: PublicFooter | undefined): FooterVM {
  return {
    template: footer?.template ?? "barra",
    color_scheme: footer?.color_scheme ?? "dark",
    slogan: footer?.slogan ?? null,
    phones: footer?.phones ?? [],
    schedule: footer?.schedule
      ? {
        is_open_now: footer.schedule.is_open_now ?? false,
        today_slots: footer.schedule.today_slots ?? [],
      }
      : null,
    show_links: footer?.show_links ?? true,
    address: footer?.address ?? null,
    social_links: footer?.social_links ?? [],
  };
}

/** Adapter type-safe del contrato generado al VM que consume la UI. */
export function toSiteVM(site: PublicStorefrontSite): SiteVM {
  return {
    enabled: site.enabled ?? true,
    maintenance_message: site.maintenance_message ?? null,
    meta: {
      title: site.meta?.title ?? null,
      description: site.meta?.description ?? null,
      favicon_file_id: site.meta?.favicon_file_id ?? null,
      social_image_file_id: site.meta?.social_image_file_id ?? null,
    },
    auth: {
      headline: site.auth?.headline ?? null,
      subcopy: site.auth?.subcopy ?? null,
    },
    theme_tokens: parseThemeTokens(site.theme_tokens),
    carousel: {
      autoplay: site.carousel?.autoplay ?? true,
      interval_seconds: site.carousel?.interval_seconds ?? 6,
      transition: site.carousel?.transition ?? "slide",
      show_arrows: site.carousel?.show_arrows ?? true,
      show_dots: site.carousel?.show_dots ?? true,
    },
    heros: (site.heros ?? []).map(toHeroVM),
    footer: toFooterVM(site.footer),
  };
}

// Espejo del preset neutro `calido` del backend (app/storefront/presets.py):
export const FALLBACK_TOKENS: ThemeTokens = {
  colors: {
    brand_primary: "#C2410C",
    brand_secondary: "#1C1917",
    accent: "#F59E0B",
    surface: "#F6EEDD",
    surface_muted: "#F1E7D2",
    text_primary: "#1C1917",
    text_inverse: "#FFFBF5",
    success: "#15803D",
  },
  typography: { font_family_key: "display_slab", heading_weight: "700", body_weight: "400" },
  shape: { button_radius: "pill", card_radius: "large", image_radius: "large" },
  effects: { card_shadow: "soft", button_style: "solid" },
};
