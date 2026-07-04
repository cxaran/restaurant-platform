"use client";

// Venta a mostrador (pantalla 1h del handoff): grid de productos a la
// izquierda y panel de venta fijo (~430px) a la derecha. Dos flujos REALES:
//  · Entrega "Mostrador"  → POST /pos/sales  (cobro inmediato en una llamada)
//  · "Recoger"/"Domicilio" → POST /orders/capture (sin cobro: se cobra al
//    entregar/recoger o al verificar el pago después, en el panel de pedidos)
// Los precios pintados son estimados del menú público; el backend recalcula
// y valida todo (cantidades enteras, modificadores, totales, cambio).

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { LocationPicker, type PickedPoint } from "@/components/map/LocationPicker";
import { useShippingQuote } from "@/components/shipping/use-shipping-quote";
import {
  distanceMeters,
  reverseGeocode,
  searchAddress,
  type AddressSuggestion,
  type GeoSearchMatch,
} from "@/core/geo/geocoding";
import { ApiRequestError } from "@/core/api/api-error";
import { browserApi } from "@/core/api/browser-client";
import type { PublicMenuCategory, PublicProduct } from "@/core/restaurant-api/contracts";
import type {
  CaptureRequest,
  OrderRead,
  PaymentMethodPublic,
  PosSaleRequest,
  PosSaleResult,
} from "@/core/restaurant-api/panel-contracts";
import { formatMoney, publicFileUrl } from "@/core/restaurant-api/theme";
import type { CartModifier } from "@/core/storefront/cart-lines";
import { isCustomizable } from "@/core/storefront/configurator";
import type { components } from "@/generated/openapi";

import { TicketPrintButton } from "../TicketPrintButton";
import { PosModifierPicker } from "./PosModifierPicker";
import {
  cashSuggestions,
  posLineKey,
  posSubtotal,
  toOrderLineInputs,
  type PosLine,
} from "./pos-cart";

type Source = "counter" | "phone" | "whatsapp" | "social";
type Fulfillment = "counter" | "pickup" | "delivery";

type PaymentCreate = components["schemas"]["PaymentCreate"];
type OrderShippingFinalizeRequest = components["schemas"]["OrderShippingFinalizeRequest"];

const SOURCES: readonly { value: Source; label: string }[] = [
  { value: "counter", label: "Mostrador" },
  { value: "phone", label: "Llamada" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "social", label: "Redes" },
];

const FULFILLMENTS: readonly { value: Fulfillment; label: string }[] = [
  { value: "counter", label: "Mostrador" },
  { value: "pickup", label: "Recoger" },
  { value: "delivery", label: "A domicilio" },
];

const EMPTY_ADDRESS = {
  street: "",
  external_number: "",
  internal_number: "",
  neighborhood: "",
  city: "",
  postal_code: "",
  references: "",
};

