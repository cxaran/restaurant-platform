"use client";

// Vista curada del catálogo (pantalla 4a): tres columnas — grupos, productos
// del grupo y editor del producto. La tabla genérica /admin/resources/products
// sigue existiendo; esta pantalla es la administración diaria del menú.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  CategoryRead,
  ModifierGroupListItem,
  ProductListItem,
  ProductModifierGroupRead,
  ProductRead,
} from "@/core/restaurant-api/contracts";

import {
  createCategory,
  getProduct,
  listAllCategories,
  listAllModifierGroups,
  listAllProducts,
  listProductModifierGroups,
  sortCategories,
  sortProductsInCategory,
  updateCategory,
  updateProduct,
  type ModifierGroupRead,
} from "./api";
import { CategoriesColumn } from "./CategoriesColumn";
import { ProductEditor } from "./ProductEditor";
import { ProductsColumn } from "./ProductsColumn";
import { apiErrorMessage } from "./ui";

function toListItem(read: ProductRead, previous?: ProductListItem): ProductListItem {
  return {
    id: read.id,
    category_id: read.category_id,
    name: read.name,
    sku: read.sku ?? null,
    money_price_amount: read.money_price_amount ?? null,
    credit_redemption_price: read.credit_redemption_price ?? null,
    is_available: read.is_available,
    is_featured: read.is_featured,
    sort_order: read.sort_order,
    is_active: read.is_active,
    created_at: previous?.created_at ?? new Date().toISOString(),
  };
}

