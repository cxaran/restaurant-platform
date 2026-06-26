import type { ResourceListCapability } from "@/core/api/contracts";
import type { FilterControls } from "@/core/resources/list-query";

type SearchCapability = ResourceListCapability["search"];

export function ResourceListControls({
  resourceName,
  search,
  controls,
  filters,
  searchValue,
  searchTooShort,
  sortParam,
  limit,
}: Readonly<{
  resourceName: string;
  search: SearchCapability;
  controls: FilterControls;
  filters: Record<string, string>;
  searchValue: string;
  searchTooShort: boolean;
  sortParam?: string;
  limit: number;
}>) {
  const hasSearch = search.enabled;
  const hasFilters = controls.ordered.length > 0;
  if (!hasSearch && !hasFilters) {
    return null;
  }

  const action = `/resources/${encodeURIComponent(resourceName)}`;
  const effectiveMin = Math.max(search.min_length ?? 0, 1);

  return (
    <form method="get" action={action} className="flex flex-wrap items-end gap-4">
      {hasSearch ? (
        <div className="flex flex-col">
          <label htmlFor="q" className="mb-1 text-xs font-medium text-slate-600">
            Buscar
          </label>
          <input
            id="q"
            type="search"
            name="q"
            defaultValue={searchValue}
            minLength={search.min_length ?? undefined}
            maxLength={search.max_length ?? undefined}
            placeholder="Buscar…"
            className="w-64 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          {searchTooShort ? (
            <p className="mt-1 text-xs text-slate-500">
              Escribe al menos {effectiveMin} caracteres para buscar.
            </p>
          ) : null}
        </div>
      ) : null}

      {controls.ordered.map((control) => (
        <div key={control.parameter} className="flex flex-col">
          <label
            htmlFor={`filter-${control.parameter}`}
            className="mb-1 text-xs font-medium text-slate-600"
          >
            {control.label}
          </label>
          <select
            id={`filter-${control.parameter}`}
            name={control.parameter}
            defaultValue={filters[control.parameter] ?? ""}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            {control.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ))}

      {/* Preserva sort explícito y límite; sin offset → reinicia en 0. */}
      {sortParam ? <input type="hidden" name="sort" value={sortParam} /> : null}
      <input type="hidden" name="limit" value={limit} />

      <button
        type="submit"
        className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
      >
        Aplicar
      </button>
    </form>
  );
}
