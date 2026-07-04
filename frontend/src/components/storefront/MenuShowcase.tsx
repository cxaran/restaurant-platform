// Vitrina del menú en la portada FIJA (Turno 11a): grilla compacta de tarjetas
// —imagen, nombre, precio y una línea corta— que enlazan al detalle del
// producto. NO es el menú interactivo (tabs, modo créditos, agregar directo):
// eso vive en /menu (MenuView). Aquí el diseño fija una vitrina que nunca crece
// ni rompe el layout; el catálogo es siempre el real.

import Link from "next/link";

import type { PublicMenuCategory, PublicProduct } from "@/core/restaurant-api/contracts";
import { formatMoney, publicFileUrl } from "@/core/restaurant-api/theme";

function priceLabel(product: PublicProduct): string {
  if (product.is_money_purchase_available && product.money_price_amount != null) {
    return formatMoney(product.money_price_amount);
  }
  if (product.credit_redemption_price != null) {
    return `${product.credit_redemption_price} créditos`;
  }
  return "—";
}

function ShowcaseTile({ product }: Readonly<{ product: PublicProduct }>) {
  const imageUrl = publicFileUrl(product.image_file_ids[0] ?? null);
  return (
    <Link
      href={`/menu/${product.id}`}
      className="sf-card"
      aria-label={`Ver ${product.name}`}
      style={{ display: "flex", flexDirection: "column", textDecoration: "none", color: "inherit" }}
    >
      <div className="sf-imgbox" style={{ height: 120, borderRadius: 0 }}>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- media dinámica del backend
          <img
            src={imageUrl}
            alt={product.name}
            style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }}
          />
        ) : (
          <span aria-hidden className="sf-display" style={{ fontSize: 34, opacity: 0.22 }}>
            {product.name.charAt(0)}
          </span>
        )}
      </div>
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <b style={{ fontSize: 14 }}>{product.name}</b>
          <b style={{ fontSize: 14, whiteSpace: "nowrap" }}>{priceLabel(product)}</b>
        </div>
        {product.description ? (
          <span
            className="sf-muted"
            style={{
              fontSize: 12,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {product.description}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

export function MenuShowcase({ categories }: Readonly<{ categories: PublicMenuCategory[] }>) {
  const products = categories.flatMap((category) => category.products);

  return (
    <div className="sf-container" style={{ paddingTop: 18, paddingBottom: 40 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 18,
        }}
      >
        <h2 className="sf-display" style={{ fontSize: 28, margin: 0 }}>
          Nuestro menú
        </h2>
        <Link
          href="/menu"
          className="sf-muted"
          style={{ fontSize: 13, fontWeight: 700, textDecoration: "none" }}
        >
          Ver menú completo →
        </Link>
      </div>
      {products.length === 0 ? (
        <div className="sf-card" style={{ padding: 26, textAlign: "center" }}>
          <div className="sf-display" style={{ fontSize: 20, marginBottom: 6 }}>
            El menú está en preparación
          </div>
          <p className="sf-muted" style={{ margin: 0, fontSize: 14 }}>
            Vuelve pronto: el catálogo aún no tiene productos publicados.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          }}
        >
          {products.map((product) => (
            <ShowcaseTile key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
