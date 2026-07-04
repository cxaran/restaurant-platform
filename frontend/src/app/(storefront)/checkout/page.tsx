import Link from "next/link";

import { getSession } from "@/core/auth/session";
import { CheckoutForm } from "./CheckoutForm";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const session = await getSession();

  return (
    <div className="sf-container" style={{ paddingBlock: 28, maxWidth: 620 }}>
      <h1 className="sf-display" style={{ fontSize: 30, margin: "0 0 18px" }}>Finalizar pedido</h1>
      {session ? (
        <CheckoutForm session={session} />
      ) : (
        // No existe checkout de invitado: el carrito local se conserva y el
        // cliente vuelve aquí después de iniciar sesión o crear su cuenta.
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
