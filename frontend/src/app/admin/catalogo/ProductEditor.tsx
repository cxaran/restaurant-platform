"use client";

// Columna derecha de la pantalla 4a: «Editando producto». Formulario del
// producto seleccionado (o alta de uno nuevo): precio, grupo, descripción,
// imagen, grupos de modificadores (orden, overrides mín/máx y panel de
// opciones), créditos, disponibilidad y acciones Duplicar / Desactivar
// (baja lógica con is_active). El backend revalida permisos siempre.

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";

import type {
  CategoryRead,
  ModifierGroupListItem,
  ProductCreate,
  ProductModifierGroupItem,
  ProductModifierGroupRead,
  ProductRead,
  ProductUpdate,
} from "@/core/restaurant-api/contracts";

import {
  attachProductImage,
  createProduct,
  detachProductImage,
  getProduct,
  replaceProductModifierGroups,
  updateProduct,
  uploadImageFile,
  type ModifierGroupRead,
} from "./api";
import { ModifierGroupPanel } from "./ModifierGroupPanel";
import { AvailabilitySwitch, ProductThumb, apiErrorMessage, apiFieldErrors } from "./ui";

const fieldBoxStyle = {
  background: "var(--bg)",
  border: "1px solid var(--border2)",
  borderRadius: 10,
} as const;

