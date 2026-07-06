import "server-only";

import type { Metadata } from "next";

import { getPublicBusiness } from "./business";
import type { PublicBusiness } from "./contracts";
import type { SiteVM } from "./view-models";

// Favicon dinámico SEGURO: solo formatos raster/ico permitidos. Si el backend
// devuelve SVG (riesgo H8 documentado) u otro tipo, cae al fallback estático
// de bootstrap. Nunca se inserta SVG remoto inline.
const SAFE_FAVICON_TYPES = new Set([
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "image/png",
  "image/webp",
  "image/jpeg",
]);

function backendBase(): string {
  return process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8000";
}

// Misma política para el LOGO dinámico (§D): mientras H8 siga abierto en
// backend, solo se renderizan imágenes raster verificadas por content-type;
// un logo SVG cae al BrandLockup textual. La sanitización definitiva es del
// servidor de archivos, no de este frontend.
export const resolveSafeImagePath = resolveSafeFaviconPath;

export async function resolveSafeFaviconPath(
  fileId: string | null | undefined,
): Promise<string | null> {
  if (!fileId || !/^[0-9a-fA-F-]{36}$/.test(fileId)) return null;
  try {
    // Timeout corto: obtener el favicon JAMÁS puede volverse punto de fallo
    // de generateMetadata ni retrasar la portada; cualquier fallo → fallback.
    const response = await fetch(
      new URL(`/api/v1/public/files/${fileId}`, backendBase()),
      { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(1500) },
    );
    if (!response.ok) return null;
    const type = (response.headers.get("content-type") ?? "").split(";")[0].trim();
    // El propio file id (UUID nuevo en cada reemplazo) evita favicon obsoleto.
    return SAFE_FAVICON_TYPES.has(type) ? `/api/v1/public/files/${fileId}` : null;
  } catch {
    return null;
  }
}

/**
 * URL del ícono CUADRADO de la PWA (logo centrado + márgenes transparentes,
 * generado al vuelo por el backend). Devuelve null si el logo no es un raster
 * seguro (misma verificación que el favicon) → el llamador cae al placeholder.
 * ``v`` = el propio file id, para refrescar la caché cuando cambie el logo.
 */
export async function resolveSquareIconPath(
  fileId: string | null | undefined,
  size: number,
): Promise<string | null> {
  const safe = await resolveSafeFaviconPath(fileId);
  if (!safe) return null;
  return `/api/v1/public/business/pwa-icon?size=${size}&v=${fileId}`;
}

/**
 * Favicon institucional para las secciones sin head propio (panel, admin, auth):
 * el LOGO del negocio, con la misma política raster segura. Cualquier fallo →
 * metadata vacía (queda el head estático del root layout).
 */
export async function businessFaviconMetadata(): Promise<Metadata> {
  try {
    const business = await getPublicBusiness();
    const icon = await resolveSafeFaviconPath(business?.logo_file_id);
    // apple-touch-icon de la PWA en iOS = ícono CUADRADO (logo centrado); los
    // layouts hijos sobrescriben `icons`, así que se declara en cada sección.
    const apple = await resolveSquareIconPath(business?.logo_file_id, 180);
    return icon ? { icons: { icon, apple: apple ?? icon } } : {};
  } catch {
    return {};
  }
}

/** Cadena de resolución del head: sitio → negocio. */
export async function buildStorefrontMetadata(
  business: PublicBusiness | null,
  site: SiteVM | null,
): Promise<Metadata> {
  const title = site?.meta.title ?? business?.trade_name ?? "Restaurante";
  const description = site?.meta.description ?? business?.slogan ?? undefined;
  // Favicon: el del sitio configurado y, en su defecto, el logo del negocio.
  const logo = await resolveSafeFaviconPath(business?.logo_file_id);
  const favicon =
    (await resolveSafeFaviconPath(site?.meta.favicon_file_id)) ?? logo;
  // apple-touch-icon (PWA en iOS): ícono CUADRADO del logo (centrado, 180x180
  // como recomienda Apple), con el logo/favicon crudo como respaldo.
  const appleIcon =
    (await resolveSquareIconPath(business?.logo_file_id, 180)) ?? logo ?? favicon;
  const ogImage = site?.meta.social_image_file_id
    ? `/api/v1/public/files/${site.meta.social_image_file_id}`
    : undefined;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: business?.trade_name ?? undefined,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    icons: favicon ? { icon: favicon, apple: appleIcon ?? favicon } : undefined,
  };
}
