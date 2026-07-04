import { notFound } from "next/navigation";

import { requireSession } from "@/core/auth/session";
import { CatalogoView } from "./CatalogoView";

// Catálogo del menú (admin, pantalla 4a del handoff): vista curada de tres
// columnas — grupos (categorías), productos del grupo y editor del producto.
// La tabla genérica /admin/resources/products sigue disponible; aquí vive la
// operación diaria. El backend revalida catalog:* en cada llamada.

export const dynamic = "force-dynamic";

export default async function CatalogoPage() {
  const session = await requireSession();
  const permissions = session.permissions ?? [];
  if (!permissions.includes("catalog:read")) {
    notFound();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <CatalogoView
        canCreate={permissions.includes("catalog:create")}
        canUpdate={permissions.includes("catalog:update")}
        canSort={permissions.includes("catalog:sort")}
        canUploadFiles={permissions.includes("files:upload")}
      />
    </div>
  );
}
