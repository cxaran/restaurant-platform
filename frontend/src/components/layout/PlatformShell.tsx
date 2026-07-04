"use client";

import { usePathname } from "next/navigation";

import { NotificationsBell } from "@/components/layout/NotificationsBell";
import { TTShell, type TTShellNavSection } from "@/components/layout/TTShell";
import type {
  NavigationModule,
  ResourceCatalog as ResourceCatalogType,
} from "@/core/api/contracts";
import type { SessionUser } from "@/core/auth/types";

// Recursos con página propia fuera del listado genérico (p. ej. el visor de respaldos).
const CUSTOM_RESOURCE_ROUTES: Record<string, string> = {
  backup_settings: "/admin/backups",
  backup_runs: "/admin/backups",
};

function resourceHref(name: string): string {
  return CUSTOM_RESOURCE_ROUTES[name] ?? `/admin/resources/${encodeURIComponent(name)}`;
}

function deriveTitle(
  pathname: string,
  catalog: ResourceCatalogType,
  modules: NavigationModule[],
): string {
  if (pathname === "/admin") return "Resumen";
  if (pathname.startsWith("/admin/account")) return "Mi cuenta";
  if (pathname.startsWith("/admin/backups")) return "Respaldos";
  if (pathname.startsWith("/admin/resources/")) {
    const name = decodeURIComponent(pathname.split("/")[3] ?? "");
    return (
      catalog.resources.find((resource) => resource.name === name)?.label ?? "Recursos"
    );
  }
  // Módulos especializados: el título sale del label que declara el backend.
  const module_ = modules.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  if (module_) return module_.label;
  return "Administración";
}

/**
 * Cromo del administrador (pantallas 4a/5a/6a/1i): TTShell con la navegación
 * derivada del CONTRATO del catálogo (recursos + módulos especializados con sus
 * href del backend, RBAC ya proyectado); no hay rutas cableadas por rol ni URLs
 * especializadas conocidas por el cliente.
 */
export function PlatformShell({
  session,
  catalog,
  brand = null,
  children,
}: Readonly<{
  session: SessionUser;
  catalog: ResourceCatalogType;
  brand?: { name: string; logoUrl: string | null } | null;
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  // Módulos especializados de la sección admin, en el orden del backend.
  const adminModules = catalog.navigation_modules.filter(
    (module_) => module_.section === "admin",
  );
  const title = deriveTitle(pathname, catalog, adminModules);
  // El visor de respaldos agrupa sus dos recursos en una sola entrada.
  const seen = new Set<string>();
  const navItems = catalog.resources.filter((resource) => {
    const href = resourceHref(resource.name);
    if (seen.has(href)) return false;
    seen.add(href);
    return true;
  });

  const sections: TTShellNavSection[] = [
    {
      key: "main",
      items: [
        { key: "inicio", href: "/admin", label: "Resumen", active: pathname === "/admin" },
        ...adminModules.map((module_) => ({
          key: module_.name,
          href: module_.href,
          label: module_.label,
          active: pathname === module_.href || pathname.startsWith(`${module_.href}/`),
        })),
      ],
    },
  ];
  if (navItems.length > 0) {
    sections.push({
      key: "resources",
      title: "Recursos",
      items: navItems.map((resource) => {
        const href = resourceHref(resource.name);
        return {
          key: resource.name,
          href,
          label: resource.label,
          active: pathname === href || pathname.startsWith(`${href}/`),
        };
      }),
    });
  }

  return (
    <TTShell
      brand={{
        homeHref: "/admin",
        name: brand?.name ?? "Restaurant Platform",
        subtitle: "Administrador",
        logoUrl: brand?.logoUrl ?? null,
      }}
      sections={sections}
      user={{ name: session.name, detail: session.email }}
      title={title}
      headerExtra={<NotificationsBell variant="tt" />}
    >
      {children}
    </TTShell>
  );
}
