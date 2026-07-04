// Resolución de CTAs controlados a href navegable. Función PURA (sirve en
// server y client). §F: SOLO tipos de CTA conocidos; jamás href libre desde
// datos remotos. Un tipo desconocido o un target inválido NO se renderiza
// (null), nunca se "corrige" hacia una URL. Bloqueados por construcción:
// javascript:, data:, blob:, file: y http: (externos solo https:).
export function ctaHref(cta: unknown): string | null {
  if (typeof cta !== "object" || cta === null) return null;
  const { link_type, target } = cta as { link_type?: string; target?: string };
  switch (link_type) {
    case "menu_page":
      return "/menu";
    case "credits_page":
      return "/creditos";
    case "product":
    case "category":
      // Identificadores publicados → navegación interna controlada al menú.
      return "/menu";
    case "internal_route":
      return typeof target === "string" && /^\/[^/\\]/.test(target) ? `${target}` : null;
    case "anchor":
      return typeof target === "string" && /^[\w-]+$/.test(target.replace(/^#/, ""))
        ? `#${target.replace(/^#/, "")}`
        : null;
    case "external_https":
      return typeof target === "string" && /^https:\/\//i.test(target) ? target : null;
    case "whatsapp": {
      const digits = typeof target === "string" ? target.replace(/\D/g, "") : "";
      return digits.length >= 8 ? `https://wa.me/${digits}` : null;
    }
    case "phone": {
      const digits = typeof target === "string" ? target.replace(/[^\d+]/g, "") : "";
      return digits.length >= 7 ? `tel:${digits}` : null;
    }
    default:
      return null;
  }
}

export function ctaLabel(cta: unknown): string | null {
  if (typeof cta !== "object" || cta === null) return null;
  const label = (cta as { label?: string }).label;
  return typeof label === "string" && label ? label : null;
}
