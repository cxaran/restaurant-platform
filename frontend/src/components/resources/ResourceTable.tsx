import type { ResourceListCapability } from "@/core/api/contracts";
import type { ResourceListPage } from "@/core/resources/list-types";

import { formatCell } from "./format-cell";

export function ResourceTable({
  label,
  list,
  page,
}: Readonly<{
  label: string;
  list: ResourceListCapability;
  page: ResourceListPage;
}>) {
  const columns = list.fields.filter((field) => field.visible_in_list);
  const { items, pagination } = page;

  return (
    <section className="space-y-4">
      <header className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold text-slate-900">{label}</h2>
      </header>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.name}
                  scope="col"
                  className="px-4 py-3 text-left font-medium text-slate-600"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length || 1}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No hay registros.
                </td>
              </tr>
            ) : (
              items.map((row, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-slate-50">
                  {columns.map((column) => (
                    <td key={column.name} className="px-4 py-3 text-slate-800">
                      {formatCell(row[column.name], column.type)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="text-sm text-slate-500">
        <p>Total: {pagination.total} registros</p>
        <p>Mostrando: {items.length} registros en esta página</p>
      </div>
    </section>
  );
}
