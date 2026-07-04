import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ApiRequestError } from "@/core/api/api-error";
import type { ResourceCapability, ResourceRelationCapability } from "@/core/api/contracts";
import { serverApi } from "@/core/api/server-client";
import { getResourceCapability } from "@/core/resources/capabilities-client";

export type RelationOption = { value: string; label: string };
export type RelationOptionGroup = {
  name: string;
  label: string | null;
  options: RelationOption[];
};

export type RelationEditorData = {
  relation: ResourceRelationCapability;
  // Todas las relaciones editables del recurso (para la navegación por pestañas).
  relations: ResourceRelationCapability[];
  mutationUrl: string;
  selected: string[];
  groups: RelationOptionGroup[];
};

class InvalidRelationResponseError extends Error {
  constructor() {
    super("La respuesta del editor relacional no tiene la forma esperada.");
    this.name = "InvalidRelationResponseError";
  }
}

function assertInternalApiPath(path: string): void {
  if (
    typeof path !== "string" ||
    !path.startsWith("/api/") ||
    path.startsWith("//") ||
    path.includes("://") ||
    path.includes("?") ||
    path.includes("#")
  ) {
    throw new InvalidRelationResponseError();
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Sustituye únicamente el segmento literal ``{id}`` de la plantilla declarada por el
// contrato. El id se codifica; no se admite ninguna otra interpolación.
function fillId(template: string, id: string): string {
  if (!template.includes("{id}")) {
    throw new InvalidRelationResponseError();
  }
  return template.replace("{id}", encodeURIComponent(id));
}

function findRelation(
  capability: ResourceCapability,
  relationName: string,
): ResourceRelationCapability | null {
  return (
    (capability.relations ?? []).find((relation) => relation.name === relationName) ?? null
  );
}

async function fetchJson(path: string, cookie: string): Promise<unknown> {
  try {
    return await serverApi<unknown>(path, { cookie });
  } catch (error) {
    if (error instanceof ApiRequestError) {
      if (error.status === 401) {
        redirect("/login");
      }
      if (error.status === 403 || error.status === 404) {
        return null;
      }
    }
    throw error;
  }
}

function isOffsetPage(value: unknown): value is {
  items: unknown[];
  pagination: { has_next?: unknown };
} {
  return (
    isPlainObject(value) &&
    Array.isArray(value.items) &&
    isPlainObject(value.pagination)
  );
}

// Límite máximo del motor de query (OffsetQuerySchema) y tope defensivo de
// páginas: 30 × 100 filas cubren con holgura cualquier catálogo relacional real.
const PAGE_LIMIT = 100;
const MAX_PAGES = 30;

/**
 * Igual que ``fetchJson`` pero, si la respuesta es una página offset (formato
 * ``{items, pagination}``), sigue ``has_next`` y acumula TODAS las filas: sin
 * esto el editor solo mostraría la primera página (20 opciones) y la selección
 * inicial quedaría trunca. Respuestas no paginadas pasan intactas.
 */
async function fetchJsonAllPages(path: string, cookie: string): Promise<unknown> {
  const first = await fetchJson(path, cookie);
  if (first === null || !isOffsetPage(first)) {
    return first;
  }
  const items = [...first.items];
  let hasNext = first.pagination.has_next === true;
  let pages = 1;
  while (hasNext && pages < MAX_PAGES) {
    const page = await fetchJson(
      `${path}?limit=${PAGE_LIMIT}&offset=${items.length}`,
      cookie,
    );
    if (page === null || !isOffsetPage(page) || page.items.length === 0) {
      break;
    }
    items.push(...page.items);
    hasNext = page.pagination.has_next === true;
    pages += 1;
  }
  return { items };
}

function parseSelected(
  raw: unknown,
  relation: ResourceRelationCapability,
): string[] {
  // Selección declarada como campo plano (p. ej. ``permissions``).
  if (relation.selection_field) {
    if (!isPlainObject(raw)) {
      throw new InvalidRelationResponseError();
    }
    const values = raw[relation.selection_field];
    if (!Array.isArray(values)) {
      throw new InvalidRelationResponseError();
    }
    return values.map((value) => String(value));
  }

  // Selección paginada: los valores se leen de ``items[].<options.value_field>``.
  if (!isPlainObject(raw) || !Array.isArray(raw.items)) {
    throw new InvalidRelationResponseError();
  }
  return raw.items.map((item) => {
    if (!isPlainObject(item)) {
      throw new InvalidRelationResponseError();
    }
    return String(item[relation.options.value_field]);
  });
}

function parseOption(
  entry: unknown,
  relation: ResourceRelationCapability,
): RelationOption {
  if (!isPlainObject(entry)) {
    throw new InvalidRelationResponseError();
  }
  const value = entry[relation.options.value_field];
  const label = entry[relation.options.label_field];
  if (value == null || label == null) {
    throw new InvalidRelationResponseError();
  }
  return { value: String(value), label: String(label) };
}

function parseGroups(
  raw: unknown,
  relation: ResourceRelationCapability,
): RelationOptionGroup[] {
  if (relation.options.type === "grouped_catalog") {
    if (!Array.isArray(raw)) {
      throw new InvalidRelationResponseError();
    }
    return raw.map((group) => {
      if (!isPlainObject(group) || !Array.isArray(group.permissions)) {
        throw new InvalidRelationResponseError();
      }
      return {
        name: String(group.name ?? ""),
        label: group.label == null ? null : String(group.label),
        options: group.permissions.map((entry) => parseOption(entry, relation)),
      };
    });
  }

  // Tipo ``list``: página única; se presenta como un solo grupo sin encabezado.
  if (!isPlainObject(raw) || !Array.isArray(raw.items)) {
    throw new InvalidRelationResponseError();
  }
  return [
    {
      name: relation.name,
      label: null,
      options: raw.items.map((entry) => parseOption(entry, relation)),
    },
  ];
}

/**
 * Datos del editor relacional resueltos en servidor desde el contrato.
 *
 * Devuelve ``null`` (la página responde ``notFound()``) cuando el recurso o la
 * relación no son visibles/editables para el actor, o cuando la selección no existe.
 * Un 401 redirige a ``/login``. La forma de selección y opciones se deriva del
 * contrato (``selection_field`` y ``options.type``), nunca de supuestos por nombre.
 */
export async function getRelationEditorData(
  resourceName: string,
  id: string,
  relationName: string,
): Promise<RelationEditorData | null> {
  const capability = await getResourceCapability(resourceName);
  if (!capability) {
    return null;
  }
  const relation = findRelation(capability, relationName);
  if (!relation || !relation.editable) {
    return null;
  }

  const selectionUrl = fillId(relation.selection_url, id);
  const mutationUrl = fillId(relation.mutation_url, id);
  assertInternalApiPath(selectionUrl);
  assertInternalApiPath(mutationUrl);
  assertInternalApiPath(relation.options.url);

  const cookie = (await cookies()).toString();
  const [selectionRaw, optionsRaw] = await Promise.all([
    fetchJsonAllPages(selectionUrl, cookie),
    fetchJsonAllPages(relation.options.url, cookie),
  ]);
  if (selectionRaw === null || optionsRaw === null) {
    return null;
  }

  return {
    relation,
    relations: capability.relations ?? [],
    mutationUrl,
    selected: parseSelected(selectionRaw, relation),
    groups: parseGroups(optionsRaw, relation),
  };
}
