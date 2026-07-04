"use client";

import Link from "next/link";

import { NotificationsBell } from "@/components/layout/NotificationsBell";
import { usePublicSession } from "@/core/storefront/PublicSessionProvider";
import { useCart } from "@/core/storefront/cart";
import type { PublicBusiness } from "@/core/restaurant-api/contracts";
import { formatMoney } from "@/core/restaurant-api/theme";
import { BrandLockup } from "./BrandLockup";

export function StorefrontHeader({
  business,
  logoUrl = null,
}: Readonly<{
  business: PublicBusiness | null;
  logoUrl?: string | null;
}>) {
  const session = usePublicSession();
  const { count, subtotalHint, mode } = useCart();
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
      <div className="sf-container sf-header-row">
        <Link
          href="/"
          className="sf-header-brand"
          style={{ color: "inherit", textDecoration: "none", minWidth: 0 }}
        >
          <BrandLockup business={business} logoUrl={logoUrl} compact />
        </Link>
        {/* Navegación FIJA del sitio (la portada es composición en código). */}
        <nav aria-label="Navegación del sitio" className="sf-header-nav">
          <Link href="/menu" style={{ color: "inherit", textDecoration: "none" }}>
            Menú
          </Link>
          <Link href="/pedidos" style={{ color: "inherit", textDecoration: "none" }}>
            Rastrear pedido
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
        {session ? <NotificationsBell variant="sf" /> : null}
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
            className="sf-btn-outline"
            style={{ padding: "8px 16px", fontSize: 14, whiteSpace: "nowrap" }}
          >
            Iniciar sesión
          </Link>
        )}
        <Link
          href="/carrito"
          aria-label={`Carrito, ${count} productos`}
          style={{
            background: "var(--sf-brand)",
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
            style={{ background: "color-mix(in srgb, black 22%, transparent)", borderRadius: 999, padding: "1px 8px", fontSize: 12 }}
          >
            {count}
          </span>
          {/* En modo canje el hint monetario no aplica: los precios van en créditos. */}
          {count > 0 && mode === "money" ? <span aria-hidden>{formatMoney(subtotalHint)}</span> : null}
        </Link>
      </div>
    </header>
  );
}
