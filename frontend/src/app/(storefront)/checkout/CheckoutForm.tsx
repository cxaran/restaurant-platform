"use client";

// Checkout web: SIEMPRE con sesión (no existe invitado). El backend valida
// precio, disponibilidad, límites y envío; este formulario solo captura
// contacto y entrega, y envía el carrito con cantidades enteras.

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { LocationPicker, type PickedPoint } from "@/components/map/LocationPicker";
import { useShippingQuote } from "@/components/shipping/use-shipping-quote";
import { trackEvent } from "@/core/analytics/analytics";
import { ApiRequestError } from "@/core/api/api-error";
import { browserApi } from "@/core/api/browser-client";
import {
  distanceMeters,
  reverseGeocode,
  searchAddress,
  type AddressSuggestion,
  type GeoSearchMatch,
} from "@/core/geo/geocoding";
import type {
  CheckoutRequest,
  DiscountQuoteRequest,
  DiscountQuoteResult,
  MyOrderRead,
  UserAddressCreate,
  UserAddressRead,
} from "@/core/restaurant-api/contracts";
import { submitCheckout } from "@/core/restaurant-api/orders";
import { formatMoney } from "@/core/restaurant-api/theme";
import { estimatedOrderTotal } from "@/core/shipping/shipping-quote";
import { useCart } from "@/core/storefront/cart";
import {
  readRememberedAddressId,
  rememberAddressId,
  resolveSelectedAddress,
} from "@/core/storefront/delivery-address";
import {
  buildOrderLineInputs,
  cartFingerprint,
  estimatedTotalAfterDiscount,
  resolveActiveDiscount,
  type AppliedDiscount,
} from "@/core/storefront/discount-quote";
import type { SessionUser } from "@/core/auth/types";
import {
  closedBannerText,
  useBusinessOpenStatus,
} from "@/core/storefront/useBusinessOpenStatus";