export function CatalogoView({
  canCreate,
  canUpdate,
  canSort,
  canUploadFiles,
}: Readonly<{
  canCreate: boolean;
  canUpdate: boolean;
  canSort: boolean;
  canUploadFiles: boolean;
}>) {
  const [categories, setCategories] = useState<CategoryRead[] | null>(null);
  const [products, setProducts] = useState<ProductListItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  // Ver también los productos dados de baja (is_active=false) para recuperarlos.
  const [showInactive, setShowInactive] = useState(false);

  const [details, setDetails] = useState<Record<string, ProductRead>>({});
  const [productGroups, setProductGroups] = useState<
    Record<string, ProductModifierGroupRead[]>
  >({});
  const [allGroups, setAllGroups] = useState<ModifierGroupListItem[] | null>(null);
  const requestedDetails = useRef(new Set<string>());
  const requestedGroups = useRef(new Set<string>());

  // Carga inicial: todos los grupos y productos (catálogo curado, tamaño chico).
  useEffect(() => {
    let cancelled = false;
    Promise.all([listAllCategories(), listAllProducts()])
      .then(([cats, prods]) => {
        if (cancelled) return;
        setCategories(cats);
        setProducts(prods);
        setSelectedCategoryId((current) => current ?? cats[0]?.id ?? null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(apiErrorMessage(err, "No fue posible cargar el catálogo."));
        }
      });
    listAllModifierGroups()
      .then((groups) => {
        if (!cancelled) setAllGroups(groups);
      })
      .catch(() => {
        // El editor muestra su propio estado si los grupos no cargan.
        if (!cancelled) setAllGroups([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const categoryProducts = useMemo(() => {
    if (!products || !selectedCategoryId) return [];
    return products
      .filter(
        (product) =>
          product.category_id === selectedCategoryId &&
          (showInactive || product.is_active),
      )
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [products, selectedCategoryId, showInactive]);

  const productCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const product of products ?? []) {
      if (!showInactive && !product.is_active) continue;
      counts[product.category_id] = (counts[product.category_id] ?? 0) + 1;
    }
    return counts;
  }, [products, showInactive]);

  // Miniaturas y resumen de la lista: el contrato de lista no trae imágenes ni
  // créditos otorgados, así que se cargan los detalles del grupo visible.
  useEffect(() => {
    let cancelled = false;
    const missing = categoryProducts.filter(
      (product) => !requestedDetails.current.has(product.id),
    );
    if (missing.length === 0) return;
    for (const product of missing) requestedDetails.current.add(product.id);
    Promise.allSettled(missing.map((product) => getProduct(product.id))).then(
      (results) => {
        if (cancelled) return;
        const loaded: Record<string, ProductRead> = {};
        results.forEach((result, index) => {
          if (result.status === "fulfilled") {
            loaded[result.value.id] = result.value;
          } else {
            // Permitir reintento en la próxima selección del grupo.
            requestedDetails.current.delete(missing[index].id);
          }
        });
        if (Object.keys(loaded).length > 0) {
          setDetails((current) => ({ ...current, ...loaded }));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [categoryProducts]);

  // Grupos de modificadores del producto seleccionado (solo al editar).
  useEffect(() => {
    if (!selectedProductId || requestedGroups.current.has(selectedProductId)) return;
    requestedGroups.current.add(selectedProductId);
    const productId = selectedProductId;
    listProductModifierGroups(productId)
      .then((groups) => {
        setProductGroups((current) => ({ ...current, [productId]: groups }));
      })
      .catch(() => {
        requestedGroups.current.delete(productId);
      });
  }, [selectedProductId]);

  const upsertProduct = useCallback(
    (read: ProductRead, options?: { select?: boolean }) => {
      setDetails((current) => ({ ...current, [read.id]: read }));
      requestedDetails.current.add(read.id);
      setProducts((current) => {
        const list = current ?? [];
        const previous = list.find((item) => item.id === read.id);
        const item = toListItem(read, previous);
        return previous
          ? list.map((existing) => (existing.id === read.id ? item : existing))
          : [...list, item];
      });
      if (options?.select) {
        setSelectedCategoryId(read.category_id);
        setSelectedProductId(read.id);
        setCreatingProduct(false);
      }
    },
    [],
  );

  const setGroupsFor = useCallback(
    (productId: string, groups: ProductModifierGroupRead[]) => {
      requestedGroups.current.add(productId);
      setProductGroups((current) => ({ ...current, [productId]: groups }));
    },
    [],
  );

  // Grupo de modificadores creado/editado desde el panel de opciones:
  // se refleja en la lista de grupos y en los nombres ya vinculados.
  const upsertModifierGroup = useCallback((read: ModifierGroupRead) => {
    setAllGroups((current) => {
      const list = current ?? [];
      const previous = list.find((item) => item.id === read.id);
      const item: ModifierGroupListItem = {
        id: read.id,
        name: read.name,
        selection_type: read.selection_type,
        min_selections: read.min_selections,
        max_selections: read.max_selections ?? null,
        is_required: read.is_required,
        sort_order: read.sort_order,
        is_active: read.is_active,
        created_at: previous?.created_at ?? new Date().toISOString(),
      };
      return previous
        ? list.map((existing) => (existing.id === read.id ? item : existing))
        : [...list, item].sort((a, b) => a.sort_order - b.sort_order);
    });
    setProductGroups((current) => {
      const next: Record<string, ProductModifierGroupRead[]> = {};
      for (const [productId, groups] of Object.entries(current)) {
        next[productId] = groups.map((group) =>
          group.modifier_group_id === read.id ? { ...group, name: read.name } : group,
        );
      }
      return next;
    });
  }, []);

  // Recarga la lista de productos incluyendo (o no) los inactivos. El filtro
  // is_active del endpoint se omite para traer todos.
  async function handleToggleShowInactive(next: boolean) {
    if (busy) return;
    setActionError(null);
    setBusy(true);
    try {
      const prods = await listAllProducts(next);
      setProducts(prods);
      setShowInactive(next);
    } catch (err) {
      setActionError(
        apiErrorMessage(err, "No fue posible recargar la lista de productos."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateCategory(name: string) {
    setActionError(null);
    try {
      const created = await createCategory({ name });
      setCategories((current) => [...(current ?? []), created]);
      setSelectedCategoryId(created.id);
    } catch (err) {
      setActionError(apiErrorMessage(err, "No fue posible crear el grupo."));
      throw err;
    }
  }

  async function handleMoveCategory(categoryId: string, direction: -1 | 1) {
    if (!categories || busy) return;
    const index = categories.findIndex((category) => category.id === categoryId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= categories.length) return;
    const reordered = [...categories];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setActionError(null);
    setBusy(true);
    const previous = categories;
    setCategories(reordered);
    try {
      const saved = await sortCategories(reordered.map((category) => category.id));
      setCategories(saved.slice().sort((a, b) => a.sort_order - b.sort_order));
    } catch (err) {
      setCategories(previous);
      setActionError(apiErrorMessage(err, "No fue posible reordenar los grupos."));
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleCategoryHidden(category: CategoryRead) {
    if (busy) return;
    setActionError(null);
    setBusy(true);
    try {
      const saved = await updateCategory(category.id, {
        is_active: !category.is_active,
      });
      setCategories((current) =>
        (current ?? []).map((existing) => (existing.id === saved.id ? saved : existing)),
      );
    } catch (err) {
      setActionError(
        apiErrorMessage(err, "No fue posible cambiar la visibilidad del grupo."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleMoveProduct(productId: string, direction: -1 | 1) {
    if (!selectedCategoryId || busy) return;
    const list = categoryProducts;
    const index = list.findIndex((product) => product.id === productId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= list.length) return;
    const reordered = [...list];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setActionError(null);
    setBusy(true);
    try {
      const saved = await sortProductsInCategory(
        selectedCategoryId,
        reordered.map((product) => product.id),
      );
      const orderById = new Map(saved.map((read) => [read.id, read.sort_order]));
      setProducts((current) =>
        (current ?? []).map((product) =>
          orderById.has(product.id)
            ? { ...product, sort_order: orderById.get(product.id) as number }
            : product,
        ),
      );
    } catch (err) {
      setActionError(apiErrorMessage(err, "No fue posible reordenar los productos."));
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleAvailability(product: ProductListItem) {
    if (busy || !canUpdate) return;
    setActionError(null);
    setBusy(true);
    try {
      const read = await updateProduct(product.id, {
        is_available: !product.is_available,
      });
      upsertProduct(read);
    } catch (err) {
      setActionError(
        apiErrorMessage(err, "No fue posible cambiar la disponibilidad del producto."),
      );
    } finally {
      setBusy(false);
    }
  }

  const selectedCategory =
    categories?.find((category) => category.id === selectedCategoryId) ?? null;
  const selectedProduct =
    (selectedProductId ? details[selectedProductId] : undefined) ?? null;

  if (loadError) {
    return (
      <p role="alert" className="m-0 text-sm font-bold" style={{ color: "var(--accent)" }}>
        {loadError}
      </p>
    );
  }

  if (categories === null || products === null) {
    return (
      <p className="m-0 text-sm" style={{ color: "var(--tx3)" }}>
        Cargando catálogo…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="m-0 min-w-0 flex-1 text-[13px]" style={{ color: "var(--tx2)" }}>
          {categories.length} grupos · {products.length} productos · los cambios
          se publican al instante en el sitio
        </p>
        {canCreate ? (
          <>
            <button
              type="button"
              className="tt-btn tt-btn-outline"
              onClick={() => setShowAddCategory(true)}
            >
              Nuevo grupo
            </button>
            <button
              type="button"
              className="tt-btn tt-btn-primary"
              disabled={selectedCategoryId === null && categories.length === 0}
              onClick={() => {
                setCreatingProduct(true);
                setSelectedProductId(null);
              }}
            >
              + Nuevo producto
            </button>
          </>
        ) : null}
      </div>

      {actionError ? (
        <p role="alert" className="m-0 text-sm font-bold" style={{ color: "var(--accent)" }}>
          {actionError}
        </p>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[250px_minmax(0,1fr)_380px]">
        <CategoriesColumn
          categories={categories}
          productCounts={productCounts}
          selectedId={selectedCategoryId}
          onSelect={(id) => {
            setSelectedCategoryId(id);
            setSearch("");
          }}
          onCreate={handleCreateCategory}
          onMove={handleMoveCategory}
          onToggleHidden={handleToggleCategoryHidden}
          showAddForm={showAddCategory}
          onShowAddForm={setShowAddCategory}
          canCreate={canCreate}
          canUpdate={canUpdate}
          canSort={canSort}
          busy={busy}
        />

        <ProductsColumn
          categoryName={selectedCategory?.name ?? null}
          products={categoryProducts}
          details={details}
          selectedId={selectedProductId}
          search={search}
          onSearch={setSearch}
          onSelect={(id) => {
            setSelectedProductId(id);
            setCreatingProduct(false);
          }}
          onToggleAvailability={handleToggleAvailability}
          onMove={handleMoveProduct}
          showInactive={showInactive}
          onToggleShowInactive={handleToggleShowInactive}
          canUpdate={canUpdate}
          canSort={canSort}
          busy={busy}
        />

        <ProductEditor
          // key reinicia el formulario al cambiar de producto o de modo; usa
          // el detalle cargado para no montar el formulario con datos vacíos.
          key={creatingProduct ? "create" : selectedProduct ? `edit-${selectedProduct.id}` : "none"}
          mode={creatingProduct ? "create" : "edit"}
          product={creatingProduct ? null : selectedProduct}
          defaultCategoryId={selectedCategoryId}
          categories={categories}
          assignedGroups={
            selectedProductId ? (productGroups[selectedProductId] ?? null) : null
          }
          allGroups={allGroups}
          canCreate={canCreate}
          canUpdate={canUpdate}
          canSort={canSort}
          canUploadFiles={canUploadFiles}
          onSaved={upsertProduct}
          onGroupsChanged={setGroupsFor}
          onGroupSaved={upsertModifierGroup}
          onCancelCreate={() => setCreatingProduct(false)}
        />
      </div>
    </div>
  );
}
