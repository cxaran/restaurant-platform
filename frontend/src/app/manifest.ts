import type { MetadataRoute } from "next";

import { getPublicBusiness } from "@/core/restaurant-api/business";

// Manifest de la PWA: hace el sitio INSTALABLE (requisito duro de iOS para
// Web Push: solo la app añadida a la pantalla de inicio recibe avisos). El
// nombre sale del negocio configurado; los íconos son estáticos (placeholder
// raster — el logo del negocio no garantiza tamaños 192/512).
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const business = await getPublicBusiness();
  const name = business?.trade_name || "Restaurant Platform";
  return {
    name,
    short_name: name.length > 24 ? name.slice(0, 24) : name,
    description: business?.slogan || "Pedidos en línea",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#e8622c",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
