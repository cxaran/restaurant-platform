"use client";

// Checkout web: SIEMPRE con sesión (no existe invitado). El backend valida
// precio, disponibilidad, límites y envío; este formulario solo captura
// contacto y entrega, y envía el carrito con cantidades enteras.

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { ApiRequestError } from "@/core/api/api-error";
import type { CheckoutRequest, MyOrderRead } from "@/core/restaurant-api/contracts";
import { submitCheckout } from "@/core/restaurant-api/orders";
import { formatMoney } from "@/core/restaurant-api/theme";
import { useCart } from "@/core/storefront/cart";
import type { SessionUser } from "@/core/auth/types";

export function CheckoutForm({ session }: Readonly<{ session: SessionUser }>) {
  const router = useRouter();
  const { lines, subtotalHint, clear } = useCart();
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

  if (lines.length === 0) {
    return (
      <div className="sf-card" style={{ padding: 24 }}>
        <p style={{ margin: 0, fontWeight: 700 }}>No hay productos en el carrito.</p>
      </div>
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const payload: CheckoutRequest = {
      fulfillment_type: fulfillment,
      customer_name: name,
      customer_phone: phone,
      customer_note: note || null,
      lines: lines.map((line) => ({
        product_id: line.product_id,
        quantity: line.quantity,
        purchase_mode: "money",
        modifiers: line.modifiers.map((modifier) => ({
          modifier_option_id: modifier.modifier_option_id,
          quantity: modifier.quantity,
        })),
        customer_note: line.customer_note ?? null,
      })),
      delivery:
        fulfillment === "delivery"
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
      } else {
        setError(
          err instanceof ApiRequestError
            ? err.body.message
            : "No fue posible enviar el pedido. Intenta de nuevo.",
        );
      }
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error ? (
        <div className="sf-error" role="alert">{error}</div>
      ) : null}

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

      <div>
        <label className="sf-label" htmlFor="co-name">Nombre de contacto</label>
        <input id="co-name" className="sf-input" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="sf-label" htmlFor="co-phone">Teléfono</label>
        <input id="co-phone" className="sf-input" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>

      {fulfillment === "delivery" ? (
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

      <button className="sf-btn" type="submit" disabled={submitting}>
        {submitting ? "Enviando…" : `Enviar pedido · ${formatMoney(subtotalHint)} + envío`}
      </button>
    </form>
  );
}
