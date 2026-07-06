import type { Metadata } from "next";
import { Alfa_Slab_One, Archivo } from "next/font/google";

import { getPublicBusiness } from "@/core/restaurant-api/business";
import { resolveSquareIconPath } from "@/core/restaurant-api/site-metadata";

import "./globals.css";

// Fuentes de la identidad visual (mismas del storefront): Archivo para el
// cuerpo y Alfa Slab One como display. Alimentan --font-tt-* que globals.css
// mapea a --font-sans / --font-display para admin, panel y auth.
const sans = Archivo({ subsets: ["latin"], variable: "--font-tt-sans" });
const slab = Alfa_Slab_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-tt-slab",
});

// Metadata DINÁMICA para la marca real de la app instalada: iOS toma el nombre
// de la pantalla de inicio de `appleWebApp.title` y el ícono del
// `apple-touch-icon` (NO del manifest). Se derivan del negocio; cualquier fallo
// degrada al placeholder (getPublicBusiness ya devuelve null en bootstrap).
export async function generateMetadata(): Promise<Metadata> {
  const business = await getPublicBusiness();
  const name = business?.trade_name || "Restaurant Platform";
  const appleIcon =
    (await resolveSquareIconPath(business?.logo_file_id, 180)) ?? "/icons/icon-192.png";
  return {
    title: name,
    description: business?.slogan || "Shell base reutilizable para productos Restaurant Platform",
    // PWA: manifest + metadatos de Apple (iOS solo recibe Web Push desde la app
    // instalada en la pantalla de inicio; ver docs/producto/notificaciones-y-roles.md).
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: name,
    },
    icons: {
      apple: appleIcon,
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${sans.variable} ${slab.variable}`}>{children}</body>
    </html>
  );
}
