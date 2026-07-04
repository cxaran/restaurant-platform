"use client";

import Link from "next/link";

import { usePublicSession } from "@/core/storefront/PublicSessionProvider";
import { useCart } from "@/core/storefront/cart";
import type { PublicBusiness } from "@/core/restaurant-api/contracts";
import { formatMoney } from "@/core/restaurant-api/theme";
import { BrandLockup } from "./BrandLockup";

export function StorefrontHeader({
  business,
  logoUrl = null,
}: Readonly<{ business: PublicBusiness | null; logoUrl?: string | null }>) {
  const session = usePublicSession();
  const { count, subtotalHint } = useCart();
  const isOpen = business?.is_open_now ?? false;

  return (
    <header
      style={{
        background: "color-mix(in srgb, var(--sf-surface) 30%, white)",
        borderBottom: "1px solid color-mix(in srgb, var(--sf-text) 12%, transparent)",
        position: "sticky",
        top: 0,
        zIndex: 30,
      }}
    >
      <div
        className="sf-container"
        style={{ display: "flex", alignItems: "center", gap: 18, paddingBlock: 12 }}
      >
        <Link href="/" style={{ color: "inherit", textDecoration: "none", minWidth: 0 }}>
          <BrandLockup business={business} logoUrl={logoUrl} compact />
        </Link>
        <nav
          aria-label="Navegación del sitio"
          style={{ display: "flex", gap: 16, fontSize: 14, fontWeight: 600, flex: 1 }}
          className="sf-header-nav"
        >
          <Link href="/menu" style={{ color: "inherit", textDecoration: "none" }}>
            Menú
          </Link>
          <Link href="/pedidos" style={{ color: "inherit", textDecoration: "none" }}>
            Mis pedidos
          </Link>
        </nav>
        <span
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}
          aria-live="polite"
        >
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              display: "inline-block",
              background: isOpen ? "var(--sf-success)" : "var(--sf-brand)",
            }}
          />
          <span className="sf-header-state">{isOpen ? "Abierto" : "Cerrado"}</span>
        </span>
        {session ? (
          <Link
            href="/cuenta"
            style={{ fontSize: 14, fontWeight: 700, color: "inherit", whiteSpace: "nowrap" }}
          >
            {session.name}
          </Link>
        ) : (
          <Link
            href="/login?next=/"
            style={{ fontSize: 14, fontWeight: 700, color: "inherit", whiteSpace: "nowrap" }}
          >
            Iniciar sesión
          </Link>
        )}
        <Link
          href="/carrito"
          aria-label={`Carrito, ${count} productos`}
          style={{
            background: "var(--sf-brand-2)",
            color: "var(--sf-text-inverse)",
            borderRadius: "var(--sf-radius-button)",
            padding: "10px 16px",
            fontSize: 14,
            fontWeight: 700,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            whiteSpace: "nowrap",
          }}
        >
          Carrito
          <span
            aria-hidden
            style={{ background: "var(--sf-brand)", borderRadius: 999, padding: "1px 8px", fontSize: 12 }}
          >
            {count}
          </span>
          {count > 0 ? <span aria-hidden>{formatMoney(subtotalHint)}</span> : null}
        </Link>
      </div>
    </header>
  );
}
