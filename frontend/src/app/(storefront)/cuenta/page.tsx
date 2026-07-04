import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { CuentaLogoutButton } from "@/components/storefront/CuentaLogoutButton";
import { serverApi } from "@/core/api/server-client";
import { getSession } from "@/core/auth/session";
import type {
  CreditTotalsRead,
  CustomerProfileSelfRead,
  MyOrderRead,
  UserAddressRead,
} from "@/core/restaurant-api/contracts";
import { formatMoney } from "@/core/restaurant-api/theme";

export const dynamic = "force-dynamic";

// Cuenta del cliente en el shell PÚBLICO (identidad storefront). El cliente
// solo ve recursos PROPIOS: todos los endpoints consultados son /me | /mine.
// Los flujos de identidad (correo/contraseña) siguen en platform-core: aquí
// solo se enlazan, nunca se duplican formularios.

/** Lectura tolerante: cualquier fallo (404 sin perfil, etc.) degrada a null. */
async function fetchOrNull<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

function SectionCard({
  title,
  action,
  children,
}: Readonly<{ title: string; action?: React.ReactNode; children: React.ReactNode }>) {
  return (
    <section className="sf-card" style={{ padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <h2 className="sf-display" style={{ fontSize: 20, margin: 0 }}>{title}</h2>
        {action ?? null}
      </div>
      {children}
    </section>
  );
}

export default async function CuentaPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login?next=/cuenta");
  }

  const cookieHeader = (await cookies()).toString();
  const [profile, orders, addresses, credits] = await Promise.all([
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
  ]);

  return (
    <div className="sf-container" style={{ paddingBlock: 28, maxWidth: 760 }}>
      <h1 className="sf-display" style={{ fontSize: 30, margin: "0 0 18px" }}>Mi cuenta</h1>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <SectionCard title="Perfil">
          <dl style={{ margin: 0, display: "grid", gap: 8, fontSize: 14 }}>
            <div>
              <dt className="sf-muted" style={{ fontSize: 12, fontWeight: 700 }}>Nombre</dt>
              <dd style={{ margin: 0, fontWeight: 700 }}>
                {profile?.full_name ?? `${session.name} ${session.last_name}`.trim()}
              </dd>
            </div>
            <div>
              <dt className="sf-muted" style={{ fontSize: 12, fontWeight: 700 }}>Correo</dt>
              <dd style={{ margin: 0 }}>{session.email}</dd>
            </div>
            {profile?.phone ? (
              <div>
                <dt className="sf-muted" style={{ fontSize: 12, fontWeight: 700 }}>Teléfono</dt>
                <dd style={{ margin: 0 }}>{profile.phone}</dd>
              </div>
            ) : null}
          </dl>
          <p className="sf-muted" style={{ margin: "12px 0 0", fontSize: 13 }}>
            El correo y la contraseña se cambian con el flujo seguro de la plataforma:{" "}
            <Link href="/admin/account" style={{ color: "inherit", fontWeight: 700 }}>
              Cambiar correo o contraseña
            </Link>
            .
          </p>
        </SectionCard>

        <SectionCard
          title="Mis pedidos"
          action={
            <Link href="/pedidos" style={{ fontSize: 13, fontWeight: 700, color: "inherit" }}>
              Ver todos
            </Link>
          }
        >
          {!orders || orders.length === 0 ? (
            <div style={{ textAlign: "center", paddingBlock: 8 }}>
              <p className="sf-muted" style={{ margin: "0 0 12px", fontSize: 14 }}>
                Todavía no tienes pedidos: tu próximo antojo te espera en el menú.
              </p>
              <Link className="sf-btn" href="/menu">Ver menú</Link>
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {orders.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/pedidos/${order.id}`}
                    style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", color: "inherit", textDecoration: "none", fontSize: 14, padding: "8px 0" }}
                  >
                    <span style={{ fontWeight: 900 }}>{order.public_code}</span>
                    <span className="sf-chip" data-active="true" style={{ fontSize: 12, padding: "3px 10px" }}>
                      {order.status_label}
                    </span>
                    <span className="sf-muted" style={{ flex: 1, fontSize: 13 }}>
                      {new Date(order.created_at).toLocaleString("es-MX")}
                    </span>
                    <span style={{ fontWeight: 900 }}>
                      {order.purchase_mode === "credits"
                        ? `${order.credits_redeemed_total} créditos`
                        : formatMoney(order.total_money_amount ?? order.items_subtotal_amount)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Mis direcciones">
          {!addresses || addresses.length === 0 ? (
            <p className="sf-muted" style={{ margin: 0, fontSize: 14 }}>
              Aún no tienes direcciones guardadas; podrás capturar una al pedir a domicilio.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
              {addresses.map((address) => (
                <li key={address.id} style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700 }}>
                    {address.street}
                    {address.external_number ? ` ${address.external_number}` : ""}
                  </span>
                  {address.neighborhood ? (
                    <span className="sf-muted">{address.neighborhood}</span>
                  ) : null}
                  {address.label ? (
                    <span className="sf-chip" style={{ fontSize: 11, padding: "2px 10px", cursor: "default" }}>
                      {address.label}
                    </span>
                  ) : null}
                  {address.is_default ? (
                    <span className="sf-chip" data-active="true" style={{ fontSize: 11, padding: "2px 10px", cursor: "default" }}>
                      Principal
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Mis créditos"
          action={
            <Link href="/creditos" style={{ fontSize: 13, fontWeight: 700, color: "inherit" }}>
              Ver movimientos
            </Link>
          }
        >
          {credits ? (
            <p style={{ margin: 0, fontSize: 14 }}>
              Saldo disponible:{" "}
              <strong style={{ color: "var(--sf-brand)", fontSize: 18 }}>
                {credits.available} créditos
              </strong>
            </p>
          ) : (
            <p className="sf-muted" style={{ margin: 0, fontSize: 14 }}>
              No fue posible consultar tus créditos en este momento.
            </p>
          )}
        </SectionCard>

        <SectionCard title="Sesión">
          <p className="sf-muted" style={{ margin: "0 0 12px", fontSize: 14 }}>
            Cierra tu sesión en este dispositivo.
          </p>
          <CuentaLogoutButton />
        </SectionCard>
      </div>
    </div>
  );
}
