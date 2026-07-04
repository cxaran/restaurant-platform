"use client";

// Cliente del catálogo administrativo (/admin/catalogo). Envuelve los
// endpoints reales de /api/v1/catalog/* sobre browserApi (cookie de sesión);
// los errores llegan como ApiRequestError con el envelope {code, message, errors}.

import { ApiRequestError } from "@/core/api/api-error";
import { browserApi } from "@/core/api/browser-client";
import type { components } from "@/generated/openapi";
import type {
  CategoryCreate,
  CategoryPage,
  CategoryRead,
  CategoryUpdate,
  ModifierGroupListItem,
  ModifierGroupPage,
  ProductCreate,
  ProductImageRead,
  ProductListItem,
  ProductModifierGroupItem,
  ProductModifierGroupRead,
  ProductPage,
  ProductRead,
  ProductUpdate,
  StoredFileRead,
} from "@/core/restaurant-api/contracts";

// Aliases locales sobre los tipos generados (misma fuente de verdad que
// contracts.ts) para el detalle del grupo de modificadores y sus opciones.
export type ModifierGroupRead = components["schemas"]["ModifierGroupRead"];
export type ModifierGroupCreate = components["schemas"]["ModifierGroupCreate"];
export type ModifierGroupUpdate = components["schemas"]["ModifierGroupUpdate"];
export type ModifierOptionRead = components["schemas"]["ModifierOptionRead"];
export type ModifierOptionCreate = components["schemas"]["ModifierOptionCreate"];
export type ModifierOptionUpdate = components["schemas"]["ModifierOptionUpdate"];

const PAGE_LIMIT = 100;
// Tope defensivo de paginación: 20 páginas × 100 filas es más que suficiente
// para un catálogo curado de restaurante y evita bucles ante datos anómalos.
const MAX_PAGES = 20;

// --- Categorías ---

export async function listAllCategories(): Promise<CategoryRead[]> {
  const rows: CategoryRead[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await browserApi<CategoryPage>(
      `/api/v1/catalog/categories?limit=${PAGE_LIMIT}&offset=${page * PAGE_LIMIT}`,
    );
    rows.push(
      ...result.items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description ?? null,
        sort_order: item.sort_order,
        is_active: item.is_active,
      })),
    );
    if (!result.pagination.has_next) break;
  }
  return rows.sort((a, b) => a.sort_order - b.sort_order);
}

export function createCategory(body: CategoryCreate): Promise<CategoryRead> {
  return browserApi<CategoryRead>("/api/v1/catalog/categories", {
    method: "POST",
    body,
  });
}

export function updateCategory(
  categoryId: string,
  body: CategoryUpdate,
): Promise<CategoryRead> {
  return browserApi<CategoryRead>(
    `/api/v1/catalog/categories/${encodeURIComponent(categoryId)}`,
    { method: "PATCH", body },
  );
}

export function sortCategories(ids: string[]): Promise<CategoryRead[]> {
  return browserApi<CategoryRead[]>("/api/v1/catalog/categories/sort-order", {
    method: "PUT",
    body: { ids },
  });
}

// --- Productos ---

export async function listAllProducts(
  includeInactive = false,
): Promise<ProductListItem[]> {
  // Omitir el filtro is_active devuelve TODOS los productos (activos e
  // inactivos); con false solo se piden los activos del catálogo vigente.
  const activeFilter = includeInactive ? "" : "is_active=true&";
  const rows: ProductListItem[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await browserApi<ProductPage>(
      `/api/v1/catalog/products?${activeFilter}limit=${PAGE_LIMIT}&offset=${page * PAGE_LIMIT}`,
    );
    rows.push(...result.items);
    if (!result.pagination.has_next) break;
  }
  return rows.sort((a, b) => a.sort_order - b.sort_order);
}

export function getProduct(productId: string): Promise<ProductRead> {
  return browserApi<ProductRead>(
    `/api/v1/catalog/products/${encodeURIComponent(productId)}`,
  );
}

export function createProduct(body: ProductCreate): Promise<ProductRead> {
  return browserApi<ProductRead>("/api/v1/catalog/products", {
    method: "POST",
    body,
  });
}

export function updateProduct(
  productId: string,
  body: ProductUpdate,
): Promise<ProductRead> {
  return browserApi<ProductRead>(
    `/api/v1/catalog/products/${encodeURIComponent(productId)}`,
    { method: "PATCH", body },
  );
}

export function sortProductsInCategory(
  categoryId: string,
  ids: string[],
): Promise<ProductRead[]> {
  return browserApi<ProductRead[]>(
    `/api/v1/catalog/categories/${encodeURIComponent(categoryId)}/products/sort-order`,
    { method: "PUT", body: { ids } },
  );
}

