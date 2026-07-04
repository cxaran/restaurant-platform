"use client";

// Piezas compartidas de la pantalla del negocio: interruptor accesible,
// botón secundario y helpers para mostrar errores del envelope de la API.

import type { ReactNode } from "react";

import { ApiRequestError } from "@/core/api/api-error";

export const labelClass = "mb-1 block text-xs font-semibold text-[var(--tx3)]";

/** Interruptor accesible (role=switch) sobre los tokens del tema admin. */
export function Toggle({
  checked,
  onChange,
  disabled = false,
  label,
  description,
}: Readonly<{
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
  description?: string;
}>) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="m-0 text-sm font-semibold text-[var(--tx)]">{label}</p>
        {description ? (
          <p className="m-0 text-xs text-[var(--tx3)]">{description}</p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full border border-[var(--border2)] transition ${
          checked ? "bg-[var(--accent)]" : "bg-[var(--bg2)]"
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <span
          className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-[var(--panel)] shadow transition-all ${
            checked ? "left-[calc(100%-20px)]" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}

/** Botón secundario (borde), como el usado en códigos de descuento. */
export function SecondaryButton({
  children,
  onClick,
  disabled = false,
  danger = false,
}: Readonly<{
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}>) {
  return (
    <button
      type="button"
      className={`rounded-[9px] border border-[var(--border2)] px-2.5 py-1 text-xs font-semibold transition hover:bg-[var(--bg2)] disabled:cursor-not-allowed disabled:opacity-60 ${
        danger ? "text-[var(--danger)]" : "text-[var(--tx)]"
      }`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

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

/** "HH:MM:SS" del backend → valor de input type=time ("HH:MM"). */
export function timeToInput(value: string): string {
  return value.slice(0, 5);
}
