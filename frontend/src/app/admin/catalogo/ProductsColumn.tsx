"use client";

// Columna central de la pantalla 4a: productos del grupo seleccionado.
// Tarjetas fila con miniatura, resumen (créditos), precio y toggle de
// disponibilidad; búsqueda local y reordenamiento con ↑/↓.

import type {
  ProductListItem,
  ProductRead,
} from "@/core/restaurant-api/contracts";

import { AvailabilitySwitch, ProductThumb, formatMoney } from "./ui";

function primaryImageFileId(detail: ProductRead | undefined): string | null {
  const images = detail?.images ?? [];
  if (images.length === 0) return null;
  const primary = images.find((image) => image.is_primary);
  return (primary ?? images[0]).file_id;
}

function productSummary(detail: ProductRead | undefined): string {
  if (!detail) return "";
  const parts: string[] = [];
  if (detail.credits_awarded_per_unit > 0) {
    parts.push(`otorga ${detail.credits_awarded_per_unit} créditos`);
  }
  if (detail.credit_redemption_price != null) {
    parts.push(`canjeable por ${detail.credit_redemption_price} créditos`);
  }
  if (!detail.is_money_purchase_available) {
    parts.push("solo por créditos");
  }
  return parts.join(" · ");
}

export function ProductsColumn({
  categoryName,
  products,
  details,
  selectedId,
  search,
  onSearch,
  onSelect,
  onToggleAvailability,
  onMove,
  showInactive,
  onToggleShowInactive,
  canUpdate,
  canSort,
  busy,
}: Readonly<{
  categoryName: string | null;
  products: ProductListItem[];
  details: Record<string, ProductRead>;
  selectedId: string | null;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (id: string) => void;
  onToggleAvailability: (product: ProductListItem) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  showInactive: boolean;
  onToggleShowInactive: (next: boolean) => void;
  canUpdate: boolean;
  canSort: boolean;
  busy: boolean;
}>) {
  const query = search.trim().toLowerCase();
  const visible = query
    ? products.filter((product) => product.name.toLowerCase().includes(query))
    : products;
  // Solo se puede reordenar sobre la lista completa (sin filtro de búsqueda)
  // y sin inactivos a la vista: el endpoint de sort-order valida únicamente
  // los productos ACTIVOS de la categoría.
  const sortable = canSort && query === "" && !showInactive;

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <p className="tt-label m-0 min-w-0 flex-1">
          {categoryName ? <>Productos en «{categoryName}»</> : "Productos"}
        </p>
        <label
          className="flex shrink-0 cursor-pointer items-center gap-1 text-[11px] font-bold"
          style={{ color: "var(--tx3)" }}
          title="Incluye los productos dados de baja (conservan su historial y se pueden reactivar)"
        >
          <input
            type="checkbox"
            checked={showInactive}
            disabled={busy}
            onChange={(event) => onToggleShowInactive(event.target.checked)}
            style={{ accentColor: "var(--accent)" }}
          />
          Mostrar inactivos
        </label>
        <input
          className="tt-input"
          style={{ width: 200, borderRadius: 999, padding: "7px 14px", fontSize: 12 }}
          placeholder="Buscar producto…"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          aria-label="Buscar producto en el grupo"
        />
      </div>

      {showInactive && canSort ? (
        <p className="m-0 px-1 text-[11px]" style={{ color: "var(--tx3)" }}>
          Para reordenar, oculta primero los inactivos.
        </p>
      ) : null}

      {products.length === 0 ? (
        <p className="m-0 text-sm" style={{ color: "var(--tx3)" }}>
          Este grupo aún no tiene productos.
        </p>
      ) : visible.length === 0 ? (
        <p className="m-0 text-sm" style={{ color: "var(--tx3)" }}>
          Sin coincidencias para «{search.trim()}».
        </p>
      ) : null}

      {visible.map((product, index) => {
        const active = product.id === selectedId;
        const inactive = !product.is_active;
        const detail = details[product.id];
        const summary = productSummary(detail);
        return (
          <div
            key={product.id}
            className="flex cursor-pointer items-center gap-3 rounded-[14px] px-3.5 py-3"
            style={{
              background: "var(--panel)",
              border: active ? "2px solid var(--accent)" : "1px solid var(--border)",
              boxShadow: active ? "0 6px 16px rgba(193, 39, 45, 0.1)" : undefined,
              opacity: inactive ? 0.5 : product.is_available ? 1 : 0.6,
            }}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(product.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(product.id);
              }
            }}
          >
            {sortable ? (
              <span className="flex flex-col gap-0.5" onClick={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  aria-label={`Subir ${product.name}`}
                  disabled={busy || index === 0}
                  onClick={() => onMove(product.id, -1)}
                  className="cursor-pointer rounded border-0 bg-transparent px-1 text-[11px] leading-none disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ color: "var(--tx3)" }}
                >
                  ▲
                </button>
                <button
                  type="button"
                  aria-label={`Bajar ${product.name}`}
                  disabled={busy || index === visible.length - 1}
                  onClick={() => onMove(product.id, 1)}
                  className="cursor-pointer rounded border-0 bg-transparent px-1 text-[11px] leading-none disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ color: "var(--tx3)" }}
                >
                  ▼
                </button>
              </span>
            ) : null}

            <ProductThumb name={product.name} fileId={primaryImageFileId(detail)} />

            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-sm" style={{ fontWeight: 800 }}>
                  {product.name}
                </span>
                {inactive ? (
                  <span className="tt-badge tt-badge-done shrink-0">INACTIVO</span>
                ) : null}
              </span>
              {inactive ? (
                <span className="truncate text-xs" style={{ color: "var(--tx3)" }}>
                  Fuera del catálogo · selecciónalo para reactivarlo
                </span>
              ) : product.is_available ? (
                summary ? (
                  <span className="truncate text-xs" style={{ color: "var(--tx2)" }}>
                    {summary}
                  </span>
                ) : null
              ) : (
                <span
                  className="truncate text-xs font-bold"
                  style={{ color: "var(--accent)" }}
                >
                  No disponible en el sitio
                </span>
              )}
            </div>

            <span className="text-[15px]" style={{ fontWeight: 900 }}>
              {formatMoney(product.money_price_amount)}
            </span>

            <AvailabilitySwitch
              checked={product.is_available}
              disabled={!canUpdate || busy || inactive}
              label={`Disponibilidad de ${product.name}`}
              onChange={() => onToggleAvailability(product)}
            />
          </div>
        );
      })}
    </div>
  );
}