function FieldBox({
  label,
  children,
}: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <label className="flex flex-1 flex-col gap-0.5 px-3 py-2" style={fieldBoxStyle}>
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

const bareInputClass = "w-full border-0 bg-transparent p-0 font-[inherit] text-sm outline-none";

function toIntOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function ProductEditor({
  mode,
  product,
  defaultCategoryId,
  categories,
  assignedGroups,
  allGroups,
  canCreate,
  canUpdate,
  canSort,
  canUploadFiles,
  onSaved,
  onGroupsChanged,
  onGroupSaved,
  onCancelCreate,
}: Readonly<{
  mode: "edit" | "create";
  product: ProductRead | null;
  defaultCategoryId: string | null;
  categories: CategoryRead[];
  assignedGroups: ProductModifierGroupRead[] | null;
  allGroups: ModifierGroupListItem[] | null;
  canCreate: boolean;
  canUpdate: boolean;
  canSort: boolean;
  canUploadFiles: boolean;
  onSaved: (read: ProductRead, options?: { select?: boolean }) => void;
  onGroupsChanged: (productId: string, groups: ProductModifierGroupRead[]) => void;
  onGroupSaved: (group: ModifierGroupRead) => void;
  onCancelCreate: () => void;
}>) {
  const creating = mode === "create";
  const canEditFields = creating ? canCreate : canUpdate;

  const [name, setName] = useState(creating ? "" : (product?.name ?? ""));
  const [price, setPrice] = useState(
    creating ? "" : (product?.money_price_amount ?? ""),
  );
  const [categoryId, setCategoryId] = useState(
    creating ? (defaultCategoryId ?? "") : (product?.category_id ?? ""),
  );
  const [description, setDescription] = useState(
    creating ? "" : (product?.description ?? ""),
  );
  const [creditsAwarded, setCreditsAwarded] = useState(
    creating ? "0" : String(product?.credits_awarded_per_unit ?? 0),
  );
  const [creditPrice, setCreditPrice] = useState(
    creating || product?.credit_redemption_price == null
      ? ""
      : String(product.credit_redemption_price),
  );
  const [isAvailable, setIsAvailable] = useState(
    creating ? true : (product?.is_available ?? true),
  );

  const [saving, setSaving] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [groupsBusy, setGroupsBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Overrides mín/máx por grupo vinculado editados y aún sin confirmar
  // (se confirman al salir del campo). Vacío = heredar del grupo.
  const [overrideDrafts, setOverrideDrafts] = useState<
    Record<string, { min?: string; max?: string }>
  >({});
  // Panel de opciones del grupo: null = cerrado; {groupId: null} = crear grupo.
  const [optionsPanel, setOptionsPanel] = useState<{ groupId: string | null } | null>(
    null,
  );

  if (!creating && !product) {
    return (
      <div className="tt-card flex flex-col overflow-hidden">
        <div
          className="px-5 py-4"
          style={{ borderBottom: "1px solid var(--border)", background: "var(--header-bg)" }}
        >
          <p className="tt-label m-0">Editando producto</p>
        </div>
        <p className="m-0 px-5 py-6 text-sm" style={{ color: "var(--tx3)" }}>
          Selecciona un producto de la lista para editarlo aquí.
        </p>
      </div>
    );
  }

  function resetMessages() {
    setNotice(null);
    setError(null);
    setFieldErrors({});
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving || !canEditFields) return;
    resetMessages();
    setSaving(true);
    try {
      if (creating) {
        if (!categoryId) {
          setError("Selecciona un grupo para el nuevo producto.");
          return;
        }
        const body: ProductCreate = {
          category_id: categoryId,
          name: name.trim(),
          description: description.trim() || null,
          money_price_amount: price.trim() || null,
          is_money_purchase_available: true,
          credits_awarded_per_unit: toIntOrNull(creditsAwarded) ?? 0,
          credit_redemption_price: toIntOrNull(creditPrice),
          is_available: isAvailable,
          is_featured: false,
        };
        const read = await createProduct(body);
        onSaved(read, { select: true });
        setNotice("Producto creado.");
      } else if (product) {
        const body: ProductUpdate = {
          name: name.trim(),
          category_id: categoryId || null,
          description: description.trim() || null,
          money_price_amount: price.trim() || null,
          credits_awarded_per_unit: toIntOrNull(creditsAwarded) ?? 0,
          credit_redemption_price: toIntOrNull(creditPrice),
          is_available: isAvailable,
        };
        const read = await updateProduct(product.id, body);
        onSaved(read);
        setNotice("Cambios guardados.");
      }
    } catch (err) {
      const errors = apiFieldErrors(err);
      setFieldErrors(errors);
      setError(apiErrorMessage(err, "No fue posible guardar el producto."));
    } finally {
      setSaving(false);
    }
  }

  // El PUT de grupos reemplaza TODO el vínculo: siempre se envía la lista
  // completa; el ORDEN de la lista define el orden en el producto.
  function groupsPayload(groups: ProductModifierGroupRead[]): ProductModifierGroupItem[] {
    return groups.map((g) => ({
      modifier_group_id: g.modifier_group_id,
      min_selections_override: g.min_selections_override ?? null,
      max_selections_override: g.max_selections_override ?? null,
    }));
  }

  async function replaceGroups(payload: ProductModifierGroupItem[]): Promise<boolean> {
    if (!product) return false;
    setGroupsBusy(true);
    try {
      const groups = await replaceProductModifierGroups(product.id, payload);
      onGroupsChanged(product.id, groups);
      return true;
    } catch (err) {
      setError(apiErrorMessage(err, "No fue posible actualizar los modificadores."));
      return false;
    } finally {
      setGroupsBusy(false);
    }
  }

  async function handleToggleGroup(groupId: string) {
    if (!product || assignedGroups === null || groupsBusy || !canUpdate) return;
    resetMessages();
    const isAssigned = assignedGroups.some((g) => g.modifier_group_id === groupId);
    const kept = sortedAssigned.filter((g) => g.modifier_group_id !== groupId);
    const payload = groupsPayload(kept);
    if (!isAssigned) {
      payload.push({
        modifier_group_id: groupId,
        min_selections_override: null,
        max_selections_override: null,
      });
    }
    await replaceGroups(payload);
  }

  async function handleMoveAssignedGroup(groupId: string, direction: -1 | 1) {
    if (!product || assignedGroups === null || groupsBusy || !canUpdate) return;
    const list = [...sortedAssigned];
    const index = list.findIndex((g) => g.modifier_group_id === groupId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    resetMessages();
    await replaceGroups(groupsPayload(list));
  }

  function overrideDraftValue(
    group: ProductModifierGroupRead,
    field: "min" | "max",
  ): string {
    const draft = overrideDrafts[group.modifier_group_id]?.[field];
    if (draft !== undefined) return draft;
    const current =
      field === "min" ? group.min_selections_override : group.max_selections_override;
    return current == null ? "" : String(current);
  }

  function setOverrideDraft(groupId: string, field: "min" | "max", value: string) {
    setOverrideDrafts((current) => ({
      ...current,
      [groupId]: { ...current[groupId], [field]: value },
    }));
  }

  /** Confirma los overrides mín/máx del grupo al salir del campo. */
  async function handleCommitOverrides(group: ProductModifierGroupRead) {
    if (!product || assignedGroups === null || groupsBusy || !canUpdate) return;
    const min = toIntOrNull(overrideDraftValue(group, "min"));
    const max = toIntOrNull(overrideDraftValue(group, "max"));
    if (
      min === (group.min_selections_override ?? null) &&
      max === (group.max_selections_override ?? null)
    ) {
      return;
    }
    resetMessages();
    if (min !== null && max !== null && max < min) {
      setError(
        `En «${group.name}», el máximo de selecciones debe ser mayor o igual que el mínimo.`,
      );
      return;
    }
    const payload = groupsPayload(sortedAssigned).map((item) =>
      item.modifier_group_id === group.modifier_group_id
        ? { ...item, min_selections_override: min, max_selections_override: max }
        : item,
    );
    const ok = await replaceGroups(payload);
    if (ok) {
      setOverrideDrafts((current) => {
        const next = { ...current };
        delete next[group.modifier_group_id];
        return next;
      });
    }
  }

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !product || imageBusy || !canUpdate || !canUploadFiles) return;
    resetMessages();
    setImageBusy(true);
    try {
      const stored = await uploadImageFile(file);
      await attachProductImage(product.id, stored.id, true);
      onSaved(await getProduct(product.id));
      setNotice("Imagen actualizada.");
    } catch (err) {
      setError(apiErrorMessage(err, "No fue posible subir la imagen."));
    } finally {
      setImageBusy(false);
    }
  }

  async function handleRemoveImage() {
    if (!product || imageBusy || !canUpdate) return;
    const current = primaryImage();
    if (!current) return;
    resetMessages();
    setImageBusy(true);
    try {
      await detachProductImage(product.id, current.id);
      onSaved(await getProduct(product.id));
      setNotice("Imagen quitada.");
    } catch (err) {
      setError(apiErrorMessage(err, "No fue posible quitar la imagen."));
    } finally {
      setImageBusy(false);
    }
  }

  async function handleDuplicate() {
    if (!product || saving || !canCreate) return;
    resetMessages();
    setSaving(true);
    try {
      const body: ProductCreate = {
        category_id: product.category_id,
        name: `${product.name} (copia)`,
        description: product.description ?? null,
        money_price_amount: product.money_price_amount ?? null,
        is_money_purchase_available: product.is_money_purchase_available,
        credits_awarded_per_unit: product.credits_awarded_per_unit,
        credit_redemption_price: product.credit_redemption_price ?? null,
        is_available: product.is_available,
        is_featured: product.is_featured,
        preparation_minutes: product.preparation_minutes ?? null,
        max_units_per_order: product.max_units_per_order ?? null,
        daily_unit_limit: product.daily_unit_limit ?? null,
      };
      const copy = await createProduct(body);
      // Copia también el vínculo de modificadores cuando es posible.
      if (canUpdate && assignedGroups && assignedGroups.length > 0) {
        try {
          const groups = await replaceProductModifierGroups(
            copy.id,
            assignedGroups.map((g) => ({
              modifier_group_id: g.modifier_group_id,
              min_selections_override: g.min_selections_override ?? null,
              max_selections_override: g.max_selections_override ?? null,
            })),
          );
          onGroupsChanged(copy.id, groups);
        } catch {
          // El duplicado ya existe; los modificadores se pueden asignar a mano.
        }
      }
      onSaved(copy, { select: true });
    } catch (err) {
      setError(apiErrorMessage(err, "No fue posible duplicar el producto."));
    } finally {
      setSaving(false);
    }
  }

  // Baja lógica del producto (is_active): distinta de la disponibilidad
  // (is_available = agotado hoy). Desactivar lo saca del catálogo vigente
  // conservando historial; Activar lo recupera.
  async function handleToggleActive() {
    if (!product || saving || !canUpdate) return;
    resetMessages();
    setSaving(true);
    try {
      const read = await updateProduct(product.id, {
        is_active: !product.is_active,
      });
      onSaved(read);
      setNotice(
        read.is_active
          ? "Producto reactivado en el catálogo."
          : "Producto desactivado del catálogo (conserva su historial).",
      );
    } catch (err) {
      setError(apiErrorMessage(err, "No fue posible cambiar el estado del producto."));
    } finally {
      setSaving(false);
    }
  }

  function primaryImage() {
    const images = product?.images ?? [];
    if (images.length === 0) return null;
    return images.find((image) => image.is_primary) ?? images[0];
  }

  const currentImage = primaryImage();
  const sortedAssigned = [...(assignedGroups ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const assignedIds = new Set(sortedAssigned.map((g) => g.modifier_group_id));
  const availableGroups = (allGroups ?? []).filter(
    (group) => !assignedIds.has(group.id),
  );

  return (
    <>
    <form onSubmit={handleSubmit} className="tt-card flex flex-col overflow-hidden" noValidate>
      <div
        className="flex items-center gap-3 px-5 py-4"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--header-bg)" }}
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <span
            className="text-[11px] font-extrabold uppercase"
            style={{ letterSpacing: "0.6px", color: "var(--tx3)" }}
          >
            {creating ? "Nuevo producto" : "Editando producto"}
          </span>
          <span className="flex items-center gap-2">
            <span className="tt-display truncate text-[17px]">
              {creating ? (name.trim() || "Producto nuevo") : product?.name}
            </span>
            {!creating && product && !product.is_active ? (
              <span className="tt-badge tt-badge-done shrink-0">INACTIVO</span>
            ) : null}
          </span>
        </div>
        {creating ? (
          <button
            type="button"
            className="tt-btn tt-btn-ghost"
            onClick={onCancelCreate}
            disabled={saving}
          >
            Cancelar
          </button>
        ) : null}
        {canEditFields ? (
          <button type="submit" className="tt-btn tt-btn-success" disabled={saving}>
            {saving ? "Guardando…" : creating ? "Crear" : "Guardar"}
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 px-5 py-4 text-[13px]">
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

        <FieldBox label="Nombre">
          <input
            className={bareInputClass}
            style={{ fontWeight: 800, color: "var(--tx)" }}
            value={name}
            required
            disabled={!canEditFields || saving}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nombre del producto"
          />
          {fieldErrors.name ? (
            <span className="text-[11px] font-bold" style={{ color: "var(--accent)" }}>
              {fieldErrors.name}
            </span>
          ) : null}
        </FieldBox>

        <div className="flex gap-2.5">
          {/* Imagen actual: subir/quitar usa /files (kind=image) + attach. */}
          <div className="flex shrink-0 flex-col items-center gap-1.5">
            <div style={{ border: "1px dashed var(--border2)", borderRadius: 12, padding: 2 }}>
              <ProductThumb
                name={creating ? name || "N" : (product?.name ?? "")}
                fileId={currentImage?.file_id ?? null}
                size={84}
              />
            </div>
            {!creating && canUpdate ? (
              <>
                <div className="flex gap-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/webp,image/jpeg"
                    className="hidden"
                    onChange={handleImageChange}
                    aria-label="Subir imagen del producto"
                  />
                  <button
                    type="button"
                    className="cursor-pointer rounded-md px-1.5 py-0.5 text-[11px] font-bold disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ border: "1px solid var(--border2)", background: "transparent", color: "var(--tx2)" }}
                    disabled={imageBusy || !canUploadFiles}
                    title={canUploadFiles ? undefined : "Necesitas permiso de archivos"}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {imageBusy ? "…" : currentImage ? "Cambiar" : "Subir"}
                  </button>
                  {currentImage ? (
                    <button
                      type="button"
                      className="cursor-pointer rounded-md px-1.5 py-0.5 text-[11px] font-bold disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ border: "1px solid var(--border2)", background: "transparent", color: "var(--accent)" }}
                      disabled={imageBusy}
                      onClick={handleRemoveImage}
                    >
                      Quitar
                    </button>
                  ) : null}
                </div>
                {!canUploadFiles ? (
                  <span
                    className="max-w-[96px] text-center text-[10px] leading-tight"
                    style={{ color: "var(--tx3)" }}
                  >
                    Necesitas permiso de archivos
                  </span>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <FieldBox label="Precio">
              <input
                className={bareInputClass}
                style={{ fontWeight: 800, color: "var(--tx)" }}
                inputMode="decimal"
                value={price}
                disabled={!canEditFields || saving}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="0.00"
              />
              {fieldErrors.money_price_amount ? (
                <span className="text-[11px] font-bold" style={{ color: "var(--accent)" }}>
                  {fieldErrors.money_price_amount}
                </span>
              ) : null}
            </FieldBox>
            <FieldBox label="Grupo">
              <select
                className={bareInputClass}
                style={{ fontWeight: 700, color: "var(--tx)", cursor: canEditFields ? "pointer" : undefined }}
                value={categoryId}
                disabled={!canEditFields || saving}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                {creating && categoryId === "" ? (
                  <option value="">Selecciona un grupo…</option>
                ) : null}
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                    {category.is_active ? "" : " (oculto)"}
                  </option>
                ))}
              </select>
            </FieldBox>
          </div>
        </div>

        <FieldBox label="Descripción">
          <textarea
            className={bareInputClass}
            style={{ color: "var(--tx)", resize: "vertical", minHeight: 48 }}
            value={description}
            disabled={!canEditFields || saving}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Descripción visible en el sitio"
          />
        </FieldBox>

        {!creating ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="tt-label min-w-0 flex-1 text-[11px]">
                Grupos de modificadores
              </span>
              {canCreate ? (
                <button
                  type="button"
                  className="cursor-pointer rounded-md border-0 bg-transparent px-1.5 py-0.5 text-[11px] font-bold disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ color: "var(--accent)" }}
                  disabled={groupsBusy}
                  onClick={() => setOptionsPanel({ groupId: null })}
                >
                  + Nuevo grupo
                </button>
              ) : null}
            </div>
            {allGroups === null || assignedGroups === null ? (
              <p className="m-0 text-xs" style={{ color: "var(--tx3)" }}>
                Cargando modificadores…
              </p>
            ) : (
              <>
                {sortedAssigned.length === 0 ? (
                  <p className="m-0 text-xs" style={{ color: "var(--tx3)" }}>
                    Este producto no tiene grupos vinculados.
                  </p>
                ) : (
                  sortedAssigned.map((group, index) => {
                    const base = allGroups.find(
                      (item) => item.id === group.modifier_group_id,
                    );
                    return (
                      <div
                        key={group.modifier_group_id}
                        className="flex items-center gap-1.5 rounded-[10px] px-2 py-1.5"
                        style={{ border: "1px solid var(--border)", background: "var(--bg)" }}
                      >
                        {canUpdate ? (
                          <span className="flex flex-col gap-0.5">
                            <button
                              type="button"
                              aria-label={`Subir ${group.name}`}
                              disabled={groupsBusy || index === 0}
                              onClick={() => handleMoveAssignedGroup(group.modifier_group_id, -1)}
                              className="cursor-pointer rounded border-0 bg-transparent px-1 text-[10px] leading-none disabled:cursor-not-allowed disabled:opacity-40"
                              style={{ color: "var(--tx3)" }}
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              aria-label={`Bajar ${group.name}`}
                              disabled={groupsBusy || index === sortedAssigned.length - 1}
                              onClick={() => handleMoveAssignedGroup(group.modifier_group_id, 1)}
                              className="cursor-pointer rounded border-0 bg-transparent px-1 text-[10px] leading-none disabled:cursor-not-allowed disabled:opacity-40"
                              style={{ color: "var(--tx3)" }}
                            >
                              ▼
                            </button>
                          </span>
                        ) : null}

                        <span
                          className="min-w-0 flex-1 truncate text-[12px]"
                          style={{ fontWeight: 800 }}
                        >
                          {group.name}
                        </span>

                        <label
                          className="flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase"
                          style={{ color: "var(--tx3)", letterSpacing: "0.4px" }}
                        >
                          mín
                          <input
                            className="w-9 rounded-md p-1 text-center text-[12px] font-bold outline-none disabled:opacity-50"
                            style={{
                              border: "1px solid var(--border2)",
                              background: "var(--panel)",
                              color: "var(--tx)",
                            }}
                            inputMode="numeric"
                            value={overrideDraftValue(group, "min")}
                            placeholder={base ? String(base.min_selections) : ""}
                            disabled={!canUpdate || groupsBusy}
                            title="Mínimo de selecciones en este producto (vacío = heredar del grupo)"
                            onChange={(event) =>
                              setOverrideDraft(group.modifier_group_id, "min", event.target.value)
                            }
                            onBlur={() => handleCommitOverrides(group)}
                          />
                        </label>
                        <label
                          className="flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase"
                          style={{ color: "var(--tx3)", letterSpacing: "0.4px" }}
                        >
                          máx
                          <input
                            className="w-9 rounded-md p-1 text-center text-[12px] font-bold outline-none disabled:opacity-50"
                            style={{
                              border: "1px solid var(--border2)",
                              background: "var(--panel)",
                              color: "var(--tx)",
                            }}
                            inputMode="numeric"
                            value={overrideDraftValue(group, "max")}
                            placeholder={
                              base?.max_selections == null ? "—" : String(base.max_selections)
                            }
                            disabled={!canUpdate || groupsBusy}
                            title="Máximo de selecciones en este producto (vacío = heredar del grupo)"
                            onChange={(event) =>
                              setOverrideDraft(group.modifier_group_id, "max", event.target.value)
                            }
                            onBlur={() => handleCommitOverrides(group)}
                          />
                        </label>

                        <button
                          type="button"
                          className="shrink-0 cursor-pointer rounded-md px-1.5 py-0.5 text-[11px] font-bold disabled:cursor-not-allowed disabled:opacity-50"
                          style={{
                            border: "1px solid var(--border2)",
                            background: "transparent",
                            color: "var(--tx2)",
                          }}
                          disabled={groupsBusy}
                          title={`Administrar las opciones de «${group.name}» (compartidas entre productos)`}
                          onClick={() =>
                            setOptionsPanel({ groupId: group.modifier_group_id })
                          }
                        >
                          Opciones…
                        </button>
                        {canUpdate ? (
                          <button
                            type="button"
                            aria-label={`Quitar «${group.name}» de este producto`}
                            title={`Quitar «${group.name}» de este producto`}
                            className="shrink-0 cursor-pointer rounded-md border-0 bg-transparent px-1 text-[13px] font-bold leading-none disabled:cursor-not-allowed disabled:opacity-50"
                            style={{ color: "var(--accent)" }}
                            disabled={groupsBusy}
                            onClick={() => handleToggleGroup(group.modifier_group_id)}
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    );
                  })
                )}

                {availableGroups.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {availableGroups.map((group) => (
                      <span key={group.id} className="flex items-center gap-0.5">
                        <button
                          type="button"
                          className="tt-chip"
                          style={{ padding: "6px 13px", fontSize: 12 }}
                          disabled={!canUpdate || groupsBusy}
                          onClick={() => handleToggleGroup(group.id)}
                          title={`Asignar «${group.name}» a este producto`}
                        >
                          + {group.name}
                        </button>
                        <button
                          type="button"
                          className="cursor-pointer rounded-md border-0 bg-transparent px-1 py-0.5 text-[10px] font-bold disabled:cursor-not-allowed disabled:opacity-50"
                          style={{ color: "var(--tx3)" }}
                          disabled={groupsBusy}
                          title={`Administrar las opciones de «${group.name}» (compartidas entre productos)`}
                          onClick={() => setOptionsPanel({ groupId: group.id })}
                        >
                          Opciones…
                        </button>
                      </span>
                    ))}
                  </div>
                ) : allGroups.length === 0 ? (
                  <p className="m-0 text-xs" style={{ color: "var(--tx3)" }}>
                    Aún no hay grupos de modificadores
                    {canCreate ? "; créalos con «+ Nuevo grupo»." : "."}
                  </p>
                ) : null}

                <p className="m-0 text-[11px]" style={{ color: "var(--tx3)" }}>
                  mín/máx vacíos heredan del grupo. Las opciones de un grupo son
                  compartidas: editarlas afecta a todos los productos que lo usan.
                </p>
              </>
            )}
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <span className="tt-label text-[11px]">Créditos</span>
          <div className="flex gap-2">
            <FieldBox label="Otorga al comprar">
              <input
                className={bareInputClass}
                style={{ fontWeight: 800, color: "var(--tx)" }}
                inputMode="numeric"
                value={creditsAwarded}
                disabled={!canEditFields || saving}
                onChange={(event) => setCreditsAwarded(event.target.value)}
                placeholder="0"
              />
            </FieldBox>
            <FieldBox label="Precio en créditos">
              <input
                className={bareInputClass}
                style={{ fontWeight: 800, color: creditPrice.trim() ? "var(--tx)" : "var(--tx3)" }}
                inputMode="numeric"
                value={creditPrice}
                disabled={!canEditFields || saving}
                onChange={(event) => setCreditPrice(event.target.value)}
                placeholder="No canjeable"
              />
            </FieldBox>
          </div>
          {fieldErrors.credit_redemption_price ? (
            <span className="text-[11px] font-bold" style={{ color: "var(--accent)" }}>
              {fieldErrors.credit_redemption_price}
            </span>
          ) : null}
        </div>

        <div
          className="flex items-center justify-between gap-3 rounded-xl px-3.5 py-3"
          style={{ border: "1px solid var(--border)" }}
        >
          <div className="flex flex-col">
            <span style={{ fontWeight: 800 }}>Disponible en el sitio</span>
            <span className="text-[11px]" style={{ color: "var(--tx3)" }}>
              apágalo si se agota hoy; no lo saca del catálogo
            </span>
          </div>
          <AvailabilitySwitch
            checked={isAvailable}
            disabled={!canEditFields || saving}
            label="Disponible en el sitio"
            onChange={setIsAvailable}
          />
        </div>

        {!creating && product ? (
          <div className="mt-1 flex gap-2">
            {canCreate ? (
              <button
                type="button"
                className="flex-1 cursor-pointer rounded-[10px] p-2.5 text-center font-bold disabled:cursor-not-allowed disabled:opacity-50"
                style={{ border: "1px solid var(--border2)", background: "transparent", color: "var(--tx2)" }}
                disabled={saving}
                onClick={handleDuplicate}
              >
                Duplicar
              </button>
            ) : null}
            {canUpdate ? (
              <button
                type="button"
                className="flex-1 cursor-pointer rounded-[10px] p-2.5 text-center font-bold disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  border: product.is_active
                    ? "1px solid #e8b7b4"
                    : "1px solid var(--border2)",
                  background: "transparent",
                  color: product.is_active ? "var(--accent)" : "var(--ok)",
                }}
                disabled={saving}
                title={
                  product.is_active
                    ? "Baja lógica: sale del catálogo pero conserva su historial"
                    : "Reactivar este producto en el catálogo"
                }
                onClick={handleToggleActive}
              >
                {product.is_active ? "Desactivar" : "Activar"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </form>

    {/* Fuera del <form> para que Enter dentro del panel no envíe el producto. */}
    {optionsPanel ? (
      <ModifierGroupPanel
        groupId={optionsPanel.groupId}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canSort={canSort}
        onClose={() => setOptionsPanel(null)}
        onSaved={onGroupSaved}
      />
    ) : null}
    </>
  );
}
