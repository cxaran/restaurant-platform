"use client";

// Piezas compartidas de la pantalla del catálogo (4a): interruptor verde de
// disponibilidad, miniatura de producto y helpers del envelope de error.

import { ApiRequestError } from "@/core/api/api-error";

import { publicFileUrl } from "./api";

/** Mensaje del envelope de error de la API; fallback para errores de red. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiRequestError ? err.body.message : fallback;
}

/** errors[] por campo del envelope {code, message, errors}. */
export function apiFieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiRequestError)) return {};
  const fieldErrors: Record<string, string> = {};
  for (const item of err.body.errors ?? []) {
    if (item.field) fieldErrors[item.field] = item.message;
  }
  return fieldErrors;
}

/**
 * Interruptor de disponibilidad (verde var(--ok) al estar activo), como el
 * toggle de la pantalla 4a del handoff. role=switch accesible.
 */
export function AvailabilitySwitch({
  checked,
  onChange,
  disabled = false,
  label,
}: Readonly<{
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}>) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onChange(!checked);
      }}
      className="relative h-[22px] w-10 shrink-0 rounded-full border-0 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      style={{
        background: checked ? "var(--ok)" : "var(--muted-btn)",
        cursor: disabled ? undefined : "pointer",
      }}
    >
      <span
        className="absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all"
        style={checked ? { right: 2 } : { left: 2 }}
      />
    </button>
  );
}

/** Miniatura del producto: imagen primaria si existe; si no, inicial. */
export function ProductThumb({
  name,
  fileId,
  size = 52,
}: Readonly<{ name: string; fileId: string | null; size?: number }>) {
  return (
    <div
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-[10px]"
      style={{ width: size, height: size, background: "var(--seg-bg)" }}
    >
      {fileId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={publicFileUrl(fileId)}
          alt=""
          className="h-full w-full object-contain"
        />
      ) : (
        <span className="text-lg font-extrabold" style={{ color: "var(--tx3)" }}>
          {name.trim().charAt(0).toUpperCase() || "·"}
        </span>
      )}
    </div>
  );
}

/** Formatea un precio del contrato (string decimal o null) como "$230". */
export function formatMoney(amount: string | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const value = Number(amount);
  if (Number.isNaN(value)) return `$${amount}`;
  return `$${value.toLocaleString("es-MX", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
