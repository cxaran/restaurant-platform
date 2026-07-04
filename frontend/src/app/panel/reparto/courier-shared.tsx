"use client";

// Piezas compartidas del flujo del repartidor (§19): helpers de API y la
// tarjeta de entrega activa. Las usan RepartoView (cola + resumen) y el
// detalle /panel/reparto/[delivery_id]; la autoridad sigue siendo el backend.

import Link from "next/link";
import { useState } from "react";

import { browserApi } from "@/core/api/browser-client";
import type {
  AssignmentRead,
  MyActiveDelivery,
} from "@/core/restaurant-api/panel-contracts";

export function fetchMyDeliveries(): Promise<MyActiveDelivery[]> {
  return browserApi<MyActiveDelivery[]>("/api/v1/courier/deliveries/mine");
}

export function startDelivery(orderDeliveryId: string): Promise<AssignmentRead> {
  return browserApi<AssignmentRead>(
    `/api/v1/courier/deliveries/${encodeURIComponent(orderDeliveryId)}/start`,
    { method: "POST" },
  );
}

export function completeDelivery(
  orderDeliveryId: string,
  deliveredToName: string,
): Promise<AssignmentRead> {
  return browserApi<AssignmentRead>(
    `/api/v1/courier/deliveries/${encodeURIComponent(orderDeliveryId)}/complete`,
    { method: "POST", body: { delivered_to_name: deliveredToName || null } },
  );
}

export function ActiveDeliveryCard({
  delivery,
  busy,
  detailHref,
  onStart,
  onComplete,
}: Readonly<{
  delivery: MyActiveDelivery;
  busy: boolean;
  detailHref?: string;
  onStart: () => void;
  onComplete: (deliveredToName: string) => void;
}>) {
  const [deliveredTo, setDeliveredTo] = useState("");
  const inProgress = delivery.assignment_status === "in_progress";

  return (
    <div style={{ border: "2px solid rgba(0,0,0,0.2)", borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ fontWeight: 900, fontSize: 16 }}>
        {delivery.public_code} · {inProgress ? "En camino" : "Asignada"}
      </div>
      <div style={{ fontSize: 14, margin: "6px 0" }}>
        {delivery.customer_name ?? "Cliente"} · {delivery.address_summary}
        {delivery.zone_name ? ` · ${delivery.zone_name}` : ""}
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>
        {delivery.collection_label}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <a
          className="sf-chip"
          style={{ textDecoration: "none", border: "1px solid rgba(0,0,0,0.3)", borderRadius: 999, padding: "8px 14px", fontWeight: 700, fontSize: 13 }}
          href={`https://www.google.com/maps/search/${encodeURIComponent(delivery.address_summary)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Abrir en Maps
        </a>
        {detailHref ? (
          <Link
            href={detailHref}
            style={{ border: "1px solid rgba(0,0,0,0.3)", borderRadius: 999, padding: "8px 14px", fontWeight: 700, fontSize: 13, textDecoration: "none", color: "inherit" }}
          >
            Ver detalle
          </Link>
        ) : null}
      </div>
      {!inProgress ? (
        <button type="button" disabled={busy} onClick={onStart} style={{ width: "100%", padding: "12px", borderRadius: 10, fontWeight: 900 }}>
          Salir a entregar
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            placeholder="¿Quién recibió? (opcional)"
            value={deliveredTo}
            onChange={(event) => setDeliveredTo(event.target.value)}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.25)" }}
          />
          <button type="button" disabled={busy} onClick={() => onComplete(deliveredTo)} style={{ width: "100%", padding: "12px", borderRadius: 10, fontWeight: 900 }}>
            Marcar como entregado
          </button>
        </div>
      )}
    </div>
  );
}
