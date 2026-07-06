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
        {/* Controles agrupados: en móvil se mantienen juntos en UNA fila
            (flex-shrink:0) para que la marca encoja con elipsis y no aparezca
            una tercera fila; la navegación baja sola a la segunda fila. */}
        <div className="sf-header-actions">
          <Link
            href="/horario"
            aria-label={`${isOpen ? "Abierto" : "Cerrado"} ahora — ver horario de atención`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            fontWeight: 600,
            color: "inherit",
            textDecoration: "none",
          }}
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
        </Link>
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
        {/* Escritorio: pill «Carrito [n] $precio». Móvil: ícono de bolsa con el
            número en badge de esquina (sin texto ni precio) — ver storefront.css. */}
        <Link
          href="/carrito"
          aria-label={`Carrito, ${count} productos`}
          className="sf-cart-btn"
        >
          <svg
            className="sf-cart-ico"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
            <path d="M3 6h18" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
          <span className="sf-cart-txt">Carrito</span>
          <span aria-hidden className="sf-cart-count" data-empty={count === 0 ? "1" : "0"}>
            {count}
          </span>
          {/* En modo canje el hint monetario no aplica: los precios van en créditos. */}
          {count > 0 && mode === "money" ? (
            <span aria-hidden className="sf-cart-money">{formatMoney(subtotalHint)}</span>
          ) : null}
          </Link>
        </div>
      </div>
    </header>
  );
}
