import type { PermissionsCatalog } from "@/core/api/contracts";

/**
 * Renderer accesible de la vista ``grouped_catalog`` (catálogo de permisos).
 *
 * No es una tabla falsa: cada grupo es una sección con encabezado real y sus
 * permisos se listan con label y descripción. Consume el mismo contrato público
 * (``/api/v1/permissions``) que alimenta el editor de permisos de roles.
 */
export function GroupedCatalog({
  label,
  catalog,
}: Readonly<{ label: string; catalog: PermissionsCatalog }>) {
  if (catalog.length === 0) {
    return (
      <p className="rounded-md border border-[var(--border)] bg-white px-4 py-6 text-sm text-[var(--tx3)]">
        No hay permisos disponibles.
      </p>
    );
  }

  return (
    <div aria-label={label} className="space-y-5">
      {catalog.map((group) => (
        <section
          key={group.name}
          aria-labelledby={`group-${group.name}`}
          className="rounded-lg border border-[var(--border)] bg-white p-5"
        >
          <h2 id={`group-${group.name}`} className="text-base font-semibold text-[var(--tx)]">
            {group.label}
          </h2>
          <ul className="mt-3 divide-y divide-[var(--border)]">
            {group.permissions.map((permission) => (
              <li key={permission.access} className="py-2">
                <p className="text-sm font-medium text-[var(--tx2)]">{permission.label}</p>
                {permission.description && permission.description !== permission.label ? (
                  <p className="mt-0.5 text-sm text-[var(--tx3)]">{permission.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
