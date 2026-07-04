"use client";

// API de envío: cotización pública ESTIMADA y administración de zonas/tarifas.
// El backend es la única autoridad de cobertura y monto; aquí no se calcula
// ninguna tarifa — solo se piden y transportan decisiones del servidor.

import { browserApi } from "@/core/api/browser-client";
import type {
  DeliveryZoneCreate,
  DeliveryZonePage,
  DeliveryZoneRead,
  DeliveryZoneUpdate,
  PublicShippingQuoteRequest,
  PublicShippingQuoteResult,
  ShippingRateCreate,
  ShippingRateRead,
  ShippingRateUpdate,
} from "./contracts";

/** Cotización estimada del carrito (rate-limited, sin sesión). */
export function requestShippingQuote(
  payload: PublicShippingQuoteRequest,
): Promise<PublicShippingQuoteResult> {
  return browserApi<PublicShippingQuoteResult>("/api/v1/public/shipping-quote", {
    method: "POST",
    body: payload,
  });
}

// --- Administración (permisos shipping:read / shipping:manage) ---

export function listDeliveryZones(): Promise<DeliveryZonePage> {
  // La pantalla administra pocas decenas de zonas: una página grande basta.
  // El orden por defecto del contrato ya es -priority (mismo criterio de solapes).
  return browserApi<DeliveryZonePage>("/api/v1/shipping/zones?limit=100");
}

export function fetchDeliveryZone(zoneId: string): Promise<DeliveryZoneRead> {
  return browserApi<DeliveryZoneRead>(
    `/api/v1/shipping/zones/${encodeURIComponent(zoneId)}`,
  );
}

export function createDeliveryZone(payload: DeliveryZoneCreate): Promise<DeliveryZoneRead> {
  return browserApi<DeliveryZoneRead>("/api/v1/shipping/zones", {
    method: "POST",
    body: payload,
  });
}

export function updateDeliveryZone(
  zoneId: string,
  payload: DeliveryZoneUpdate,
): Promise<DeliveryZoneRead> {
  return browserApi<DeliveryZoneRead>(
    `/api/v1/shipping/zones/${encodeURIComponent(zoneId)}`,
    { method: "PATCH", body: payload },
  );
}

/**
 * Eliminación DEFINITIVA de la zona (sus tarifas caen en cascada). El historial
 * de pedidos no depende de la zona viva: cada pedido conserva el monto cobrado
 * y el nombre de la zona como snapshot.
 */
export function deleteDeliveryZone(zoneId: string): Promise<DeliveryZoneRead> {
  return browserApi<DeliveryZoneRead>(
    `/api/v1/shipping/zones/${encodeURIComponent(zoneId)}`,
    { method: "DELETE" },
  );
}

export function createShippingRate(
  zoneId: string,
  payload: ShippingRateCreate,
): Promise<ShippingRateRead> {
  return browserApi<ShippingRateRead>(
    `/api/v1/shipping/zones/${encodeURIComponent(zoneId)}/rates`,
    { method: "POST", body: payload },
  );
}

export function updateShippingRate(
  rateId: string,
  payload: ShippingRateUpdate,
): Promise<ShippingRateRead> {
  return browserApi<ShippingRateRead>(
    `/api/v1/shipping/rates/${encodeURIComponent(rateId)}`,
    { method: "PATCH", body: payload },
  );
}
