"use client";

// Detalle de producto como PÁGINA (diseño 1b): imagen grande, nombre, precio,
// grupos de modificadores, observaciones, stepper y botón grande de agregar.
// Reutiliza la MISMA lógica de validación que el diálogo de edición del
// carrito (core/storefront/configurator.ts + ModifierGroupFields); el backend
// recalcula precios y vuelve a validar grupos en el checkout.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { trackEvent } from "@/core/analytics/analytics";
import type { PublicProduct } from "@/core/restaurant-api/contracts";
import { formatMoney, publicFileUrl } from "@/core/restaurant-api/theme";
import { useCart } from "@/core/storefront/cart";
import {
  estimatedUnitPrice,
  hasPriceAdjustments,
  isValidUnitCount,
  selectionToCartModifiers,
  validateSelection,
  type ProductSelection,
} from "@/core/storefront/configurator";
import { redemptionPrice } from "@/core/storefront/credits-cart";
import { ModifierGroupFields } from "./ModifierGroupFields";
import { QuantityStepper } from "./QuantityStepper";

export function ProductDetail({
  product,
  creditsEnabled = true,
}: Readonly<{ product: PublicProduct; creditsEnabled?: boolean }>) {
  const router = useRouter();
  const { mode, addLine } = useCart();
  const [selection, setSelection] = useState<ProductSelection>({});
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");

  // Vista del detalle de producto (view_item): una vez por producto montado.
  useEffect(() => {
    trackEvent("view_item", { item_id: product.id, item_name: product.name });
  }, [product.id, product.name]);

  const problems = validateSelection(product, selection);
  const unitEstimate = estimatedUnitPrice(product, selection);
  const withAdjustments = hasPriceAdjustments(product, selection);
  const imageUrl = publicFileUrl(product.image_file_ids[0] ?? null);
  const maxUnits = product.max_units_per_order ?? undefined;
  const validQuantity = isValidUnitCount(product, quantity);

  const creditsMode = mode === "credits";
  const redeemPrice = redemptionPrice(product);
  const money = product.is_money_purchase_available && product.money_price_amount != null;
  // Invariantes de canje: producto canjeable y CERO modificadores con costo
  // (el backend rechazaría con producto_no_canjeable / modificador_monetario_en_canje).
  const creditsConflict = creditsMode && (redeemPrice === null || withAdjustments);
  // En dinero, un producto que no se vende con dinero no se puede agregar.
  const moneyBlocked = !creditsMode && !money;
  const canConfirm = problems.length === 0 && validQuantity && !creditsConflict && !moneyBlocked;

  function addToCart() {
    if (!canConfirm) return;
    const trimmedNote = note.trim();
    addLine(
      {
        product_id: product.id,
        name: product.name,
        // Hint de presentación (incluye ajustes estimados); nunca se envía al backend.
        unit_price_hint:
          unitEstimate !== null ? unitEstimate.toFixed(2) : (product.money_price_amount ?? null),
        modifiers: selectionToCartModifiers(product, selection),
        ...(trimmedNote ? { customer_note: trimmedNote } : {}),
      },
      quantity,
    );
    router.push("/carrito");
  }

  const ctaAmount = creditsMode
    ? redeemPrice !== null && validQuantity
      ? `${redeemPrice * quantity} créditos`
      : null
    : unitEstimate !== null
      ? formatMoney(unitEstimate * quantity)
      : null;

  return (
    <div className="sf-pd">
      <div className="sf-pd-hero">
        <Link href="/menu" className="sf-pd-back" aria-label="Volver al menú">
          ‹
        </Link>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- media dinámica del backend
          <img src={imageUrl} alt={product.name} />
        ) : (
          <span aria-hidden className="sf-display" style={{ fontSize: 64, opacity: 0.22 }}>
            {product.name.charAt(0)}
          </span>
        )}
      </div>

      <div className="sf-pd-body">
        <div className="sf-pd-titlerow">
          <h1 className="sf-display" style={{ fontSize: 24, margin: 0 }}>
            {product.name}
          </h1>
          <div className="sf-pd-price">
            {creditsMode
              ? redeemPrice !== null
                ? `${redeemPrice} créditos`
                : "—"
              : money
                ? formatMoney(product.money_price_amount)
                : "Solo con créditos"}
          </div>
        </div>

        {product.description ? (
          <p className="sf-muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
            {product.description}
          </p>
        ) : null}
        {product.inclusions.length > 0 ? (
          <p className="sf-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
            Incluye:{" "}
            {product.inclusions
              .map((inclusion) =>
                inclusion.description
                  ? `${inclusion.name} (${inclusion.description})`
                  : inclusion.name,
              )
              .join(", ")}
          </p>
        ) : null}
        {creditsEnabled && product.credits_awarded_per_unit > 0 && !creditsMode ? (
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--sf-brand)" }}>
            Gana {product.credits_awarded_per_unit} créditos por unidad
          </p>
        ) : null}

        <ModifierGroupFields
          product={product}
          selection={selection}
          problems={problems}
          creditsMode={creditsMode}
          variant="page"
          onGroupChange={(groupId, next) =>
            setSelection((current) => ({ ...current, [groupId]: next }))
          }
        />

        <div>
          <label className="sf-pd-grouphead" htmlFor="pd-note" style={{ display: "block", marginBottom: 8 }}>
            Observaciones
          </label>
          <textarea
            id="pd-note"
            className="sf-input sf-pd-note"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="«Sin apio, por favor»"
          />
        </div>

        {maxUnits !== undefined ? (
          <p className="sf-muted" style={{ margin: 0, fontSize: 12 }}>
            Máximo {maxUnits} por pedido.
          </p>
        ) : null}
        {!validQuantity && maxUnits !== undefined ? (
          <p className="sf-error" role="alert" style={{ margin: 0, fontSize: 13 }}>
            La cantidad supera el máximo de {maxUnits} por pedido; redúcela para continuar.
          </p>
        ) : null}
        {!creditsMode && unitEstimate !== null && withAdjustments ? (
          <p className="sf-muted" style={{ margin: 0, fontSize: 12 }}>
            Precio estimado; el total final lo confirma la cocina.
          </p>
        ) : null}
        {creditsConflict ? (
          <p className="sf-error" role="alert" style={{ margin: 0, fontSize: 13 }}>
            {redeemPrice === null
              ? "Este producto no es canjeable: solo con dinero — crea un pedido separado."
              : "Hay modificadores con costo seleccionados; no están disponibles en canje. Quítalos para continuar."}
          </p>
        ) : null}
        {moneyBlocked ? (
          <p className="sf-error" role="alert" style={{ margin: 0, fontSize: 13 }}>
            Este producto solo está disponible canjeando créditos.
          </p>
        ) : null}
        {problems.length > 0 ? (
          <p className="sf-muted" style={{ margin: 0, fontSize: 12 }}>
            Completa las opciones marcadas para continuar.
          </p>
        ) : null}
      </div>

      <div className="sf-pd-footer">
        <QuantityStepper value={quantity} onChange={setQuantity} max={maxUnits} />
        <button
          type="button"
          className="sf-btn sf-pd-add"
          disabled={!canConfirm}
          onClick={addToCart}
        >
          <span>Agregar al carrito</span>
          {ctaAmount ? <span>{ctaAmount}</span> : null}
        </button>
      </div>
    </div>
  );
}