export function PosView({
  sellerName,
  canAdjustShipping,
}: Readonly<{ sellerName: string; canAdjustShipping: boolean }>) {
  const [menu, setMenu] = useState<PublicMenuCategory[]>([]);
  const [methods, setMethods] = useState<PaymentMethodPublic[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [picker, setPicker] = useState<PublicProduct | null>(null);
  const [lines, setLines] = useState<PosLine[]>([]);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [source, setSource] = useState<Source>("counter");
  const [fulfillment, setFulfillment] = useState<Fulfillment>("counter");
  const [address, setAddress] = useState({ ...EMPTY_ADDRESS });
  const [deliveryNote, setDeliveryNote] = useState("");
  const [internalNote, setInternalNote] = useState("");
  // Punto de entrega (mismo selector y contrato que el checkout web): con
  // coordenadas el backend cotiza solo; sin ellas el envío queda en revisión
  // manual hasta el ajuste autorizado en el panel de pedidos.
  const [deliveryPoint, setDeliveryPoint] = useState<PickedPoint | null>(null);
  // Asistencia de captura (geocodificación): la dirección del pin se SUGIERE
  // (jamás pisa en silencio lo escrito), la dirección escrita mueve el mapa
  // sin seleccionar ubicación, y se avisa si pin y dirección no coinciden.
  const [pinSuggestion, setPinSuggestion] = useState<AddressSuggestion | null>(null);
  const [geoNotice, setGeoNotice] = useState<string | null>(null);
  const [addressMatch, setAddressMatch] = useState<GeoSearchMatch | null>(null);
  const addressRef = useRef(address);
  const reverseSeqRef = useRef(0);
  useEffect(() => {
    addressRef.current = address;
  });

  const [methodCode, setMethodCode] = useState<string | null>(null);
  const [billAmount, setBillAmount] = useState("");
  const [reference, setReference] = useState("");
  const [bankName, setBankName] = useState("");
  const [terminalName, setTerminalName] = useState("");
  const [cardLastFour, setCardLastFour] = useState("");

  // Cobro opcional del flujo de captura (pickup/delivery): se encadena tras
  // POST /orders/capture como PUT shipping + POST payments. Por defecto no se
  // registra nada (se cobra después desde el panel de pedidos).
  const [captureMethodCode, setCaptureMethodCode] = useState<string | null>(null);
  const [captureBillAmount, setCaptureBillAmount] = useState("");
  const [captureReference, setCaptureReference] = useState("");
  const [captureBankName, setCaptureBankName] = useState("");
  const [shippingCost, setShippingCost] = useState("");
  const [captureWarning, setCaptureWarning] = useState<string | null>(null);
  const [capturePaymentRecorded, setCapturePaymentRecorded] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saleResult, setSaleResult] = useState<PosSaleResult | null>(null);
  const [captureResult, setCaptureResult] = useState<OrderRead | null>(null);
  const [clock, setClock] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await browserApi<PublicMenuCategory[]>("/api/v1/public/menu");
        if (active) setMenu(data);
      } catch {
        if (active) setMenu([]);
      }
    })();
    (async () => {
      // Métodos disponibles EN MOSTRADOR (available_pos): incluye efectivo en
      // caja aunque no esté disponible en línea.
      try {
        const data = await browserApi<PaymentMethodPublic[]>("/api/v1/pos/payment-methods");
        if (active) {
          setMethods(data);
          // Método por defecto: el primero que da cambio (efectivo) o el primero.
          setMethodCode((prev) => {
            if (prev !== null || data.length === 0) return prev;
            const cash = data.find((method) => method.allows_cash_change);
            return (cash ?? data[0]).code;
          });
        }
      } catch {
        if (active) setMethods([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Reloj del encabezado del panel de venta ("Karla R. · 6:48 p.m.").
  useEffect(() => {
    const update = () =>
      setClock(new Date().toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" }));
    update();
    const id = window.setInterval(update, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const products = useMemo(() => {
    const byId = new Map<string, PublicProduct>();
    for (const category of menu) {
      if (categoryId !== null && category.id !== categoryId) continue;
      for (const product of category.products) {
        // El POS vende en dinero (§16): lo canjeable-solo-con-créditos no aplica.
        if (product.is_money_purchase_available) byId.set(product.id, product);
      }
    }
    return [...byId.values()];
  }, [menu, categoryId]);

  const method = methods.find((item) => item.code === methodCode) ?? null;
  const subtotal = posSubtotal(lines);
  const total = subtotal; // El POS no aplica envío ni códigos de descuento.
  const isChargeFlow = fulfillment === "counter";

  // Cotización estimada de envío (misma API pública del checkout): informativa
  // para el cajero; el monto del pedido lo fija el backend al capturar.
  const shippingQuote = useShippingQuote(
    fulfillment,
    subtotal,
    fulfillment === "delivery" ? deliveryPoint : null,
  );

  const received = billAmount.trim() ? Number.parseFloat(billAmount) : null;
  const change = received !== null && Number.isFinite(received) ? received - total : null;
  const insufficientCash =
    isChargeFlow && method?.allows_cash_change === true && change !== null && change < 0;

  const missingReference =
    isChargeFlow && method !== null && method.requires_transaction_reference && !reference.trim();
  const missingBank =
    isChargeFlow && method !== null && method.requires_bank_name && !bankName.trim();
  const invalidCardLastFour =
    isChargeFlow &&
    method !== null &&
    !method.allows_cash_change &&
    cardLastFour.trim() !== "" &&
    !/^\d{4}$/.test(cardLastFour.trim());
  const missingDelivery =
    fulfillment === "delivery" &&
    (!customerName.trim() || !customerPhone.trim() || !address.street.trim());

  // Cobro opcional al capturar (pickup/delivery).
  const captureMethod = !isChargeFlow
    ? methods.find((item) => item.code === captureMethodCode) ?? null
    : null;
  const parsedShippingCost = shippingCost.trim() ? Number.parseFloat(shippingCost) : null;
  const invalidShippingCost =
    fulfillment === "delivery" &&
    shippingCost.trim() !== "" &&
    (parsedShippingCost === null || !Number.isFinite(parsedShippingCost) || parsedShippingCost < 0);
  // Estimado solo para los montos rápidos de "paga con": el total real (con
  // envío) lo fija el backend.
  const captureChargeEstimate =
    subtotal +
    (fulfillment === "delivery" && parsedShippingCost !== null && Number.isFinite(parsedShippingCost)
      ? Math.max(parsedShippingCost, 0)
      : 0);
  const missingCaptureReference =
    captureMethod !== null && captureMethod.requires_transaction_reference && !captureReference.trim();
  const missingCaptureBank =
    captureMethod !== null && captureMethod.requires_bank_name && !captureBankName.trim();

  const blockedReason =
    lines.length === 0
      ? "Toca productos para agregarlos a la venta."
      : isChargeFlow && method === null
        ? "No hay métodos de pago disponibles para cobrar."
        : missingReference
          ? "Este método requiere la referencia de la transacción."
          : missingBank
            ? "Este método requiere el banco emisor."
            : invalidCardLastFour
              ? "Los últimos 4 dígitos de la tarjeta deben ser exactamente 4 números."
              : insufficientCash
                ? "El monto recibido no alcanza el total."
                : missingDelivery
                  ? "El envío a domicilio requiere nombre, teléfono y calle."
                  : invalidShippingCost
                    ? "El costo de envío debe ser un monto válido (≥ 0)."
                    : missingCaptureReference
                      ? "Este método requiere la referencia de la transacción."
                      : missingCaptureBank
                        ? "Este método requiere el banco emisor."
                        : null;

  // ── Asistencia de captura de dirección/ubicación (solo delivery) ────────
  // Pin nuevo (clic, arrastre o "Usar mi ubicación") → dirección sugerida:
  // con el formulario vacío se pre-llena avisando; con texto ya escrito se
  // ofrece la sugerencia para confirmar (nunca se pisa nada en silencio).
  function handleDeliveryPoint(point: PickedPoint | null) {
    setDeliveryPoint(point);
    setPinSuggestion(null);
    setGeoNotice(null);
    if (point === null) return;
    const seq = ++reverseSeqRef.current;
    void reverseGeocode(point).then((suggestion) => {
      if (seq !== reverseSeqRef.current || suggestion === null) return;
      const current = addressRef.current;
      const untouched =
        !current.street.trim() &&
        !current.neighborhood.trim() &&
        !current.postal_code.trim() &&
        !current.city.trim();
      if (untouched) {
        setAddress((prev) => ({
          ...prev,
          street: suggestion.street,
          external_number: suggestion.external_number || prev.external_number,
          neighborhood: suggestion.neighborhood || prev.neighborhood,
          city: suggestion.city || prev.city,
          postal_code: suggestion.postal_code || prev.postal_code,
        }));
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
    setAddress((prev) => ({
      ...prev,
      street: pinSuggestion.street,
      external_number: pinSuggestion.external_number || prev.external_number,
      neighborhood: pinSuggestion.neighborhood || prev.neighborhood,
      city: pinSuggestion.city || prev.city,
      postal_code: pinSuggestion.postal_code || prev.postal_code,
    }));
    setPinSuggestion(null);
    setGeoNotice("Dirección actualizada con la del punto del mapa.");
  }

  // Dirección escrita → geocodificar (debounce) para mover el mapa cerca (sin
  // seleccionar ubicación) y poder contrastarla contra el pin.
  const addressQuery = useMemo(() => {
    if (fulfillment !== "delivery" || address.street.trim().length < 4) return "";
    return [
      [address.street.trim(), address.external_number.trim()].filter(Boolean).join(" "),
      address.neighborhood.trim(),
      address.postal_code.trim(),
      address.city.trim(),
    ]
      .filter(Boolean)
      .join(", ");
  }, [
    fulfillment,
    address.street,
    address.external_number,
    address.neighborhood,
    address.postal_code,
    address.city,
  ]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(
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
      clearTimeout(timer);
    };
  }, [addressQuery]);

  // Contraste pin ↔ dirección escrita: a partir de ~300 m se pide verificar
  // (típico "pin a ojo" o dirección de otra colonia). Aviso, nunca bloqueo.
  const pinDistance = useMemo(
    () =>
      deliveryPoint !== null && addressMatch !== null
        ? distanceMeters(deliveryPoint, addressMatch)
        : null,
    [deliveryPoint, addressMatch],
  );
  const pinFarFromAddress = pinDistance !== null && pinDistance > 300;

  function movePinToAddress() {
    if (addressMatch === null) return;
    // Movimiento explícito: el pin adopta la dirección escrita, sin re-sugerir.
    setDeliveryPoint({
      longitude: addressMatch.longitude,
      latitude: addressMatch.latitude,
    });
    setPinSuggestion(null);
    setGeoNotice("Pin movido a la dirección escrita: confirma el punto exacto en el mapa.");
  }

  function addLine(
    product: PublicProduct,
    modifiers: CartModifier[],
    quantity: number,
    note: string | null,
    unitPriceHint: number | null,
  ) {
    const key = posLineKey(product.id, modifiers, note);
    setLines((current) => {
      const existing = current.find((line) => line.key === key);
      if (existing) {
        return current.map((line) =>
          line.key === key ? { ...line, quantity: line.quantity + quantity } : line,
        );
      }
      return [
        ...current,
        {
          key,
          product_id: product.id,
          name: product.name,
          unit_price_hint: unitPriceHint,
          quantity,
          modifiers,
          note,
          max_units: product.max_units_per_order ?? null,
        },
      ];
    });
  }

  function tapProduct(product: PublicProduct) {
    if (isCustomizable(product)) {
      setPicker(product);
      return;
    }
    const base = Number.parseFloat(product.money_price_amount ?? "");
    addLine(product, [], 1, null, Number.isFinite(base) ? base : null);
  }

  function stepLine(key: string, delta: 1 | -1) {
    setLines((current) =>
      current.flatMap((line) => {
        if (line.key !== key) return [line];
        const next = line.quantity + delta;
        if (next < 1) return []; // "−" en 1 quita la línea (como el diseño).
        if (delta > 0 && line.max_units !== null && next > line.max_units) return [line];
        return [{ ...line, quantity: next }];
      }),
    );
  }

  function clearCaptureCharge() {
    setCaptureMethodCode(null);
    setCaptureBillAmount("");
    setCaptureReference("");
    setCaptureBankName("");
    setShippingCost("");
  }

  function resetSale() {
    // Invalida cualquier geocodificación inversa EN VUELO: si resolviera
    // después de limpiar, rellenaría la venta nueva con el pin viejo.
    reverseSeqRef.current += 1;
    setLines([]);
    setCustomerName("");
    setCustomerPhone("");
    setAddress({ ...EMPTY_ADDRESS });
    setDeliveryPoint(null);
    setPinSuggestion(null);
    setGeoNotice(null);
    setAddressMatch(null);
    setDeliveryNote("");
    setInternalNote("");
    setBillAmount("");
    setReference("");
    setBankName("");
    setTerminalName("");
    setCardLastFour("");
    clearCaptureCharge();
    setCaptureWarning(null);
    setCapturePaymentRecorded(false);
    setError(null);
    setSaleResult(null);
    setCaptureResult(null);
  }

  // Pasos encadenados tras POST /orders/capture: primero fijar el envío (para
  // que el monto esperado del pago lo incluya) y después registrar el pago.
  // Si algo falla, el pedido YA existe: se avisa y se termina desde Pedidos.
  async function chainCaptureSteps(order: OrderRead): Promise<void> {
    const wantsShipping =
      fulfillment === "delivery" && canAdjustShipping && shippingCost.trim() !== "";
    if (wantsShipping) {
      try {
        await browserApi(`/api/v1/orders/${order.id}/shipping`, {
          method: "PUT",
          body: {
            final_amount: shippingCost.trim(),
            reason: "Costo de envío capturado en POS",
          } satisfies OrderShippingFinalizeRequest,
        });
      } catch (err) {
        // Sin envío fijado, el pago tendría un monto esperado incompleto:
        // se detiene la cadena y ambos se terminan desde Pedidos.
        const message = err instanceof ApiRequestError ? err.body.message : "error de red";
        setCaptureWarning(
          `El pedido ${order.public_code} SÍ se creó, pero no se pudo fijar el envío ` +
            `(${message}). Ajusta el envío y registra el pago desde el panel de pedidos.`,
        );
        return;
      }
    }
    if (captureMethod !== null) {
      try {
        // El monto esperado lo deriva el backend (se omite expected_amount).
        const body: PaymentCreate = {
          method_code: captureMethod.code,
          ...(captureMethod.allows_cash_change && captureBillAmount.trim()
            ? { change_requested_for_amount: captureBillAmount.trim() }
            : {}),
          ...(captureReference.trim()
            ? { transaction_reference: captureReference.trim() }
            : {}),
          ...(captureBankName.trim() ? { bank_name: captureBankName.trim() } : {}),
        };
        await browserApi(`/api/v1/orders/${order.id}/payments`, { method: "POST", body });
        setCapturePaymentRecorded(true);
      } catch (err) {
        const message = err instanceof ApiRequestError ? err.body.message : "error de red";
        setCaptureWarning(
          `El pedido ${order.public_code} SÍ se creó, pero no se pudo registrar el pago ` +
            `(${message}). Regístralo desde el panel de pedidos.`,
        );
      }
    }
  }

  async function submit() {
    if (blockedReason !== null || busy) return;
    setBusy(true);
    setError(null);
    setSaleResult(null);
    setCaptureResult(null);
    setCaptureWarning(null);
    setCapturePaymentRecorded(false);
    try {
      if (isChargeFlow) {
        if (method === null) return;
        const payload: PosSaleRequest = {
          source,
          lines: toOrderLineInputs(lines),
          ...(customerName.trim() ? { customer_name: customerName.trim() } : {}),
          payment: {
            method_code: method.code,
            ...(method.allows_cash_change && billAmount.trim()
              ? { change_requested_for_amount: billAmount.trim() }
              : {}),
            ...(reference.trim() ? { transaction_reference: reference.trim() } : {}),
            ...(bankName.trim() ? { bank_name: bankName.trim() } : {}),
            ...(!method.allows_cash_change && terminalName.trim()
              ? { terminal_name: terminalName.trim() }
              : {}),
            ...(!method.allows_cash_change && cardLastFour.trim()
              ? { card_last_four: cardLastFour.trim() }
              : {}),
          },
          ...(internalNote.trim() ? { internal_note: internalNote.trim() } : {}),
        };
        const sale = await browserApi<PosSaleResult>("/api/v1/pos/sales", {
          method: "POST",
          body: payload,
        });
        setSaleResult(sale);
      } else {
        const payload: CaptureRequest = {
          source,
          fulfillment_type: fulfillment,
          purchase_mode: "money",
          lines: toOrderLineInputs(lines),
          ...(customerName.trim() ? { customer_name: customerName.trim() } : {}),
          ...(customerPhone.trim() ? { customer_phone: customerPhone.trim() } : {}),
          ...(internalNote.trim() ? { internal_note: internalNote.trim() } : {}),
          ...(fulfillment === "delivery"
            ? {
                delivery: {
                  recipient_name: customerName.trim(),
                  recipient_phone: customerPhone.trim(),
                  street: address.street.trim(),
                  ...(address.external_number.trim()
                    ? { external_number: address.external_number.trim() }
                    : {}),
                  ...(address.internal_number.trim()
                    ? { internal_number: address.internal_number.trim() }
                    : {}),
                  ...(address.neighborhood.trim()
                    ? { neighborhood: address.neighborhood.trim() }
                    : {}),
                  ...(address.city.trim() ? { city: address.city.trim() } : {}),
                  ...(address.postal_code.trim()
                    ? { postal_code: address.postal_code.trim() }
                    : {}),
                  ...(address.references.trim()
                    ? { references: address.references.trim() }
                    : {}),
                  ...(deliveryNote.trim() ? { delivery_note: deliveryNote.trim() } : {}),
                  // Mismo contrato de ubicación que el checkout: el backend
                  // cotiza zona/tarifa; sin punto queda pending_review.
                  ...(deliveryPoint !== null
                    ? {
                        location: {
                          type: "Point" as const,
                          coordinates: [
                            deliveryPoint.longitude,
                            deliveryPoint.latitude,
                          ] as [number, number],
                        },
                      }
                    : {}),
                },
              }
            : {}),
        };
        const order = await browserApi<OrderRead>("/api/v1/orders/capture", {
          method: "POST",
          body: payload,
        });
        setCaptureResult(order);
        await chainCaptureSteps(order);
      }
      // Venta registrada: se limpia la captura pero se conservan fuente y
      // tipo de entrega (ritmo de mostrador: varias ventas seguidas).
      reverseSeqRef.current += 1; // invalida reverse-geocode en vuelo
      setLines([]);
      setCustomerName("");
      setCustomerPhone("");
      setAddress({ ...EMPTY_ADDRESS });
      setDeliveryPoint(null);
      setPinSuggestion(null);
      setGeoNotice(null);
      setAddressMatch(null);
      setDeliveryNote("");
      setInternalNote("");
      setBillAmount("");
      setReference("");
      setBankName("");
      setTerminalName("");
      setCardLastFour("");
      clearCaptureCharge();
    } catch (err) {
      // H6: sin reintentos automáticos en operaciones económicas.
      setError(
        err instanceof ApiRequestError && err.status === 409
          ? "No se pudo confirmar por una actualización simultánea. Revisa y vuelve a intentar."
          : err instanceof ApiRequestError
            ? err.body.message
            : "No fue posible registrar la venta.",
      );
    } finally {
      setBusy(false);
    }
  }

  const resultOrderId = saleResult?.order.id ?? captureResult?.id ?? null;

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
      {/* ── Izquierda: chips de categoría + grid de productos ─────────── */}
      <section className="flex min-w-0 flex-col gap-4" aria-label="Menú de productos">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="tt-chip"
            data-active={categoryId === null ? "1" : "0"}
            onClick={() => setCategoryId(null)}
          >
            Todo
          </button>
          {menu.map((category) => (
            <button
              key={category.id}
              type="button"
              className="tt-chip"
              data-active={categoryId === category.id ? "1" : "0"}
              onClick={() => setCategoryId(category.id)}
            >
              {category.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {products.map((product) => {
            const imageUrl = publicFileUrl(product.image_file_ids[0] ?? null);
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => tapProduct(product)}
                className="tt-card flex cursor-pointer flex-col items-center gap-2 p-3.5 text-center transition hover:border-[var(--tx3)]"
              >
                <span className="flex h-[110px] w-full items-center justify-center">
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- media dinámica del backend
                    <img
                      src={imageUrl}
                      alt=""
                      className="max-h-[104px] max-w-full object-contain"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="tt-display text-4xl text-[var(--tx3)]"
                    >
                      {product.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="text-[15px] font-extrabold leading-tight">{product.name}</span>
                <span className="text-[17px] font-black text-[var(--accent)]">
                  {formatMoney(product.money_price_amount)}
                </span>
              </button>
            );
          })}
        </div>
        {products.length === 0 ? (
          <p className="m-0 text-sm text-[var(--tx3)]">Sin productos disponibles.</p>
        ) : null}
      </section>

      {/* ── Derecha: panel de venta (430px, como la pantalla 1h) ──────── */}
      <aside className="tt-card flex flex-col overflow-hidden xl:sticky xl:top-0" aria-label="Venta en curso">
        <div className="flex flex-col gap-2.5 border-b border-[var(--border)] px-5 pb-3.5 pt-5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="tt-display text-[18px]">
              {saleResult?.order.public_code ?? captureResult?.public_code ?? "Nueva venta"}
            </span>
            <span className="text-xs text-[var(--tx3)]">
              {sellerName}
              {clock ? ` · ${clock}` : ""}
            </span>
          </div>
          <input
            className="tt-input"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            placeholder={
              fulfillment === "delivery"
                ? "Nombre del cliente (recibe el pedido)"
                : "Nombre del cliente (opcional)"
            }
            aria-label="Nombre del cliente"
          />
        </div>

        <div className="flex flex-col gap-3 px-5 py-4 text-sm">
          <div className="flex flex-col gap-1.5">
            <span className="tt-label">Fuente del pedido</span>
            <div className="tt-seg" role="group" aria-label="Fuente del pedido">
              {SOURCES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className="tt-seg-item"
                  data-active={source === item.value ? "1" : "0"}
                  aria-pressed={source === item.value}
                  onClick={() => setSource(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="tt-label">Tipo de entrega</span>
            <div className="tt-seg" role="group" aria-label="Tipo de entrega">
              {FULFILLMENTS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className="tt-seg-item"
                  data-active={fulfillment === item.value ? "1" : "0"}
                  aria-pressed={fulfillment === item.value}
                  onClick={() => setFulfillment(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {fulfillment !== "counter" ? (
            <div className="flex flex-col gap-2">
              <input
                className="tt-input"
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
                placeholder={
                  fulfillment === "delivery"
                    ? "Teléfono de quien recibe"
                    : "Teléfono del cliente (opcional)"
                }
                inputMode="tel"
                aria-label="Teléfono del cliente"
              />
              {fulfillment === "delivery" ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      className="tt-input col-span-2"
                      value={address.street}
                      onChange={(event) =>
                        setAddress((current) => ({ ...current, street: event.target.value }))
                      }
                      placeholder="Calle"
                      aria-label="Calle"
                    />
                    <input
                      className="tt-input"
                      value={address.external_number}
                      onChange={(event) =>
                        setAddress((current) => ({
                          ...current,
                          external_number: event.target.value,
                        }))
                      }
                      placeholder="No. exterior"
                      aria-label="Número exterior"
                    />
                    <input
                      className="tt-input"
                      value={address.internal_number}
                      onChange={(event) =>
                        setAddress((current) => ({
                          ...current,
                          internal_number: event.target.value,
                        }))
                      }
                      placeholder="No. interior (opcional)"
                      aria-label="Número interior"
                    />
                    <input
                      className="tt-input"
                      value={address.neighborhood}
                      onChange={(event) =>
                        setAddress((current) => ({
                          ...current,
                          neighborhood: event.target.value,
                        }))
                      }
                      placeholder="Colonia"
                      aria-label="Colonia"
                    />
                    <input
                      className="tt-input"
                      value={address.city}
                      onChange={(event) =>
                        setAddress((current) => ({ ...current, city: event.target.value }))
                      }
                      placeholder="Ciudad"
                      aria-label="Ciudad"
                    />
                    <input
                      className="tt-input"
                      value={address.postal_code}
                      onChange={(event) =>
                        setAddress((current) => ({
                          ...current,
                          postal_code: event.target.value,
                        }))
                      }
                      placeholder="C.P."
                      aria-label="Código postal"
                    />
                    <input
                      className="tt-input"
                      value={address.references}
                      onChange={(event) =>
                        setAddress((current) => ({
                          ...current,
                          references: event.target.value,
                        }))
                      }
                      placeholder="Referencias"
                      aria-label="Referencias"
                    />
                    <input
                      className="tt-input col-span-2"
                      value={deliveryNote}
                      onChange={(event) => setDeliveryNote(event.target.value)}
                      placeholder="Nota de entrega (opcional)"
                      aria-label="Nota de entrega"
                    />
                  </div>

                  {/* Ubicación en mapa: mismo selector del checkout web. El POS
                      arranca centrado en la zona del operador (autoLocate) y el
                      mapa sigue a la dirección escrita mientras no haya pin. */}
                  <LocationPicker
                    value={deliveryPoint}
                    onChange={handleDeliveryPoint}
                    height={200}
                    buttonClassName="tt-btn tt-btn-outline"
                    testId="pos-location"
                    autoLocate
                    focus={addressMatch}
                  />
                  {geoNotice !== null ? (
                    <p
                      role="status"
                      data-testid="pos-geo-notice"
                      className="m-0 text-xs text-[var(--tx2)]"
                    >
                      {geoNotice}
                    </p>
                  ) : null}
                  {pinSuggestion !== null ? (
                    <div
                      data-testid="pos-pin-suggestion"
                      className="flex flex-col gap-1.5 rounded-[10px] border border-[var(--border2)] bg-[var(--bg2)] p-2.5 text-xs"
                    >
                      <span>
                        El punto del mapa corresponde aprox. a:{" "}
                        <strong>{pinSuggestion.label}</strong>
                      </span>
                      <span className="text-[var(--tx3)]">
                        Ya hay una dirección escrita; no se modificó nada.
                      </span>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="tt-btn tt-btn-outline"
                          onClick={applyPinSuggestion}
                        >
                          Usar esta dirección
                        </button>
                        <button
                          type="button"
                          className="tt-btn tt-btn-outline"
                          onClick={() => setPinSuggestion(null)}
                        >
                          Mantener lo escrito
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {pinFarFromAddress && pinDistance !== null ? (
                    <div
                      role="alert"
                      data-testid="pos-pin-mismatch"
                      className="tt-badge tt-badge-warn m-0 flex flex-col items-start gap-1.5 whitespace-normal py-1.5 text-xs"
                    >
                      <span>
                        El pin está a ~
                        {pinDistance >= 1000
                          ? `${(pinDistance / 1000).toFixed(1)} km`
                          : `${Math.round(pinDistance)} m`}{" "}
                        de la dirección escrita. Verifica el punto antes de
                        capturar.
                      </span>
                      <button
                        type="button"
                        className="tt-btn tt-btn-outline"
                        onClick={movePinToAddress}
                      >
                        Mover pin a la dirección escrita
                      </button>
                    </div>
                  ) : null}
                  <div aria-live="polite" data-testid="pos-shipping-quote" className="text-xs">
                    {deliveryPoint === null ? (
                      <span className="text-[var(--tx3)]">
                        Sin ubicación el envío queda por confirmar en el panel de pedidos.
                      </span>
                    ) : shippingQuote.kind === "loading" ? (
                      <span className="text-[var(--tx3)]">Cotizando envío…</span>
                    ) : shippingQuote.kind === "calculated" ? (
                      <span className="font-bold">
                        Envío estimado:{" "}
                        {shippingQuote.isFreeShipping
                          ? "gratis"
                          : formatMoney(shippingQuote.amount)}
                        {shippingQuote.zoneName ? ` · ${shippingQuote.zoneName}` : ""}
                        {shippingQuote.estimatedMinutes != null
                          ? ` · ~${shippingQuote.estimatedMinutes} min`
                          : ""}
                      </span>
                    ) : shippingQuote.kind === "pending_review" ? (
                      <span className="font-bold text-[var(--tx2)]">
                        Fuera de zona con tarifa: el envío queda por confirmar (ajuste
                        autorizado en el panel de pedidos).
                      </span>
                    ) : (
                      <span className="text-[var(--tx3)]">
                        No fue posible cotizar; el envío se ajusta en el panel de pedidos.
                      </span>
                    )}
                  </div>

                  <p className="tt-badge tt-badge-warn m-0 whitespace-normal py-1.5 text-xs">
                    Se registra sin cobro: el pago se cobra contra entrega (o al verificarse) y
                    el envío se ajusta en el panel de pedidos.
                  </p>
                </>
              ) : (
                <p className="tt-badge tt-badge-warn m-0 whitespace-normal py-1.5 text-xs">
                  Se registra sin cobro: el pago se registra cuando el cliente recoge.
                </p>
              )}
            </div>
          ) : null}

          {/* Líneas de la venta */}
          <div className="flex flex-col gap-3">
            {lines.length === 0 ? (
              <p className="m-0 text-[13px] text-[var(--tx3)]">Toca productos para agregarlos.</p>
            ) : (
              lines.map((line) => (
                <div key={line.key} className="flex items-center gap-2.5">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="font-bold leading-tight">{line.name}</span>
                    {line.modifiers.length > 0 ? (
                      <span className="text-xs text-[var(--tx2)]">
                        {line.modifiers
                          .map((modifier) =>
                            modifier.quantity > 1
                              ? `${modifier.name} ×${modifier.quantity}`
                              : modifier.name,
                          )
                          .join(" · ")}
                      </span>
                    ) : null}
                    {line.note ? (
                      <span className="text-xs italic text-[var(--tx3)]">“{line.note}”</span>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2.5 rounded-[10px] border border-[var(--border2)] bg-[var(--bg)] px-2.5 py-1.5 text-[13px] font-extrabold">
                    <button
                      type="button"
                      className="cursor-pointer border-0 bg-transparent font-black text-[var(--accent)]"
                      aria-label={`Quitar uno de ${line.name}`}
                      onClick={() => stepLine(line.key, -1)}
                    >
                      −
                    </button>
                    <span>{line.quantity}</span>
                    <button
                      type="button"
                      className="cursor-pointer border-0 bg-transparent font-black text-[var(--accent)]"
                      aria-label={`Agregar uno de ${line.name}`}
                      onClick={() => stepLine(line.key, 1)}
                    >
                      +
                    </button>
                  </div>
                  <span className="w-14 shrink-0 text-right font-extrabold">
                    {line.unit_price_hint !== null
                      ? formatMoney(line.unit_price_hint * line.quantity)
                      : "—"}
                  </span>
                </div>
              ))
            )}
          </div>

          <input
            className="tt-input"
            value={internalNote}
            onChange={(event) => setInternalNote(event.target.value)}
            placeholder="Nota interna (opcional)"
            aria-label="Nota interna"
          />

          {/* Totales */}
          <div
            className="flex flex-col gap-2 pt-3"
            style={{ borderTop: "1px dashed var(--border2)" }}
          >
            <div className="flex justify-between text-[var(--tx2)]">
              <span>Subtotal</span>
              <span className="font-bold">{formatMoney(subtotal)}</span>
            </div>
            <div className="flex justify-between text-[20px] font-black">
              <span>Total</span>
              <span>{formatMoney(total)}</span>
            </div>
          </div>

          {/* Pago (solo flujo de cobro inmediato en mostrador) */}
          {isChargeFlow ? (
            <div className="flex flex-col gap-2.5">
              <span className="tt-label">Tipo de pago</span>
              {methods.length === 0 ? (
                <p className="m-0 text-[13px] font-bold text-[var(--accent)]">
                  No hay métodos de pago disponibles.
                </p>
              ) : (
                <div className="tt-seg flex-wrap" role="group" aria-label="Tipo de pago">
                  {methods.map((item) => (
                    <button
                      key={item.code}
                      type="button"
                      className="tt-seg-item"
                      data-active={methodCode === item.code ? "1" : "0"}
                      aria-pressed={methodCode === item.code}
                      onClick={() => setMethodCode(item.code)}
                    >
                      {item.display_name}
                    </button>
                  ))}
                </div>
              )}

              {method?.allows_cash_change ? (
                <>
                  <div className="flex gap-2" role="group" aria-label="Monto recibido">
                    {cashSuggestions(total).map((amount) => {
                      const active = billAmount.trim() === String(amount);
                      return (
                        <button
                          key={amount}
                          type="button"
                          onClick={() => setBillAmount(active ? "" : String(amount))}
                          aria-pressed={active}
                          className={`flex-1 cursor-pointer rounded-[10px] py-2.5 text-center text-sm font-extrabold ${
                            active
                              ? "border-2 border-[var(--tx)] bg-transparent"
                              : "border border-[var(--border2)] bg-[var(--bg)]"
                          }`}
                        >
                          {formatMoney(amount)}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    className="tt-input"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={billAmount}
                    onChange={(event) => setBillAmount(event.target.value)}
                    placeholder="Otro monto recibido (opcional)"
                    aria-label="Monto recibido"
                  />
                  {change !== null ? (
                    // Tono ámbar derivado de --warn para respetar el tema oscuro.
                    <div
                      className="flex items-center justify-between rounded-[12px] px-4 py-3 text-[15px] font-extrabold"
                      style={{
                        background: "color-mix(in srgb, var(--warn) 16%, var(--panel))",
                        border: "1px solid color-mix(in srgb, var(--warn) 45%, var(--panel))",
                        color: "var(--warn)",
                      }}
                    >
                      <span>
                        Recibido {formatMoney(received)} ·{" "}
                        {change >= 0 ? "Cambio" : "Falta"}
                      </span>
                      <span>{formatMoney(Math.abs(change))}</span>
                    </div>
                  ) : null}
                </>
              ) : null}

              {method !== null && !method.allows_cash_change ? (
                <div className="flex flex-col gap-2">
                  {method.instructions ? (
                    <p className="m-0 text-xs text-[var(--tx3)]">{method.instructions}</p>
                  ) : null}
                  {method.requires_transaction_reference ? (
                    <input
                      className="tt-input"
                      value={reference}
                      onChange={(event) => setReference(event.target.value)}
                      placeholder="Referencia de la transacción"
                      aria-label="Referencia de la transacción"
                    />
                  ) : null}
                  {method.requires_bank_name ? (
                    <input
                      className="tt-input"
                      value={bankName}
                      onChange={(event) => setBankName(event.target.value)}
                      placeholder="Banco emisor"
                      aria-label="Banco emisor"
                    />
                  ) : null}
                  {/* Datos opcionales de terminal/tarjeta (método sin cambio). */}
                  <div className="flex gap-2">
                    <input
                      className="tt-input flex-1"
                      value={terminalName}
                      onChange={(event) => setTerminalName(event.target.value)}
                      placeholder="Terminal (opcional)"
                      aria-label="Terminal"
                    />
                    <input
                      className="tt-input flex-1"
                      value={cardLastFour}
                      onChange={(event) => setCardLastFour(event.target.value)}
                      placeholder="Últimos 4 dígitos"
                      aria-label="Últimos 4 dígitos de la tarjeta"
                      inputMode="numeric"
                      maxLength={4}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Cobro opcional al capturar (pickup/delivery): método + "paga con";
              se encadena tras crear el pedido. Sin método, se cobra después. */}
          {!isChargeFlow ? (
            <div className="flex flex-col gap-2.5">
              <span className="tt-label">
                Cobro al {fulfillment === "delivery" ? "entregar" : "recoger"} (opcional)
              </span>
              {fulfillment === "delivery" && canAdjustShipping ? (
                <input
                  className="tt-input"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={shippingCost}
                  onChange={(event) => setShippingCost(event.target.value)}
                  placeholder="Costo de envío $ (opcional)"
                  aria-label="Costo de envío"
                />
              ) : null}
              {methods.length > 0 ? (
                <div className="tt-seg flex-wrap" role="group" aria-label="Método de cobro">
                  <button
                    type="button"
                    className="tt-seg-item"
                    data-active={captureMethodCode === null ? "1" : "0"}
                    aria-pressed={captureMethodCode === null}
                    onClick={() => setCaptureMethodCode(null)}
                  >
                    Después
                  </button>
                  {methods.map((item) => (
                    <button
                      key={item.code}
                      type="button"
                      className="tt-seg-item"
                      data-active={captureMethodCode === item.code ? "1" : "0"}
                      aria-pressed={captureMethodCode === item.code}
                      onClick={() => setCaptureMethodCode(item.code)}
                    >
                      {item.display_name}
                    </button>
                  ))}
                </div>
              ) : null}
              {captureMethod?.allows_cash_change ? (
                <>
                  <div className="flex gap-2" role="group" aria-label="Paga con">
                    {cashSuggestions(captureChargeEstimate).map((amount) => {
                      const active = captureBillAmount.trim() === String(amount);
                      return (
                        <button
                          key={amount}
                          type="button"
                          onClick={() => setCaptureBillAmount(active ? "" : String(amount))}
                          aria-pressed={active}
                          className={`flex-1 cursor-pointer rounded-[10px] py-2.5 text-center text-sm font-extrabold ${
                            active
                              ? "border-2 border-[var(--tx)] bg-transparent"
                              : "border border-[var(--border2)] bg-[var(--bg)]"
                          }`}
                        >
                          {formatMoney(amount)}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    className="tt-input"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={captureBillAmount}
                    onChange={(event) => setCaptureBillAmount(event.target.value)}
                    placeholder="¿Con cuánto paga? (opcional)"
                    aria-label="Monto con el que paga"
                  />
                  <p className="m-0 text-xs text-[var(--tx3)]">
                    El cambio exacto se calcula al cobrar con el total final del pedido.
                  </p>
                </>
              ) : null}
              {captureMethod !== null && !captureMethod.allows_cash_change ? (
                <div className="flex flex-col gap-2">
                  {captureMethod.instructions ? (
                    <p className="m-0 text-xs text-[var(--tx3)]">{captureMethod.instructions}</p>
                  ) : null}
                  {captureMethod.requires_transaction_reference ? (
                    <input
                      className="tt-input"
                      value={captureReference}
                      onChange={(event) => setCaptureReference(event.target.value)}
                      placeholder="Referencia de la transacción"
                      aria-label="Referencia de la transacción"
                    />
                  ) : null}
                  {captureMethod.requires_bank_name ? (
                    <input
                      className="tt-input"
                      value={captureBankName}
                      onChange={(event) => setCaptureBankName(event.target.value)}
                      placeholder="Banco emisor"
                      aria-label="Banco emisor"
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="m-0 text-[13px] font-bold text-[var(--accent)]">
              {error}
            </p>
          ) : null}

          {/* Resultado de la última operación */}
          {saleResult ? (
            <div
              role="status"
              className="flex flex-col gap-1 rounded-[12px] border border-[var(--border)] bg-[var(--bg)] p-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-black">{saleResult.order.public_code}</span>
                {saleResult.payment.status === "paid" ? (
                  <span className="tt-badge tt-badge-ok">Pagado</span>
                ) : (
                  <span className="tt-badge tt-badge-warn">Pago por verificar</span>
                )}
              </div>
              <span>Total {formatMoney(saleResult.order.total_money_amount)}</span>
              {Number.parseFloat(saleResult.payment.change_amount) > 0 ? (
                <span className="font-extrabold">
                  Cambio {formatMoney(saleResult.payment.change_amount)}
                </span>
              ) : null}
              {saleResult.payment.status !== "paid" ? (
                <span className="text-xs text-[var(--tx2)]">
                  El pedido quedó aprobado; se completa al verificar el pago en el panel de
                  pedidos.
                </span>
              ) : null}
            </div>
          ) : null}
          {captureResult ? (
            <div
              role="status"
              className="flex flex-col gap-1 rounded-[12px] border border-[var(--border)] bg-[var(--bg)] p-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-black">{captureResult.public_code}</span>
                {capturePaymentRecorded ? (
                  <span className="tt-badge tt-badge-ok">Pago registrado</span>
                ) : (
                  <span className="tt-badge tt-badge-warn">Sin cobro</span>
                )}
              </div>
              <span>Total {formatMoney(captureResult.total_money_amount)}</span>
              <span className="text-xs text-[var(--tx2)]">
                {capturePaymentRecorded
                  ? "Pedido capturado con pago registrado; se concilia al "
                  : "Pedido capturado; se cobra al "}
                {fulfillment === "delivery" ? "entregar" : "recoger"} desde el panel de{" "}
                <Link href="/panel/pedidos">pedidos</Link>.
              </span>
            </div>
          ) : null}
          {captureWarning ? (
            <p role="alert" className="m-0 text-[13px] font-bold text-[var(--accent)]">
              {captureWarning}
            </p>
          ) : null}
        </div>

        {/* Pie de acciones */}
        <div className="flex flex-col gap-2.5 border-t border-[var(--border)] px-5 pb-5 pt-4">
          <button
            type="button"
            className={`tt-btn w-full py-4 text-[17px] ${isChargeFlow ? "tt-btn-primary" : "tt-btn-dark"}`}
            disabled={busy || blockedReason !== null}
            onClick={() => void submit()}
          >
            {busy
              ? "Registrando…"
              : isChargeFlow
                ? `Cobrar ${formatMoney(total)}`
                : "Registrar pedido"}
          </button>
          {blockedReason !== null && lines.length > 0 ? (
            <p className="m-0 text-center text-xs text-[var(--tx3)]">{blockedReason}</p>
          ) : null}
          <div className="flex gap-2.5">
            {/* Impresión DIRECTA del ticket (sin página intermedia): imprime
                al toque y registra la impresión en la bitácora. */}
            <TicketPrintButton
              key={resultOrderId ?? "sin-pedido"}
              orderId={resultOrderId}
              className="tt-btn tt-btn-outline"
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="tt-btn tt-btn-ghost flex-1"
              onClick={resetSale}
              disabled={busy}
            >
              Cancelar venta
            </button>
          </div>
        </div>
      </aside>

      {picker ? (
        <PosModifierPicker
          product={picker}
          onClose={() => setPicker(null)}
          onConfirm={({ modifiers, quantity, note, unitPriceHint }) => {
            addLine(picker, modifiers, quantity, note, unitPriceHint);
            setPicker(null);
          }}
        />
      ) : null}
    </div>
  );
}
