import Link from "next/link";

import { formatMoney, publicFileUrl, sectionScheme } from "@/core/restaurant-api/theme";
import type { StorefrontSectionVM } from "@/core/restaurant-api/view-models";
import { HeroCarousel, type HeroSlideVM } from "./HeroCarousel";
import { AddToCartButton } from "./MenuView";

// Registry: SOLO plantillas que el backend expone hoy. Las keys planeadas pero
// aún sin contrato (catalog.categories, banner.credits, banner.delivery) NO se
// registran: caen en UnknownTemplateFallback (plan §4).

type SectionProps = Readonly<{ section: StorefrontSectionVM; preview?: boolean }>;

export function ctaHref(cta: unknown): string | null {
  // §F: SOLO tipos de CTA conocidos; jamás href libre desde datos remotos.
  // Un tipo desconocido o un target inválido NO se renderiza (null), nunca se
  // "corrige" hacia una URL. Bloqueados por construcción: javascript:, data:,
  // blob:, file: y http: (externos solo https:).
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

function CtaLink({ cta, variant }: Readonly<{ cta: unknown; variant: "solid" | "outline" }>) {
  if (typeof cta !== "object" || cta === null) return null;
  const label = (cta as { label?: string }).label;
  if (!label) return null;
  const href = ctaHref(cta);
  if (href === null) return null;
  const external = href.startsWith("http") || href.startsWith("tel:");
  const className = variant === "solid" ? "sf-btn" : "sf-btn-outline";
  return external ? (
    <a className={className} href={href} rel="noopener noreferrer" target="_blank">
      {label}
    </a>
  ) : (
    <Link className={className} href={href}>
      {label}
    </Link>
  );
}

function AnnouncementSection({ section }: SectionProps) {
  const amount = section.data?.free_shipping_from_amount;
  const behavior = section.behavior as { show_free_shipping?: boolean; show_service_note?: boolean };
  const parts: string[] = [];
  if (behavior.show_free_shipping !== false && typeof amount === "string") {
    parts.push(`Envío gratis desde ${formatMoney(amount)}`);
  }
  if (behavior.show_service_note !== false) parts.push("Servicio a domicilio");
  if (parts.length === 0) return null;
  return (
    <div
      style={{
        background: "var(--sf-brand)",
        color: "var(--sf-text-inverse)",
        textAlign: "center",
        fontWeight: 700,
        fontSize: 14,
        padding: "9px 16px",
        letterSpacing: "0.3px",
      }}
    >
      {parts.join(" · ")}
    </div>
  );
}

function HeroSection({ section }: SectionProps) {
  const raw = Array.isArray(section.content.slides) ? section.content.slides : [];
  const slides = raw.filter(
    (slide): slide is HeroSlideVM =>
      typeof slide === "object" &&
      slide !== null &&
      typeof (slide as HeroSlideVM).title === "string" &&
      (slide as { is_active?: boolean }).is_active !== false,
  );
  if (slides.length === 0) return null;
  const style = section.style as { color_scheme?: string; content_alignment?: string };
  const scheme = sectionScheme(style.color_scheme);
  const mainMedia = section.media.main ?? section.media.hero ?? null;
  return (
    <HeroCarousel
      slides={slides}
      background={scheme.background}
      color={scheme.color}
      alignment={style.content_alignment === "center" ? "center" : "left"}
      mediaUrl={publicFileUrl(mainMedia?.desktop_file_id ?? mainMedia?.mobile_file_id)}
      mediaAlt={mainMedia?.alt_text ?? ""}
      renderCta={(cta, variant) => <CtaLink cta={cta} variant={variant} />}
    />
  );
}

function PromoBannerSection({ section }: SectionProps) {
  const content = section.content as {
    title?: string;
    description?: string;
    cta?: unknown;
  };
  if (!content.title) return null;
  const scheme = sectionScheme((section.style as { color_scheme?: string }).color_scheme ?? "dark");
  return (
    <section className="sf-container" style={{ paddingBlock: 18 }}>
      <div
        className="sf-card"
        style={{
          background: scheme.background,
          color: scheme.color,
          border: "none",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "22px 26px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 240, flex: 1 }}>
          <div className="sf-display" style={{ fontSize: 22 }}>{content.title}</div>
          {content.description ? (
            <div style={{ fontSize: 14, opacity: 0.85 }}>{content.description}</div>
          ) : null}
        </div>
        <CtaLink cta={content.cta} variant="solid" />
      </div>
    </section>
  );
}

type BoundProduct = {
  id?: string;
  name?: string;
  description?: string | null;
  money_price_amount?: string | null;
  credits_awarded_per_unit?: number;
  credit_redemption_price?: number | null;
};

function FeaturedProductsSection({ section, preview }: SectionProps) {
  const content = section.content as { title?: string; description?: string };
  const style = section.style as { show_credits?: boolean; show_product_description?: boolean };
  const products = Array.isArray(section.data?.products)
    ? (section.data?.products as BoundProduct[])
    : [];
  // §F: en público una sección sin elementos se elimina visualmente completa.
  if (products.length === 0 && !preview) return null;
  return (
    <section className="sf-container" style={{ paddingBlock: 26 }}>
      {content.title ? (
        <h2 className="sf-display" style={{ fontSize: 28, margin: "0 0 4px" }}>
          {content.title}
        </h2>
      ) : null}
      {content.description ? (
        <p className="sf-muted" style={{ margin: "0 0 16px", fontSize: 15 }}>
          {content.description}
        </p>
      ) : null}
      {products.length === 0 ? (
        // §F: binding vacío (p. ej. category sin category_id) — solo llega
        // aquí en preview; en público la sección ya se omitió completa.
        <div className="sf-error" role="note" style={{ fontSize: 13 }}>
          Esta sección no tiene productos: la fuente del binding no está
          completamente configurada (¿category_id válido?) o el catálogo no
          tiene elementos publicados.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 18,
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            marginTop: 14,
          }}
        >
          {products.map((product) => (
            <article key={product.id ?? product.name} className="sf-card" style={{ display: "flex", flexDirection: "column" }}>
              <div className="sf-imgbox" style={{ height: 150, borderRadius: 0 }} aria-hidden>
                <span className="sf-display" style={{ fontSize: 34, opacity: 0.25 }}>
                  {(product.name ?? "?").charAt(0)}
                </span>
              </div>
              <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{product.name}</div>
                {style.show_product_description !== false && product.description ? (
                  <div className="sf-muted" style={{ fontSize: 13, flex: 1 }}>{product.description}</div>
                ) : null}
                {style.show_credits !== false && (product.credits_awarded_per_unit ?? 0) > 0 ? (
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--sf-brand)" }}>
                    Gana {product.credits_awarded_per_unit} créditos
                  </div>
                ) : null}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>
                    {formatMoney(product.money_price_amount)}
                  </div>
                  {product.id && product.name && !preview ? (
                    <AddToCartButton
                      productId={product.id}
                      name={product.name}
                      priceHint={product.money_price_amount ?? null}
                      creditRedemptionPrice={product.credit_redemption_price ?? null}
                      compact
                    />
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function HoursSection({ section }: SectionProps) {
  const content = section.content as { title?: string };
  const isOpen = section.data?.is_open_now === true;
  const slots = Array.isArray(section.data?.today_slots)
    ? (section.data?.today_slots as { opens_at?: string; closes_at?: string }[])
    : [];
  return (
    <section className="sf-container" style={{ paddingBlock: 22 }}>
      <div className="sf-card" style={{ padding: "20px 24px", display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
        <div className="sf-display" style={{ fontSize: 20, flex: 1, minWidth: 180 }}>
          {content.title ?? "Horario"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14 }}>
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: isOpen ? "var(--sf-success)" : "var(--sf-brand)",
              display: "inline-block",
            }}
          />
          {isOpen ? "Abierto ahora" : "Cerrado por el momento"}
        </div>
        <div className="sf-muted" style={{ fontSize: 14 }}>
          {slots.length > 0
            ? `Hoy: ${slots
                .map((slot) => `${(slot.opens_at ?? "").slice(0, 5)} – ${(slot.closes_at ?? "").slice(0, 5)}`)
                .join(" y ")}`
            : "Hoy no hay servicio"}
        </div>
      </div>
    </section>
  );
}

function ContactSection({ section }: SectionProps) {
  const content = section.content as { title?: string; show_whatsapp?: boolean };
  const phones = Array.isArray(section.data?.phones)
    ? (section.data?.phones as { label?: string | null; phone?: string; phone_normalized?: string; is_whatsapp?: boolean }[])
    : [];
  if (phones.length === 0) return null;
  return (
    <section className="sf-container" style={{ paddingBlock: 22 }}>
      <h2 className="sf-display" style={{ fontSize: 24, margin: "0 0 12px" }}>
        {content.title ?? "Contacto"}
      </h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {phones.map((phone) => {
          const wa = content.show_whatsapp !== false && phone.is_whatsapp;
          const href = wa
            ? `https://wa.me/${(phone.phone_normalized ?? "").replace(/\D/g, "")}`
            : `tel:${phone.phone_normalized ?? phone.phone}`;
          return (
            <a
              key={`${phone.phone}-${phone.label ?? ""}`}
              className="sf-btn-outline"
              href={href}
              rel="noopener noreferrer"
              target={wa ? "_blank" : undefined}
              style={{ fontSize: 14, padding: "10px 20px" }}
            >
              {wa ? "WhatsApp" : "Llamar"} {phone.phone}
              {phone.label ? ` · ${phone.label}` : ""}
            </a>
          );
        })}
      </div>
    </section>
  );
}

type BoundCategory = { id?: string; name?: string; description?: string | null };

function CategoriesSection({ section, preview }: SectionProps) {
  const content = section.content as { title?: string };
  const categories = Array.isArray(section.data?.categories)
    ? (section.data?.categories as BoundCategory[])
    : [];
  if (categories.length === 0 && !preview) return null;
  return (
    <section className="sf-container" style={{ paddingBlock: 22 }}>
      {content.title ? (
        <h2 className="sf-display" style={{ fontSize: 26, margin: "0 0 12px" }}>
          {content.title}
        </h2>
      ) : null}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {categories.map((category) => (
          <Link
            key={category.id ?? category.name}
            className="sf-chip"
            href="/menu"
            style={{ textDecoration: "none" }}
          >
            {category.name}
          </Link>
        ))}
      </div>
    </section>
  );
}

function CreditsBannerSection({ section }: SectionProps) {
  // §35.2: invita al programa; los números reales viven en /creditos.
  const content = section.content as { title?: string; description?: string; cta?: unknown };
  if (!content.title) return null;
  const scheme = sectionScheme((section.style as { color_scheme?: string }).color_scheme ?? "brand");
  return (
    <section className="sf-container" style={{ paddingBlock: 18 }}>
      <div
        className="sf-card"
        style={{
          background: scheme.background, color: scheme.color, border: "none",
          display: "flex", flexWrap: "wrap", alignItems: "center",
          justifyContent: "space-between", gap: 16, padding: "22px 26px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 240, flex: 1 }}>
          <div className="sf-display" style={{ fontSize: 22 }}>{content.title}</div>
          {content.description ? (
            <div style={{ fontSize: 14, opacity: 0.85 }}>{content.description}</div>
          ) : null}
        </div>
        <CtaLink
          cta={content.cta ?? { label: "Mis créditos", link_type: "credits_page" }}
          variant="solid"
        />
      </div>
    </section>
  );
}

function DeliveryBannerSection({ section }: SectionProps) {
  // §35.3: el umbral es DERIVADO del backend; sin datos no se inventa nada.
  const content = section.content as { title?: string; description?: string };
  const enabled = section.data?.delivery_enabled === true;
  const threshold = section.data?.free_shipping_from_amount;
  if (!enabled) return null;
  const scheme = sectionScheme((section.style as { color_scheme?: string }).color_scheme ?? "dark");
  return (
    <section className="sf-container" style={{ paddingBlock: 18 }}>
      <div
        className="sf-card"
        style={{
          background: scheme.background, color: scheme.color, border: "none",
          padding: "22px 26px", display: "flex", flexDirection: "column", gap: 6,
        }}
      >
        <div className="sf-display" style={{ fontSize: 22 }}>
          {content.title ?? "Servicio a domicilio"}
        </div>
        <div style={{ fontSize: 14, opacity: 0.85 }}>
          {content.description ?? "Te lo llevamos hasta tu puerta."}
          {typeof threshold === "string"
            ? ` Envío gratis desde ${formatMoney(threshold)}.`
            : ""}
        </div>
      </div>
    </section>
  );
}

function UnknownTemplateFallback({ section, preview }: SectionProps) {
  // En el sitio público una plantilla desconocida no rompe nada: se omite.
  // En preview se señala para que el editor sepa qué falta.
  if (!preview) return null;
  return (
    <div className="sf-container" style={{ paddingBlock: 10 }}>
      <div className="sf-error" role="note">
        Plantilla «{section.template_key}» v{section.template_version} sin soporte en este
        frontend todavía.
      </div>
    </div>
  );
}

const REGISTRY: Record<string, (props: SectionProps) => React.ReactNode> = {
  "storefront.announcement.free_shipping": AnnouncementSection,
  "storefront.hero": HeroSection,
  "storefront.banner.promo": PromoBannerSection,
  "storefront.catalog.featured_products": FeaturedProductsSection,
  "storefront.business.hours": HoursSection,
  "storefront.business.contact": ContactSection,
  "storefront.catalog.categories": CategoriesSection,
  "storefront.banner.credits": CreditsBannerSection,
  "storefront.banner.delivery": DeliveryBannerSection,
};

export const SUPPORTED_TEMPLATE_KEYS = Object.keys(REGISTRY);

export function SectionRenderer({
  sections,
  preview = false,
}: Readonly<{ sections: StorefrontSectionVM[]; preview?: boolean }>) {
  return (
    <>
      {sections.map((section, index) => {
        const Template = REGISTRY[section.template_key] ?? UnknownTemplateFallback;
        return (
          <Template
            key={`${section.template_key}-${section.sort_order}-${index}`}
            section={section}
            preview={preview}
          />
        );
      })}
    </>
  );
}

export { publicFileUrl };
