import type { components } from "@/generated/openapi";

// Fila genérica: las columnas reales se derivan de la capability, no del row.
export type ResourceRow = Record<string, unknown>;

// Reutiliza el schema de paginación generado por OpenAPI (no se replica a mano).
export type ResourceListPage = {
  items: ResourceRow[];
  pagination: components["schemas"]["OffsetPagination"];
};
