import { notFound } from "next/navigation";

import { requireSession } from "@/core/auth/session";
import { DiscountCodesView } from "./DiscountCodesView";

// Códigos de descuento (admin): página especializada (como /admin/backups y
// /admin/storefront, fuera de la tabla genérica de recursos). Los códigos SOLO
// aplican al checkout web con dinero: nunca en canjes con créditos ni en panel/POS.

export const dynamic = "force-dynamic";

export default async function DiscountCodesPage() {
  const session = await requireSession();
  const permissions = session.permissions ?? [];
  if (!permissions.includes("discount_codes:read")) {
    notFound();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h1 style={{ margin: 0 }}>Códigos de descuento</h1>
      <p style={{ margin: 0, fontSize: 14, opacity: 0.75 }}>
        Códigos manuales para el checkout del sitio público en modo dinero. No aplican en
        canjes con créditos ni en pedidos del panel o POS.
      </p>
      <DiscountCodesView
        canManage={permissions.includes("discount_codes:manage")}
        canSearchProfiles={permissions.includes("profiles:read")}
      />
    </div>
  );
}
