"use client";

// Cliente de la administración de códigos de descuento. Contratos generados
// (aliases en restaurant-api/contracts.ts); los errores llegan como
// ApiRequestError con el envelope {code, message, errors}.

import { browserApi } from "@/core/api/browser-client";
import type {
  CustomerProfileRead,
  DiscountCodeCreate,
  DiscountCodeListItem,
  DiscountCodeRead,
  DiscountCodeUpdate,
  DiscountRedemptionListItem,
} from "@/core/restaurant-api/contracts";

export function listDiscountCodes(params: {
  q?: string;
  isActive?: boolean | null;
}): Promise<DiscountCodeListItem[]> {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.isActive === true || params.isActive === false) {
    search.set("is_active", String(params.isActive));
  }
  const query = search.toString();
  return browserApi<DiscountCodeListItem[]>(
    `/api/v1/discount-codes${query ? `?${query}` : ""}`,
  );
}

export function getDiscountCode(codeId: string): Promise<DiscountCodeRead> {
  return browserApi<DiscountCodeRead>(
    `/api/v1/discount-codes/${encodeURIComponent(codeId)}`,
  );
}

export function createDiscountCode(body: DiscountCodeCreate): Promise<DiscountCodeRead> {
  return browserApi<DiscountCodeRead>("/api/v1/discount-codes", {
    method: "POST",
    body,
  });
}

export function updateDiscountCode(
  codeId: string,
  body: DiscountCodeUpdate,
): Promise<DiscountCodeRead> {
  return browserApi<DiscountCodeRead>(
    `/api/v1/discount-codes/${encodeURIComponent(codeId)}`,
    { method: "PATCH", body },
  );
}

export function listDiscountRedemptions(
  codeId: string,
): Promise<DiscountRedemptionListItem[]> {
  return browserApi<DiscountRedemptionListItem[]>(
    `/api/v1/discount-codes/${encodeURIComponent(codeId)}/redemptions`,
  );
}

/** Búsqueda de clientes por teléfono (requiere profiles:read en la sesión). */
export function searchCustomersByPhone(phone: string): Promise<CustomerProfileRead[]> {
  const search = new URLSearchParams({ phone, limit: "8" });
  return browserApi<CustomerProfileRead[]>(`/api/v1/profiles/customers?${search}`);
}
