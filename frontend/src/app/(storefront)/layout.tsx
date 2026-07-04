import "./storefront.css";

import type { Metadata } from "next";
import { Alfa_Slab_One, Archivo, Baloo_2, Lora } from "next/font/google";
import type { ReactNode } from "react";

import { StorefrontFooter } from "@/components/storefront/StorefrontFooter";
import { StorefrontHeader } from "@/components/storefront/StorefrontHeader";
import { StorefrontThemeProvider } from "@/components/storefront/StorefrontThemeProvider";
import { getSession } from "@/core/auth/session";
import { getPublicBusiness } from "@/core/restaurant-api/business";
import {
  buildStorefrontMetadata,
  resolveSafeImagePath,
} from "@/core/restaurant-api/site-metadata";
import { getPublicStorefrontPage } from "@/core/restaurant-api/storefront";
import { FALLBACK_TOKENS } from "@/core/restaurant-api/view-models";
import { CartProvider } from "@/core/storefront/cart";
import {
  storefrontDemoEnabled,
  TONY_DEMO_TOKENS,
} from "@/core/storefront/demo-fixtures";
import { PublicSessionProvider } from "@/core/storefront/PublicSessionProvider";

export const dynamic = "force-dynamic";

// Fuentes AUTORIZADAS del tema (allowlist local; el tema elige por clave).
const slab = Alfa_Slab_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-sf-slab",
});
const sans = Archivo({ subsets: ["latin"], variable: "--font-sf-sans" });
const serif = Lora({ subsets: ["latin"], variable: "--font-sf-serif" });
const rounded = Baloo_2({ subsets: ["latin"], variable: "--font-sf-rounded" });

async function resolveTheme() {
  const result = await getPublicStorefrontPage("home");
  const layout = result.status === "published" ? result.page.layout : null;
  if (result.status === "published" && result.page.theme_tokens) {
    return { tokens: result.page.theme_tokens, layout };
  }
  const tokens = storefrontDemoEnabled() ? TONY_DEMO_TOKENS : FALLBACK_TOKENS;
  return { tokens, layout };
}

export async function generateMetadata(): Promise<Metadata> {
  // La metadata nunca rompe la portada: cualquier fallo → mínimos seguros.
  try {
    const [business, result] = await Promise.all([
      getPublicBusiness(),
      getPublicStorefrontPage("home"),
    ]);
    return await buildStorefrontMetadata(
      business,
      result.status === "published" ? result.page : null,
    );
  } catch {
    return { title: "Restaurante" };
  }
}

export default async function StorefrontLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [business, session, { tokens, layout }] = await Promise.all([
    getPublicBusiness(),
    getSession(),
    resolveTheme(),
  ]);
  // Logo dinámico SOLO si es raster verificado (§D): SVG → monograma textual.
  const safeLogoUrl = await resolveSafeImagePath(business?.logo_file_id);
  const fontVars = `${slab.variable} ${sans.variable} ${serif.variable} ${rounded.variable}`;

  return (
    <PublicSessionProvider initialSession={session}>
      <CartProvider>
        <StorefrontThemeProvider tokens={tokens} fontVars={fontVars}>
          <StorefrontHeader business={business} logoUrl={safeLogoUrl} layout={layout} />
          <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>{children}</main>
          <StorefrontFooter business={business} layout={layout} />
        </StorefrontThemeProvider>
      </CartProvider>
    </PublicSessionProvider>
  );
}
