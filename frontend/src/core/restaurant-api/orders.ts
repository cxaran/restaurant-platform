"use client";

import { browserApi } from "@/core/api/browser-client";
import type { CheckoutRequest, MyOrderRead } from "./contracts";

/** Checkout web (source=online): el backend valida precio, stock y envío. */
export function submitCheckout(payload: CheckoutRequest): Promise<MyOrderRead> {
  return browserApi<MyOrderRead>("/api/v1/orders", {
    method: "POST",
    body: payload,
  });
}

export function fetchMyOrders(): Promise<MyOrderRead[]> {
  return browserApi<MyOrderRead[]>("/api/v1/orders/mine");
}

export function fetchMyOrder(orderId: string): Promise<MyOrderRead> {
  return browserApi<MyOrderRead>(`/api/v1/orders/mine/${encodeURIComponent(orderId)}`);
}
