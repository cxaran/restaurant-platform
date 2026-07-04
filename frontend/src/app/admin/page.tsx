import {
  EnvironmentBadge,
  SetupChecklistBanner,
} from "@/components/system/SetupChecklistBanner";
import { requireSession } from "@/core/auth/session";
import { getSetupChecklist } from "@/core/system-settings/checklist-data";
import { shouldShowBanner } from "@/core/system-settings/setup-checklist";

import { ResumenView } from "./resumen/ResumenView";

// Inicio del admin = «Resumen» (pantalla 1i): métricas y finanzas del día.
// El catálogo de recursos ya navega desde la sidebar del shell, por eso la
// página no repite la tabla genérica. El resumen consume /reports/* y
// /finances/*, ambos tras finances:read: sin ese permiso se muestra un aviso
// (el backend seguiría respondiendo 403 de todos modos).

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireSession();
  // Checklist de puesta en marcha DERIVADO del backend (degrada a null sin permiso).
  const checklist = await getSetupChecklist();
  const canReadFinances = (session.permissions ?? []).includes("finances:read");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {checklist ? <EnvironmentBadge environment={checklist.environment} /> : null}
      {shouldShowBanner(checklist) && checklist ? (
        <SetupChecklistBanner checklist={checklist} />
      ) : null}
      {canReadFinances ? (
        <ResumenView />
      ) : (
        <div className="tt-card" style={{ padding: 22 }}>
          <h1 className="tt-display" style={{ margin: "0 0 8px", fontSize: 24 }}>
            Resumen
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: "var(--tx2)" }}>
            Tu cuenta no tiene permiso para consultar las métricas financieras
            (finances:read). Usa la barra lateral para ir a tus módulos.
          </p>
        </div>
      )}
    </div>
  );
}
