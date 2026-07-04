"use client";

// Alta/edición de un código de descuento. El texto del código SIEMPRE lo
// escribe el administrador (no hay generador). Los errores de dominio del
// backend (codigo_duplicado, vigencia_invalida, descuento_mayor_al_minimo) se
// muestran junto al campo correspondiente; el resto como error general.

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FieldError } from "@/components/ui/FieldError";
import { Input } from "@/components/ui/Input";
import { ApiRequestError } from "@/core/api/api-error";
import type {
  CustomerProfileRead,
  DiscountCodeCreate,
  DiscountCodeRead,
  DiscountCodeUpdate,
} from "@/core/restaurant-api/contracts";

import { createDiscountCode, searchCustomersByPhone, updateDiscountCode } from "./api";

// Campo destino de cada error de dominio conocido del backend.
const FIELD_BY_ERROR_CODE: Record<string, string> = {
  codigo_duplicado: "code",
  vigencia_invalida: "valid_until",
  descuento_mayor_al_minimo: "discount_amount",
};

/** ISO (backend) → valor de un input datetime-local en hora local. */
function isoToLocalInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Valor datetime-local (hora local) → ISO UTC para el backend; vacío → null. */
function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Teléfono parcial para no exponer el número completo en la ayuda de búsqueda. */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 4 ? `••• ${digits.slice(-4)}` : phone;
}

