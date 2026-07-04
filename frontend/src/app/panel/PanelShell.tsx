"use client";

import { usePathname } from "next/navigation";

import { TTShell, type TTShellNavSection } from "@/components/layout/TTShell";
import type { NavigationModule } from "@/core/api/contracts";
import type { SessionUser } from "@/core/auth/types";

import { PendingRefundsAlert } from "./pedidos/PendingRefunds";

/**
 * Cromo del panel operativo (pantalla 1g del handoff): TTShell con los módulos
 * de la sección "panel" del catálogo de navegación (RBAC ya proyectado por el
 * backend). El cliente no decide permisos ni conoce URLs especializadas.
 */
export function PanelShell({
  session,
  modules,
  brand = null,
  children,
}: Readonly<{
  session: SessionUser;
  modules: NavigationModule[];
  brand?: { name: string; logoUrl: string | null } | null;
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const permissions = session.permissions ?? [];
  const activeModule = modules.find(
    (module_) => pathname === module_.href || pathname.startsWith(`${module_.href}/`),
  );
  // Alerta de conciliación H5 en la BARRA del título de Pedidos: icono con
  // contador que abre el detalle en un diálogo — no roba espacio al tablero.
  const isPedidos = pathname === "/panel/pedidos" || pathname.startsWith("/panel/pedidos/");
  const headerExtra =
    isPedidos && permissions.includes("payments:read") ? (
      <PendingRefundsAlert canRefund={permissions.includes("payments:refund")} />
    ) : null;
  const isCuenta = pathname === "/panel/cuenta" || pathname.startsWith("/panel/cuenta/");
  const title =
    pathname === "/panel"
      ? "Panel de operación"
      : isCuenta
        ? "Mi cuenta"
        : (activeModule?.label ?? "Panel");

  const sections: TTShellNavSection[] = [
    {
      key: "modules",
      items: [
        {
          key: "inicio",
          href: "/panel",
          label: "Inicio",
          active: pathname === "/panel",
        },
        ...modules.map((module_) => ({
          key: module_.name,
          href: module_.href,
          label: module_.label,
          active: pathname === module_.href || pathname.startsWith(`${module_.href}/`),
        })),
      ],
    },
    {
      // Identidad propia: siempre disponible (no depende de permisos RBAC).
      key: "cuenta",
      items: [
        {
          key: "cuenta",
          href: "/panel/cuenta",
          label: "Mi cuenta",
          active: isCuenta,
        },
      ],
    },
  ];

  return (
    <TTShell
      brand={{
        homeHref: "/panel",
        name: brand?.name ?? "Restaurant Platform",
        subtitle: "Panel de empleado",
        logoUrl: brand?.logoUrl ?? null,
      }}
      sections={sections}
      user={{ name: session.name, detail: session.email }}
      title={title}
      headerExtra={headerExtra}
    >
      {children}
    </TTShell>
  );
}
