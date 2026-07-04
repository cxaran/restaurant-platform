import { SectionRenderer } from "@/components/storefront/SectionRenderer";
import { getPublicBusiness, getPublicMenu } from "@/core/restaurant-api/business";
import { getPublicStorefrontPage } from "@/core/restaurant-api/storefront";
import type { StorefrontPageVM, StorefrontSectionVM } from "@/core/restaurant-api/view-models";
import { storefrontDemoEnabled, tonyDemoHomePage } from "@/core/storefront/demo-fixtures";

export const dynamic = "force-dynamic";

/** Fallback neutro sin revisión publicada: negocio + menú reales, cero marca. */
async function fallbackSections(): Promise<StorefrontSectionVM[]> {
  const business = await getPublicBusiness();
  return [
    {
      template_key: "storefront.hero",
      template_version: 1,
      sort_order: 10,
      content: {
        slides: [
          {
            variant: "minimal",
            title: business?.trade_name ?? "Bienvenido",
            description:
              business?.slogan ?? "Explora nuestro menú y haz tu pedido en línea.",
            primary_cta: { label: "Ver menú", link_type: "menu_page" },
            is_active: true,
          },
        ],
      },
      style: { color_scheme: "surface", content_alignment: "left", height: "compact" },
      behavior: {},
      media: {},
      data: null,
    },
    {
      template_key: "storefront.catalog.featured_products",
      template_version: 1,
      sort_order: 20,
      content: { title: "Nuestros favoritos" },
      style: {},
      behavior: {},
      media: {},
      data: null,
    },
  ];
}

/** Secciones de productos sin binding resuelto → se hidratan del menú real. */
async function hydrateProductSections(
  sections: StorefrontSectionVM[],
): Promise<StorefrontSectionVM[]> {
  const needsProducts = sections.some(
    (section) =>
      section.template_key === "storefront.catalog.featured_products" &&
      (section.data === null || !Array.isArray(section.data.products)),
  );
  if (!needsProducts) return sections;
  const menu = await getPublicMenu();
  const all = menu.flatMap((category) => category.products);
  const featured = all.filter((product) => product.is_featured);
  const products = (featured.length > 0 ? featured : all).slice(0, 6).map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    money_price_amount: product.money_price_amount,
    credits_awarded_per_unit: product.credits_awarded_per_unit,
    credit_redemption_price: product.credit_redemption_price,
  }));
  return sections.map((section) =>
    section.template_key === "storefront.catalog.featured_products" &&
    (section.data === null || !Array.isArray(section.data.products))
      ? { ...section, data: { products } }
      : section,
  );
}

export default async function StorefrontHomePage() {
  const result = await getPublicStorefrontPage("home");

  if (result.status === "maintenance") {
    return (
      <div className="sf-container" style={{ paddingBlock: 60, textAlign: "center" }}>
        <h1 className="sf-display" style={{ fontSize: 30, marginBottom: 8 }}>
          Estamos en mantenimiento
        </h1>
        <p className="sf-muted" style={{ fontSize: 15 }}>{result.message}</p>
      </div>
    );
  }

  let page: StorefrontPageVM | null = result.status === "published" ? result.page : null;
  let sections: StorefrontSectionVM[];
  let demoActive = false;
  if (page) {
    // La revisión publicada SIEMPRE gana: el demo jamás sustituye backend real.
    sections = page.sections;
  } else if (storefrontDemoEnabled()) {
    page = tonyDemoHomePage();
    sections = page.sections;
    demoActive = true;
  } else {
    sections = await fallbackSections();
  }
  sections = await hydrateProductSections(sections);

  return (
    <>
      {demoActive ? (
        <div
          role="note"
          style={{
            background:
              "repeating-linear-gradient(45deg, #00000014, #00000014 12px, transparent 12px, transparent 24px)",
            textAlign: "center",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: 1,
            padding: "4px 8px",
          }}
        >
          DEMO — portada de muestra; ninguna revisión publicada todavía
        </div>
      ) : null}
      <SectionRenderer sections={sections} />
    </>
  );
}
