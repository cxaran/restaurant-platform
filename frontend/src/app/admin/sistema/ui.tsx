"use client";

// Piezas compartidas de la pantalla de configuración del sistema: interruptor
// accesible, campo de secreto write-only (nunca precargado; vacío = conservar),
// bloques de ayuda y helpers del envelope de error. Espeja el estilo de
// /admin/negocio sobre los tokens del tema admin.

import type { ReactNode } from "react";

import { Badge } from "@/components/ui/Badge";
import { FieldError } from "@/components/ui/FieldError";
import { Input } from "@/components/ui/Input";
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
  description?: ReactNode;
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

/** Encabezado de sección: título + descripción larga de cómo funciona el bloque. */
export function SectionHeader({
  title,
  children,
}: Readonly<{ title: string; children?: ReactNode }>) {
  return (
    <div className="mb-3">
      <h2 className="m-0 text-base font-semibold text-[var(--tx)]">{title}</h2>
      {children ? (
        <p className="m-0 mt-1 text-xs text-[var(--tx3)]">{children}</p>
      ) : null}
    </div>
  );
}

/** Texto de ayuda debajo de un campo (mismo estilo que las notas de negocio). */
export function HelpText({ children }: Readonly<{ children: ReactNode }>) {
  return <p className="m-0 mt-1 text-xs text-[var(--tx3)]">{children}</p>;
}

/** Línea de error general (role=alert) o de aviso de éxito (role=status). */
export function Feedback({
  error,
  notice,
}: Readonly<{ error?: string | null; notice?: string | null }>) {
  if (error) {
    return (
      <p role="alert" className="m-0 text-sm font-semibold text-[var(--danger)]">
        {error}
      </p>
    );
  }
  if (notice) {
    return (
      <p role="status" className="m-0 text-sm font-semibold text-[var(--ok)]">
        {notice}
      </p>
    );
  }
  return null;
}

/**
 * Campo de secreto WRITE-ONLY: nunca se precarga (el backend no lo devuelve).
 * Muestra si ya hay uno guardado; escribir uno nuevo lo reemplaza y dejarlo
 * vacío lo conserva (el formulario omite el campo del PATCH cuando está vacío).
 */
export function SecretField({
  id,
  label,
  configured,
  value,
  onChange,
  disabled = false,
  error,
  help,
}: Readonly<{
  id: string;
  label: string;
  configured: boolean;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  error?: string;
  help?: ReactNode;
}>) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <label className={`${labelClass} mb-0`} htmlFor={id}>
          {label}
        </label>
        <Badge tone={configured ? "ok" : "neutral"}>
          {configured ? "Configurado" : "Sin configurar"}
        </Badge>
      </div>
      <Input
        id={id}
        type="password"
        autoComplete="new-password"
        disabled={disabled}
        value={value}
        placeholder={configured ? "Dejar vacío para conservar el actual" : ""}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {help ? <HelpText>{help}</HelpText> : null}
      <FieldError id={`${id}-error`} message={error} />
    </div>
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
