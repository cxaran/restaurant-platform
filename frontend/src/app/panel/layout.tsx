import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SessionProvider } from "@/core/auth/SessionProvider";
import { getSession } from "@/core/auth/session";
import type { NavigationModule, ResourceCatalog } from "@/core/api/contracts";
import { serverApi } from "@/core/api/server-client";
import { getPublicBusiness } from "@/core/restaurant-api/business";
import {
  businessFaviconMetadata,
  resolveSafeImagePath,
} from "@/core/restaurant-api/site-metadata";

import { PanelShell } from "./PanelShell";

export const dynamic = "force-dynamic";

// Favicon dinámico: el logo del negocio también identifica la pestaña del panel.
export async function generateMetadata(): Promise<Metadata> {
  return businessFaviconMetadata();
}

async function getPanelModules(): Promise<NavigationModule[]> {
  try {
    const catalog = await serverApi<ResourceCatalog>("/api/v1/resources", {
      cookie: (await cookies()).toString(),
    });
    return catalog.navigation_modules.filter((module_) => module_.section === "panel");
  } catch {
    // Sin catálogo la sidebar queda con solo "Inicio"; la página índice informa.
    return [];
  }
}

export default async function PanelLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  if (!session) redirect("/login");
  const [modules, business] = await Promise.all([getPanelModules(), getPublicBusiness()]);
  const logoUrl = await resolveSafeImagePath(business?.logo_file_id);

  return (
    <SessionProvider initialSession={session}>
      <PanelShell
        session={session}
        modules={modules}
        brand={business ? { name: business.trade_name, logoUrl } : null}
      >
        {children}
      </PanelShell>
    </SessionProvider>
  );
}
