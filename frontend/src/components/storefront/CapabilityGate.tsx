import type { ReactNode } from "react";

// Patrón único para capacidades no disponibles (instrucción §K). Distingue la
// causa — nunca "algo salió mal" cuando la causa funcional se conoce — y jamás
// simula la capacidad ausente.
export type CapabilityState =
  | { kind: "available" }
  | { kind: "no_permission" }
  | { kind: "missing_endpoint"; detail: string }
  | { kind: "incomplete_config"; detail: string }
  | { kind: "not_implemented"; detail: string }
  | { kind: "api_error"; detail: string };

const LABELS: Record<Exclude<CapabilityState["kind"], "available">, string> = {
  no_permission: "No tienes permiso para esta acción.",
  missing_endpoint: "Requiere una capacidad de servidor aún no disponible.",
  incomplete_config: "Configuración incompleta.",
  not_implemented: "Función aún no implementada en esta versión.",
  api_error: "Error temporal del servidor.",
};

export function CapabilityGate({
  state,
  title,
  children,
}: Readonly<{ state: CapabilityState; title: string; children: ReactNode }>) {
  if (state.kind === "available") return <>{children}</>;
  const detail = "detail" in state ? state.detail : undefined;
  return (
    <div
      role="note"
      style={{
        border: "1px dashed color-mix(in srgb, currentColor 35%, transparent)",
        borderRadius: 12,
        padding: "14px 16px",
        fontSize: 13,
        opacity: 0.85,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 2 }}>{title}</div>
      <div>{LABELS[state.kind]}</div>
      {detail ? <div style={{ marginTop: 2 }}>{detail}</div> : null}
    </div>
  );
}
