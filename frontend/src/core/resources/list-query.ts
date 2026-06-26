import type { ResourceListCapability } from "@/core/api/contracts";

export type SortDirection = "asc" | "desc";

export type ResourceListQuery = {
  q?: string;
  sort?: {
    field: string;
    direction: SortDirection;
  };
  limit: number;
  offset: number;
  filters: Record<string, string>;
};

export type FilterControl = {
  parameter: string;
  field: string;
  label: string;
  options: readonly { value: string; label: string }[];
};

export type FilterControls = {
  ordered: readonly FilterControl[];
  byParameter: ReadonlyMap<string, FilterControl>;
};

type RawSearchParams = Record<string, string | string[] | undefined>;

const RESERVED_PARAMETERS = new Set(["q", "sort", "limit", "offset"]);

/** Capability de filtro inconsistente o widget no soportado: error hacia la boundary. */
export class FilterContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FilterContractError";
  }
}

/**
 * Índice ordenado y validado de controles de filtro desde ``list.filters``.
 *
 * Conserva el orden declarado por backend y valida el contrato (no el input del
 * usuario). Una capability inválida lanza ``FilterContractError`` → error boundary.
 * En este commit el único widget soportado en UI es ``select``.
 */
export function buildFilterControls(list: ResourceListCapability): FilterControls {
  const fieldsByName = new Map(list.fields.map((field) => [field.name, field]));
  const ordered: FilterControl[] = [];
  const byParameter = new Map<string, FilterControl>();

  for (const filter of list.filters) {
    if (!filter.parameter) {
      throw new FilterContractError("Filtro con parameter vacío.");
    }
    if (RESERVED_PARAMETERS.has(filter.parameter)) {
      throw new FilterContractError(`El filtro usa un parameter reservado: ${filter.parameter}.`);
    }
    if (byParameter.has(filter.parameter)) {
      throw new FilterContractError(`Parameter de filtro duplicado: ${filter.parameter}.`);
    }
    const field = filter.field ? fieldsByName.get(filter.field) : undefined;
    if (!field) {
      throw new FilterContractError(`El filtro '${filter.parameter}' referencia un field inválido.`);
    }
    if (!field.filter_operators.includes(filter.operator)) {
      throw new FilterContractError(
        `El operador '${filter.operator}' no está en filter_operators de '${field.name}'.`,
      );
    }
    if (filter.widget !== "select") {
      throw new FilterContractError(`Widget de filtro no soportado en este commit: ${filter.widget}.`);
    }
    if (!filter.options || filter.options.length === 0) {
      throw new FilterContractError(`El filtro '${filter.parameter}' (select) no declara opciones.`);
    }

    const seenValues = new Set<string>();
    for (const option of filter.options) {
      if (!option.value) {
        throw new FilterContractError(`El filtro '${filter.parameter}' tiene una opción con value vacío.`);
      }
      if (!option.label || option.label.trim() === "") {
        throw new FilterContractError(`El filtro '${filter.parameter}' tiene una opción sin label.`);
      }
      if (seenValues.has(option.value)) {
        throw new FilterContractError(
          `El filtro '${filter.parameter}' tiene el value de opción duplicado: ${option.value}.`,
        );
      }
      seenValues.add(option.value);
    }

    const control: FilterControl = {
      parameter: filter.parameter,
      field: field.name,
      label: filter.label,
      options: filter.options.map((option) => ({ value: option.value, label: option.label })),
    };
    ordered.push(control);
    byParameter.set(control.parameter, control);
  }

  return { ordered, byParameter };
}

function singleParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseInteger(raw: string | undefined): number | null {
  if (raw === undefined) {
    return null;
  }
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    return null;
  }
  return Number.parseInt(trimmed, 10);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function sortableFieldNames(list: ResourceListCapability): Set<string> {
  return new Set(list.fields.filter((field) => field.sortable).map((field) => field.name));
}

function parseLimit(raw: string | undefined, list: ResourceListCapability): number {
  const { default_limit, max_limit } = list.pagination;
  const parsed = parseInteger(raw);
  if (parsed === null) {
    return default_limit;
  }
  return clamp(parsed, 1, max_limit);
}

function parseOffset(raw: string | undefined): number {
  const parsed = parseInteger(raw);
  if (parsed === null || parsed < 0) {
    return 0;
  }
  return parsed;
}

function parseQuery(raw: string | undefined, list: ResourceListCapability): string | undefined {
  if (raw === undefined || !list.search.enabled) {
    return undefined;
  }
  const trimmed = raw.trim();
  const min = list.search.min_length ?? 0;
  const max = list.search.max_length ?? Number.POSITIVE_INFINITY;
  if (trimmed.length < Math.max(min, 1) || trimmed.length > max) {
    return undefined;
  }
  return trimmed;
}

