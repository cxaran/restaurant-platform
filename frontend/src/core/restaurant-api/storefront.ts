import "server-only";

import { ApiRequestError } from "@/core/api/api-error";
import { serverApi } from "@/core/api/server-client";
import {
  toStorefrontPageVM,
  type PublicStorefrontPage,
  type StorefrontPageVM,
} from "./view-models";

export type StorefrontPageResult =
  | { status: "published"; page: StorefrontPageVM }
  | { status: "not_published" }
  | { status: "maintenance"; message: string };

/** Página pública publicada; el backend ya resolvió visibilidad y bindings.
 * El payload está TIPADO en OpenAPI (PublicStorefrontPage): sin parseo defensivo. */
export async function getPublicStorefrontPage(pageKey: string): Promise<StorefrontPageResult> {
  try {
    const raw = await serverApi<PublicStorefrontPage>(
      `/api/v1/public/storefront/${encodeURIComponent(pageKey)}`,
    );
    return { status: "published", page: toStorefrontPageVM(raw) };
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
