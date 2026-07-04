import { HeroCarousel } from "@/components/storefront/HeroCarousel";
import { HighlightBanner } from "@/components/storefront/Highlights";
import { MenuShowcase } from "@/components/storefront/MenuShowcase";
import { getPublicBusiness, getPublicMenu } from "@/core/restaurant-api/business";
import {
  getPublicHighlights,
  getPublicStorefrontSite,
} from "@/core/restaurant-api/storefront";
import type { HeroVM } from "@/core/restaurant-api/view-models";

export const dynamic = "force-dynamic";

// La portada es una composición FIJA en código (Turno 11):
//   hero(s) en carrusel → franja destacada → menú directo del catálogo.
// El administrador edita CONTENIDO (heros, destacados, footer, tema); la
// estructura es del diseño y el menú siempre es el catálogo real.

/** Hero neutro cuando el admin aún no configura ninguno: negocio real, cero marca. */
async function fallbackHero(): Promise<HeroVM> {
  const business = await getPublicBusiness();
  return {
    id: "fallback",
    template: "minimal",
    eyebrow: null,
    title: business?.trade_name ?? "Bienvenido",
    title_accent: null,
    description: business?.slogan ?? "Explora nuestro menú y haz tu pedido en línea.",
    primary_cta: { label: "Ver menú", link_type: "menu_page", target: null },
    secondary_cta: null,
    product: null,
    image: {
      desktop_file_id: null,
      mobile_file_id: null,
      alt_text: null,
      focal_x: null,
      focal_y: null,
    },
    height: "compact",
    alignment: "left",
    color_scheme: "surface",
    button_variant: "solid",
    overlay: "soft",
    image_position: "right",
  };
}

export default async function StorefrontHomePage() {
  const [site, homeHighlights, categories] = await Promise.all([
    getPublicStorefrontSite(),
    getPublicHighlights("home"),
    getPublicMenu(),
  ]);

  if (site && !site.enabled) {
    return (
      <div className="sf-container" style={{ paddingBlock: 60, textAlign: "center" }}>
        <h1 className="sf-display" style={{ fontSize: 30, marginBottom: 8 }}>
          Estamos en mantenimiento
        </h1>
        <p className="sf-muted" style={{ fontSize: 15 }}>
          {site.maintenance_message ?? "Volvemos pronto."}
        </p>
      </div>
    );
  }

  const heros = site && site.heros.length > 0 ? site.heros : [await fallbackHero()];
  const carousel = site?.carousel ?? {
    autoplay: true,
    interval_seconds: 6,
    transition: "slide",
    show_arrows: true,
    show_dots: true,
  };

  return (
    <>
      <HeroCarousel heros={heros} carousel={carousel} />

      {/* Franja destacada (highlight `home`): un slot fijo bajo el hero. */}
      {homeHighlights.length > 0 ? (
        <div className="sf-container" style={{ paddingBlock: 14 }}>
          <HighlightBanner highlight={homeHighlights[0]} variant="strip" />
        </div>
      ) : null}

      {/* Menú directo: vitrina compacta del catálogo real (Turno 11a). El menú
          interactivo completo vive en /menu. */}
      <MenuShowcase categories={categories} />
    </>
  );
}