function parseSort(
  raw: string | undefined,
  list: ResourceListCapability,
): ResourceListQuery["sort"] {
  if (raw === undefined) {
    return undefined;
  }
  const term = raw.trim();
  // Solo un término en esta primera UI: cualquier coma invalida todo el sort.
  if (term === "" || term.includes(",") || term.length > list.sort.max_length) {
    return undefined;
  }
  const direction: SortDirection = term.startsWith("-") ? "desc" : "asc";
  const field = direction === "desc" ? term.slice(1) : term;
  if (field === "" || !sortableFieldNames(list).has(field)) {
    return undefined;
  }
  return { field, direction };
}

// Solo se aceptan parámetros del índice; repetidos, vacíos o no declarados se omiten.
function parseFilters(
  searchParams: RawSearchParams,
  controls: FilterControls,
): Record<string, string> {
  const filters: Record<string, string> = {};
  for (const control of controls.ordered) {
    const raw = singleParam(searchParams[control.parameter]);
    if (raw === undefined || raw === "") {
      continue;
    }
    if (!control.options.some((option) => option.value === raw)) {
      continue;
    }
    filters[control.parameter] = raw;
  }
  return filters;
}

/** Estado de lista canónico y seguro, validado contra la capability y sus filtros. */
export function parseListQuery(
  searchParams: RawSearchParams,
  list: ResourceListCapability,
  controls: FilterControls,
): ResourceListQuery {
  return {
    q: parseQuery(singleParam(searchParams.q), list),
    sort: parseSort(singleParam(searchParams.sort), list),
    limit: parseLimit(singleParam(searchParams.limit), list),
    offset: parseOffset(singleParam(searchParams.offset)),
    filters: parseFilters(searchParams, controls),
  };
}

/** Texto crudo de búsqueda para prellenar el form + si está por debajo del mínimo. */
export function parseSearchField(
  searchParams: RawSearchParams,
  list: ResourceListCapability,
): { value: string; tooShort: boolean } {
  const raw = singleParam(searchParams.q) ?? "";
  const trimmed = raw.trim();
  const min = list.search.min_length ?? 0;
  const tooShort = list.search.enabled && trimmed.length > 0 && trimmed.length < Math.max(min, 1);
  return { value: raw, tooShort };
}

function sortToParam(sort: NonNullable<ResourceListQuery["sort"]>): string {
  return `${sort.direction === "desc" ? "-" : ""}${sort.field}`;
}

/**
 * Reconstruye los parámetros solo desde el estado validado. Orden determinista:
 * q, sort, limit, offset, y luego los filtros en ``controls.ordered`` (allowlist;
 * jamás se itera ``query.filters`` directamente).
 */
export function buildListSearchParams(
  query: ResourceListQuery,
  controls: FilterControls,
): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q !== undefined) {
    params.set("q", query.q);
  }
  if (query.sort !== undefined) {
    params.set("sort", sortToParam(query.sort));
  }
  // limit y offset explícitos siempre: enlaces/forms deterministas.
  params.set("limit", String(query.limit));
  params.set("offset", String(query.offset));
  for (const control of controls.ordered) {
    const value = query.filters[control.parameter];
    if (value === undefined) {
      continue;
    }
    // Defensa: solo se emite un value declarado.
    if (control.options.some((option) => option.value === value)) {
      params.set(control.parameter, value);
    }
  }
  return params;
}

export function buildListHref(
  basePath: string,
  query: ResourceListQuery,
  controls: FilterControls,
): string {
  return `${basePath}?${buildListSearchParams(query, controls).toString()}`;
}

/**
 * Href para alternar el sort de una columna (un solo término):
 * sin sort / otro campo → asc; mismo asc → desc; mismo desc → quitar sort.
 * Siempre resetea offset y preserva q, limit y filtros válidos.
 */
export function buildSortHref(
  basePath: string,
  query: ResourceListQuery,
  controls: FilterControls,
  fieldName: string,
): string {
  let nextSort: ResourceListQuery["sort"];
  if (!query.sort || query.sort.field !== fieldName) {
    nextSort = { field: fieldName, direction: "asc" };
  } else if (query.sort.direction === "asc") {
    nextSort = { field: fieldName, direction: "desc" };
  } else {
    nextSort = undefined;
  }
  return buildListHref(basePath, { ...query, sort: nextSort, offset: 0 }, controls);
}

/** Href para una página por offset, preservando q, sort, limit y filtros. */
export function buildPageHref(
  basePath: string,
  query: ResourceListQuery,
  controls: FilterControls,
  nextOffset: number,
): string {
  return buildListHref(basePath, { ...query, offset: Math.max(0, nextOffset) }, controls);
}
