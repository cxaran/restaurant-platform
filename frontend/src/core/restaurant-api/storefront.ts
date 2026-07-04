import "server-only";

import { ApiRequestError } from "@/core/api/api-error";
import { serverApi } from "@/core/api/server-client";
import { parseStorefrontPage, type StorefrontPageVM } from "./view-models";

export type StorefrontPageResult =
  | { status: "published"; page: StorefrontPageVM }
  | { status: "not_published" }
  | { status: "maintenance"; message: string };

/** Página pública publicada; el backend ya resolvió visibilidad y bindings. */
export async function getPublicStorefrontPage(pageKey: string): Promise<StorefrontPageResult> {
  try {
    const raw = await serverApi<unknown>(
      `/api/v1/public/storefront/${encodeURIComponent(pageKey)}`,
    );
    const page = parseStorefrontPage(raw);
    return page ? { status: "published", page } : { status: "not_published" };
  } catch (error) {
    if (error instanceof ApiRequestError) {
      if (error.status === 503) {
        return { status: "maintenance", message: error.body.message };
      }
      if (error.status === 404) return { status: "not_published" };
    }
    throw error;
  }
}