// --- Imágenes del producto (subida vía /files, luego attach) ---

// Espejo del perfil "image" del backend (FILE_PROFILES, 5 MB): un archivo más
// grande jamás será aceptado, y validarlo aquí evita que un proxy corte la
// subida a medio camino con un error de red ilegible.
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export async function uploadImageFile(file: File): Promise<StoredFileRead> {
  if (file.size > IMAGE_MAX_BYTES) {
    throw new ApiRequestError(413, {
      code: "archivo_demasiado_grande",
      message: "La imagen supera el máximo de 5 MB; reduce su tamaño e intenta de nuevo.",
    });
  }
  const form = new FormData();
  form.append("file", file);
  form.append("kind", "image");
  return browserApi<StoredFileRead>("/api/v1/files", {
    method: "POST",
    body: form,
  });
}

export function attachProductImage(
  productId: string,
  fileId: string,
  isPrimary: boolean,
): Promise<ProductImageRead> {
  return browserApi<ProductImageRead>(
    `/api/v1/catalog/products/${encodeURIComponent(productId)}/images`,
    { method: "POST", body: { file_id: fileId, is_primary: isPrimary } },
  );
}

export function detachProductImage(
  productId: string,
  imageId: string,
): Promise<void> {
  return browserApi<void>(
    `/api/v1/catalog/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`,
    { method: "DELETE" },
  );
}

// --- Grupos de modificadores ---

export async function listAllModifierGroups(): Promise<ModifierGroupListItem[]> {
  const rows: ModifierGroupListItem[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await browserApi<ModifierGroupPage>(
      `/api/v1/catalog/modifier-groups?is_active=true&limit=${PAGE_LIMIT}&offset=${page * PAGE_LIMIT}`,
    );
    rows.push(...result.items);
    if (!result.pagination.has_next) break;
  }
  return rows.sort((a, b) => a.sort_order - b.sort_order);
}

/** Detalle del grupo con sus opciones ordenadas (incluye inactivas). */
export function getModifierGroup(groupId: string): Promise<ModifierGroupRead> {
  return browserApi<ModifierGroupRead>(
    `/api/v1/catalog/modifier-groups/${encodeURIComponent(groupId)}`,
  );
}

export function createModifierGroup(
  body: ModifierGroupCreate,
): Promise<ModifierGroupRead> {
  return browserApi<ModifierGroupRead>("/api/v1/catalog/modifier-groups", {
    method: "POST",
    body,
  });
}

export function updateModifierGroup(
  groupId: string,
  body: ModifierGroupUpdate,
): Promise<ModifierGroupRead> {
  return browserApi<ModifierGroupRead>(
    `/api/v1/catalog/modifier-groups/${encodeURIComponent(groupId)}`,
    { method: "PATCH", body },
  );
}

export function createModifierOption(
  groupId: string,
  body: ModifierOptionCreate,
): Promise<ModifierOptionRead> {
  return browserApi<ModifierOptionRead>(
    `/api/v1/catalog/modifier-groups/${encodeURIComponent(groupId)}/options`,
    { method: "POST", body },
  );
}

export function updateModifierOption(
  optionId: string,
  body: ModifierOptionUpdate,
): Promise<ModifierOptionRead> {
  return browserApi<ModifierOptionRead>(
    `/api/v1/catalog/modifier-options/${encodeURIComponent(optionId)}`,
    { method: "PATCH", body },
  );
}

/** Reordena TODAS las opciones del grupo (la lista debe traer todos los ids). */
export function sortModifierOptions(
  groupId: string,
  ids: string[],
): Promise<ModifierOptionRead[]> {
  return browserApi<ModifierOptionRead[]>(
    `/api/v1/catalog/modifier-groups/${encodeURIComponent(groupId)}/options/sort-order`,
    { method: "PUT", body: { ids } },
  );
}

export function listProductModifierGroups(
  productId: string,
): Promise<ProductModifierGroupRead[]> {
  return browserApi<ProductModifierGroupRead[]>(
    `/api/v1/catalog/products/${encodeURIComponent(productId)}/modifier-groups`,
  );
}

export function replaceProductModifierGroups(
  productId: string,
  groups: ProductModifierGroupItem[],
): Promise<ProductModifierGroupRead[]> {
  return browserApi<ProductModifierGroupRead[]>(
    `/api/v1/catalog/products/${encodeURIComponent(productId)}/modifier-groups`,
    { method: "PUT", body: { groups } },
  );
}

/** URL pública de un archivo de imagen (mismas rutas que usa el storefront). */
export function publicFileUrl(fileId: string): string {
  return `/api/v1/public/files/${encodeURIComponent(fileId)}`;
}
