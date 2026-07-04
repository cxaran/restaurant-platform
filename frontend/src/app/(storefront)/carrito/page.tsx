"use client";

// Carrito (diseño 1c): líneas con miniatura, modificadores y nota, stepper,
// editar (diálogo ProductConfigurator, para no salir del carrito) y eliminar;
// resumen con subtotal y CTA a checkout. Funciona sin sesión (invitado): el
// carrito es local y el checkout pide iniciar sesión al confirmar.

import Link from "next/link";
import { useEffect, useState } from "react";

import { useShippingQuote } from "@/components/shipping/use-shipping-quote";
import { CartModeToggle } from "@/components/storefront/CartModeToggle";
import { ProductConfigurator } from "@/components/storefront/ProductConfigurator";
import { QuantityStepper } from "@/components/storefront/QuantityStepper";
import { browserApi } from "@/core/api/browser-client";
import type { PublicProduct, UserAddressRead } from "@/core/restaurant-api/contracts";
import { fetchPublicMenu } from "@/core/restaurant-api/menu";
import { formatMoney, publicFileUrl } from "@/core/restaurant-api/theme";
import { estimatedOrderTotal } from "@/core/shipping/shipping-quote";
import { useCart, type CartLine } from "@/core/storefront/cart";
import { isCustomizable } from "@/core/storefront/configurator";
import { creditsTotal, lineCreditsTotal, redemptionPrice } from "@/core/storefront/credits-cart";
import {
  addressPoint,
  addressSummary,
  readRememberedAddressId,
  rememberAddressId,
  resolveSelectedAddress,
} from "@/core/storefront/delivery-address";
import { usePublicSession } from "@/core/storefront/PublicSessionProvider";
import { useMyCredits } from "@/core/storefront/useMyCredits";

