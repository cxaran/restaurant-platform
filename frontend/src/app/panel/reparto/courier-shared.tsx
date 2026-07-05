"use client";

// Piezas compartidas del flujo del repartidor (§19): helpers de API y la
// tarjeta de entrega activa con el lenguaje visual interno (pantallas 7a/7b).
// Las usan RepartoView (cola + resumen), el detalle /panel/reparto/[delivery_id]
// y EntregasView (aviso de cobro); la autoridad sigue siendo el backend.

import Link from "next/link";
import { useState } from "react";

import { browserApi } from "@/core/api/browser-client";
import type {
  AssignmentRead,
  AvailableDeliveryItem,
  MyActiveDelivery,
} from "@/core/restaurant-api/panel-contracts";
import { formatMoney } from "@/core/restaurant-api/theme";

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

// Los timestamps del backend son naive-UTC (convención H7): si no traen zona
// se interpreta UTC explícitamente antes de comparar contra el reloj local.
function parseApiDate(value: string): Date {
  const hasTimezone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(value);
  return new Date(hasTimezone ? value : `${value}Z`);
}

/** Etiqueta relativa «Listo hace X min» a partir del ready_since real. */
export function readySinceLabel(readySince: string | null | undefined): string | null {
  if (!readySince) return null;
  const elapsedMs = Date.now() - parseApiDate(readySince).getTime();
  if (!Number.isFinite(elapsedMs)) return null;
  const minutes = Math.max(0, Math.round(elapsedMs / 60_000));
  if (minutes < 60) return `Listo hace ${minutes} min`;
  return `Listo hace ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/**
 * Enlaces de navegación/contacto del repartidor a partir del contrato real.
 * `location` es GeoJSON Point: coordinates = [lng, lat] — Maps/Waze esperan
 * `lat,lng`, por eso se invierte. El teléfono se normaliza como en
 * panel/pedidos/OrderDetail: 10 dígitos ⇒ se antepone lada país 52 (MX).
 */
export function deliveryNavLinks(
  delivery: Pick<AvailableDeliveryItem, "address_summary" | "location" | "recipient_phone">,
) {
  const coords = delivery.location?.coordinates ?? null; // GeoJSON: [lng, lat]
  const mapsHref = coords
    ? `https://www.google.com/maps/search/?api=1&query=${coords[1]},${coords[0]}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(delivery.address_summary)}`;
  const wazeHref = coords ? `https://waze.com/ul?ll=${coords[1]},${coords[0]}&navigate=yes` : null;
  const rawPhone = delivery.recipient_phone ?? "";
  const phoneDigits = rawPhone.replace(/\D/g, "");
  const telHref = phoneDigits ? `tel:${rawPhone}` : null;
  const whatsappHref = phoneDigits
    ? `https://wa.me/${phoneDigits.length === 10 ? `52${phoneDigits}` : phoneDigits}`
    : null;
  return { mapsHref, wazeHref, telHref, whatsappHref };
}

const CONTACT_BTN_STYLE = {
  flex: "1 1 30%",
  padding: 10,
  fontSize: 12,
  borderRadius: 11,
} as const;

/**
 * Botonera Maps / Waze / Llamar / WhatsApp (+ «Ver detalle» opcional).
 * Waze, Llamar y WhatsApp solo aparecen cuando el contrato trae coordenadas
 * o teléfono reales; Maps siempre existe (cae a búsqueda por texto).
 */
export function DeliveryContactActions({
  delivery,
  detailHref,
}: Readonly<{
  delivery: Pick<AvailableDeliveryItem, "address_summary" | "location" | "recipient_phone">;
  detailHref?: string;
}>) {
  const { mapsHref, wazeHref, telHref, whatsappHref } = deliveryNavLinks(delivery);
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <a
        className="tt-btn tt-btn-outline"
        style={CONTACT_BTN_STYLE}
        href={mapsHref}
        target="_blank"
        rel="noopener noreferrer"
      >
        Maps
      </a>
      {wazeHref ? (
        <a
          className="tt-btn tt-btn-outline"
          style={CONTACT_BTN_STYLE}
          href={wazeHref}
          target="_blank"
          rel="noopener noreferrer"
        >
          Waze
        </a>
      ) : null}
      {telHref ? (
        <a className="tt-btn tt-btn-outline" style={CONTACT_BTN_STYLE} href={telHref}>
          Llamar
        </a>
      ) : null}
      {whatsappHref ? (
        <a
          className="tt-btn tt-btn-outline"
          style={CONTACT_BTN_STYLE}
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
        >
          WhatsApp
        </a>
      ) : null}
      {detailHref ? (
        <Link href={detailHref} className="tt-btn tt-btn-outline" style={CONTACT_BTN_STYLE}>
          Ver detalle
        </Link>
      ) : null}
    </div>
  );
}

