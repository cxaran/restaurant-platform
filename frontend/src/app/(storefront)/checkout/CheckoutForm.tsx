"use client";

// Checkout web: SIEMPRE con sesión (no existe invitado). El backend valida
// precio, disponibilidad, límites y envío; este formulario solo captura
// contacto y entrega, y envía el carrito con cantidades enteras.

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { ApiRequestError } from "@/core/api/api-error";
import { browserApi } from "@/core/api/browser-client";
import type {
  CheckoutRequest,
  DiscountQuoteRequest,
  DiscountQuoteResult,
  MyOrderRead,
} from "@/core/restaurant-api/contracts";
import { submitCheckout } from "@/core/restaurant-api/orders";
import { formatMoney } from "@/core/restaurant-api/theme";
import { useCart } from "@/core/storefront/cart";
import {
  buildOrderLineInputs,
  cartFingerprint,
  estimatedTotalAfterDiscount,
  resolveActiveDiscount,
  type AppliedDiscount,
} from "@/core/storefront/discount-quote";
import type { SessionUser } from "@/core/auth/types";

export function CheckoutForm({ session }: Readonly<{ session: SessionUser }>) {
  const router = useRouter();
  const { lines, mode, subtotalHint, clear } = useCart();
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

  // Código de descuento (SOLO checkout web en modo dinero): la cotización viene
  // del backend y queda anclada al carrito exacto que se cotizó.
  const [discountInput, setDiscountInput] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<AppliedDiscount | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);

  // INVARIANTE (el backend la revalida): canje con créditos = pedido completo
  // en créditos, SIN envío (solo pickup), sin códigos de descuento.
  const credits = mode === "credits";
  const effectiveFulfillment = credits ? "pickup" : fulfillment;

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
            }
          : null,
    };
    try {
      const order: MyOrderRead = await submitCheckout(payload);
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
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
        <fieldset style={{ border: "none", margin: 0, padding: 0, display: "flex", gap: 10 }}>
          <legend className="sf-label">¿Cómo recibes tu pedido?</legend>
          {(["pickup", "delivery"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className="sf-chip"
              data-active={fulfillment === option}
              aria-pressed={fulfillment === option}
              onClick={() => setFulfillment(option)}
            >
              {option === "pickup" ? "Recoger en tienda" : "A domicilio"}
            </button>
          ))}
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
          <div>
            <label className="sf-label" htmlFor="co-street">Calle</label>
            <input id="co-street" className="sf-input" required value={street} onChange={(e) => setStreet(e.target.value)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
            <div>
              <label className="sf-label" htmlFor="co-num">Número</label>
              <input id="co-num" className="sf-input" value={externalNumber} onChange={(e) => setExternalNumber(e.target.value)} />
            </div>
            <div>
              <label className="sf-label" htmlFor="co-col">Colonia</label>
              <input id="co-col" className="sf-input" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="sf-label" htmlFor="co-ref">Referencias</label>
            <input id="co-ref" className="sf-input" value={references} onChange={(e) => setReferences(e.target.value)} />
          </div>
          <p className="sf-muted" style={{ fontSize: 13, margin: 0 }}>
            El costo de envío puede confirmarse después según tu zona; verás el total final en
            el seguimiento de tu pedido.
          </p>
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

      <button className="sf-btn" type="submit" disabled={submitting}>
        {submitting
          ? "Enviando…"
          : credits
            ? "Canjear pedido con créditos"
            : `Enviar pedido · ${formatMoney(estimatedTotal)} + envío`}
      </button>
    </form>
  );
}