export function DiscountCodeForm({
  initial,
  canSearchProfiles,
  onSaved,
  onCancel,
}: Readonly<{
  initial: DiscountCodeRead | null;
  canSearchProfiles: boolean;
  onSaved: (saved: DiscountCodeRead, wasNew: boolean) => void;
  onCancel: () => void;
}>) {
  const isNew = initial === null;
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [discountAmount, setDiscountAmount] = useState(initial?.discount_amount ?? "");
  const [minimumOrderAmount, setMinimumOrderAmount] = useState(
    initial?.minimum_order_amount ?? "",
  );
  const [validFrom, setValidFrom] = useState(isoToLocalInput(initial?.valid_from));
  const [validUntil, setValidUntil] = useState(isoToLocalInput(initial?.valid_until));
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [targetUserId, setTargetUserId] = useState(initial?.target_customer_user_id ?? "");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Ayuda de búsqueda de cliente por teléfono (solo con profiles:read).
  const [phoneQuery, setPhoneQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<CustomerProfileRead[] | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfileRead | null>(null);

  async function handleSearchCustomers() {
    const phone = phoneQuery.trim();
    if (!phone || searching) return;
    setSearching(true);
    setSearchError(null);
    try {
      setResults(await searchCustomersByPhone(phone));
    } catch (err) {
      setResults(null);
      setSearchError(
        err instanceof ApiRequestError
          ? err.body.message
          : "No fue posible buscar clientes.",
      );
    } finally {
      setSearching(false);
    }
  }

  function applyApiError(err: unknown) {
    if (!(err instanceof ApiRequestError)) {
      setGeneralError("No fue posible guardar el código. Intenta de nuevo.");
      return;
    }
    const nextFieldErrors: Record<string, string> = {};
    for (const item of err.body.errors ?? []) {
      if (item.field) nextFieldErrors[item.field] = item.message;
    }
    const mappedField = FIELD_BY_ERROR_CODE[err.body.code];
    if (mappedField && !nextFieldErrors[mappedField]) {
      nextFieldErrors[mappedField] = err.body.message;
    }
    setFieldErrors(nextFieldErrors);
    setGeneralError(Object.keys(nextFieldErrors).length > 0 ? null : err.body.message);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setFieldErrors({});
    setGeneralError(null);
    setSaving(true);
    try {
      if (isNew) {
        const body: DiscountCodeCreate = {
          code: code.trim(),
          name: name.trim(),
          description: description.trim() || null,
          discount_amount: discountAmount,
          minimum_order_amount: minimumOrderAmount,
          valid_from: localInputToIso(validFrom),
          valid_until: localInputToIso(validUntil),
          target_customer_user_id: targetUserId.trim() || null,
          is_active: isActive,
        };
        onSaved(await createDiscountCode(body), true);
      } else {
        const body: DiscountCodeUpdate = {
          code: code.trim(),
          name: name.trim(),
          description: description.trim() || null,
          discount_amount: discountAmount,
          minimum_order_amount: minimumOrderAmount,
          valid_from: localInputToIso(validFrom),
          valid_until: localInputToIso(validUntil),
          target_customer_user_id: targetUserId.trim() || null,
          is_active: isActive,
        };
        onSaved(await updateDiscountCode(initial.id, body), false);
      }
    } catch (err) {
      applyApiError(err);
    } finally {
      setSaving(false);
    }
  }

  const labelClass = "mb-1 block text-xs font-semibold text-[var(--tx3)]";

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <h2 className="m-0 text-base font-semibold text-[var(--tx)]">
          {isNew ? "Nuevo código de descuento" : `Editar código ${initial.code}`}
        </h2>

        {!isNew ? (
          // Nota fija (regla de dominio): las redenciones son snapshots inmutables.
          <p className="m-0 rounded-[11px] bg-[var(--bg2)] px-3 py-2 text-sm text-[var(--tx2)]">
            Los cambios aplican solo a usos futuros; las redenciones existentes conservan su
            snapshot.
          </p>
        ) : null}

        {generalError ? (
          <p role="alert" className="m-0 text-sm font-semibold text-[var(--danger)]">
            {generalError}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="dc-code">Código</label>
            <Input
              id="dc-code"
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
              aria-describedby={fieldErrors.code ? "dc-code-error" : undefined}
              autoComplete="off"
            />
            <FieldError id="dc-code-error" message={fieldErrors.code} />
          </div>
          <div>
            <label className={labelClass} htmlFor="dc-name">Nombre</label>
            <Input
              id="dc-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-describedby={fieldErrors.name ? "dc-name-error" : undefined}
            />
            <FieldError id="dc-name-error" message={fieldErrors.name} />
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="dc-description">Descripción (opcional)</label>
          <Input
            id="dc-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <FieldError message={fieldErrors.description} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="dc-amount">Descuento (monto)</label>
            <Input
              id="dc-amount"
              type="number"
              min="0"
              step="0.01"
              required
              value={discountAmount}
              onChange={(event) => setDiscountAmount(event.target.value)}
              aria-describedby={fieldErrors.discount_amount ? "dc-amount-error" : undefined}
            />
            <FieldError id="dc-amount-error" message={fieldErrors.discount_amount} />
          </div>
          <div>
            <label className={labelClass} htmlFor="dc-minimum">Compra mínima</label>
            <Input
              id="dc-minimum"
              type="number"
              min="0"
              step="0.01"
              required
              value={minimumOrderAmount}
              onChange={(event) => setMinimumOrderAmount(event.target.value)}
              aria-describedby={
                fieldErrors.minimum_order_amount ? "dc-minimum-error" : undefined
              }
            />
            <FieldError id="dc-minimum-error" message={fieldErrors.minimum_order_amount} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="dc-from">Vigente desde (opcional)</label>
            <Input
              id="dc-from"
              type="datetime-local"
              value={validFrom}
              onChange={(event) => setValidFrom(event.target.value)}
              aria-describedby={fieldErrors.valid_from ? "dc-from-error" : undefined}
            />
            <FieldError id="dc-from-error" message={fieldErrors.valid_from} />
          </div>
          <div>
            <label className={labelClass} htmlFor="dc-until">Vigente hasta (opcional)</label>
            <Input
              id="dc-until"
              type="datetime-local"
              value={validUntil}
              onChange={(event) => setValidUntil(event.target.value)}
              aria-describedby={fieldErrors.valid_until ? "dc-until-error" : undefined}
            />
            <FieldError id="dc-until-error" message={fieldErrors.valid_until} />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-[var(--tx)]">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-[var(--border2)] accent-[var(--accent)]"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
          Código activo
        </label>

        <fieldset className="m-0 flex flex-col gap-2 rounded-[11px] border border-[var(--border)] p-3">
          <legend className="px-1 text-xs font-semibold text-[var(--tx3)]">
            Cliente objetivo (opcional: vacío = código general)
          </legend>
          <div>
            <label className={labelClass} htmlFor="dc-target">ID de usuario (UUID)</label>
            <Input
              id="dc-target"
              value={targetUserId}
              onChange={(event) => {
                setTargetUserId(event.target.value);
                setSelectedCustomer(null);
              }}
              placeholder="p. ej. 3fa85f64-5717-4562-b3fc-2c963f66afa6"
              aria-describedby={
                fieldErrors.target_customer_user_id ? "dc-target-error" : undefined
              }
              autoComplete="off"
            />
            <FieldError id="dc-target-error" message={fieldErrors.target_customer_user_id} />
            {selectedCustomer ? (
              <p className="m-0 mt-1 text-sm text-[var(--tx2)]">
                Cliente seleccionado: <strong>{selectedCustomer.full_name}</strong>{" "}
                ({maskPhone(selectedCustomer.phone)})
              </p>
            ) : null}
            {targetUserId ? (
              <button
                type="button"
                className="mt-1 text-xs font-semibold text-[var(--danger)]"
                onClick={() => {
                  setTargetUserId("");
                  setSelectedCustomer(null);
                }}
              >
                Quitar cliente (volver a código general)
              </button>
            ) : null}
          </div>

          {canSearchProfiles ? (
            <div>
              <label className={labelClass} htmlFor="dc-phone-search">
                Buscar cliente por teléfono
              </label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="dc-phone-search"
                  type="tel"
                  className="min-w-[160px] flex-1"
                  value={phoneQuery}
                  onChange={(event) => setPhoneQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleSearchCustomers();
                    }
                  }}
                  placeholder="Teléfono del cliente"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="rounded-[11px] border border-[var(--border2)] px-4 py-2 text-sm font-semibold text-[var(--tx)] transition hover:bg-[var(--bg2)] disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void handleSearchCustomers()}
                  disabled={searching || phoneQuery.trim().length === 0}
                >
                  {searching ? "Buscando…" : "Buscar"}
                </button>
              </div>
              {searchError ? (
                <p role="alert" className="m-0 mt-1 text-sm text-[var(--danger)]">{searchError}</p>
              ) : null}
              {results !== null ? (
                results.length === 0 ? (
                  <p className="m-0 mt-1 text-sm text-[var(--tx3)]">
                    Sin clientes con ese teléfono.
                  </p>
                ) : (
                  <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
                    {results.map((customer) => (
                      <li key={customer.user_id}>
                        <button
                          type="button"
                          className="w-full rounded-[9px] border border-[var(--border)] px-3 py-1.5 text-left text-sm text-[var(--tx)] transition hover:bg-[var(--bg2)]"
                          onClick={() => {
                            setTargetUserId(customer.user_id);
                            setSelectedCustomer(customer);
                            setResults(null);
                            setPhoneQuery("");
                          }}
                        >
                          <span className="font-semibold">{customer.full_name}</span>{" "}
                          <span className="text-[var(--tx3)]">{maskPhone(customer.phone)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </div>
          ) : null}
        </fieldset>

        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Guardando…" : isNew ? "Crear código" : "Guardar cambios"}
          </Button>
          <button
            type="button"
            className="rounded-[11px] border border-[var(--border2)] px-4 py-2 text-sm font-semibold text-[var(--tx)] transition hover:bg-[var(--bg2)]"
            onClick={onCancel}
          >
            Cancelar
          </button>
        </div>
      </form>
    </Card>
  );
}