export default function CartPage() {
  const { lines, mode, count, subtotalHint, setQuantity, removeLine } = useCart();
  const session = usePublicSession();
  const myCredits = useMyCredits();
  const [catalog, setCatalog] = useState<Map<string, PublicProduct> | null>(null);
  const [editing, setEditing] = useState<CartLine | null>(null);
  const credits = mode === "credits";

  // Estimación de envío según la dirección guardada SELECCIONADA (spec zonas):
  // una sola dirección → esa; varias → se recuerda la última usada. El costo
  // lo cotiza el backend; sin coordenadas o fuera de zona se dice tal cual.
  const [addresses, setAddresses] = useState<UserAddressRead[] | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let active = true;
    browserApi<UserAddressRead[]>("/api/v1/users/me/addresses")
      .then((data) => {
        if (!active) return;
        setAddresses(data);
        setSelectedAddressId(readRememberedAddressId());
      })
      .catch(() => {
        if (active) setAddresses([]);
      });
    return () => {
      active = false;
    };
  }, [session]);

  const selectedAddress = resolveSelectedAddress(addresses ?? [], selectedAddressId);
  const deliveryPoint = addressPoint(selectedAddress);
  const shippingQuote = useShippingQuote(
    credits || lines.length === 0 ? "pickup" : "delivery",
    subtotalHint,
    deliveryPoint,
  );
  const totalWithShipping = estimatedOrderTotal(subtotalHint, shippingQuote);

  // Catálogo público para reconstituir el PublicProduct de cada línea al
  // editar (y para precios de canje y miniaturas). Si el fetch falla solo se
  // ocultan las acciones de edición y los precios en créditos quedan como "—".
  useEffect(() => {
    let cancelled = false;
    fetchPublicMenu()
      .then((categories) => {
        if (cancelled) return;
        const map = new Map<string, PublicProduct>();
        for (const category of categories) {
          for (const product of category.products) map.set(product.id, product);
        }
        setCatalog(map);
      })
      .catch(() => {
        // Silencioso: el carrito sigue funcionando sin edición de modificadores.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const editingProduct = editing ? (catalog?.get(editing.product_id) ?? null) : null;
  const totalLabel = credits
    ? catalog
      ? `${creditsTotal(lines, catalog)} créditos`
      : "créditos por calcular"
    : formatMoney(subtotalHint);

  return (
    <div className="sf-container" style={{ paddingBlock: 24, maxWidth: 640 }}>
      <div className="sf-cart-head">
        <Link href="/menu" className="sf-pd-back sf-cart-back" aria-label="Volver al menú">
          ‹
        </Link>
        <h1 className="sf-display" style={{ fontSize: 26, margin: 0, flex: 1 }}>
          Tu carrito
        </h1>
        {lines.length > 0 ? (
          <span className="sf-muted" style={{ fontSize: 13, fontWeight: 600 }}>
            {count} producto{count === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
      <CartModeToggle
        productsById={catalog}
        availableCredits={myCredits ? myCredits.available : null}
      />
      {lines.length === 0 ? (
        <div className="sf-card" style={{ padding: 28, textAlign: "center" }}>
          <p style={{ fontWeight: 700, marginBottom: 12 }}>Tu carrito está vacío.</p>
          <Link className="sf-btn" href="/menu">Ver menú</Link>
        </div>
      ) : (
        <>
          <ul
            style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}
            aria-live="polite"
          >
            {lines.map((line) => {
              const product = catalog?.get(line.product_id) ?? null;
              const editable =
                product !== null && (line.modifiers.length > 0 || isCustomizable(product));
              const unitCredits = redemptionPrice(product);
              const totalCredits = lineCreditsTotal(line, product);
              const imageUrl = publicFileUrl(product?.image_file_ids[0] ?? null);
              return (
                <li key={line.key} className="sf-card sf-cart-line">
                  <div className="sf-imgbox sf-cart-thumb" aria-hidden>
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- media dinámica del backend
                      <img src={imageUrl} alt="" />
                    ) : (
                      <span className="sf-display" style={{ fontSize: 24, opacity: 0.22 }}>
                        {line.name.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontWeight: 800, fontSize: 14 }}>
                      <span>{line.name}</span>
                      <span style={{ whiteSpace: "nowrap" }}>
                        {credits
                          ? totalCredits !== null
                            ? `${totalCredits} cr.`
                            : "—"
                          : line.unit_price_hint
                            ? formatMoney(Number.parseFloat(line.unit_price_hint) * line.quantity)
                            : "—"}
                      </span>
                    </div>
                    {line.modifiers.length > 0 ? (
                      <div className="sf-muted" style={{ fontSize: 12, lineHeight: 1.45 }}>
                        {line.modifiers
                          .map(
                            (modifier) =>
                              `${modifier.name}${modifier.quantity > 1 ? ` ×${modifier.quantity}` : ""}`,
                          )
                          .join(" · ")}
                      </div>
                    ) : null}
                    <div className="sf-muted" style={{ fontSize: 12 }}>
                      {credits
                        ? unitCredits !== null
                          ? `${unitCredits} créditos c/u`
                          : "Solo con dinero — crea un pedido separado"
                        : line.unit_price_hint
                          ? `${formatMoney(line.unit_price_hint)} c/u`
                          : "Precio al confirmar"}
                    </div>
                    <div className="sf-cart-linefoot">
                      {line.customer_note ? (
                        <span className="sf-muted" style={{ fontSize: 12, flex: 1, minWidth: 0 }}>
                          «{line.customer_note}»
                        </span>
                      ) : (
                        <span style={{ flex: 1 }} />
                      )}
                      <QuantityStepper
                        value={line.quantity}
                        onChange={(next) => setQuantity(line.key, next)}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      {editable ? (
                        <button
                          type="button"
                          className="sf-chip"
                          style={{ padding: "5px 14px", fontSize: 13 }}
                          onClick={() => setEditing(line)}
                          aria-label={`Editar ${line.name}`}
                        >
                          Editar
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="sf-chip"
                        style={{ padding: "5px 14px", fontSize: 13 }}
                        onClick={() => removeLine(line.key)}
                        aria-label={`Quitar ${line.name}`}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="sf-card sf-cart-summary">
            <div className="sf-cart-summaryrow">
              <span>Subtotal</span>
              <span style={{ fontWeight: 700 }}>{totalLabel}</span>
            </div>
            {!credits ? (
              <>
                <div className="sf-cart-summaryrow">
                  <span>Envío estimado</span>
                  <span style={{ fontWeight: 700 }} data-testid="cart-shipping-estimate">
                    {!session || !selectedAddress
                      ? "Se calcula al confirmar"
                      : deliveryPoint === null
                        ? "No se puede calcular"
                        : shippingQuote.kind === "loading"
                          ? "Cotizando…"
                          : shippingQuote.kind === "calculated"
                            ? shippingQuote.isFreeShipping
                              ? "Gratis"
                              : formatMoney(shippingQuote.amount)
                            : shippingQuote.kind === "pending_review"
                              ? "Por confirmar"
                              : "No disponible ahora"}
                  </span>
                </div>
                {/* Direcciones resumidas: cambiar aquí recuerda la selección
                    (misma que precarga el checkout). */}
                {session && addresses !== null && addresses.length > 0 ? (
                  <div
                    role="radiogroup"
                    aria-label="Dirección para estimar el envío"
                    style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
                  >
                    {addresses.map((address) => {
                      const active = selectedAddress?.id === address.id;
                      return (
                        <button
                          key={address.id}
                          type="button"
                          className="sf-chip"
                          role="radio"
                          aria-checked={active}
                          data-testid={`cart-address-${address.street}`}
                          style={{
                            padding: "5px 12px",
                            fontSize: 12,
                            ...(active
                              ? { outline: "2px solid currentColor", fontWeight: 700 }
                              : { opacity: 0.75 }),
                          }}
                          onClick={() => {
                            setSelectedAddressId(address.id);
                            rememberAddressId(address.id);
                          }}
                        >
                          {addressSummary(address)}
                          {!address.location ? " · sin ubicación" : ""}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </>
            ) : null}
            <div className="sf-cart-summarytotal">
              <span>Total estimado</span>
              <span data-testid="cart-total-estimate">
                {credits
                  ? totalLabel
                  : totalWithShipping !== null
                    ? formatMoney(totalWithShipping)
                    : `${totalLabel} + envío`}
              </span>
            </div>
            <div className="sf-muted" style={{ fontSize: 11 }}>
              {credits
                ? `${myCredits ? `Saldo disponible: ${myCredits.available} créditos. ` : ""}Canje sin envío (solo recoger en tienda); el backend valida el saldo al confirmar.`
                : !session
                  ? "Inicia sesión para estimar el envío según tu dirección; el total final lo confirma la cocina."
                  : !selectedAddress
                    ? "Guarda una dirección con ubicación en tu cuenta para estimar el envío aquí."
                    : deliveryPoint === null
                      ? "La dirección seleccionada no tiene ubicación guardada: el costo se confirma al revisar tu pedido."
                      : shippingQuote.kind === "pending_review"
                        ? "Tu dirección está fuera de las zonas con tarifa automática: el costo se confirma al revisar tu pedido."
                        : "Estimación según tu dirección seleccionada (aplica a entrega a domicilio); el total final lo confirma la cocina."}
            </div>
          </div>

          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <Link
              className="sf-btn"
              href="/checkout"
              style={{ width: "100%", padding: "15px 18px" }}
            >
              Finalizar pedido ·{" "}
              {credits
                ? totalLabel
                : totalWithShipping !== null
                  ? formatMoney(totalWithShipping)
                  : `${totalLabel} + envío`}
            </Link>
            {!session ? (
              <div className="sf-cart-authlinks">
                <Link href="/login?next=/checkout">Iniciar sesión</Link>
                <span aria-hidden>·</span>
                <Link href="/register">Crear cuenta</Link>
              </div>
            ) : null}
          </div>
        </>
      )}
      {editing && editingProduct ? (
        <ProductConfigurator
          product={editingProduct}
          editLine={editing}
          mode={mode}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
