import "server-only";

import type { Metadata } from "next";

import { getPublicBusiness } from "./business";
import type { PublicBusiness } from "./contracts";
import type { StorefrontPageVM } from "./view-models";

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
 * Favicon institucional para las secciones sin head propio (panel, admin, auth):
 * el LOGO del negocio, con la misma política raster segura. Cualquier fallo →
 * metadata vacía (queda el head estático del root layout).
 */
export async function businessFaviconMetadata(): Promise<Metadata> {
  try {
    const business = await getPublicBusiness();
    const icon = await resolveSafeFaviconPath(business?.logo_file_id);
    return icon ? { icons: { icon } } : {};
  } catch {
    return {};
  }
}

/** Cadena de resolución del head (§45.1): página → sitio → negocio. */
export async function buildStorefrontMetadata(
  business: PublicBusiness | null,
  page: StorefrontPageVM | null,
): Promise<Metadata> {
  const title = page?.meta.title ?? business?.trade_name ?? "Restaurante";
  const description = page?.meta.description ?? business?.slogan ?? undefined;
  // Favicon: el de la página publicada y, en su defecto, el logo del negocio.
  const favicon =
    (await resolveSafeFaviconPath(page?.meta.favicon_file_id)) ??
    (await resolveSafeFaviconPath(business?.logo_file_id));
  const ogImage = page?.meta.og_image_file_id
    ? `/api/v1/public/files/${page.meta.og_image_file_id}`
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
    icons: favicon ? { icon: favicon } : undefined,
  };
}
