// Fixtures de demostración Tony-Tony. SOLO activos con
// NEXT_PUBLIC_STOREFRONT_DEMO="true" (nunca por defecto, nunca en producción).
// Sustituyen ÚNICAMENTE la portada cuando no hay revisión publicada; los datos
// de negocio/menú/checkout siguen siendo reales siempre.
import type { StorefrontPageVM, ThemeTokens } from "@/core/restaurant-api/view-models";

export function storefrontDemoEnabled(): boolean {
  return process.env.NEXT_PUBLIC_STOREFRONT_DEMO === "true";
}

export const TONY_DEMO_TOKENS: ThemeTokens = {
  colors: {
    brand_primary: "#C1272D",
    brand_secondary: "#1C1512",
    accent: "#F6B93B",
    surface: "#F6EEDD",
    surface_muted: "#EDE4CF",
    text_primary: "#1C1512",
    text_inverse: "#FBF5E9",
    success: "#338553",
  },
  typography: { font_family_key: "display_slab", heading_weight: "700", body_weight: "400" },
  shape: { button_radius: "pill", card_radius: "large", image_radius: "large" },
  effects: { card_shadow: "soft", button_style: "solid" },
};

export function tonyDemoHomePage(): StorefrontPageVM {
  return {
    page_key: "home",
    slug: "/",
    meta: { title: null, description: null, og_image_file_id: null, favicon_file_id: null },
    theme_tokens: TONY_DEMO_TOKENS,
    sections: [
      {
        template_key: "storefront.announcement.free_shipping",
        template_version: 1,
        sort_order: 5,
        content: {},
        style: {},
        behavior: { show_free_shipping: true, show_service_note: true },
        data: { free_shipping_from_amount: "350.00" },
      },
      {
        template_key: "storefront.hero",
        template_version: 1,
        sort_order: 10,
        content: {
          slides: [
            {
              variant: "split",
              eyebrow: "Recién hecho",
              title: "Sabor que te hace volver",
              description:
                "Boneless recién hechos, papas doradas y salsas de la casa. Pide en línea y te lo llevamos hasta tu puerta.",
              primary_cta: { label: "Pedir ahora", link_type: "menu_page" },
              secondary_cta: { label: "Ver menú completo", link_type: "menu_page" },
              is_active: true,
            },
          ],
        },
        style: { height: "compact", content_alignment: "left", color_scheme: "surface" },
        behavior: {},
        data: null,
      },
      {
        template_key: "storefront.catalog.featured_products",
        template_version: 1,
        sort_order: 20,
        content: { title: "Los más pedidos" },
        style: { layout: "grid", color_scheme: "surface" },
        behavior: {},
        // data null → la sección resuelve productos reales desde /public/menu
        data: null,
      },
      {
        template_key: "storefront.business.hours",
        template_version: 1,
        sort_order: 30,
        content: { title: "Horario" },
        style: {},
        behavior: {},
        data: null,
      },
      {
        template_key: "storefront.business.contact",
        template_version: 1,
        sort_order: 40,
        content: { title: "Contacto", show_whatsapp: true },
        style: {},
        behavior: {},
        data: null,
      },
    ],
  };
}
