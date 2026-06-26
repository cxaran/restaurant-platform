import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ApiRequestError } from "@/core/api/api-error";
import type { ResourceCapability } from "@/core/api/contracts";
import { serverApi } from "@/core/api/server-client";
import type { ResourceListPage, ResourceRow } from "@/core/resources/list-types";

class InvalidListResponseError extends Error {
  constructor() {
    super("La respuesta de la lista de recursos no tiene la forma esperada.");
    this.name = "InvalidListResponseError";
  }
}

// Defensa: aunque ``api_path`` viene del backend, solo se acepta un path interno
// relativo bajo /api/. Cualquier otra cosa (URL absoluta, protocol-relative, host)
// se rechaza sin intentar corregirla.
function assertInternalApiPath(path: string): void {
  if (
    typeof path !== "string" ||
    !path.startsWith("/api/") ||
    path.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(path)
  ) {
    throw new InvalidListResponseError();
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseListPage(raw: unknown): ResourceListPage {
  if (!isPlainObject(raw)) {
    throw new InvalidListResponseError();
  }

  const { items, pagination } = raw;
  if (!Array.isArray(items) || !isPlainObject(pagination)) {
    throw new InvalidListResponseError();
  }

  if (
    !isFiniteNumber(pagination.limit) ||
    !isFiniteNumber(pagination.offset) ||
    !isFiniteNumber(pagination.total) ||
    typeof pagination.has_next !== "boolean"
  ) {
    throw new InvalidListResponseError();
  }

  const rows: ResourceRow[] = [];
  for (const item of items) {
    if (!isPlainObject(item)) {
      throw new InvalidListResponseError();
    }
    rows.push(item);
  }

  return {
    items: rows,
    pagination: {
      limit: pagination.limit,
      offset: pagination.offset,
      total: pagination.total,
      has_next: pagination.has_next,
    },
  };
}

/**
 * Primera página de un recurso ``view: "table"``, resuelta en servidor.
 *
 * Pide ``GET capability.api_path`` sin query params (filtros/sort/paginación llegan
 * en Commit 6). 401 → ``/login``; 403 (pérdida de acceso tras obtener capability) →
 * ``null`` para que la página responda ``notFound()`` sin filtrar contenido; 5xx/red
 * y respuestas inválidas se propagan a la error boundary.
 */
export async function getResourceListPage(
  capability: ResourceCapability,
): Promise<ResourceListPage | null> {
  if (capability.view !== "table" || !capability.list) {
    return null;
  }

  assertInternalApiPath(capability.api_path);
  const cookie = (await cookies()).toString();

  let raw: unknown;
  try {
    raw = await serverApi<unknown>(capability.api_path, { cookie });
  } catch (error) {
    if (error instanceof ApiRequestError) {
      if (error.status === 401) {
        redirect("/login");
      }
      if (error.status === 403) {
        return null;
      }
    }
    throw error;
  }

  return parseListPage(raw);
}
