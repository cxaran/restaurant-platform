import "./storefront.css";

import type { Metadata } from "next";
import { Alfa_Slab_One, Archivo, Baloo_2, Lora } from "next/font/google";
import type { ReactNode } from "react";

import { CreditsModeGuard } from "@/components/storefront/CreditsModeGuard";
import { GlobalRibbon } from "@/components/storefront/Highlights";
import { StorefrontFooter } from "@/components/storefront/StorefrontFooter";
import { StorefrontHeader } from "@/components/storefront/StorefrontHeader";
import { StorefrontThemeProvider } from "@/components/storefront/StorefrontThemeProvider";
import { getSession } from "@/core/auth/session";
import { getPublicBusiness } from "@/core/restaurant-api/business";
import {
  buildStorefrontMetadata,
  resolveSafeImagePath,
} from "@/core/restaurant-api/site-metadata";
import {
  getPublicHighlights,
  getPublicStorefrontSite,
} from "@/core/restaurant-api/storefront";
import { FALLBACK_TOKENS } from "@/core/restaurant-api/view-models";
import { CartProvider } from "@/core/storefront/cart";
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

export async function generateMetadata(): Promise<Metadata> {
  // La metadata nunca rompe la portada: cualquier fallo → mínimos seguros.
  try {
    const [business, site] = await Promise.all([
      getPublicBusiness(),
      getPublicStorefrontSite(),
    ]);
    return await buildStorefrontMetadata(business, site);
  } catch {
    return { title: "Restaurante" };
  }
}

export default async function StorefrontLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [business, session, site, globalHighlights] = await Promise.all([
    getPublicBusiness(),
    getSession(),
    getPublicStorefrontSite(),
    getPublicHighlights("global"),
  ]);
  // Logo dinámico SOLO si es raster verificado (§D): SVG → monograma textual.
  const safeLogoUrl = await resolveSafeImagePath(business?.logo_file_id);
  const fontVars = `${slab.variable} ${sans.variable} ${serif.variable} ${rounded.variable}`;

  return (
    <PublicSessionProvider initialSession={session}>
      <CartProvider>
        <CreditsModeGuard />
        <StorefrontThemeProvider tokens={site?.theme_tokens ?? FALLBACK_TOKENS} fontVars={fontVars}>
          {/* Cinta global (highlight `global`): SIEMPRE sobre el header. */}
          <GlobalRibbon highlights={globalHighlights} />
          <StorefrontHeader business={business} logoUrl={safeLogoUrl} />
          <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>{children}</main>
          <StorefrontFooter business={business} footer={site?.footer ?? null} logoUrl={safeLogoUrl} />
        </StorefrontThemeProvider>
      </CartProvider>
    </PublicSessionProvider>
  );
}
