import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { ApiRequestError } from "@/core/api/api-error";
import { serverApi } from "@/core/api/server-client";
import { getSession } from "@/core/auth/session";
import { getPublicBusiness } from "@/core/restaurant-api/business";
import type { MyOrderRead } from "@/core/restaurant-api/contracts";
import { formatMoney } from "@/core/restaurant-api/theme";

import {
  buildOrderTimeline,
  formatOrderTime,
  statusTone,
} from "../order-presentation";

export const dynamic = "force-dynamic";

// Seguimiento de pedido (escenas 1e y 2a del handoff): banda oscura con código
// e insignia de estado, línea de tiempo, tarjeta del repartidor SOLO cuando el
// backend la incluye (en camino, §19.2), desglose y contacto con el negocio.

/** wa.me exige solo dígitos. */
function waDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

function lineName(line: NonNullable<MyOrderRead["lines"]>[number]): string {
  const mods = (line.modifiers ?? []).map((m) => m.option_name_snapshot);
  return [line.product_name_snapshot, ...mods].join(" · ");
}

export default async function MyOrderDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  const session = await getSession();
  if (!session) {
    return (
      <div className="sf-container" style={{ paddingBlock: 40, maxWidth: 620 }}>
        <div className="sf-card" style={{ padding: 26, textAlign: "center" }}>
          <p style={{ fontWeight: 700, marginBottom: 14 }}>Inicia sesión para ver tu pedido.</p>
          <Link className="sf-btn" href={`/login?next=/pedidos/${id}`}>Iniciar sesión</Link>
        </div>
      </div>
    );
  }

  const cookieHeader = (await cookies()).toString();
  let order: MyOrderRead;
  try {
    order = await serverApi<MyOrderRead>(`/api/v1/orders/mine/${encodeURIComponent(id)}`, {
      cookie: cookieHeader,
    });
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }
  const business = await getPublicBusiness();

  const isCredits = order.purchase_mode === "credits";
  const isDelivery = order.fulfillment_type === "delivery";
  const total = order.total_money_amount ?? order.items_subtotal_amount;
  const timeline = buildOrderTimeline(order);
  const courier = order.courier ?? null;
  const courierCoords = courier?.location?.coordinates ?? null; // GeoJSON: [lng, lat]
  const businessWhatsapp = (business?.phones ?? []).find((p) => p.is_whatsapp) ?? null;
  const businessPhone = (business?.phones ?? [])[0] ?? null;

  return (
    <div className="sf-container" style={{ paddingBlock: 28, maxWidth: 680 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Banda oscura del seguimiento (1e/2a). */}
        <section className="sf-band" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sf-band-sub" style={{ fontSize: 12 }}>Pedido</div>
              <h1 className="sf-display" style={{ fontSize: 22, margin: 0 }}>
                {order.public_code}
              </h1>
            </div>
            <span className="sf-badge" data-tone={statusTone(order.status)}>
              {order.status_label}
            </span>
          </div>
          <div className="sf-band-sub" style={{ fontSize: 13 }}>
            {new Date(order.created_at).toLocaleString("es-MX")}
            {order.shipping_pending_review
              ? " · El costo de envío está por confirmarse; el total puede cambiar."
              : ""}
          </div>
        </section>

        {/* Repartidor: el backend SOLO lo incluye en camino (privacidad §19.2). */}
        {courier ? (
          <>
            {courierCoords ? (
              <a
                className="sf-card"
                href={`https://www.google.com/maps?q=${courierCoords[1]},${courierCoords[0]}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  padding: "12px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  fontWeight: 800,
                  color: "var(--sf-success)",
                  textDecoration: "none",
                }}
              >
                <span className="sf-live-dot" aria-hidden="true" />
                Ubicación en tiempo real
                {courier.location_at ? (
                  <span className="sf-muted" style={{ fontWeight: 600 }}>
                    · actualizada {formatOrderTime(courier.location_at)}
                  </span>
                ) : null}
                <span style={{ marginLeft: "auto", color: "var(--sf-text)" }}>Abrir mapa</span>
              </a>
            ) : (
              <div className="sf-map-ph" role="presentation">
                <span className="sf-live-pill">
                  <span className="sf-live-dot" aria-hidden="true" />
                  Ubicación en tiempo real
                </span>
                <span className="sf-map-ph-note">
                  se activa cuando el repartidor comparte su ubicación
                </span>
              </div>
            )}
            <div
              className="sf-card"
              style={{
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                gap: 14,
                flexWrap: "wrap",
              }}
            >
              <span className="sf-avatar sf-display" style={{ background: "var(--sf-brand-2)" }} aria-hidden="true">
                {courier.name.trim().charAt(0).toUpperCase() || "R"}
              </span>
              <div style={{ flex: 1, minWidth: 140, display: "flex", flexDirection: "column", gap: 2 }}>
                <span
                  className="sf-muted"
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                  }}
                >
                  Tu repartidor
                </span>
                <span style={{ fontWeight: 800, fontSize: 15 }}>{courier.name}</span>
                {courier.public_note ? (
                  <span className="sf-muted" style={{ fontSize: 12 }}>{courier.public_note}</span>
                ) : null}
                {/* Cambio que lleva el repartidor (efectivo contra entrega). */}
                {courier.cash_change_amount &&
                Number.parseFloat(courier.cash_change_amount) > 0 ? (
                  <span style={{ fontSize: 12, fontWeight: 800, color: "var(--sf-success)" }}>
                    Lleva tu cambio de {formatMoney(courier.cash_change_amount)}
                  </span>
                ) : null}
              </div>
              {courier.public_phone ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <a
                    className="sf-btn-outline"
                    href={`tel:${courier.public_phone}`}
                    style={{ fontSize: 12, padding: "9px 14px", borderRadius: 12 }}
                  >
                    Llamar
                  </a>
                  <a
                    className="sf-btn sf-btn-wa"
                    href={`https://wa.me/${waDigits(courier.public_phone)}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 12, padding: "9px 14px", borderRadius: 12 }}
                  >
                    WhatsApp
                  </a>
                </div>
              ) : null}
            </div>
            <p className="sf-muted" style={{ margin: "-6px 4px 0", fontSize: 11 }}>
              El contacto del repartidor solo es visible mientras tu pedido está en camino.
            </p>
          </>
        ) : null}

        {/* Línea de tiempo (1e/2a); cancelado no tiene progreso. */}
        {timeline ? (
          <div className="sf-card" style={{ padding: 16, display: "flex", flexDirection: "column" }}>
            {timeline.map((step, index) => {
              const next = timeline[index + 1];
              const lineTone = next
                ? next.state === "done"
                  ? "success"
                  : next.state === "current"
                    ? next.tone
                    : undefined
                : undefined;
              return (
                <div className="sf-tl-row" key={step.key}>
                  <div className="sf-tl-rail">
                    <span className="sf-tl-dot" data-state={step.state} data-tone={step.tone} />
                    {next ? <span className="sf-tl-line" data-tone={lineTone} /> : null}
                  </div>
                  <div
                    style={{
                      paddingBottom: next ? 14 : 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: 1,
                    }}
                  >
                    <span className="sf-tl-title" data-state={step.state} data-tone={step.tone}>
                      {step.label}
                    </span>
                    {step.caption ? <span className="sf-tl-caption">{step.caption}</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="sf-card" style={{ padding: "16px 18px" }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>
              Este pedido fue cancelado.
            </p>
            <p className="sf-muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
              Si tienes dudas sobre un cargo o un canje, contacta al negocio.
            </p>
          </div>
        )}

        {/* Aclaraciones del restaurante (registradas al aprobar/transicionar). */}
        {(order.visible_notes ?? []).length > 0 ? (
          <div
            className="sf-card"
            style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}
            data-testid="order-visible-notes"
          >
            <span
              className="sf-muted"
              style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6 }}
            >
              Notas del restaurante
            </span>
            {(order.visible_notes ?? []).map((note, index) => (
              <p key={index} style={{ margin: 0, fontSize: 13 }}>
                {note.note}
              </p>
            ))}
          </div>
        ) : null}

        {/* Desglose (1e): líneas, descuento, envío y total congelado. */}
        <div
          className="sf-card"
          style={{ padding: 16, display: "flex", flexDirection: "column", gap: 9, fontSize: 13 }}
        >
          {(order.lines ?? []).map((line) => (
            <div key={line.id} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span className="sf-muted" style={{ color: "var(--sf-text)" }}>
                {line.quantity} × {lineName(line)}
              </span>
              <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                {isCredits
                  ? `${line.credits_redeemed_total} créditos`
                  : formatMoney(line.money_line_total_amount)}
              </span>
            </div>
          ))}
          {!isCredits ? (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span>Subtotal</span>
              <span style={{ fontWeight: 700 }}>{formatMoney(order.items_subtotal_amount)}</span>
            </div>
          ) : null}
          {/* Descuento aplicado (snapshot del backend): solo si hubo código. */}
          {!isCredits && Number.parseFloat(order.discount_total_amount) > 0 ? (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span>{order.discount_code_label ?? "Descuento"}</span>
              <span style={{ fontWeight: 700 }}>−{formatMoney(order.discount_total_amount)}</span>
            </div>
          ) : null}
          {!isCredits && isDelivery ? (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span>Envío</span>
              <span style={{ fontWeight: 700 }}>
                {order.shipping_pending_review
                  ? "Por confirmar"
                  : formatMoney(order.shipping_amount ?? "0")}
              </span>
            </div>
          ) : null}
          <div
            style={{
              borderTop: "1px dashed color-mix(in srgb, var(--sf-text) 25%, transparent)",
              paddingTop: 9,
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              fontWeight: 900,
              fontSize: 15,
            }}
          >
            <span>Total</span>
            <span>{isCredits ? `${order.credits_redeemed_total} créditos` : formatMoney(total)}</span>
          </div>
          {order.delivery ? (
            <div className="sf-muted" style={{ fontSize: 12, lineHeight: 1.45 }}>
              Entrega en {order.delivery.street}
              {order.delivery.external_number ? ` ${order.delivery.external_number}` : ""}
              {order.delivery.neighborhood ? `, ${order.delivery.neighborhood}` : ""}
              {order.delivery.references ? (
                <>
                  <br />
                  «{order.delivery.references}»
                </>
              ) : null}
            </div>
          ) : null}
          {order.credits_earned_total_snapshot > 0 ? (
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--sf-brand)" }}>
              {order.status === "completed"
                ? `Este pedido te dio ${order.credits_earned_total_snapshot} créditos.`
                : `Este pedido te dará ${order.credits_earned_total_snapshot} créditos al completarse.`}
            </div>
          ) : null}
        </div>

        {/* Contacto con el negocio (pie de 1e/2a). */}
        {businessWhatsapp ? (
          <a
            className="sf-btn-outline"
            href={`https://wa.me/${waDigits(businessWhatsapp.phone_normalized)}`}
            target="_blank"
            rel="noreferrer"
            style={{ width: "100%", fontSize: 14 }}
          >
            Contactar por WhatsApp
          </a>
        ) : businessPhone ? (
          <a
            className="sf-btn-outline"
            href={`tel:${businessPhone.phone_normalized}`}
            style={{ width: "100%", fontSize: 14 }}
          >
            Contactar al negocio
          </a>
        ) : null}
      </div>
    </div>
  );
}