/**
 * Referencias del domicilio («portón negro») y total del pedido, como en el
 * diseño de la tarjeta del repartidor. Solo se pintan cuando el backend los
 * incluye en el contrato.
 */
export function DeliveryExtraInfo({
  delivery,
}: Readonly<{
  delivery: Pick<AvailableDeliveryItem, "references" | "total_amount" | "visible_notes">;
}>) {
  return (
    <>
      {delivery.references ? (
        <>
          <span style={{ fontStyle: "italic" }}>«{delivery.references}»</span>
          <br />
        </>
      ) : null}
      {/* Aclaraciones registradas por el equipo (p. ej. al aprobar): el
          cliente ve las mismas en su seguimiento. */}
      {(delivery.visible_notes ?? []).map((note, index) => (
        <span key={index} style={{ display: "block", fontWeight: 700, color: "var(--tx)" }}>
          ⓘ {note}
        </span>
      ))}
      {delivery.total_amount ? (
        <>
          <span>
            Total:{" "}
            <span style={{ fontWeight: 900, color: "var(--tx)" }}>
              {formatMoney(delivery.total_amount)}
            </span>
          </span>
          <br />
        </>
      ) : null}
    </>
  );
}

/**
 * Aviso de cobro derivado del `collection_label` que ya calcula el backend
 * (payment_service.collection_instruction): «Cobrar $X…» exige efectivo (rojo);
 * cualquier variante de «no cobrar» va en verde.
 */
export function CollectionNote({ label }: Readonly<{ label: string }>) {
  const mustCollect = label.startsWith("Cobrar");
  return (
    <span style={{ fontWeight: 800, color: mustCollect ? "var(--accent)" : "var(--ok)" }}>
      {label}
    </span>
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
    <article
      className="tt-card"
      style={{
        border: "2px solid var(--ok)",
        borderRadius: 18,
        overflow: "hidden",
        boxShadow: "0 6px 16px rgba(51, 133, 83, 0.15)",
      }}
    >
      <div
        aria-hidden
        style={{
          height: 96,
          background:
            "repeating-linear-gradient(45deg, #f3ebd8, #f3ebd8 12px, #ede2c8 12px, #ede2c8 24px)",
          position: "relative",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 44,
            left: "42%",
            width: 16,
            height: 16,
            borderRadius: "50% 50% 50% 0",
            transform: "rotate(-45deg)",
            background: "var(--accent)",
            boxShadow: "0 3px 6px rgba(0,0,0,0.25)",
          }}
        />
        <span
          className={inProgress ? "tt-badge" : "tt-badge tt-badge-warn"}
          style={{
            position: "absolute",
            top: 10,
            left: 12,
            padding: "4px 11px",
            fontSize: 10,
            letterSpacing: "0.4px",
            ...(inProgress ? { background: "var(--ok)", color: "#f0f8f2" } : {}),
          }}
        >
          {inProgress ? "EN CAMINO" : "ASIGNADA · POR SALIR"}
        </span>
      </div>

      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 9 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontWeight: 900, fontSize: 15 }}>
            {delivery.public_code}
            {delivery.customer_name ? ` · ${delivery.customer_name}` : ""}
          </span>
        </div>

        <div style={{ fontSize: 13, color: "var(--tx2)", lineHeight: 1.45 }}>
          {delivery.address_summary}
          {delivery.zone_name ? ` · ${delivery.zone_name}` : ""}
          <br />
          <DeliveryExtraInfo delivery={delivery} />
          <CollectionNote label={delivery.collection_label} />
        </div>

        <DeliveryContactActions delivery={delivery} detailHref={detailHref} />

        {!inProgress ? (
          <button
            type="button"
            className="tt-btn tt-btn-primary"
            disabled={busy}
            onClick={onStart}
            style={{ width: "100%", padding: 13, borderRadius: 13, fontSize: 15, fontWeight: 900 }}
          >
            Salir a entregar
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              className="tt-input"
              placeholder="¿Quién recibió? (opcional)"
              value={deliveredTo}
              onChange={(event) => setDeliveredTo(event.target.value)}
            />
            <button
              type="button"
              className="tt-btn tt-btn-success"
              disabled={busy}
              onClick={() => onComplete(deliveredTo)}
              style={{ width: "100%", padding: 14, borderRadius: 13, fontSize: 15, fontWeight: 900 }}
            >
              Marcar entregado
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
