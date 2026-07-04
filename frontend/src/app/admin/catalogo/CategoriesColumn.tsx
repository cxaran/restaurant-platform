"use client";

// Columna izquierda de la pantalla 4a: grupos (categorías) del catálogo.
// Tarjetas con conteo de productos, reordenamiento con ↑/↓ (PUT sort-order),
// alta inline y badge OCULTO para categorías con is_active=false.

import { useState, type FormEvent } from "react";

import type { CategoryRead } from "@/core/restaurant-api/contracts";

export function CategoriesColumn({
  categories,
  productCounts,
  selectedId,
  onSelect,
  onCreate,
  onMove,
  onToggleHidden,
  showAddForm,
  onShowAddForm,
  canCreate,
  canUpdate,
  canSort,
  busy,
}: Readonly<{
  categories: CategoryRead[];
  productCounts: Record<string, number>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
  onMove: (id: string, direction: -1 | 1) => void;
  onToggleHidden: (category: CategoryRead) => void;
  showAddForm: boolean;
  onShowAddForm: (show: boolean) => void;
  canCreate: boolean;
  canUpdate: boolean;
  canSort: boolean;
  busy: boolean;
}>) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      await onCreate(name);
      setNewName("");
      onShowAddForm(false);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="tt-label m-0 px-1">Grupos · usa ↑ ↓ para ordenar</p>

      {categories.length === 0 ? (
        <p className="m-0 px-1 text-sm" style={{ color: "var(--tx3)" }}>
          Aún no hay grupos en el catálogo.
        </p>
      ) : null}

      {categories.map((category, index) => {
        const active = category.id === selectedId;
        const count = productCounts[category.id] ?? 0;
        return (
          <div
            key={category.id}
            className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm"
            style={
              active
                ? {
                    background: "var(--side-bg)",
                    color: "var(--side-strong)",
                    fontWeight: 800,
                  }
                : {
                    background: "var(--panel)",
                    border: "1px solid var(--border)",
                    color: category.is_active ? "var(--tx2)" : "var(--tx3)",
                    fontWeight: 600,
                  }
            }
          >
            <button
              type="button"
              onClick={() => onSelect(category.id)}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left font-[inherit] text-inherit"
              style={{ fontWeight: "inherit", fontSize: "inherit", color: "inherit" }}
            >
              <span className="min-w-0 flex-1 truncate">{category.name}</span>
              <span
                className="rounded-full px-2 py-px text-[11px]"
                style={
                  active
                    ? { background: "var(--accent)", color: "var(--on-accent)" }
                    : { background: "var(--seg-bg)", color: "var(--tx2)" }
                }
              >
                {count}
              </span>
              {!category.is_active ? (
                <span className="tt-badge tt-badge-done">OCULTO</span>
              ) : null}
            </button>

            {active && canUpdate ? (
              <button
                type="button"
                onClick={() => onToggleHidden(category)}
                disabled={busy}
                className="cursor-pointer rounded-md border-0 px-1.5 py-0.5 text-[11px] font-bold"
                style={{ background: "rgba(201,188,161,0.2)", color: "var(--side-tx)" }}
                title={
                  category.is_active
                    ? "Ocultar este grupo del sitio"
                    : "Volver a mostrar este grupo en el sitio"
                }
              >
                {category.is_active ? "Ocultar" : "Mostrar"}
              </button>
            ) : null}

            {canSort ? (
              <span className="flex flex-col gap-0.5">
                <button
                  type="button"
                  aria-label={`Subir ${category.name}`}
                  disabled={busy || index === 0}
                  onClick={() => onMove(category.id, -1)}
                  className="cursor-pointer rounded border-0 bg-transparent px-1 text-[11px] leading-none disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ color: active ? "var(--side-tx)" : "var(--tx3)" }}
                >
                  ▲
                </button>
                <button
                  type="button"
                  aria-label={`Bajar ${category.name}`}
                  disabled={busy || index === categories.length - 1}
                  onClick={() => onMove(category.id, 1)}
                  className="cursor-pointer rounded border-0 bg-transparent px-1 text-[11px] leading-none disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ color: active ? "var(--side-tx)" : "var(--tx3)" }}
                >
                  ▼
                </button>
              </span>
            ) : null}
          </div>
        );
      })}

      {canCreate ? (
        showAddForm ? (
          <form onSubmit={handleCreate} className="mt-1 flex flex-col gap-2">
            <input
              className="tt-input"
              placeholder="Nombre del grupo"
              value={newName}
              autoFocus
              onChange={(event) => setNewName(event.target.value)}
              aria-label="Nombre del nuevo grupo"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="tt-btn tt-btn-primary flex-1"
                disabled={creating || newName.trim() === ""}
              >
                {creating ? "Creando…" : "Crear grupo"}
              </button>
              <button
                type="button"
                className="tt-btn tt-btn-ghost"
                onClick={() => onShowAddForm(false)}
                disabled={creating}
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => onShowAddForm(true)}
            className="mt-1 cursor-pointer rounded-xl bg-transparent p-3 text-center text-[13px] font-bold"
            style={{ border: "1px dashed var(--border2)", color: "var(--tx3)" }}
          >
            + Agregar grupo
          </button>
        )
      ) : null}

      <div
        className="mt-auto rounded-xl p-3 text-xs leading-relaxed"
        style={{
          background: "#fff7ea",
          border: "1px solid #e8cfa0",
          color: "#7a5a14",
        }}
      >
        Un grupo oculto no aparece en el sitio, pero conserva sus productos e
        historial.
      </div>
    </div>
  );
}
