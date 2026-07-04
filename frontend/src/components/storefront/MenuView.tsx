"use client";

import { useMemo, useState } from "react";

import type { PublicMenuCategory, PublicProduct } from "@/core/restaurant-api/contracts";
import { formatMoney, publicFileUrl } from "@/core/restaurant-api/theme";
import { useCart } from "@/core/storefront/cart";

export function AddToCartButton({
  productId,
  name,
  priceHint,
  compact = false,
}: Readonly<{ productId: string; name: string; priceHint: string | null; compact?: boolean }>) {
  const { addLine } = useCart();
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

function ProductCard({ product }: Readonly<{ product: PublicProduct }>) {
  const imageUrl = publicFileUrl(product.image_file_ids[0] ?? null);
  const money = product.is_money_purchase_available && product.money_price_amount !== null;
  return (
    <article className="sf-card" style={{ display: "flex", flexDirection: "column" }}>
      <div className="sf-imgbox" style={{ height: 170, borderRadius: 0 }}>
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
      </div>
      <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>{product.name}</div>
        {product.description ? (
          <div className="sf-muted" style={{ fontSize: 13, lineHeight: 1.45, flex: 1 }}>
            {product.description}
          </div>
        ) : (
          <div style={{ flex: 1 }} />
        )}
        {product.credits_awarded_per_unit > 0 ? (
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--sf-brand)" }}>
            Gana {product.credits_awarded_per_unit} créditos
          </div>
        ) : null}
        {product.modifier_groups.length > 0 ? (
          <div className="sf-muted" style={{ fontSize: 12 }}>
            Personalizable: {product.modifier_groups.map((group) => group.name).join(", ")}
          </div>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>
            {money ? formatMoney(product.money_price_amount) : "Solo con créditos"}
          </div>
          {money ? (
            <AddToCartButton
              productId={product.id}
              name={product.name}
              priceHint={product.money_price_amount ?? null}
              compact
            />
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function MenuView({ categories }: Readonly<{ categories: PublicMenuCategory[] }>) {
  const [active, setActive] = useState<string | "all">("all");
  const visible = useMemo(
    () => (active === "all" ? categories : categories.filter((c) => c.id === active)),
    [categories, active],
  );

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
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
