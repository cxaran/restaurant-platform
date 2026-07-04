import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { CuentaLogoutButton } from "@/components/storefront/CuentaLogoutButton";
import { AddressBook } from "./AddressBook";
import { serverApi } from "@/core/api/server-client";
import { getSession } from "@/core/auth/session";
import type {
  CreditMovementRead,
  CreditTotalsRead,
  CustomerProfileSelfRead,
  MyOrderRead,
  UserAddressRead,
} from "@/core/restaurant-api/contracts";

import { CreditMovementsList } from "../creditos/CreditMovementsList";
import { CreditsHero } from "../creditos/CreditsHero";
import { OrderCard } from "../pedidos/OrderCard";

export const dynamic = "force-dynamic";

// Cuenta del cliente en el shell PÚBLICO (identidad storefront, escena 3a del
// handoff: banda de perfil, saldo de créditos destacado, movimientos,
// historial de compras y direcciones). El cliente solo ve recursos PROPIOS:
// todos los endpoints consultados son /me | /mine. Los flujos de identidad
// (correo/contraseña) siguen en platform-core: aquí solo se enlazan.

/** Lectura tolerante: cualquier fallo (404 sin perfil, etc.) degrada a null. */
async function fetchOrNull<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

function SectionHeading({
  label,
  action,
}: Readonly<{ label: string; action?: React.ReactNode }>) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 12,
        marginBottom: 8,
      }}
    >
      <h2 className="sf-section-label" style={{ margin: 0 }}>{label}</h2>
      {action ?? null}
    </div>
  );
}

export default async function CuentaPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/cuenta");
  }

  const cookieHeader = (await cookies()).toString();
  const [profile, orders, addresses, credits, movements] = await Promise.all([
    fetchOrNull(
      serverApi<CustomerProfileSelfRead>("/api/v1/profiles/me", { cookie: cookieHeader }),
    ),
    fetchOrNull(
      serverApi<MyOrderRead[]>("/api/v1/orders/mine?limit=5", { cookie: cookieHeader }),
    ),
    fetchOrNull(
      serverApi<UserAddressRead[]>("/api/v1/users/me/addresses", { cookie: cookieHeader }),
    ),
    fetchOrNull(serverApi<CreditTotalsRead>("/api/v1/credits/me", { cookie: cookieHeader })),
    fetchOrNull(
      serverApi<CreditMovementRead[]>("/api/v1/credits/me/movements?limit=4", {
        cookie: cookieHeader,
      }),
    ),
  ]);

  const displayName =
    profile?.full_name ?? `${session.name} ${session.last_name}`.trim();
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";
  const subline = [profile?.phone, session.email].filter(Boolean).join(" · ");

  return (
    <div className="sf-container" style={{ paddingBlock: 28, maxWidth: 720 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Banda de perfil (3a): avatar, nombre en display y acceso a edición. */}
        <section className="sf-band">
          <span className="sf-avatar sf-display" aria-hidden="true">{initial}</span>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <h1 className="sf-display" style={{ fontSize: 20, margin: 0 }}>{displayName}</h1>
            <div className="sf-band-sub" style={{ fontSize: 12, overflowWrap: "anywhere" }}>
              {subline}
            </div>
          </div>
          <Link
            className="sf-band-link"
            href="/admin/account"
            title="Cambiar correo o contraseña con el flujo seguro de la plataforma"
          >
            Editar
          </Link>
        </section>

        {/* Saldo de créditos destacado (3a). */}
        {credits ? (
          <CreditsHero totals={credits} />
        ) : (
          <div className="sf-card" style={{ padding: "16px 20px" }}>
            <p className="sf-muted" style={{ margin: 0, fontSize: 14 }}>
              No fue posible consultar tus créditos en este momento.
            </p>
          </div>
        )}

        <section>
          <SectionHeading
            label="Movimientos de créditos"
            action={
              <Link
                href="/creditos"
                style={{ fontSize: 12, fontWeight: 700, color: "inherit" }}
              >
                Ver todos
              </Link>
            }
          />
          <CreditMovementsList movements={movements ?? []} />
        </section>

        <section>
          <SectionHeading
            label="Historial de compras"
            action={
              <Link
                href="/pedidos"
                style={{ fontSize: 12, fontWeight: 700, color: "inherit" }}
              >
                Ver todo
              </Link>
            }
          />
          {!orders || orders.length === 0 ? (
            <div className="sf-card" style={{ padding: 20, textAlign: "center" }}>
              <p className="sf-muted" style={{ margin: "0 0 12px", fontSize: 14 }}>
                Todavía no tienes pedidos: tu próximo antojo te espera en el menú.
              </p>
              <Link className="sf-btn" href="/menu">Ver menú</Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {orders.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionHeading label="Mis direcciones" />
          {/* Libreta editable: crear/editar/predeterminar/eliminar con mapa;
              las coordenadas hacen que el envío cotice solo en el checkout. */}
          <AddressBook initial={addresses ?? []} />
        </section>

        {/* Acciones al pie (3a): cierre de sesión con el mismo lenguaje. */}
        <div className="sf-account-actions">
          <CuentaLogoutButton />
        </div>
        <p className="sf-muted" style={{ margin: 0, fontSize: 12 }}>
          El correo y la contraseña se cambian con el flujo seguro de la plataforma
          desde «Editar».
        </p>
      </div>
    </div>
  );
}
