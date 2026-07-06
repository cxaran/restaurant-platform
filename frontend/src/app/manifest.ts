import type { MetadataRoute } from "next";

import { getPublicBusiness } from "@/core/restaurant-api/business";
import { resolveSquareIconPath } from "@/core/restaurant-api/site-metadata";
import { getPublicStorefrontSite } from "@/core/restaurant-api/storefront";
import { FALLBACK_TOKENS } from "@/core/restaurant-api/view-models";

// Manifest de la PWA: hace el sitio INSTALABLE (requisito duro de iOS para
// Web Push: solo la app añadida a la pantalla de inicio recibe avisos) y le da
// la MARCA REAL del negocio al instalarlo: nombre + logo + colores del tema.
//
// - Nombre/descr.: del negocio configurado (`GET /public/business`).
// - Íconos: el LOGO del negocio CUADRADO (centrado y con márgenes
//   transparentes vía /public/business/pwa-icon; misma política raster que el
//   favicon, SVG bloqueado por H8). Si no hay logo válido, cae a los íconos
//   placeholder estáticos. El maskable siempre usa el placeholder (recorte
//   circular seguro; un logo cualquiera se cortaría).
// - Colores: del tema publicado (`GET /public/storefront/site` → theme_tokens):
//   theme_color = brand_primary (barra de estado Android), background_color =
//   surface (fondo del splash). Fallback al preset neutro.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [business, site] = await Promise.all([
    getPublicBusiness(),
    getPublicStorefrontSite(),
  ]);

  const name = business?.trade_name || "Restaurant Platform";
  const colors = site?.theme_tokens?.colors ?? FALLBACK_TOKENS.colors;
  const themeColor = colors.brand_primary ?? FALLBACK_TOKENS.colors.brand_primary;
  const backgroundColor = colors.surface ?? FALLBACK_TOKENS.colors.surface;

  // Íconos del logo: "any" (192/512) con márgenes TRANSPARENTES, y el maskable
  // (ícono adaptable de Android) con el logo sobre fondo BLANCO y padding de
  // zona segura para que la máscara circular no lo recorte. Si no hay logo
  // raster, todo cae al placeholder estático.
  const logoId = business?.logo_file_id;
  const icon192 = await resolveSquareIconPath(logoId, 192);
  const icon512 = await resolveSquareIconPath(logoId, 512);
  const maskable = await resolveSquareIconPath(logoId, 512, {
    bg: "ffffff",
    padding: 0.14,
  });
  const icons: MetadataRoute.Manifest["icons"] = icon192 && icon512 && maskable
    ? [
        { src: icon192, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: icon512, sizes: "512x512", type: "image/png", purpose: "any" },
        { src: maskable, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ]
    : [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ];

  return {
    name,
    short_name: name.length > 24 ? name.slice(0, 24) : name,
    description: business?.slogan || "Pedidos en línea",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: backgroundColor,
    theme_color: themeColor,
    icons,
  };
}
