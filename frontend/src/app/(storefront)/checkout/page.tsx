import Link from "next/link";

import { HighlightBanner } from "@/components/storefront/Highlights";
import { getSession } from "@/core/auth/session";
import { getPublicHighlights } from "@/core/restaurant-api/storefront";
import { CheckoutForm } from "./CheckoutForm";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const [session, highlights] = await Promise.all([
    getSession(),
    getPublicHighlights("checkout"),
  ]);

  return (
    <div className="sf-container" style={{ paddingBlock: 24, maxWidth: 620 }}>
      <div className="sf-cart-head">
        <Link href="/carrito" className="sf-pd-back sf-cart-back" aria-label="Volver al carrito">
          ‹
        </Link>
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <h1 className="sf-display" style={{ fontSize: 26, margin: 0 }}>Finalizar pedido</h1>
          <span className="sf-muted" style={{ fontSize: 12 }}>
            {session
              ? `Con tu cuenta · ${session.name}`
              : "Necesitas una cuenta para confirmar"}
          </span>
        </div>
      </div>
      {/* Chips de confianza (highlight `checkout`): micro-tranquilizadores,
          nada que distraiga al pagar. */}
      {highlights.length > 0 ? (
        <div className="sf-hl-chiprow" style={{ marginBottom: 14 }}>
          {highlights.map((item) => (
            <HighlightBanner key={item.id} highlight={item} variant="chip" />
          ))}
        </div>
      ) : null}
      {session ? (
        <CheckoutForm session={session} />
      ) : (
        // No existe checkout de invitado (requiere backend): el carrito local
        // se conserva y el cliente vuelve aquí después de iniciar sesión o
        // crear su cuenta.
        <div className="sf-card" style={{ padding: 26, display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="sf-display" style={{ fontSize: 20 }}>Confirma tus datos para continuar</div>
          <p className="sf-muted" style={{ margin: 0, fontSize: 14 }}>
            Necesitas una cuenta para pedir en línea: así puedes seguir tu pedido y acumular
            créditos. Tu carrito se conserva mientras te registras.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="sf-btn" href="/login?next=/checkout">Iniciar sesión</Link>
            <Link className="sf-btn-outline" href="/register">Crear cuenta</Link>
          </div>
        </div>
      )}
    </div>
  );
}
