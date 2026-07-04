"use client";

// Panel modal del catálogo (4a): administración de un grupo de modificadores
// y de sus OPCIONES (crear, editar, reordenar, disponibilidad y baja lógica).
// Un grupo puede estar vinculado a varios productos: editar aquí afecta a
// TODOS los que lo comparten. El backend revalida catalog:* en cada llamada.

import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  createModifierGroup,
  createModifierOption,
  getModifierGroup,
  sortModifierOptions,
  updateModifierGroup,
  updateModifierOption,
  type ModifierGroupRead,
  type ModifierGroupUpdate,
  type ModifierOptionRead,
  type ModifierOptionUpdate,
} from "./api";
import { AvailabilitySwitch, apiErrorMessage } from "./ui";

function toIntOr(value: string, fallback: number): number {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function SmallField({
  label,
  children,
  grow = false,
}: Readonly<{ label: string; children: ReactNode; grow?: boolean }>) {
  return (
    <label
      className={`flex ${grow ? "min-w-0 flex-1" : ""} flex-col gap-0.5 px-2.5 py-1.5`}
      style={{
        background: "var(--bg)",
        border: "1px solid var(--border2)",
        borderRadius: 10,
      }}
    >
      <span
        className="text-[9px] font-extrabold uppercase"
        style={{ letterSpacing: "0.6px", color: "var(--tx3)" }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

const bareInputClass =
  "w-full border-0 bg-transparent p-0 font-[inherit] text-[13px] outline-none";

/** Fila editable de una opción: nombre, "+$", disponibilidad y baja lógica. */
function OptionRow({
  option,
  index,
  count,
  busy,
  canUpdate,
  canSort,
  onMove,
  onPatch,
}: Readonly<{
  option: ModifierOptionRead;
  index: number;
  count: number;
  busy: boolean;
  canUpdate: boolean;
  canSort: boolean;
  onMove: (optionId: string, direction: -1 | 1) => void;
  onPatch: (optionId: string, body: ModifierOptionUpdate, successMsg: string) => void;
}>) {
  const [name, setName] = useState(option.name);
  const [price, setPrice] = useState(option.price_adjustment);
  // Sincroniza los borradores locales cuando el servidor confirma el cambio
  // (patrón «adjust state during render», sin efecto).
  const [prevOption, setPrevOption] = useState({
    name: option.name,
    price: option.price_adjustment,
  });
  if (prevOption.name !== option.name || prevOption.price !== option.price_adjustment) {
    setPrevOption({ name: option.name, price: option.price_adjustment });
    setName(option.name);
    setPrice(option.price_adjustment);
  }
  const dirty = name !== option.name || price !== option.price_adjustment;
  const inactive = !option.is_active;

  return (
    <div
      className="flex items-center gap-2 rounded-[10px] px-2.5 py-2"
      style={{
        border: "1px solid var(--border)",
        background: "var(--panel)",
        opacity: inactive ? 0.55 : 1,
      }}
    >
      {canSort ? (
        <span className="flex flex-col gap-0.5">
          <button
            type="button"
            aria-label={`Subir ${option.name}`}
            disabled={busy || index === 0}
            onClick={() => onMove(option.id, -1)}
            className="cursor-pointer rounded border-0 bg-transparent px-1 text-[11px] leading-none disabled:cursor-not-allowed disabled:opacity-40"
            style={{ color: "var(--tx3)" }}
          >
            ▲
          </button>
          <button
            type="button"
            aria-label={`Bajar ${option.name}`}
            disabled={busy || index === count - 1}
            onClick={() => onMove(option.id, 1)}
            className="cursor-pointer rounded border-0 bg-transparent px-1 text-[11px] leading-none disabled:cursor-not-allowed disabled:opacity-40"
            style={{ color: "var(--tx3)" }}
          >
            ▼
          </button>
        </span>
      ) : null}

      <input
        className="min-w-0 flex-1 rounded-md border-0 bg-transparent p-1 text-[13px] font-bold outline-none"
        style={{ color: "var(--tx)" }}
        value={name}
        disabled={!canUpdate || busy}
        onChange={(event) => setName(event.target.value)}
        aria-label={`Nombre de la opción ${option.name}`}
      />
      {inactive ? <span className="tt-badge tt-badge-done shrink-0">INACTIVA</span> : null}

      <span
        className="flex shrink-0 items-center gap-0.5 text-[13px] font-bold"
        style={{ color: "var(--tx2)" }}
      >
        +$
        <input
          className="w-16 rounded-md p-1 text-[13px] font-bold outline-none"
          style={{
            border: "1px solid var(--border2)",
            background: "var(--bg)",
            color: "var(--tx)",
          }}
          inputMode="decimal"
          value={price}
          disabled={!canUpdate || busy}
          onChange={(event) => setPrice(event.target.value)}
          aria-label={`Precio extra de ${option.name}`}
        />
      </span>

      {dirty && canUpdate ? (
        <button
          type="button"
          className="tt-btn tt-btn-success shrink-0"
          style={{ padding: "5px 10px", fontSize: 11 }}
          disabled={busy || name.trim() === ""}
          onClick={() =>
            onPatch(
              option.id,
              { name: name.trim(), price_adjustment: price.trim() || "0" },
              "Opción guardada.",
            )
          }
        >
          Guardar
        </button>
      ) : null}

      <AvailabilitySwitch
        checked={option.is_available}
        disabled={!canUpdate || busy || inactive}
        label={`Disponibilidad de ${option.name}`}
        onChange={(next) =>
          onPatch(
            option.id,
            { is_available: next },
            next ? "Opción disponible." : "Opción marcada como agotada.",
          )
        }
      />

      {canUpdate ? (
        <button
          type="button"
          className="shrink-0 cursor-pointer rounded-md border-0 bg-transparent px-1.5 py-0.5 text-[11px] font-bold disabled:cursor-not-allowed disabled:opacity-50"
          style={{ color: inactive ? "var(--ok)" : "var(--accent)" }}
          disabled={busy}
          title={
            inactive
              ? "Reactivar esta opción en el catálogo"
              : "Baja lógica: la opción deja de ofrecerse pero conserva su historial"
          }
          onClick={() =>
            onPatch(
              option.id,
              { is_active: !option.is_active },
              inactive ? "Opción reactivada." : "Opción desactivada (conserva su historial).",
            )
          }
        >
          {inactive ? "Activar" : "Desactivar"}
        </button>
      ) : null}
    </div>
  );
}

export function ModifierGroupPanel({
  groupId,
  canCreate,
  canUpdate,
  canSort,
  onClose,
  onSaved,
}: Readonly<{
  /** null = crear un grupo nuevo desde cero. */
  groupId: string | null;
  canCreate: boolean;
  canUpdate: boolean;
  canSort: boolean;
  onClose: () => void;
  onSaved: (group: ModifierGroupRead) => void;
}>) {
  const creatingGroup = groupId === null;
  const [detail, setDetail] = useState<ModifierGroupRead | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Ajustes del grupo (nombre, tipo, mín/máx, obligatorio).
  const [name, setName] = useState("");
  const [selectionType, setSelectionType] = useState<"single" | "multiple">("single");
  const [minSel, setMinSel] = useState("0");
  const [maxSel, setMaxSel] = useState("");
  const [isRequired, setIsRequired] = useState(false);

  // Alta de una opción nueva.
  const [optName, setOptName] = useState("");
  const [optPrice, setOptPrice] = useState("");

  const dialogRef = useRef<HTMLDivElement>(null);
  const currentId = detail?.id ?? groupId;

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    getModifierGroup(groupId)
      .then((read) => {
        if (cancelled) return;
        setDetail(read);
        setName(read.name);
        setSelectionType(read.selection_type === "multiple" ? "multiple" : "single");
        setMinSel(String(read.min_selections));
        setMaxSel(read.max_selections == null ? "" : String(read.max_selections));
        setIsRequired(read.is_required);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(apiErrorMessage(err, "No fue posible cargar el grupo."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  function resetMessages() {
    setError(null);
    setNotice(null);
  }

  async function handleSaveGroup() {
    if (busy) return;
    resetMessages();
    const trimmedName = name.trim();
    if (trimmedName === "") {
      setError("El nombre del grupo es obligatorio.");
      return;
    }
    const minValue = toIntOr(minSel, 0);
    const maxValue = maxSel.trim() === "" ? null : toIntOr(maxSel, 0);
    if (maxValue !== null && maxValue < minValue) {
      setError("El máximo de selecciones debe ser mayor o igual que el mínimo.");
      return;
    }
    setBusy(true);
    try {
      if (currentId === null) {
        if (!canCreate) return;
        const read = await createModifierGroup({
          name: trimmedName,
          selection_type: selectionType,
          min_selections: minValue,
          max_selections: maxValue,
          is_required: isRequired,
        });
        setDetail(read);
        onSaved(read);
        setNotice("Grupo creado. Ahora agrega sus opciones.");
      } else {
        if (!canUpdate) return;
        const body: ModifierGroupUpdate = {
          name: trimmedName,
          selection_type: selectionType,
          min_selections: minValue,
          max_selections: maxValue,
          is_required: isRequired,
        };
        const read = await updateModifierGroup(currentId, body);
        setDetail(read);
        onSaved(read);
        setNotice("Grupo guardado.");
      }
    } catch (err) {
      setError(apiErrorMessage(err, "No fue posible guardar el grupo."));
    } finally {
      setBusy(false);
    }
  }

  async function handlePatchOption(
    optionId: string,
    body: ModifierOptionUpdate,
    successMsg: string,
  ) {
    if (busy || !canUpdate || !detail) return;
    resetMessages();
    setBusy(true);
    try {
      const saved = await updateModifierOption(optionId, body);
      setDetail((current) =>
        current
          ? {
              ...current,
              options: (current.options ?? []).map((option) =>
                option.id === saved.id ? saved : option,
              ),
            }
          : current,
      );
      setNotice(successMsg);
    } catch (err) {
      setError(apiErrorMessage(err, "No fue posible guardar la opción."));
    } finally {
      setBusy(false);
    }
  }

  async function handleMoveOption(optionId: string, direction: -1 | 1) {
    if (busy || !canSort || !detail || !currentId) return;
    const options = [...(detail.options ?? [])];
    const index = options.findIndex((option) => option.id === optionId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= options.length) return;
    [options[index], options[target]] = [options[target], options[index]];
    resetMessages();
    setBusy(true);
    try {
      // El PUT exige la lista COMPLETA de ids del grupo en el nuevo orden.
      const saved = await sortModifierOptions(
        currentId,
        options.map((option) => option.id),
      );
      setDetail((current) => (current ? { ...current, options: saved } : current));
    } catch (err) {
      setError(apiErrorMessage(err, "No fue posible reordenar las opciones."));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateOption() {
    if (busy || !canCreate || !currentId) return;
    resetMessages();
    const trimmedName = optName.trim();
    if (trimmedName === "") {
      setError("Escribe el nombre de la nueva opción.");
      return;
    }
    setBusy(true);
    try {
      const created = await createModifierOption(currentId, {
        name: trimmedName,
        price_adjustment: optPrice.trim() || "0",
      });
      setDetail((current) =>
        current
          ? { ...current, options: [...(current.options ?? []), created] }
          : current,
      );
      setOptName("");
      setOptPrice("");
      setNotice("Opción agregada.");
    } catch (err) {
      setError(apiErrorMessage(err, "No fue posible crear la opción."));
    } finally {
      setBusy(false);
    }
  }

  const options = detail?.options ?? [];
  const loadingDetail = groupId !== null && detail === null && loadError === null;
  const canEditGroup = currentId === null ? canCreate : canUpdate;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(28,21,18,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 50,
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modifier-group-panel-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !busy) onClose();
        }}
        className="flex w-full flex-col gap-3 outline-none"
        style={{
          background: "var(--panel)",
          color: "var(--tx)",
          borderRadius: 16,
          border: "1px solid var(--border2)",
          boxShadow: "0 24px 48px rgba(28,21,18,0.25)",
          padding: "18px 20px",
          maxWidth: 560,
          maxHeight: "88vh",
          overflowY: "auto",
        }}
      >
        <div className="flex items-center gap-3">
          <h2
            id="modifier-group-panel-title"
            className="tt-display m-0 min-w-0 flex-1 truncate text-[18px]"
          >
            {creatingGroup && detail === null
              ? "Nuevo grupo de modificadores"
              : `Opciones de «${detail?.name ?? "…"}»`}
          </h2>
          <button
            type="button"
            className="tt-btn tt-btn-ghost"
            onClick={onClose}
            disabled={busy}
          >
            Cerrar
          </button>
        </div>

        <p className="m-0 text-xs leading-relaxed" style={{ color: "var(--tx2)" }}>
          Este grupo puede estar vinculado a varios productos: los cambios en sus
          opciones y ajustes se aplican a <b>todos</b> los productos que lo comparten.
        </p>

        {loadError ? (
          <p role="alert" className="m-0 text-sm font-bold" style={{ color: "var(--accent)" }}>
            {loadError}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="m-0 text-sm font-bold" style={{ color: "var(--accent)" }}>
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="m-0 text-sm font-bold" style={{ color: "var(--ok)" }}>
            {notice}
          </p>
        ) : null}

        {loadingDetail ? (
          <p className="m-0 text-sm" style={{ color: "var(--tx3)" }}>
            Cargando grupo…
          </p>
        ) : loadError ? null : (
          <>
            {/* Ajustes del grupo */}
            <div className="flex flex-col gap-2">
              <span className="tt-label text-[11px]">Ajustes del grupo</span>
              <SmallField label="Nombre" grow>
                <input
                  className={bareInputClass}
                  style={{ fontWeight: 800, color: "var(--tx)" }}
                  value={name}
                  disabled={!canEditGroup || busy}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Nombre del grupo"
                />
              </SmallField>
              <div className="flex flex-wrap gap-2">
                <SmallField label="Tipo de selección" grow>
                  <select
                    className={bareInputClass}
                    style={{ fontWeight: 700, color: "var(--tx)" }}
                    value={selectionType}
                    disabled={!canEditGroup || busy}
                    onChange={(event) =>
                      setSelectionType(event.target.value === "multiple" ? "multiple" : "single")
                    }
                  >
                    <option value="single">Una sola opción</option>
                    <option value="multiple">Varias opciones</option>
                  </select>
                </SmallField>
                <SmallField label="Mínimo">
                  <input
                    className={bareInputClass}
                    style={{ fontWeight: 800, color: "var(--tx)", width: 56 }}
                    inputMode="numeric"
                    value={minSel}
                    disabled={!canEditGroup || busy}
                    onChange={(event) => setMinSel(event.target.value)}
                    placeholder="0"
                  />
                </SmallField>
                <SmallField label="Máximo">
                  <input
                    className={bareInputClass}
                    style={{ fontWeight: 800, color: "var(--tx)", width: 56 }}
                    inputMode="numeric"
                    value={maxSel}
                    disabled={!canEditGroup || busy}
                    onChange={(event) => setMaxSel(event.target.value)}
                    placeholder="Sin tope"
                  />
                </SmallField>
              </div>
              <div className="flex items-center gap-3">
                <label
                  className="flex cursor-pointer items-center gap-1.5 text-[13px] font-bold"
                  style={{ color: "var(--tx2)" }}
                >
                  <input
                    type="checkbox"
                    checked={isRequired}
                    disabled={!canEditGroup || busy}
                    onChange={(event) => setIsRequired(event.target.checked)}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  Obligatorio al ordenar
                </label>
                {canEditGroup ? (
                  <button
                    type="button"
                    className="tt-btn tt-btn-success ml-auto"
                    disabled={busy || name.trim() === ""}
                    onClick={handleSaveGroup}
                  >
                    {busy
                      ? "Guardando…"
                      : currentId === null
                        ? "Crear grupo"
                        : "Guardar grupo"}
                  </button>
                ) : null}
              </div>
            </div>

            {/* Opciones del grupo */}
            {currentId !== null ? (
              <div className="flex flex-col gap-2">
                <span className="tt-label text-[11px]">
                  Opciones{canSort ? " · usa ↑ ↓ para ordenar" : ""}
                </span>
                {options.length === 0 ? (
                  <p className="m-0 text-xs" style={{ color: "var(--tx3)" }}>
                    Este grupo aún no tiene opciones.
                  </p>
                ) : (
                  options.map((option, index) => (
                    <OptionRow
                      key={option.id}
                      option={option}
                      index={index}
                      count={options.length}
                      busy={busy}
                      canUpdate={canUpdate}
                      canSort={canSort}
                      onMove={handleMoveOption}
                      onPatch={handlePatchOption}
                    />
                  ))
                )}

                {canCreate ? (
                  <div
                    className="flex items-center gap-2 rounded-[10px] px-2.5 py-2"
                    style={{ border: "1px dashed var(--border2)" }}
                  >
                    <input
                      className="min-w-0 flex-1 rounded-md border-0 bg-transparent p-1 text-[13px] outline-none"
                      style={{ color: "var(--tx)" }}
                      value={optName}
                      disabled={busy}
                      onChange={(event) => setOptName(event.target.value)}
                      placeholder="Nueva opción (p. ej. Queso extra)"
                      aria-label="Nombre de la nueva opción"
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void handleCreateOption();
                        }
                      }}
                    />
                    <span
                      className="flex shrink-0 items-center gap-0.5 text-[13px] font-bold"
                      style={{ color: "var(--tx2)" }}
                    >
                      +$
                      <input
                        className="w-16 rounded-md p-1 text-[13px] font-bold outline-none"
                        style={{
                          border: "1px solid var(--border2)",
                          background: "var(--bg)",
                          color: "var(--tx)",
                        }}
                        inputMode="decimal"
                        value={optPrice}
                        disabled={busy}
                        onChange={(event) => setOptPrice(event.target.value)}
                        placeholder="0"
                        aria-label="Precio extra de la nueva opción"
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void handleCreateOption();
                          }
                        }}
                      />
                    </span>
                    <button
                      type="button"
                      className="tt-btn tt-btn-outline shrink-0"
                      style={{ padding: "5px 12px", fontSize: 12 }}
                      disabled={busy || optName.trim() === ""}
                      onClick={handleCreateOption}
                    >
                      Agregar
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
