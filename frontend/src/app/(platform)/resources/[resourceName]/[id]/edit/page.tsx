import Link from "next/link";
import { notFound } from "next/navigation";

import { ResourceUpdateForm } from "@/components/resources/ResourceUpdateForm";
import { requireSession } from "@/core/auth/session";
import { getResourceCapability } from "@/core/resources/capabilities-client";
import { fillPlaceholder } from "@/core/resources/item-reference";
import { getResourceDetail } from "@/core/resources/resource-detail-client";
import { assertSupportedUpdateForm } from "@/core/resources/resource-form";

type PageProps = {
  params: Promise<{ resourceName: string; id: string }>;
};

/**
 * Edición genérica guiada por capability. El segmento ``id`` es el valor de la
 * referencia del item; las URLs (detail, update) se construyen sustituyendo el
 * ``placeholder`` declarado por ``item_reference``, nunca asumiendo "id".
 *
 * notFound si falta item_reference, detail o forms.update, o si el detalle no es
 * accesible. Los valores iniciales provienen del detalle (fuente de verdad), no de
 * la fila de tabla.
 */
export default async function EditResourcePage({ params }: PageProps) {
  await requireSession();
  const { resourceName, id } = await params;

  const capability = await getResourceCapability(resourceName);
  if (
    !capability ||
    capability.view !== "table" ||
    !capability.item_reference ||
    !capability.detail ||
    !capability.forms?.update
  ) {
    notFound();
  }

  assertSupportedUpdateForm(capability.forms.update);

  const placeholder = capability.item_reference.placeholder;
  const detailUrl = fillPlaceholder(capability.detail.url_template, placeholder, id);
  const mutationUrl = fillPlaceholder(capability.forms.update.url_template, placeholder, id);

  const detail = await getResourceDetail(detailUrl);
  if (!detail) {
    notFound();
  }

  // Editores relacionales publicados por el backend (ya filtrados por permiso). Se
  // exponen como navegación dentro del flujo de edición: las URLs se construyen con la
  // referencia del item (placeholder), nunca asumiendo "id".
  const relations = capability.relations ?? [];

  return (
    <div className="space-y-6">
      <ResourceUpdateForm
        resourceName={resourceName}
        resourceLabel={capability.label}
        update={capability.forms.update}
        mutationUrl={mutationUrl}
        initialValues={detail}
      />

      {relations.length > 0 ? (
        <nav
          aria-label="Relaciones"
          className="max-w-xl space-y-3 rounded-lg border border-slate-200 bg-white p-6"
        >
          <h2 className="text-sm font-semibold text-slate-700">Relaciones</h2>
          <ul className="space-y-2">
            {relations.map((relation) => (
              <li key={relation.name}>
                <Link
                  href={`/resources/${encodeURIComponent(resourceName)}/${encodeURIComponent(
                    id,
                  )}/${encodeURIComponent(relation.name)}`}
                  className="text-sm font-medium text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
                >
                  Editar {relation.label}
                </Link>
                {relation.description ? (
                  <p className="text-xs text-slate-500">{relation.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
