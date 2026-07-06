import type { MetadataRoute } from "next";

import { getPublicBusiness } from "@/core/restaurant-api/business";
import { resolveSafeImagePath } from "@/core/restaurant-api/site-metadata";
import { getPublicStorefrontSite } from "@/core/restaurant-api/storefront";
import { FALLBACK_TOKENS } from "@/core/restaurant-api/view-models";

// Manifest de la PWA: hace el sitio INSTALABLE (requisito duro de iOS para
// Web Push: solo la app añadida a la pantalla de inicio recibe avisos) y le da
// la MARCA REAL del negocio al instalarlo: nombre + logo + colores del tema.
//
// - Nombre/descr.: del negocio configurado (`GET /public/business`).
// - Íconos: el LOGO del negocio si es raster seguro (misma política que el
//   favicon; SVG bloqueado por H8). Si no hay logo válido, cae a los íconos
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

  const logo = await resolveSafeImagePath(business?.logo_file_id);
  // Si hay logo válido lo usamos como ícono principal (declarado en los tamaños
  // que Android busca para el launcher/splash, aunque la imagen original no
  // sea exactamente cuadrada); el maskable queda en el placeholder.
  const icons: MetadataRoute.Manifest["icons"] = logo
    ? [
        { src: logo, sizes: "192x192", purpose: "any" },
        { src: logo, sizes: "512x512", purpose: "any" },
        {
          src: "/icons/icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
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
