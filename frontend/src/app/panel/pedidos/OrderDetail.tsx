"use client";

// Panel derecho de la pantalla 1g: detalle del pedido seleccionado con
// desglose de líneas, envío (con ajuste manual pre-aprobación), pagos,
// dirección y las transiciones permitidas.
// Ocultar botones NO es seguridad — el backend valida cada acción.

import { useEffect, useMemo, useRef, useState } from "react";

import { LocationPicker, type PickedPoint } from "@/components/map/LocationPicker";
import { useShippingQuote } from "@/components/shipping/use-shipping-quote";
import { ApiRequestError } from "@/core/api/api-error";
import { browserApi } from "@/core/api/browser-client";
import {
  distanceMeters,
  reverseGeocode,
  searchAddress,
  type GeoSearchMatch,
} from "@/core/geo/geocoding";
import type { OrderRead } from "@/core/restaurant-api/panel-contracts";
import { formatMoney } from "@/core/restaurant-api/theme";
import type { components } from "@/generated/openapi";

import { TicketPrintButton } from "../TicketPrintButton";
import { OrderPayments } from "./OrderPayments";
import {
  FULFILLMENT_LABELS,
  NEXT_ACTIONS,
  PAYMENT_STATUS_LABELS,
  PRE_APPROVAL_STATUSES,
  SOURCE_LABELS,
  STATUS_BADGE_CLASS,
  STATUS_LABELS,
  formatClock,
} from "./order-meta";

type OrderShippingFinalizeRequest = components["schemas"]["OrderShippingFinalizeRequest"];

// Etapas fijas de la fila inferior (1g): se pintan siempre y solo se habilita
// la que ORDER_TRANSITIONS permite desde el estado actual (y con permiso).
const STAGE_BUTTONS: { to: string; label: string }[] = [
  { to: "preparing", label: "En preparación" },
  { to: "ready", label: "Listo" },
  { to: "out_for_delivery", label: "En camino" },
  { to: "completed", label: "Entregado" },
];

function isPositive(amount: string | null | undefined): boolean {
  const value = Number.parseFloat(amount ?? "");
  return Number.isFinite(value) && value > 0;
}

