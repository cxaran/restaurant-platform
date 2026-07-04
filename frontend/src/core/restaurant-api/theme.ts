// Tokens publicados → variables CSS `--sf-*` del sitio público.
// Los valores pasan por allowlists: jamás CSS arbitrario desde datos remotos.
import type { ThemeTokens } from "./view-models";

const RADIUS: Record<string, string> = {
  pill: "999px",
  rounded: "14px",
  large: "20px",
  medium: "14px",
  small: "8px",
};

const SHADOW: Record<string, string> = {
  soft: "0 8px 24px rgba(28, 21, 18, 0.10)",
  none: "none",
};

// Claves de fuente AUTORIZADAS (espejo de presets.py::ALLOWED_FONT_KEYS).
// El CSS real de cada familia lo cargan las clases de next/font del layout.
export const FONT_KEYS = [
  "display_slab",
  "modern_sans",
  "classic_serif",
  "friendly_rounded",
] as const;
export type FontKey = (typeof FONT_KEYS)[number];

export function resolveFontKey(value: string | undefined): FontKey {
  return (FONT_KEYS as readonly string[]).includes(value ?? "")
    ? (value as FontKey)
    : "display_slab";
}

export function themeToCssVars(tokens: ThemeTokens): Record<string, string> {
  const c = tokens.colors;
  const vars: Record<string, string> = {
    "--sf-brand": c.brand_primary ?? "#C2410C",
    "--sf-brand-2": c.brand_secondary ?? "#1C1917",
    "--sf-accent": c.accent ?? "#F59E0B",
    "--sf-surface": c.surface ?? "#FFFBF5",
    "--sf-surface-muted": c.surface_muted ?? "#F5EFE6",
    "--sf-text": c.text_primary ?? "#1C1917",
    "--sf-text-inverse": c.text_inverse ?? "#FFFBF5",
    "--sf-success": c.success ?? "#15803D",
    "--sf-radius-button": RADIUS[tokens.shape.button_radius ?? "pill"] ?? RADIUS.pill,
    "--sf-radius-card": RADIUS[tokens.shape.card_radius ?? "large"] ?? RADIUS.large,
    "--sf-radius-image": RADIUS[tokens.shape.image_radius ?? "large"] ?? RADIUS.large,
    "--sf-shadow-card": SHADOW[tokens.effects.card_shadow ?? "soft"] ?? SHADOW.soft,
    "--sf-heading-weight": /^\d{3}$/.test(tokens.typography.heading_weight ?? "")
      ? (tokens.typography.heading_weight as string)
      : "700",
  };
  return vars;
}

/** Esquemas de color por sección (§58.4): resueltos aquí, nunca hex libres. */
export function sectionScheme(scheme: unknown): {
  background: string;
  color: string;
  muted: boolean;
} {
  switch (scheme) {
    case "brand":
      return { background: "var(--sf-brand)", color: "var(--sf-text-inverse)", muted: false };
    case "brand_inverse":
      return { background: "var(--sf-brand-2)", color: "var(--sf-text-inverse)", muted: false };
    case "dark":
      return { background: "var(--sf-brand-2)", color: "var(--sf-text-inverse)", muted: false };
    case "surface_muted":
      return { background: "var(--sf-surface-muted)", color: "var(--sf-text)", muted: true };
    default:
      return { background: "var(--sf-surface)", color: "var(--sf-text)", muted: false };
  }
}

export function publicFileUrl(fileId: string | null | undefined): string | null {
  if (!fileId || !/^[0-9a-fA-F-]{36}$/.test(fileId)) return null;
  return `/api/v1/public/files/${fileId}`;
}

export function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const amount = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}
