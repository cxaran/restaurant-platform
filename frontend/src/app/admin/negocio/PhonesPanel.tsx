"use client";

// Teléfonos del negocio: lista con alta/edición/baja. El DELETE del contrato
// DESACTIVA el teléfono (soft delete); los inactivos se muestran con badge y
// pueden reactivarse con PATCH is_active. «Principal» es único: el backend
// desmarca el anterior automáticamente.

import { useEffect, useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldError } from "@/components/ui/FieldError";
import { Input } from "@/components/ui/Input";
import { LoadingState } from "@/components/ui/LoadingState";
import type { BusinessPhoneRead } from "@/core/restaurant-api/contracts";

import {
  createBusinessPhone,
  deactivateBusinessPhone,
  listBusinessPhones,
  updateBusinessPhone,
} from "./api";
import { SecondaryButton, Toggle, apiErrorMessage, apiFieldErrors, labelClass } from "./ui";

type FormState = { type: "none" } | { type: "form"; initial: BusinessPhoneRead | null };

function PhoneForm({
  initial,
  onSaved,
  onCancel,
}: Readonly<{
  initial: BusinessPhoneRead | null;
  onSaved: () => void;
  onCancel: () => void;
}>) {
  const isNew = initial === null;
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [isWhatsapp, setIsWhatsapp] = useState(initial?.is_whatsapp ?? false);
  const [isPublic, setIsPublic] = useState(initial?.is_public ?? true);
  const [isPrimary, setIsPrimary] = useState(initial?.is_primary ?? false);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setFieldErrors({});
    setGeneralError(null);
    setSaving(true);
    try {
      const body = {
        phone: phone.trim(),
        label: label.trim() || null,
        is_whatsapp: isWhatsapp,
        is_public: isPublic,
        is_primary: isPrimary,
      };
      if (isNew) {
        await createBusinessPhone({ ...body, sort_order: 0 });
      } else {
        await updateBusinessPhone(initial.id, body);
      }
      onSaved();
    } catch (err) {
      const errors = apiFieldErrors(err);
      setFieldErrors(errors);
      setGeneralError(
        Object.keys(errors).length > 0
          ? null
          : apiErrorMessage(err, "No fue posible guardar el teléfono."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-[11px] border border-[var(--border)] p-3"
      noValidate
    >
      <h3 className="m-0 text-sm font-semibold text-[var(--tx)]">
        {isNew ? "Nuevo teléfono" : `Editar teléfono ${initial.phone}`}
      </h3>

      {generalError ? (
        <p role="alert" className="m-0 text-sm font-semibold text-[var(--danger)]">
          {generalError}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="ph-number">Número</label>
          <Input
            id="ph-number"
            type="tel"
            required
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            aria-describedby={fieldErrors.phone ? "ph-number-error" : undefined}
            autoComplete="off"
          />
          <FieldError id="ph-number-error" message={fieldErrors.phone} />
        </div>
        <div>
          <label className={labelClass} htmlFor="ph-label">Etiqueta (opcional)</label>
          <Input
            id="ph-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="p. ej. Sucursal centro"
            aria-describedby={fieldErrors.label ? "ph-label-error" : undefined}
          />
          <FieldError id="ph-label-error" message={fieldErrors.label} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Toggle checked={isPrimary} onChange={setIsPrimary} label="Principal" />
        <Toggle checked={isWhatsapp} onChange={setIsWhatsapp} label="WhatsApp" />
        <Toggle
          checked={isPublic}
          onChange={setIsPublic}
          label="Visible en el sitio"
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Guardando…" : isNew ? "Agregar teléfono" : "Guardar cambios"}
        </Button>
        <SecondaryButton onClick={onCancel}>Cancelar</SecondaryButton>
      </div>
    </form>
  );
}

export function PhonesPanel({ canEdit }: Readonly<{ canEdit: boolean }>) {
  const [phones, setPhones] = useState<BusinessPhoneRead[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [form, setForm] = useState<FormState>({ type: "none" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listBusinessPhones()
      .then((rows) => {
        if (cancelled) return;
        setPhones(rows);
        setListError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setListError(apiErrorMessage(err, "No fue posible cargar los teléfonos."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  function refresh() {
    setForm({ type: "none" });
    setActionError(null);
    setRefreshKey((key) => key + 1);
  }

  async function setActive(phone: BusinessPhoneRead, active: boolean) {
    setBusyId(phone.id);
    setActionError(null);
    try {
      if (active) {
        await updateBusinessPhone(phone.id, { is_active: true });
      } else {
        await deactivateBusinessPhone(phone.id);
      }
      setRefreshKey((key) => key + 1);
    } catch (err) {
      setActionError(
        apiErrorMessage(
          err,
          active
            ? "No fue posible reactivar el teléfono."
            : "No fue posible desactivar el teléfono.",
        ),
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-base font-semibold text-[var(--tx)]">Teléfonos</h2>
        {canEdit && form.type === "none" ? (
          <Button type="button" onClick={() => setForm({ type: "form", initial: null })}>
            Agregar teléfono
          </Button>
        ) : null}
      </div>

      {actionError ? (
        <p role="alert" className="m-0 mb-2 text-sm font-semibold text-[var(--danger)]">
          {actionError}
        </p>
      ) : null}

      {form.type === "form" ? (
        <div className="mb-3">
          <PhoneForm
            key={form.initial?.id ?? "new"}
            initial={form.initial}
            onSaved={refresh}
            onCancel={() => setForm({ type: "none" })}
          />
        </div>
      ) : null}

      {phones === null && !listError ? <LoadingState message="Cargando teléfonos…" /> : null}
      {listError ? (
        <p role="alert" className="m-0 text-sm font-semibold text-[var(--danger)]">{listError}</p>
      ) : null}

      {phones !== null && phones.length === 0 ? (
        <EmptyState
          title="Sin teléfonos"
          description="Agrega al menos un teléfono de contacto para el negocio."
        />
      ) : null}

      {phones !== null && phones.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {phones.map((phone) => (
            <li
              key={phone.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[11px] border border-[var(--border)] px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-sm font-semibold ${phone.is_active ? "text-[var(--tx)]" : "text-[var(--tx3)]"}`}>
                  {phone.phone}
                </span>
                {phone.label ? (
                  <span className="text-sm text-[var(--tx2)]">{phone.label}</span>
                ) : null}
                {phone.is_primary ? <Badge tone="accent">Principal</Badge> : null}
                {phone.is_whatsapp ? <Badge tone="ok">WhatsApp</Badge> : null}
                {!phone.is_public ? <Badge tone="neutral">Interno</Badge> : null}
                {!phone.is_active ? <Badge tone="danger">Inactivo</Badge> : null}
              </div>
              {canEdit ? (
                <span className="inline-flex gap-2">
                  {phone.is_active ? (
                    <>
                      <SecondaryButton
                        onClick={() => setForm({ type: "form", initial: phone })}
                        disabled={busyId === phone.id}
                      >
                        Editar
                      </SecondaryButton>
                      <SecondaryButton
                        danger
                        onClick={() => void setActive(phone, false)}
                        disabled={busyId === phone.id}
                      >
                        {busyId === phone.id ? "Desactivando…" : "Desactivar"}
                      </SecondaryButton>
                    </>
                  ) : (
                    <SecondaryButton
                      onClick={() => void setActive(phone, true)}
                      disabled={busyId === phone.id}
                    >
                      {busyId === phone.id ? "Reactivando…" : "Reactivar"}
                    </SecondaryButton>
                  )}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
