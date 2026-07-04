import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PlatformShell } from "@/components/layout/PlatformShell";
import { SessionProvider } from "@/core/auth/SessionProvider";
import { getSession } from "@/core/auth/session";
import { getBootstrapStatus } from "@/core/bootstrap/bootstrap-server";
import { getPublicBusiness } from "@/core/restaurant-api/business";
import {
  businessFaviconMetadata,
  resolveSafeImagePath,
} from "@/core/restaurant-api/site-metadata";
import { getResourceCatalog } from "@/core/resources/capabilities-client";

// Favicon dinámico: el logo del negocio también identifica la pestaña del admin.
export async function generateMetadata(): Promise<Metadata> {
  return businessFaviconMetadata();
}

export default async function PlatformLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  if (!session) {
    const status = await getBootstrapStatus();
    redirect(status.setup_required ? "/setup" : "/login");
  }
  const [catalog, business] = await Promise.all([
    getResourceCatalog(),
    getPublicBusiness(),
  ]);
  // Marca del negocio en la sidebar (misma identidad del storefront); el logo
  // solo si es raster verificado (H8) — si no, monograma textual.
  const logoUrl = await resolveSafeImagePath(business?.logo_file_id);

  return (
    <SessionProvider initialSession={session}>
      <PlatformShell
        session={session}
        catalog={catalog}
        brand={business ? { name: business.trade_name, logoUrl } : null}
      >
        {children}
      </PlatformShell>
    </SessionProvider>
  );
}
