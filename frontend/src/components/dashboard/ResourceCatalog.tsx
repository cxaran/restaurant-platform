import Link from "next/link";

import type { ResourceCapability, ResourceView } from "@/core/api/contracts";

const VIEW_DESCRIPTION: Record<ResourceView, string> = {
  table: "Módulo con listado administrativo",
  grouped_catalog: "Catálogo organizado por grupos",
};

const VIEW_LABEL: Record<ResourceView, string> = {
  table: "Listado",
  grouped_catalog: "Catálogo agrupado",
};

function CardContent({ resource }: Readonly<{ resource: ResourceCapability }>) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-[var(--tx)]">{resource.label}</h3>
        <span className="shrink-0 rounded-full bg-[var(--panel2)] px-2.5 py-0.5 text-xs font-medium text-[var(--tx2)]">
          {VIEW_LABEL[resource.view]}
        </span>
      </div>
      <p className="mt-2 text-sm text-[var(--tx3)]">{VIEW_DESCRIPTION[resource.view]}</p>
    </>
  );
}

export function ResourceCatalog({
  resources,
}: Readonly<{ resources: ResourceCapability[] }>) {
  if (resources.length === 0) {
    return (
      <p className="rounded-lg border border-[var(--border)] bg-white px-4 py-6 text-sm text-[var(--tx3)]">
        No tienes módulos disponibles.
      </p>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {resources.map((resource) => (
        <li key={resource.name}>
          {resource.view === "table" ? (
            <Link
              href={`/admin/resources/${encodeURIComponent(resource.name)}`}
              className="block rounded-lg border border-[var(--border)] bg-white p-5 transition hover:border-[var(--border2)] hover:shadow-sm"
            >
              <CardContent resource={resource} />
            </Link>
          ) : (
            <div className="rounded-lg border border-[var(--border)] bg-white p-5">
              <CardContent resource={resource} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