export function CheckoutForm({ session }: Readonly<{ session: SessionUser }>) {
  const router = useRouter();
  const { lines, mode, subtotalHint, clear } = useCart();
  const openStatus = useBusinessOpenStatus();
  const closedBySchedule = openStatus?.blockedBySchedule === true;
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">("pickup");
  const [name, setName] = useState(`${session.name} ${session.last_name ?? ""}`.trim());
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [externalNumber, setExternalNumber] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [references, setReferences] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Ubicación de entrega (spec zonas): dirección guardada con coordenadas,
  // geolocalización EXPLÍCITA o pin manual. Sin punto no se confirma delivery.
  const [addresses, setAddresses] = useState<UserAddressRead[]>([]);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [point, setPoint] = useState<PickedPoint | null>(null);
  // Dirección NUEVA capturada a mano: al confirmar el pedido se guarda en la
  // libreta del cliente (casilla visible, activada por defecto) para que el
  // próximo pedido la tenga preseleccionada con sus coordenadas.
  const [saveNewAddress, setSaveNewAddress] = useState(true);

  // Asistencia de captura (mismos principios que POS/panel): la dirección del
  // pin se SUGIERE (jamás pisa en silencio lo escrito), la dirección escrita
  // acerca el mapa sin seleccionar ubicación, y se avisa si el pin queda lejos
  // de lo escrito. Sin autoLocate: en flujos públicos la geolocalización se
  // pide SOLO al tocar "Usar mi ubicación".
  const [pinSuggestion, setPinSuggestion] = useState<AddressSuggestion | null>(null);
  const [geoNotice, setGeoNotice] = useState<string | null>(null);
  const [addressMatch, setAddressMatch] = useState<GeoSearchMatch | null>(null);
  const reverseSeqRef = useRef(0);
  const fieldsRef = useRef({ street: "", neighborhood: "" });
  useEffect(() => {
    fieldsRef.current = { street, neighborhood };
  });

  // Código de descuento (SOLO checkout web en modo dinero): la cotización viene
  // del backend y queda anclada al carrito exacto que se cotizó.
  const [discountInput, setDiscountInput] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<AppliedDiscount | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  // Aceptación de términos: DEBE declararse con el resto de hooks, antes del
  // early return de carrito vacío (regla de hooks de React).
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // INVARIANTE (el backend la revalida): canje con créditos = pedido completo
  // en créditos, SIN envío (solo pickup), sin códigos de descuento.
  const credits = mode === "credits";
  const effectiveFulfillment = credits ? "pickup" : fulfillment;

  // Analítica: inicio del checkout, una sola vez por montaje y con carrito.
  const beganCheckoutRef = useRef(false);
  useEffect(() => {
    if (beganCheckoutRef.current || lines.length === 0) return;
    beganCheckoutRef.current = true;
    trackEvent("begin_checkout", { item_count: lines.length, purchase_mode: mode });
  }, [lines.length, mode]);

  // Cotización vigente: se descarta sola si el carrito cambió o el modo pasó a
  // créditos (el código NUNCA viaja en credits). Derivada para que el envío y
  // la UI nunca usen una cotización obsoleta ni un render intermedio.
  const activeDiscount = resolveActiveDiscount(appliedDiscount, mode, lines);
  useEffect(() => {
    if (appliedDiscount && !resolveActiveDiscount(appliedDiscount, mode, lines)) {
      setAppliedDiscount(null);
      setDiscountError(null);
    }
  }, [appliedDiscount, mode, lines]);

  const estimatedTotal = activeDiscount
    ? estimatedTotalAfterDiscount(subtotalHint, activeDiscount.discountAmount)
    : subtotalHint;

  // Direcciones guardadas del cliente (para autollenar y aportar coordenadas).
  // Se preselecciona la misma dirección que estimó el envío en el carrito:
  // única dirección → esa; varias → la última usada (recordada localmente).
  useEffect(() => {
    let active = true;
    browserApi<UserAddressRead[]>("/api/v1/users/me/addresses")
      .then((data) => {
        if (!active) return;
        setAddresses(data);
        const preselected = resolveSelectedAddress(data, readRememberedAddressId());
        if (preselected) applyAddress(preselected);
      })
      .catch(() => {
        // Sin direcciones (o error): la captura manual sigue disponible.
      });
    return () => {
      active = false;
    };
  }, []);

  // Cotización ESTIMADA de envío: recotiza al cambiar punto, subtotal o tipo
  // de entrega. El backend decide zona/tarifa/monto; aquí solo se muestra.
  const shippingQuote = useShippingQuote(
    effectiveFulfillment,
    subtotalHint,
    effectiveFulfillment === "delivery" ? point : null,
  );
  const totalWithShipping = estimatedOrderTotal(estimatedTotal, shippingQuote);
  const missingLocation = effectiveFulfillment === "delivery" && point === null;

  function applyAddress(address: UserAddressRead | null) {
    // La dirección guardada trae campos y pin CONSISTENTES entre sí: se fijan
    // directo, se invalida cualquier geocodificación en vuelo y no se sugiere
    // nada (sugerir reemplazos sobre una dirección guardada sería ruido).
    reverseSeqRef.current += 1;
    setPinSuggestion(null);
    setGeoNotice(null);
    if (address === null) {
      setAddressId(null);
      rememberAddressId(null);
      return; // captura manual: se conservan los campos ya tecleados
    }
    setAddressId(address.id);
    rememberAddressId(address.id);
    setStreet(address.street);
    setExternalNumber(address.external_number ?? "");
    setNeighborhood(address.neighborhood ?? "");
    setReferences(address.references ?? "");
    setPoint(
      address.location
        ? {
            longitude: address.location.coordinates[0],
            latitude: address.location.coordinates[1],
          }
        : null,
    );
  }

  // Pin nuevo (clic, arrastre o "Usar mi ubicación") → dirección sugerida:
  // con los campos vacíos se pre-llena avisando; con texto ya escrito se
  // ofrece la sugerencia para confirmar (nunca se pisa nada en silencio).
  function handleDeliveryPoint(next: PickedPoint | null) {
    setPoint(next);
    setPinSuggestion(null);
    setGeoNotice(null);
    const seq = ++reverseSeqRef.current;
    if (next === null) return;
    void reverseGeocode(next).then((suggestion) => {
      if (seq !== reverseSeqRef.current || suggestion === null) return;
      const current = fieldsRef.current;
      if (!current.street.trim() && !current.neighborhood.trim()) {
        setStreet(suggestion.street);
        setExternalNumber((prev) => suggestion.external_number || prev);
        setNeighborhood((prev) => suggestion.neighborhood || prev);
        setGeoNotice(
          "Dirección tomada del punto del mapa: revísala y completa número y referencias.",
        );
      } else {
        setPinSuggestion(suggestion);
      }
    });
  }

  function applyPinSuggestion() {
    if (pinSuggestion === null) return;
    setStreet(pinSuggestion.street);
    setExternalNumber((prev) => pinSuggestion.external_number || prev);
    setNeighborhood((prev) => pinSuggestion.neighborhood || prev);
    setPinSuggestion(null);
    setGeoNotice("Dirección actualizada con la del punto del mapa.");
    // La dirección escrita ya no corresponde a la guardada seleccionada.
    setAddressId(null);
  }

  // Dirección escrita → geocodificar (debounce) para acercar el mapa (sin
  // seleccionar ubicación) y poder contrastarla contra el pin.
  const addressQuery = useMemo(() => {
    if (effectiveFulfillment !== "delivery" || street.trim().length < 4) return "";
    return [
      [street.trim(), externalNumber.trim()].filter(Boolean).join(" "),
      neighborhood.trim(),
    ]
      .filter(Boolean)
      .join(", ");
  }, [effectiveFulfillment, street, externalNumber, neighborhood]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(
      () => {
        if (addressQuery === "") {
          setAddressMatch(null);
          return;
        }
        void searchAddress(addressQuery).then((match) => {
          if (!cancelled) setAddressMatch(match);
        });
      },
      addressQuery === "" ? 0 : 900,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [addressQuery]);

  // Contraste pin ↔ dirección escrita (~300 m): típico pin "a ojo". Aviso,
  // nunca bloqueo: el costo real siempre lo decide el backend.
  const pinDistance = useMemo(
    () =>
      point !== null && addressMatch !== null ? distanceMeters(point, addressMatch) : null,
    [point, addressMatch],
  );
  const pinFarFromAddress = pinDistance !== null && pinDistance > 300;

  function movePinToAddress() {
    if (addressMatch === null) return;
    reverseSeqRef.current += 1; // movimiento explícito: sin re-sugerencia
    setPoint({ longitude: addressMatch.longitude, latitude: addressMatch.latitude });
    setPinSuggestion(null);
    setGeoNotice("Pin movido a la dirección escrita: confirma el punto exacto en el mapa.");
  }

  if (lines.length === 0) {
    return (
      <div className="sf-card" style={{ padding: 24 }}>
        <p style={{ margin: 0, fontWeight: 700 }}>No hay productos en el carrito.</p>
      </div>
    );
  }

  async function handleApplyDiscount() {
    const code = discountInput.trim();
    if (!code || quoting) return;
    setDiscountError(null);
    setQuoting(true);
    try {
      // Se cotizan EXACTAMENTE las mismas líneas que enviaría el checkout.
      const body: DiscountQuoteRequest = {
        discount_code: code,
        lines: buildOrderLineInputs(lines, mode),
      };
      const quote = await browserApi<DiscountQuoteResult>("/api/v1/discount-codes/quote", {
        method: "POST",
        body,
      });
      setAppliedDiscount({
        code: quote.code,
        name: quote.name,
        discountAmount: quote.discount_amount,
        cartFingerprint: cartFingerprint(lines),
      });
      setDiscountInput("");
    } catch (err) {
      // El carrito NO se toca: solo se muestra el motivo (mensaje del backend,
      // p. ej. codigo_no_encontrado, compra_minima_no_alcanzada…).
      setDiscountError(
        err instanceof ApiRequestError
          ? err.body.message
          : "No fue posible validar el código. Intenta de nuevo.",
      );
    } finally {
      setQuoting(false);
    }
  }

  function handleRemoveDiscount() {
    setAppliedDiscount(null);
    setDiscountError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (missingLocation) return; // la entrega exige un punto de ubicación
    if (closedBySchedule) return; // cerrado por horario: el backend rechazaría igual
    if (!acceptedTerms) return; // debe aceptar términos y aviso de privacidad
    setError(null);
    setSubmitting(true);
    const payload: CheckoutRequest = {
      fulfillment_type: effectiveFulfillment,
      purchase_mode: mode,
      customer_name: name,
      customer_phone: phone,
      customer_note: note || null,
      // Misma construcción de líneas que la cotización del código de descuento.
      lines: buildOrderLineInputs(lines, mode),
      // El código SOLO viaja si hay una cotización vigente (nunca en credits).
      ...(activeDiscount ? { discount_code: activeDiscount.code } : {}),
      delivery:
        effectiveFulfillment === "delivery"
          ? {
              street,
              external_number: externalNumber || null,
              neighborhood: neighborhood || null,
              references: references || null,
              recipient_name: name,
              recipient_phone: phone,
              // El punto viaja como GeoJSON; el backend resuelve zona y costo
              // (nunca se envía un monto de envío desde el frontend).
              ...(addressId !== null ? { user_address_id: addressId } : {}),
              ...(point !== null
                ? {
                    location: {
                      type: "Point" as const,
                      coordinates: [point.longitude, point.latitude] as [number, number],
                    },
                  }
                : {}),
            }
          : null,
    };
    try {
      const order: MyOrderRead = await submitCheckout(payload);
      // Dirección NUEVA (no venía de la libreta): se guarda para el próximo
      // pedido, con sus coordenadas. Best-effort: jamás bloquea el pedido ya
      // confirmado. No se duplica si ya existe una igual (calle + número).
      if (
        effectiveFulfillment === "delivery" &&
        addressId === null &&
        saveNewAddress &&
        street.trim() !== ""
      ) {
        const duplicated = addresses.some(
          (item) =>
            item.street.trim().toLowerCase() === street.trim().toLowerCase() &&
            (item.external_number ?? "").trim().toLowerCase() ===
              externalNumber.trim().toLowerCase(),
        );
        if (!duplicated) {
          try {
            const saved = await browserApi<UserAddressRead>("/api/v1/users/me/addresses", {
              method: "POST",
              body: {
                street: street.trim(),
                external_number: externalNumber.trim() || null,
                neighborhood: neighborhood.trim() || null,
                references: references.trim() || null,
                location:
                  point !== null
                    ? {
                        type: "Point" as const,
                        coordinates: [point.longitude, point.latitude] as [number, number],
                      }
                    : null,
                // La primera dirección del cliente queda como principal.
                is_default: addresses.length === 0,
              } satisfies UserAddressCreate,
            });
            rememberAddressId(saved.id);
          } catch {
            // Silencioso: el pedido ya está confirmado.
          }
        }
      }
      // CONVERSIÓN PRINCIPAL: solo tras la confirmación real del backend.
      // Metadatos técnicos únicamente — jamás nombre, teléfono ni dirección.
      trackEvent("purchase", {
        transaction_id: order.id,
        ...(credits
          ? {}
          : { value: totalWithShipping ?? estimatedTotal, currency: "MXN" }),
        item_count: lines.length,
        fulfillment_type: effectiveFulfillment,
        purchase_mode: mode,
      });
      clear();
      router.push(`/pedidos/${order.id}`);
    } catch (err) {
      // §J (H6): sin reintentos automáticos de operaciones económicas; un
      // conflicto de concurrencia se explica y el cliente decide reintentar.
      if (err instanceof ApiRequestError && err.status === 409) {
        setError(
          "No se pudo confirmar por una actualización simultánea. Revisa el pedido y vuelve a intentarlo.",
        );
      } else if (err instanceof ApiRequestError) {
        // Error de dominio (p. ej. seleccion_incompleta): mensaje del backend
        // más el detalle por campo si viene; el carrito NO se toca.
        const details = (err.body.errors ?? [])
          .map((item) => item.message)
          .filter((message) => message && message !== err.body.message);
        setError(details.length > 0 ? `${err.body.message} ${details.join(" ")}` : err.body.message);
      } else {
        setError("No fue posible enviar el pedido. Intenta de nuevo.");
      }
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="sf-checkout"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      {error ? (
        <div className="sf-error" role="alert">{error}</div>
      ) : null}

      {credits ? (
        <div>
          <span className="sf-label">¿Cómo recibes tu pedido?</span>
          <span className="sf-chip" data-active="true" aria-hidden>
            Recoger en tienda
          </span>
          <p className="sf-muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
            El canje con créditos solo está disponible para recoger en tienda (el envío no se
            paga con créditos).
          </p>
        </div>
      ) : (
        <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
          <legend className="sf-visually-hidden">¿Cómo recibes tu pedido?</legend>
          <div className="sf-segment" role="group" aria-label="¿Cómo recibes tu pedido?">
            {(["delivery", "pickup"] as const).map((option) => (
              <button
                key={option}
                type="button"
                data-active={fulfillment === option}
                aria-pressed={fulfillment === option}
                onClick={() => setFulfillment(option)}
              >
                {option === "pickup" ? "Recoger" : "A domicilio"}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div>
        <label className="sf-label" htmlFor="co-name">Nombre de contacto</label>
        <input id="co-name" className="sf-input" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="sf-label" htmlFor="co-phone">Teléfono</label>
        <input id="co-phone" className="sf-input" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>

      {effectiveFulfillment === "delivery" ? (
        <>
          {addresses.length > 0 ? (
            <div>
              <label className="sf-label" htmlFor="co-addr">Mis direcciones</label>
              <select
                id="co-addr"
                className="sf-input"
                value={addressId ?? ""}
                onChange={(e) =>
                  applyAddress(addresses.find((a) => a.id === e.target.value) ?? null)
                }
                data-testid="checkout-saved-address"
              >
                <option value="">Capturar otra dirección</option>
                {addresses.map((address) => (
                  <option key={address.id} value={address.id}>
                    {(address.label?.trim() || address.street) +
                      (address.is_default ? " · predeterminada" : "") +
                      (address.location ? "" : " · sin ubicación")}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
            <div>
              <label className="sf-label" htmlFor="co-street">Calle</label>
              <input id="co-street" className="sf-input" required value={street} onChange={(e) => setStreet(e.target.value)} />
            </div>
            <div>
              <label className="sf-label" htmlFor="co-num">Número</label>
              <input id="co-num" className="sf-input" value={externalNumber} onChange={(e) => setExternalNumber(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="sf-label" htmlFor="co-col">Colonia</label>
            <input id="co-col" className="sf-input" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
          </div>
          <div>
            <label className="sf-label" htmlFor="co-ref">Referencias</label>
            <input id="co-ref" className="sf-input" value={references} onChange={(e) => setReferences(e.target.value)} />
          </div>

          <div>
            <span className="sf-label">Ubicación de entrega</span>
            {/* Mismos principios que POS/panel: el mapa sigue a la dirección
                escrita mientras no haya pin (focus); la geolocalización SOLO
                con el botón explícito (flujo público, sin autoLocate). */}
            <LocationPicker
              value={point}
              onChange={handleDeliveryPoint}
              height={240}
              buttonClassName="sf-btn-outline"
              testId="checkout-location"
              focus={addressMatch}
            />
          </div>

          {point === null && addressMatch !== null ? (
            <p className="sf-muted" style={{ margin: 0, fontSize: 12 }}>
              Mapa centrado cerca de tu dirección; toca el mapa para fijar el pin.
            </p>
          ) : null}

          {geoNotice !== null ? (
            <p
              role="status"
              data-testid="checkout-geo-notice"
              className="sf-muted"
              style={{ margin: 0, fontSize: 12 }}
            >
              {geoNotice}
            </p>
          ) : null}

          {pinSuggestion !== null ? (
            <div
              data-testid="checkout-pin-suggestion"
              className="sf-card"
              style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}
            >
              <span>
                El punto del mapa corresponde aprox. a: <strong>{pinSuggestion.label}</strong>
              </span>
              <span className="sf-muted" style={{ fontSize: 12 }}>
                Ya hay una dirección escrita; no se modificó nada.
              </span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="sf-chip" onClick={applyPinSuggestion}>
                  Usar esta dirección
                </button>
                <button type="button" className="sf-chip" onClick={() => setPinSuggestion(null)}>
                  Mantener lo escrito
                </button>
              </div>
            </div>
          ) : null}

          {pinFarFromAddress && pinDistance !== null ? (
            <div
              role="alert"
              data-testid="checkout-pin-mismatch"
              className="sf-card"
              style={{
                padding: "12px 16px", display: "flex", flexDirection: "column",
                gap: 8, fontSize: 13, borderLeft: "4px solid #d97706",
              }}
            >
              <span>
                El pin está a ~
                {pinDistance >= 1000
                  ? `${(pinDistance / 1000).toFixed(1)} km`
                  : `${Math.round(pinDistance)} m`}{" "}
                de la dirección escrita. Verifica el punto antes de confirmar tu pedido.
              </span>
              <div>
                <button type="button" className="sf-chip" onClick={movePinToAddress}>
                  Mover pin a la dirección escrita
                </button>
              </div>
            </div>
          ) : null}

          {/* Dirección nueva (no viene de la libreta): se ofrece guardarla en
              la cuenta al confirmar; las guardadas siempre van primero. */}
          {addressId === null ? (
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
              <input
                type="checkbox"
                checked={saveNewAddress}
                onChange={(event) => setSaveNewAddress(event.target.checked)}
                data-testid="checkout-save-address"
              />
              Guardar esta dirección en mi cuenta para futuros pedidos
            </label>
          ) : null}

          {/* Decisión del backend, pintada tal cual: nunca un total falso. */}
          <div
            className="sf-card"
            style={{ padding: "12px 16px", fontSize: 14 }}
            aria-live="polite"
            data-testid="checkout-shipping-quote"
          >
            {point === null ? (
              <span className="sf-muted">
                Coloca tu ubicación (pin en el mapa, GPS o una dirección guardada) para
                cotizar el envío. Sin ubicación no es posible confirmar la entrega.
              </span>
            ) : shippingQuote.kind === "loading" ? (
              <span className="sf-muted">Cotizando envío…</span>
            ) : shippingQuote.kind === "calculated" ? (
              <span>
                <strong>
                  {shippingQuote.isFreeShipping
                    ? "Envío gratis"
                    : `Envío ${formatMoney(shippingQuote.amount)}`}
                </strong>
                {shippingQuote.zoneName ? ` · zona ${shippingQuote.zoneName}` : ""}
                {shippingQuote.estimatedMinutes != null
                  ? ` · ~${shippingQuote.estimatedMinutes} min`
                  : ""}
                <span className="sf-muted"> (estimado; el total final lo confirma la cocina)</span>
              </span>
            ) : shippingQuote.kind === "pending_review" ? (
              <span>
                <strong>Costo de envío por confirmar.</strong>{" "}
                <span className="sf-muted">
                  Tu ubicación está fuera de las zonas con tarifa automática; recibimos tu
                  pedido y te confirmamos el costo antes de prepararlo.
                </span>
              </span>
            ) : (
              <span className="sf-muted">
                No fue posible cotizar el envío en este momento; el costo se confirmará al
                recibir tu pedido.
              </span>
            )}
          </div>
        </>
      ) : null}

      <div>
        <label className="sf-label" htmlFor="co-note">Nota para la cocina (opcional)</label>
        <textarea id="co-note" className="sf-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      {/* Código de descuento: SOLO en modo dinero (en credits no existe). */}
      {!credits ? (
        <div className="sf-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          <label className="sf-label" htmlFor="co-discount" style={{ margin: 0 }}>
            ¿Tienes un código de descuento?
          </label>
          {activeDiscount ? (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontWeight: 800 }}>{activeDiscount.name}</div>
                <div className="sf-muted" style={{ fontSize: 13 }}>
                  Código {activeDiscount.code} · descuento de {formatMoney(activeDiscount.discountAmount)}
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  Nueva estimación:{" "}
                  <strong>{formatMoney(estimatedTotal)}</strong> + envío (estimación; el total
                  final lo confirma la cocina).
                </div>
              </div>
              <button type="button" className="sf-chip" onClick={handleRemoveDiscount}>
                Quitar
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                id="co-discount"
                className="sf-input"
                style={{ flex: 1, minWidth: 160 }}
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleApplyDiscount();
                  }
                }}
                placeholder="Escribe tu código"
                autoComplete="off"
              />
              <button
                type="button"
                className="sf-btn-outline"
                onClick={() => void handleApplyDiscount()}
                disabled={quoting || discountInput.trim().length === 0}
              >
                {quoting ? "Validando…" : "Aplicar"}
              </button>
            </div>
          )}
          {discountError ? (
            <div className="sf-error" role="alert">{discountError}</div>
          ) : null}
        </div>
      ) : null}

      {closedBySchedule && openStatus ? (
        <div
          role="status"
          className="sf-card"
          style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700 }}
        >
          🕐 {closedBannerText(openStatus)} No es posible confirmar pedidos por ahora;
          tu carrito se conserva.
        </div>
      ) : null}
      <label
        style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, marginBottom: 12 }}
      >
        <input
          type="checkbox"
          checked={acceptedTerms}
          onChange={(event) => setAcceptedTerms(event.target.checked)}
          data-testid="checkout-accept-terms"
          style={{ marginTop: 2 }}
        />
        <span>
          Acepto los{" "}
          <a
            href="/terminos"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontWeight: 700, textDecoration: "underline" }}
          >
            Términos y Condiciones y el Aviso de Privacidad
          </a>
          .
        </span>
      </label>
      <button
        className="sf-btn"
        type="submit"
        disabled={submitting || missingLocation || closedBySchedule || !acceptedTerms}
        style={{ width: "100%", padding: "15px 18px", justifyContent: "space-between" }}
      >
        {submitting ? (
          <span style={{ width: "100%", textAlign: "center" }}>Enviando…</span>
        ) : credits ? (
          <span style={{ width: "100%", textAlign: "center" }}>Canjear pedido con créditos</span>
        ) : (
          <>
            <span>Confirmar pedido</span>
            <span>
              {effectiveFulfillment !== "delivery"
                ? formatMoney(estimatedTotal)
                : totalWithShipping !== null
                  ? `${formatMoney(totalWithShipping)} incl. envío`
                  : `${formatMoney(estimatedTotal)} + envío por confirmar`}
            </span>
          </>
        )}
      </button>
      {missingLocation ? (
        <p className="sf-muted" style={{ margin: 0, fontSize: 12, textAlign: "center" }}>
          Para confirmar una entrega a domicilio coloca tu ubicación en el mapa.
        </p>
      ) : null}
    </form>
  );
}
