import { requireSession } from "@/core/auth/session";
import { RepartoView } from "./RepartoView";

export const dynamic = "force-dynamic";

export default async function PanelRepartoPage() {
  await requireSession();
  // La capacidad real (can_deliver) la valida el backend en cada endpoint del
  // courier; aquí solo se exige sesión para no filtrar nada por adelantado.
  // El shell del panel (TTShell) ya aporta <main>, sidebar y título.
  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="sr-only">Reparto</h1>
      <RepartoView />
    </div>
  );
}
