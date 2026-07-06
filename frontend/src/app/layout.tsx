import type { Metadata } from "next";
import { Alfa_Slab_One, Archivo } from "next/font/google";

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

export const metadata: Metadata = {
  title: "Restaurant Platform",
  description: "Shell base reutilizable para productos Restaurant Platform",
  // PWA: manifest + metadatos de Apple (iOS solo recibe Web Push desde la app
  // instalada en la pantalla de inicio; ver docs/producto/notificaciones-y-roles.md).
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/icon-192.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${sans.variable} ${slab.variable}`}>{children}</body>
    </html>
  );
}
