import Link from "next/link";

import type { ResourceRelationCapability } from "@/core/api/contracts";

/**
 * Navegación por pestañas del flujo de administración de un item: "Datos generales"
 * (el formulario de edición) y un tab por cada editor relacional publicado por el
 * backend (ya filtrado por permiso). Las URLs se construyen con la referencia del item
 * (placeholder), nunca asumiendo "id"; el actor no escribe rutas a mano.
 *
 * ``active`` es ``"general"`` en la edición o el ``name`` de la relación en su editor.
 */
export function ResourceEditTabs({
  resourceName,
  id,
  relations,
  active,
}: Readonly<{
  resourceName: string;
  id: string;
  relations: ResourceRelationCapability[];
  active: "general" | string;
}>) {
  const base = `/resources/${encodeURIComponent(resourceName)}/${encodeURIComponent(id)}`;
  const tabs: { key: string; label: string; href: string }[] = [
    { key: "general", label: "Datos generales", href: `${base}/edit` },
    ...relations.map((relation) => ({
      key: relation.name,
      label: relation.label,
      href: `${base}/${encodeURIComponent(relation.name)}`,
    })),
  ];

  return (
    <nav aria-label="Secciones del recurso" className="flex flex-wrap gap-1 border-b border-slate-200">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              isActive
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
