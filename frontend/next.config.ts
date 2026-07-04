import type { NextConfig } from "next";

const apiProxyTarget = process.env.API_PROXY_TARGET;

// Orígenes adicionales permitidos por el dev server (p. ej. la IP LAN del host para
// probar desde otro dispositivo en la misma red). CSV en DEV_ALLOWED_ORIGINS; vacío
// por defecto (solo localhost). No afecta a producción.
const devAllowedOrigins = (process.env.DEV_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  output: "standalone",
  ...(devAllowedOrigins.length > 0 ? { allowedDevOrigins: devAllowedOrigins } : {}),
  async rewrites() {
    if (!apiProxyTarget) {
      return [];
    }

    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*`,
      },
    ];
  },
  // Compatibilidad tras la reestructura de entornos (público en /, operación
  // en /panel, administración en /admin). Estas rutas antiguas NO deben usarse
  // en navegación, CTAs ni metadata nuevas; solo amortiguan enlaces guardados.
  async redirects() {
    return [
      { source: "/sitio", destination: "/", permanent: false },
      { source: "/sitio/:path*", destination: "/:path*", permanent: false },
      { source: "/resources", destination: "/admin/resources", permanent: false },
      { source: "/resources/:path*", destination: "/admin/resources/:path*", permanent: false },
      { source: "/backups", destination: "/admin/backups", permanent: false },
      { source: "/backups/:path*", destination: "/admin/backups/:path*", permanent: false },
      { source: "/account", destination: "/admin/account", permanent: false },
      { source: "/storefront", destination: "/admin/storefront", permanent: false },
    ];
  },
};

export default nextConfig;