// Resolver el envío pre-aprobación (desbloquea "Aprobar" en deliveries):
//  · pin en el mapa → cotización en vivo (misma API pública) → "Aplicar
//    cotización" recotiza EN EL BACKEND (PostGIS) y fija el costo;
//  · si el punto queda fuera de zona (o la zona falla), el empleado ingresa
//    el monto manual con motivo — SIEMPRE disponible, aunque sí cotice.
// El pin se persiste en la entrega (location_source employee_selected).
function ShippingAdjust({
  order,
  onDone,
}: Readonly<{ order: OrderRead; onDone: () => void }>) {
  const initialCoords = order.delivery?.location?.coordinates ?? null;
  const [open, setOpen] = useState(false);
  const [point, setPoint] = useState<PickedPoint | null>(
    initialCoords ? { longitude: initialCoords[0], latitude: initialCoords[1] } : null,
  );
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Asistencia de captura (misma que el POS): la dirección del PEDIDO se
  // geocodifica para acercar el mapa y contrastarla contra el pin; el pin se
  // geocodifica a la inversa para mostrar a qué dirección corresponde. Aquí
  // la dirección es un snapshot y NO se edita: solo se valida el punto.
  const [addressMatch, setAddressMatch] = useState<GeoSearchMatch | null>(null);
  const [pinLabel, setPinLabel] = useState<string | null>(null);
  const reverseSeqRef = useRef(0);

  const orderAddressQuery = useMemo(() => {
    const delivery = order.delivery;
    if (!delivery) return "";
    return [
      [delivery.street, delivery.external_number].filter(Boolean).join(" "),
      delivery.neighborhood,
      delivery.postal_code,
      delivery.city,
    ]
      .filter(Boolean)
      .join(", ");
  }, [order.delivery]);

  useEffect(() => {
    if (!open || orderAddressQuery === "") return;
    let cancelled = false;
    void searchAddress(orderAddressQuery).then((match) => {
      if (!cancelled) setAddressMatch(match);
    });
    return () => {
      cancelled = true;
    };
  }, [open, orderAddressQuery]);

  function handlePoint(next: PickedPoint | null) {
    setPoint(next);
    setPinLabel(null);
    const seq = ++reverseSeqRef.current;
    if (next === null) return;
    void reverseGeocode(next).then((suggestion) => {
      if (seq === reverseSeqRef.current && suggestion !== null) {
        setPinLabel(suggestion.label);
      }
    });
  }

  // Pin lejos de la dirección del pedido (~300 m): típico pin "a ojo".
  const pinDistance = useMemo(
    () =>
      point !== null && addressMatch !== null ? distanceMeters(point, addressMatch) : null,
    [point, addressMatch],
  );
  const pinFarFromAddress = pinDistance !== null && pinDistance > 300;

  const subtotal = Number.parseFloat(order.items_subtotal_amount);
  const quote = useShippingQuote(
    open ? "delivery" : "pickup", // el mapa cerrado no cotiza
    Number.isFinite(subtotal) ? subtotal : 0,
    point,
  );

  const parsed = Number.parseFloat(amount);
  const invalidAmount = amount.trim() === "" || !Number.isFinite(parsed) || parsed < 0;

  function geoPoint(p: PickedPoint) {
    return {
      type: "Point" as const,
      coordinates: [p.longitude, p.latitude] as [number, number],
    };
  }

  async function put(body: OrderShippingFinalizeRequest) {
    setBusy(true);
    setError(null);
    try {
      await browserApi(`/api/v1/orders/${order.id}/shipping`, { method: "PUT", body });
      setOpen(false);
      setAmount("");
      setReason("");
      onDone();
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.body.message : "No fue posible ajustar el envío.",
      );
    } finally {
      setBusy(false);
    }
  }

  // El monto que fija el backend es SU recotización con el pin (no el preview).
  async function applyQuote() {
    if (point === null || busy) return;
    await put({ location: geoPoint(point) });
  }

  async function applyManual() {
    if (invalidAmount || !reason.trim() || busy) return;
    await put({
      final_amount: amount.trim(),
      reason: reason.trim(),
      // El pin se guarda también con costo manual (le sirve al repartidor).
      ...(point !== null ? { location: geoPoint(point) } : {}),
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        className="tt-btn tt-btn-outline"
        onClick={() => setOpen(true)}
        style={{ padding: "8px 16px", fontSize: 13, whiteSpace: "nowrap" }}
        data-testid="shipping-resolve-open"
      >
        Resolver envío
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, flexBasis: "100%" }}>
      {/* Mismo sistema de captura que el POS: arranca centrado en la zona del
          operador, sigue a la dirección del pedido mientras no haya pin, y el
          pin se contrasta contra esa dirección. */}
      <LocationPicker
        value={point}
        onChange={handlePoint}
        height={220}
        buttonClassName="tt-btn tt-btn-outline"
        testId="order-shipping-location"
        autoLocate
        focus={addressMatch}
      />

      {point === null && addressMatch !== null ? (
        <p style={{ margin: 0, fontSize: 12, color: "var(--tx3)" }}>
          Mapa centrado cerca de la dirección del pedido; toca el mapa para fijar el pin.
        </p>
      ) : null}

      {pinLabel !== null ? (
        <p
          role="status"
          data-testid="order-shipping-pin-address"
          style={{ margin: 0, fontSize: 12, color: "var(--tx2)" }}
        >
          El pin corresponde aprox. a: <strong>{pinLabel}</strong> — compáralo con la
          dirección capturada del pedido.
        </p>
      ) : null}

      {pinFarFromAddress && pinDistance !== null ? (
        <div
          role="alert"
          data-testid="order-shipping-pin-mismatch"
          className="tt-badge tt-badge-warn"
          style={{
            margin: 0, display: "flex", flexDirection: "column", gap: 6,
            alignItems: "flex-start", whiteSpace: "normal", padding: "8px 12px", fontSize: 12,
          }}
        >
          <span>
            El pin está a ~
            {pinDistance >= 1000
              ? `${(pinDistance / 1000).toFixed(1)} km`
              : `${Math.round(pinDistance)} m`}{" "}
            de la dirección capturada del pedido. Verifica el punto antes de fijar el costo.
          </span>
          <button
            type="button"
            className="tt-btn tt-btn-outline"
            onClick={() => {
              if (addressMatch !== null) {
                handlePoint({
                  longitude: addressMatch.longitude,
                  latitude: addressMatch.latitude,
                });
              }
            }}
            style={{ padding: "6px 12px", fontSize: 12 }}
          >
            Mover pin a la dirección del pedido
          </button>
        </div>
      ) : null}

      <div
        aria-live="polite"
        data-testid="order-shipping-quote"
        style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13 }}
      >
        {point === null ? (
          <span style={{ color: "var(--tx3)" }}>
            Coloca el pin en el mapa para cotizar por zona, o fija el costo manual abajo.
          </span>
        ) : quote.kind === "loading" ? (
          <span style={{ color: "var(--tx3)" }}>Cotizando zona…</span>
        ) : quote.kind === "calculated" ? (
          <>
            <span style={{ fontWeight: 800 }}>
              {quote.isFreeShipping ? "Envío gratis" : formatMoney(quote.amount)}
              {quote.zoneName ? ` · zona ${quote.zoneName}` : ""}
              {quote.estimatedMinutes != null ? ` · ~${quote.estimatedMinutes} min` : ""}
            </span>
            <button
              type="button"
              className="tt-btn tt-btn-success"
              disabled={busy}
              onClick={() => void applyQuote()}
              style={{ padding: "8px 16px", fontSize: 13 }}
              data-testid="shipping-apply-quote"
            >
              {busy ? "Aplicando…" : "Aplicar cotización"}
            </button>
          </>
        ) : quote.kind === "pending_review" ? (
          <span style={{ fontWeight: 700, color: "var(--accent)" }}>
            {quote.zoneName
              ? `El punto cae en ${quote.zoneName}, pero sin tarifa aplicable: fija el costo manual.`
              : "El punto queda fuera de las zonas de entrega: fija el costo manual."}
          </span>
        ) : (
          <span style={{ fontWeight: 700, color: "var(--accent)" }}>
            No fue posible cotizar la zona; fija el costo manual.
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          className="tt-input"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="Costo manual $"
          aria-label="Monto de envío"
          style={{ flex: "1 1 120px", padding: "8px 12px", fontSize: 13 }}
        />
        <input
          className="tt-input"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Motivo del costo manual (obligatorio)"
          aria-label="Motivo del ajuste"
          style={{ flex: "2 1 180px", padding: "8px 12px", fontSize: 13 }}
        />
      </div>
      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>
          {error}
        </p>
      ) : null}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="tt-btn tt-btn-success"
          disabled={busy || invalidAmount || !reason.trim()}
          onClick={() => void applyManual()}
          style={{ padding: "8px 16px", fontSize: 13 }}
          data-testid="shipping-apply-manual"
        >
          {busy ? "Guardando…" : "Fijar costo manual"}
        </button>
        <button
          type="button"
          className="tt-btn tt-btn-ghost"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          style={{ padding: "8px 16px", fontSize: 13 }}
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}

