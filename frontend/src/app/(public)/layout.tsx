import "../(storefront)/storefront.css";

import type { Metadata } from "next";
import { Alfa_Slab_One, Archivo, Baloo_2, Lora } from "next/font/google";
import type { ReactNode } from "react";

import { AnalyticsProvider } from "@/components/analytics/AnalyticsProvider";
import { BrandLockup } from "@/components/storefront/BrandLockup";
import { StorefrontThemeProvider } from "@/components/storefront/StorefrontThemeProvider";
import { getPublicAnalyticsConfig } from "@/core/restaurant-api/analytics";
import { getPublicBusiness } from "@/core/restaurant-api/business";
import {
  businessFaviconMetadata,
  resolveSafeImagePath,
} from "@/core/restaurant-api/site-metadata";
import { getPublicStorefrontSite } from "@/core/restaurant-api/storefront";
import { FALLBACK_TOKENS } from "@/core/restaurant-api/view-models";

export const dynamic = "force-dynamic";

// Fuentes AUTORIZADAS del tema — el MISMO allowlist y variables que el layout
// del storefront: el login es una extensión visual del sitio público.
const slab = Alfa_Slab_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-sf-slab",
});
const sans = Archivo({ subsets: ["latin"], variable: "--font-sf-sans" });
const serif = Lora({ subsets: ["latin"], variable: "--font-sf-serif" });
const rounded = Baloo_2({ subsets: ["latin"], variable: "--font-sf-rounded" });

// Texto por defecto del panel lateral de acceso cuando el admin no lo ha
// personalizado en el editor del sitio (storefront_settings.auth_*). El titular
// admite un salto de línea (\n → dos líneas vía white-space: pre-line).
const AUTH_HEADLINE_FALLBACK = "Tu antojo,\na un par de toques.";
const AUTH_SUBCOPY_FALLBACK =
  "Explora el menú, pide en minutos y recíbelo en tu puerta. Entra con tu cuenta.";

export async function generateMetadata(): Promise<Metadata> {
  // La metadata jamás rompe las páginas de acceso: fallo → mínimos seguros.
  try {
    const business = await getPublicBusiness();
    return {
      title: business?.trade_name ? `Acceso · ${business.trade_name}` : "Acceso",
      ...(await businessFaviconMetadata()),
    };
  } catch {
    return { title: "Acceso" };
  }
}

/**
 * Layout de las páginas públicas de auth (login/registro/reset/unlock) según el
 * handoff de diseño (Turno 8, escenas 8a móvil / 8b web): panel de marca oscuro
 * (banda superior redondeada en móvil, columna izquierda en escritorio) con la
 * identidad DINÁMICA del negocio, y el formulario sobre la superficie del tema.
 * Todo el color/forma sale de tokens `--sf-*`; nada de paleta fija aquí.
 */
export default async function PublicAuthLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [business, site, analytics] = await Promise.all([
    getPublicBusiness(),
    getPublicStorefrontSite(),
    getPublicAnalyticsConfig(),
  ]);
  // Tokens del tema activo; fallback neutro si el backend no responde (jamás marca fija).
  const tokens = site?.theme_tokens ?? FALLBACK_TOKENS;
  // Texto del panel lateral, editable en el storefront; vacío → copy por defecto.
  const authHeadline = site?.auth.headline?.trim() || AUTH_HEADLINE_FALLBACK;
  const authSubcopy = site?.auth.subcopy?.trim() || AUTH_SUBCOPY_FALLBACK;
  // Logo dinámico SOLO si es raster verificado (§D): SVG/otros → monograma.
  const safeLogoUrl = await resolveSafeImagePath(business?.logo_file_id);
  const fontVars = `${slab.variable} ${sans.variable} ${serif.variable} ${rounded.variable}`;
  const name = business?.trade_name ?? "Mi Restaurante";
  const year = new Date().getFullYear();

  return (
    <StorefrontThemeProvider tokens={tokens} fontVars={fontVars}>
      <AnalyticsProvider config={analytics} />
      <div className="sf-auth">
        <aside className="sf-auth-brand">
          {/* Móvil (8a): marca apilada y centrada en la banda oscura. */}
          <div className="sf-auth-brand-stack">
            {safeLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- archivo dinámico servido por el backend
              <img
                src={safeLogoUrl}
                alt=""
                width={84}
                height={84}
                style={{ objectFit: "contain" }}
              />
            ) : (
              <span aria-hidden className="sf-display sf-auth-monogram">
                {name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="sf-display sf-auth-brand-name">{name}</span>
            {business?.slogan ? (
              <span className="sf-auth-brand-slogan">{business.slogan}</span>
            ) : null}
          </div>

          {/* Escritorio (8b): lockup arriba, héroe al centro y pie legal. */}
          <div className="sf-auth-brand-top">
            <BrandLockup business={business} logoUrl={safeLogoUrl} compact />
          </div>
          <div className="sf-auth-brand-hero">
            <p
              className="sf-display sf-auth-brand-headline"
              style={{ whiteSpace: "pre-line" }}
            >
              {authHeadline}
            </p>
            <p className="sf-auth-brand-copy">{authSubcopy}</p>
          </div>
          <p className="sf-auth-brand-foot">
            © {year} {name}
            {business?.slogan ? ` · ${business.slogan}` : ""}
          </p>
        </aside>

        <div className="sf-auth-content">
          <main className="sf-auth-main">{children}</main>
        </div>
      </div>
    </StorefrontThemeProvider>
  );
}
