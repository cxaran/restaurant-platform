import Link from "next/link";

import { CapabilityGate } from "@/components/storefront/CapabilityGate";
import { requireSession } from "@/core/auth/session";

export const dynamic = "force-dynamic";

// /panel: entorno OPERATIVO diario (cajero, cocina, reparto, supervisor).
// No es un admin reducido ni una app por rol: es un shell común cuyos módulos
// se derivan de capabilities reales — jamás de `role === "x"`. Las pantallas
// operativas (cola de pedidos, POS, reparto, tickets) son el siguiente
// incremento del frontend: aquí se declaran sin simular funcionalidad, y la
// autorización real sigue siendo del backend en cada llamada.
const MODULES: {
  label: string;
  detail: string;
  anyOf: string[];
}[] = [
  {
    label: "Pedidos (cola y preparación)",
    detail: "Pantalla operativa en el siguiente incremento del frontend.",
    anyOf: ["orders:read"],
  },
  {
    label: "Punto de venta",
    detail: "Pantalla operativa en el siguiente incremento del frontend.",
    anyOf: ["orders:capture", "payments:record"],
  },
  {
    label: "Reparto (mis entregas)",
    detail: "Pantalla mobile-first en el siguiente incremento del frontend.",
    anyOf: ["deliveries:self_assign", "deliveries:read"],
  },
  {
    label: "Tickets",
    detail: "Pantalla operativa en el siguiente incremento del frontend.",
    anyOf: ["tickets:print"],
  },
];

export default async function PanelPage() {
  const session = await requireSession();
  const permissions = new Set(session.permissions ?? []);
  const visible = MODULES.filter((module) =>
    module.anyOf.some((permission) => permissions.has(permission)),
  );

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "32px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 26 }}>Panel de operación</h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, opacity: 0.75 }}>
          {session.name} · módulos según tus permisos
        </p>
      </header>

      {visible.length === 0 ? (
        <div style={{ border: "1px solid rgba(0,0,0,0.15)", borderRadius: 12, padding: 22 }}>
          <p style={{ margin: "0 0 10px", fontWeight: 600 }}>
            Tu cuenta no tiene módulos operativos asignados.
          </p>
          <Link href="/" style={{ fontWeight: 700 }}>Ir al sitio</Link>
        </div>
      ) : (
        visible.map((module) => (
          <CapabilityGate
            key={module.label}
            title={module.label}
            state={{ kind: "not_implemented", detail: module.detail }}
          >
            {null}
          </CapabilityGate>
        ))
      )}

      <nav style={{ display: "flex", gap: 16, fontSize: 14, fontWeight: 600 }}>
        <Link href="/">Sitio público</Link>
        <Link href="/admin">Administración</Link>
      </nav>
    </main>
  );
}