export function OrderDetail({
  detail,
  loading,
  perms,
  busy,
  onTransition,
  onRefresh,
}: Readonly<{
  detail: OrderRead | null;
  loading: boolean;
  perms: Set<string>;
  busy: boolean;
  onTransition: (to: string) => void;
  onRefresh: () => void;
}>) {
  if (!detail) {
    return (
      <section className="tt-card" style={{ flex: "999 1 460px", minWidth: 0, borderRadius: 18, padding: "22px 24px" }}>
        <p style={{ margin: 0, fontSize: 14, color: "var(--tx3)" }}>
          {loading ? "Cargando detalle del pedido…" : "Selecciona un pedido de la lista para ver su detalle."}
        </p>
      </section>
    );
  }

  const allowed = (NEXT_ACTIONS[detail.status] ?? []).filter((action) =>
    perms.has(action.permission),
  );
  const allowedTargets = new Set(allowed.map((action) => action.to));
  const headerActions = allowed.filter(
    (action) =>
      action.to === "approved" ||
      action.to === "pending_approval" ||
      action.to === "pending_payment_verification" ||
      action.to === "cancelled",
  );
  const canAdjustShipping =
    perms.has("orders:adjust_shipping") &&
    detail.fulfillment_type === "delivery" &&
    PRE_APPROVAL_STATUSES.includes(detail.status);
  // Un delivery no puede aprobarse sin costo FINAL de envío (§17.2): el botón
  // se deshabilita con explicación en lugar de dejar que el backend responda 409.
  const shippingBlocked =
    detail.fulfillment_type === "delivery" &&
    PRE_APPROVAL_STATUSES.includes(detail.status) &&
    detail.shipping?.final_amount == null;
  const isCredits = detail.purchase_mode === "credits";
  const lines = detail.lines ?? [];
  const adjustments = detail.adjustments ?? [];
  const shipping = detail.shipping ?? null;
  const delivery = detail.delivery ?? null;

  const shippingAmount = shipping?.final_amount ?? shipping?.estimated_amount ?? detail.shipping_total_amount;
  const shippingName = shipping?.shipping_rate_name_snapshot ?? shipping?.delivery_zone_name_snapshot ?? null;

  // Dirección y enlaces externos: solo con datos reales del contrato.
  const addressText = delivery
    ? [
        [delivery.street, delivery.external_number].filter(Boolean).join(" "),
        delivery.internal_number ? `Int. ${delivery.internal_number}` : null,
        delivery.neighborhood ? `Col. ${delivery.neighborhood}` : null,
        delivery.city,
        delivery.postal_code ? `CP ${delivery.postal_code}` : null,
      ]
        .filter(Boolean)
        .join(", ")
    : null;
  const coords = delivery?.location?.coordinates ?? null; // GeoJSON: [lng, lat]
  const mapsHref = coords
    ? `https://www.google.com/maps/search/?api=1&query=${coords[1]},${coords[0]}`
    : addressText
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`
      : null;
  const wazeHref = coords ? `https://waze.com/ul?ll=${coords[1]},${coords[0]}&navigate=yes` : null;
  const rawPhone = delivery?.recipient_phone ?? detail.customer_phone_snapshot ?? "";
  const phoneDigits = rawPhone.replace(/\D/g, "");
  const whatsappHref = phoneDigits
    ? `https://wa.me/${phoneDigits.length === 10 ? `52${phoneDigits}` : phoneDigits}`
    : null;

  const subline = [
    `Recibido ${formatClock(detail.created_at)}`,
    FULFILLMENT_LABELS[detail.fulfillment_type] ?? detail.fulfillment_type,
    SOURCE_LABELS[detail.source] ?? detail.source,
    detail.customer_name_snapshot,
    detail.customer_phone_snapshot,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section
      className="tt-card"
      aria-label={`Detalle del pedido ${detail.public_code}`}
      style={{
        flex: "999 1 460px", minWidth: 0, borderRadius: 18, padding: "22px 24px",
        display: "flex", flexDirection: "column", gap: 16, opacity: loading ? 0.75 : 1,
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 220px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h2 className="tt-display" style={{ margin: 0, fontSize: 20, fontWeight: 400 }}>
              {detail.public_code}
            </h2>
            <span className={`tt-badge ${STATUS_BADGE_CLASS[detail.status] ?? "tt-badge-done"}`}>
              {(STATUS_LABELS[detail.status] ?? detail.status).toUpperCase()}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted-btn-tx)" }}>{subline}</p>
        </div>
        {headerActions.map((action) =>
          action.to === "cancelled" ? (
            <button
              key={action.to}
              type="button"
              className="tt-btn tt-btn-outline-accent"
              disabled={busy}
              onClick={() => onTransition(action.to)}
              style={{ borderRadius: 14, padding: "13px 22px", fontSize: 14 }}
            >
              {action.label}
            </button>
          ) : action.to === "pending_payment_verification" ? (
            <button
              key={action.to}
              type="button"
              className="tt-btn tt-btn-outline"
              disabled={busy}
              onClick={() => onTransition(action.to)}
              style={{ borderRadius: 14, padding: "13px 22px", fontSize: 14 }}
            >
              {action.label}
            </button>
          ) : (
            <button
              key={action.to}
              type="button"
              className="tt-btn tt-btn-success"
              disabled={busy || (action.to === "approved" && shippingBlocked)}
              title={
                action.to === "approved" && shippingBlocked
                  ? "Fija primero el costo de envío (por zona o manual)."
                  : undefined
              }
              onClick={() => onTransition(action.to)}
              style={{ borderRadius: 14, padding: "15px 32px", fontSize: 16, fontWeight: 900 }}
            >
              {action.label}
            </button>
          ),
        )}
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
          flex: 1,
          minHeight: 0,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <div
            style={{
              background: "var(--bg)", borderRadius: 14, padding: 16,
              display: "flex", flexDirection: "column", gap: 10, fontSize: 14,
            }}
          >
            {lines.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--tx3)" }}>Sin líneas registradas.</p>
            ) : (
              lines.map((line) => (
                <div key={line.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ fontWeight: 700 }}>
                      {line.quantity} × {line.product_name_snapshot}
                    </span>
                    <span style={{ fontWeight: 800, whiteSpace: "nowrap" }}>
                      {line.purchase_mode === "credits"
                        ? `${line.credits_redeemed_total} créditos`
                        : formatMoney(line.money_line_total_amount)}
                    </span>
                  </div>
                  {(line.modifiers ?? []).length > 0 ? (
                    <div style={{ fontSize: 13, color: "var(--muted-btn-tx)" }}>
                      {(line.modifiers ?? [])
                        .map((modifier) =>
                          modifier.quantity > 1
                            ? `${modifier.quantity} × ${modifier.option_name_snapshot}`
                            : modifier.option_name_snapshot,
                        )
                        .join(" · ")}
                    </div>
                  ) : null}
                  {line.customer_note ? (
                    <div style={{ fontSize: 13, color: "var(--muted-btn-tx)" }}>
                      «{line.customer_note}»
                    </div>
                  ) : null}
                </div>
              ))
            )}

            <div
              style={{
                borderTop: "1px dashed var(--border2)", paddingTop: 10,
                display: "flex", flexDirection: "column", gap: 6,
              }}
            >
              {isCredits ? (
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: 16 }}>
                  <span>Total en créditos</span>
                  <span>{detail.credits_redeemed_total} créditos</span>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Subtotal</span>
                    <span style={{ fontWeight: 700 }}>{formatMoney(detail.items_subtotal_amount)}</span>
                  </div>
                  {isPositive(detail.discount_total_amount) ? (
                    <div style={{ display: "flex", justifyContent: "space-between", color: "var(--ok)" }}>
                      <span>Descuento</span>
                      <span style={{ fontWeight: 700 }}>−{formatMoney(detail.discount_total_amount)}</span>
                    </div>
                  ) : null}
                  {adjustments.map((adjustment) => (
                    <div
                      key={adjustment.id}
                      style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--tx2)" }}
                    >
                      <span>{adjustment.reason}</span>
                      <span style={{ fontWeight: 700 }}>
                        {adjustment.direction === "discount" ? "−" : "+"}
                        {formatMoney(adjustment.amount)}
                      </span>
                    </div>
                  ))}
                  {detail.shipping_total_amount != null || shipping ? (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Envío{shippingName ? ` · ${shippingName}` : ""}</span>
                      <span style={{ fontWeight: 700 }}>
                        {shipping?.is_free_shipping ? "Gratis" : formatMoney(detail.shipping_total_amount)}
                      </span>
                    </div>
                  ) : null}
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: 16 }}>
                    <span>Total</span>
                    <span>{formatMoney(detail.total_money_amount)}</span>
                  </div>
                </>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--muted-btn-tx)" }}>
                <span>Pago</span>
                <span style={{ fontWeight: 800, color: "var(--tx)" }}>
                  {PAYMENT_STATUS_LABELS[detail.payment_status] ?? detail.payment_status}
                </span>
              </div>
            </div>
          </div>

          {shipping ? (
            <div
              style={{
                border: "1px solid var(--border)", borderRadius: 14, padding: "14px 16px",
                display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span className="tt-label">Envío aplicado</span>
                <span style={{ fontSize: 14, fontWeight: 700 }}>
                  {shipping.is_free_shipping ? "Gratis" : formatMoney(shippingAmount)}
                  {shippingName ? ` · ${shippingName}` : ""}
                  {shipping.final_amount == null && !shipping.is_free_shipping ? " (estimado)" : ""}
                </span>
              </div>
              {shippingBlocked ? (
                <p
                  role="note"
                  style={{
                    margin: 0, flexBasis: "100%", fontSize: 12, fontWeight: 700,
                    color: "var(--accent)",
                  }}
                  data-testid="shipping-blocks-approval"
                >
                  Para aprobar el pedido primero fija el costo de envío (cotiza por zona con el
                  pin o ingresa el monto manual).
                </p>
              ) : null}
              {canAdjustShipping ? (
                <ShippingAdjust key={detail.id} order={detail} onDone={onRefresh} />
              ) : null}
            </div>
          ) : null}

          {perms.has("payments:read") ? (
            <OrderPayments key={detail.id} order={detail} perms={perms} onChanged={onRefresh} />
          ) : null}

          {detail.customer_note ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span className="tt-label">Nota del cliente</span>
              <p style={{ margin: 0, fontSize: 13, color: "var(--tx2)" }}>«{detail.customer_note}»</p>
            </div>
          ) : null}
          {detail.internal_note ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span className="tt-label">Nota interna</span>
              <p style={{ margin: 0, fontSize: 13, color: "var(--tx2)" }}>{detail.internal_note}</p>
            </div>
          ) : null}
          {(detail.visible_notes ?? []).length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span className="tt-label">Aclaraciones visibles (cliente y repartidor)</span>
              {(detail.visible_notes ?? []).map((note, index) => (
                <p key={index} style={{ margin: 0, fontSize: 13, color: "var(--tx2)" }}>
                  «{note.note}»
                </p>
              ))}
            </div>
          ) : null}
        </div>

        {delivery ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span className="tt-label">Entrega a domicilio</span>
              <p style={{ margin: 0, fontSize: 13, color: "var(--tx2)", lineHeight: 1.5 }}>
                {addressText}
                {delivery.references ? (
                  <>
                    <br />«{delivery.references}»
                  </>
                ) : null}
                {delivery.delivery_note ? (
                  <>
                    <br />
                    {delivery.delivery_note}
                  </>
                ) : null}
              </p>
            </div>
            <div style={{ fontSize: 13, color: "var(--tx2)" }}>
              Recibe: <b>{delivery.recipient_name}</b>
              {delivery.recipient_phone ? ` · ${delivery.recipient_phone}` : ""}
            </div>
            {mapsHref || wazeHref || whatsappHref ? (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {mapsHref ? (
                  <a href={mapsHref} target="_blank" rel="noreferrer" className="tt-btn tt-btn-outline" style={{ flex: 1 }}>
                    Abrir en Maps
                  </a>
                ) : null}
                {wazeHref ? (
                  <a href={wazeHref} target="_blank" rel="noreferrer" className="tt-btn tt-btn-outline" style={{ flex: 1 }}>
                    Waze
                  </a>
                ) : null}
                {whatsappHref ? (
                  <a href={whatsappHref} target="_blank" rel="noreferrer" className="tt-btn tt-btn-outline" style={{ flex: 1 }}>
                    WhatsApp
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <footer style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {STAGE_BUTTONS.map((stage) => {
          const enabled = allowedTargets.has(stage.to) && !busy;
          return (
            <button
              key={stage.to}
              type="button"
              className={`tt-btn ${allowedTargets.has(stage.to) ? "tt-btn-success" : "tt-btn-muted"}`}
              disabled={!enabled}
              onClick={() => onTransition(stage.to)}
              style={{ flex: "1 1 120px", padding: 14, fontSize: 14 }}
            >
              {stage.label}
            </button>
          );
        })}
        {perms.has("tickets:print") ? (
          // Impresión DIRECTA (sin página intermedia ni vista previa): el
          // ticket sale al toque y la impresión queda en la bitácora.
          <TicketPrintButton
            key={detail.id}
            orderId={detail.id}
            className="tt-btn tt-btn-ghost"
            style={{ flex: "1 1 120px" }}
            buttonStyle={{ padding: 14, fontSize: 14 }}
          />
        ) : null}
      </footer>
    </section>
  );
}
