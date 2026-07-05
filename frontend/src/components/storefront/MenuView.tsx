"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { PublicMenuCategory, PublicProduct } from "@/core/restaurant-api/contracts";
import { formatMoney, publicFileUrl } from "@/core/restaurant-api/theme";
import { useCart } from "@/core/storefront/cart";
import { isCustomizable, requiresConfiguration } from "@/core/storefront/configurator";
import { redemptionPrice } from "@/core/storefront/credits-cart";
import { useMyCredits } from "@/core/storefront/useMyCredits";
import { CartModeToggle } from "./CartModeToggle";

export function AddToCartButton({
  productId,
  name,
  priceHint,
  creditRedemptionPrice = null,
  compact = false,
}: Readonly<{
  productId: string;
  name: string;
  priceHint: string | null;
  /** Precio de canje del producto (para bloquear el agregado rápido en modo créditos). */
  creditRedemptionPrice?: number | null;
  compact?: boolean;
}>) {
  const { mode, addLine } = useCart();
  // En modo créditos un producto sin precio de canje NO se agrega: se explica.
  if (
    mode === "credits" &&
    !(typeof creditRedemptionPrice === "number" && creditRedemptionPrice > 0)
  ) {
    return (
      <span className="sf-muted" style={{ fontSize: 12, fontWeight: 700 }}>
        Solo con dinero — crea un pedido separado
      </span>
    );
  }
  return (
    <button
      type="button"
      className="sf-btn"
      style={compact ? { padding: "8px 18px", fontSize: 13 } : undefined}
      onClick={() =>
        addLine({ product_id: productId, name, unit_price_hint: priceHint, modifiers: [] })
      }
    >
      Agregar
    </button>
  );
}

function ProductCard({
  product,
  creditsEnabled = true,
}: Readonly<{ product: PublicProduct; creditsEnabled?: boolean }>) {
  const { mode } = useCart();
  const imageUrl = publicFileUrl(product.image_file_ids[0] ?? null);
  const money = product.is_money_purchase_available && product.money_price_amount != null;
  const redeemPrice = redemptionPrice(product);
  const credits = mode === "credits";
  // En modo créditos solo se puede agregar lo canjeable; en dinero, lo comprable.
  const addable = credits ? redeemPrice !== null : money;
  // Con grupos requeridos (o mínimos > 0) NUNCA se agrega directo al carrito:
  // el detalle (página 1b) es el único camino para configurar.
  const mustConfigure = requiresConfiguration(product);
  const customizable = isCustomizable(product);
  const detailHref = `/menu/${product.id}`;
  return (
    <article className="sf-card" style={{ display: "flex", flexDirection: "column" }}>
      <Link
        href={detailHref}
        aria-label={`Ver ${product.name}`}
        className="sf-imgbox"
        style={{ height: 170, borderRadius: 0 }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- media dinámica del backend
          <img
            src={imageUrl}
            alt={product.name}
            style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }}
          />
        ) : (
          <span aria-hidden className="sf-display" style={{ fontSize: 40, opacity: 0.22 }}>
            {product.name.charAt(0)}
          </span>
        )}
      </Link>
      <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        <Link
          href={detailHref}
          style={{ fontWeight: 800, fontSize: 16, color: "inherit", textDecoration: "none" }}
        >
          {product.name}
        </Link>
        {product.description ? (
          <div className="sf-muted" style={{ fontSize: 13, lineHeight: 1.45, flex: 1 }}>
            {product.description}
          </div>
        ) : (
          <div style={{ flex: 1 }} />
        )}
        {creditsEnabled && product.credits_awarded_per_unit > 0 ? (
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--sf-brand)" }}>
            Gana {product.credits_awarded_per_unit} créditos
          </div>
        ) : null}
        {product.modifier_groups.length > 0 ? (
          <div className="sf-muted" style={{ fontSize: 12 }}>
            Personalizable: {product.modifier_groups.map((group) => group.name).join(", ")}
          </div>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>
            {credits
              ? redeemPrice !== null
                ? `${redeemPrice} créditos`
                : money
                  ? formatMoney(product.money_price_amount)
                  : "—"
              : money
                ? formatMoney(product.money_price_amount)
                : "Solo con créditos"}
          </div>
          {addable ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {customizable && !mustConfigure ? (
                <Link
                  href={detailHref}
                  className="sf-chip"
                  aria-label={`Personalizar ${product.name}`}
                >
                  Personalizar
                </Link>
              ) : null}
              {mustConfigure ? (
                <Link
                  href={detailHref}
                  className="sf-btn"
                  style={{ padding: "8px 18px", fontSize: 13 }}
                  aria-label={`Agregar ${product.name}`}
                >
                  Agregar
                </Link>
              ) : (
                <AddToCartButton
                  productId={product.id}
                  name={product.name}
                  priceHint={product.money_price_amount ?? null}
                  creditRedemptionPrice={product.credit_redemption_price ?? null}
                  compact
                />
              )}
            </div>
          ) : credits ? (
            <span className="sf-muted" style={{ fontSize: 12, fontWeight: 700 }}>
              Solo con dinero — crea un pedido separado
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function MenuView({
  categories,
  creditsEnabled = true,
}: Readonly<{ categories: PublicMenuCategory[]; creditsEnabled?: boolean }>) {
  const myCredits = useMyCredits();
  const [active, setActive] = useState<string | "all">("all");
  const visible = useMemo(
    () => (active === "all" ? categories : categories.filter((c) => c.id === active)),
    [categories, active],
  );
  const productsById = useMemo(() => {
    const map = new Map<string, PublicProduct>();
    for (const category of categories) {
      for (const product of category.products) map.set(product.id, product);
    }
    return map;
  }, [categories]);

  if (categories.length === 0) {
    return (
      <div className="sf-container" style={{ paddingBlock: 40 }}>
        <div className="sf-card" style={{ padding: 26, textAlign: "center" }}>
          <div className="sf-display" style={{ fontSize: 20, marginBottom: 6 }}>
            El menú está en preparación
          </div>
          <p className="sf-muted" style={{ margin: 0, fontSize: 14 }}>
            Vuelve pronto: el catálogo aún no tiene productos publicados.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="sf-container" style={{ paddingBlock: 18 }}>
      <CartModeToggle
        productsById={productsById}
        availableCredits={myCredits ? myCredits.available : null}
      />
      <div
        role="tablist"
        aria-label="Categorías"
        style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 10 }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={active === "all"}
          className="sf-chip"
          data-active={active === "all"}
          onClick={() => setActive("all")}
        >
          Todo
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            role="tab"
            aria-selected={active === category.id}
            className="sf-chip"
            data-active={active === category.id}
            onClick={() => setActive(category.id)}
          >
            {category.name}
          </button>
        ))}
      </div>
      {visible.map((category) => (
        <section key={category.id} style={{ paddingBlock: 14 }}>
          <h2 className="sf-display" style={{ fontSize: 24, margin: "0 0 12px" }}>
            {category.name}
          </h2>
          <div
            style={{
              display: "grid",
              gap: 18,
              gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
            }}
          >
            {category.products.map((product) => (
              <ProductCard key={product.id} product={product} creditsEnabled={creditsEnabled} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
