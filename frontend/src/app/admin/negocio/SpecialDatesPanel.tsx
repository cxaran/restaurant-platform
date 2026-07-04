"use client";

// Fechas especiales: excepciones puntuales al horario semanal. Una fecha puede
// marcar el día como cerrado o definir franjas propias que sustituyen a las
// del día. Alta y eliminación; sin edición (se elimina y se vuelve a crear).

import { useEffect, useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldError } from "@/components/ui/FieldError";
import { Input } from "@/components/ui/Input";
import { LoadingState } from "@/components/ui/LoadingState";
import type { SpecialDateRead, SpecialDateSlotInput } from "@/core/restaurant-api/contracts";

import { createSpecialDate, deleteSpecialDate, listSpecialDates } from "./api";
import { SecondaryButton, Toggle, apiErrorMessage, apiFieldErrors, labelClass, timeToInput } from "./ui";

type DraftSlot = { opens_at: string; closes_at: string };

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("es-MX", { dateStyle: "long" });
}

function formatSlots(item: SpecialDateRead): string {
  const slots = item.slots ?? [];
  return slots
    .map((slot) => `${timeToInput(slot.opens_at)}–${timeToInput(slot.closes_at)}`)
    .join(", ");
}

function SpecialDateForm({
  onSaved,
  onCancel,
}: Readonly<{ onSaved: () => void; onCancel: () => void }>) {
  const [calendarDate, setCalendarDate] = useState("");
  const [isClosed, setIsClosed] = useState(true);
  const [reason, setReason] = useState("");
  const [slots, setSlots] = useState<DraftSlot[]>([{ opens_at: "", closes_at: "" }]);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setFieldErrors({});
    setGeneralError(null);

    if (!calendarDate) {
      setFieldErrors({ calendar_date: "Elige la fecha." });
      return;
    }

    let slotInputs: SpecialDateSlotInput[] = [];
    if (!isClosed) {
      if (slots.length === 0) {
        setGeneralError("Agrega al menos una franja o marca el día como cerrado.");
        return;
      }
      for (let index = 0; index < slots.length; index += 1) {
        if (!slots[index].opens_at || !slots[index].closes_at) {
          setGeneralError(
            `La franja ${index + 1} necesita hora de apertura y de cierre.`,
          );
          return;
        }
      }
      slotInputs = slots.map((slot, index) => ({
        slot_number: index + 1,
        opens_at: slot.opens_at,
        closes_at: slot.closes_at,
      }));
    }

    setSaving(true);
    try {
      await createSpecialDate({
        calendar_date: calendarDate,
        is_closed: isClosed,
        reason: reason.trim() || null,
        slots: slotInputs,
      });
      onSaved();
    } catch (err) {
      const errors = apiFieldErrors(err);
      setFieldErrors(errors);
      setGeneralError(
        Object.keys(errors).length > 0
          ? null
          : apiErrorMessage(err, "No fue posible guardar la fecha especial."),
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
      <h3 className="m-0 text-sm font-semibold text-[var(--tx)]">Nueva fecha especial</h3>

      {generalError ? (
        <p role="alert" className="m-0 text-sm font-semibold text-[var(--danger)]">
          {generalError}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="sd-date">Fecha</label>
          <Input
            id="sd-date"
            type="date"
            required
            value={calendarDate}
            onChange={(event) => setCalendarDate(event.target.value)}
            aria-describedby={fieldErrors.calendar_date ? "sd-date-error" : undefined}
          />
          <FieldError id="sd-date-error" message={fieldErrors.calendar_date} />
        </div>
        <div>
          <label className={labelClass} htmlFor="sd-reason">Nota (opcional)</label>
          <Input
            id="sd-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="p. ej. Día festivo"
            aria-describedby={fieldErrors.reason ? "sd-reason-error" : undefined}
          />
          <FieldError id="sd-reason-error" message={fieldErrors.reason} />
        </div>
      </div>

      <Toggle
        checked={isClosed}
        onChange={setIsClosed}
        label="Cerrado todo el día"
        description="Apágalo para definir un horario especial con franjas propias."
      />

      {!isClosed ? (
        <div className="flex flex-col gap-2">
          {slots.map((slot, index) => (
            // Franjas posicionales sin id propio: el índice es la identidad.
            <div key={index} className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--tx3)]">
                Abre
                <Input
                  type="time"
                  className="w-32"
                  value={slot.opens_at}
                  onChange={(event) =>
                    setSlots((prev) =>
                      prev.map((item, i) =>
                        i === index ? { ...item, opens_at: event.target.value } : item,
                      ),
                    )
                  }
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--tx3)]">
                Cierra
                <Input
                  type="time"
                  className="w-32"
                  value={slot.closes_at}
                  onChange={(event) =>
                    setSlots((prev) =>
                      prev.map((item, i) =>
                        i === index ? { ...item, closes_at: event.target.value } : item,
                      ),
                    )
                  }
                />
              </label>
              <SecondaryButton
                danger
                onClick={() => setSlots((prev) => prev.filter((_, i) => i !== index))}
              >
                Quitar
              </SecondaryButton>
            </div>
          ))}
          <div>
            <SecondaryButton
              onClick={() => setSlots((prev) => [...prev, { opens_at: "", closes_at: "" }])}
            >
              Agregar franja
            </SecondaryButton>
          </div>
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Guardando…" : "Agregar fecha"}
        </Button>
        <SecondaryButton onClick={onCancel}>Cancelar</SecondaryButton>
      </div>
    </form>
  );
}

export function SpecialDatesPanel({ canEdit }: Readonly<{ canEdit: boolean }>) {
  const [items, setItems] = useState<SpecialDateRead[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSpecialDates()
      .then((rows) => {
        if (cancelled) return;
        setItems(rows);
        setListError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setListError(apiErrorMessage(err, "No fue posible cargar las fechas especiales."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  async function handleDelete(item: SpecialDateRead) {
    setBusyId(item.id);
    setActionError(null);
    try {
      await deleteSpecialDate(item.id);
      setRefreshKey((key) => key + 1);
    } catch (err) {
      setActionError(apiErrorMessage(err, "No fue posible eliminar la fecha especial."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-base font-semibold text-[var(--tx)]">Fechas especiales</h2>
        {canEdit && !showForm ? (
          <Button type="button" onClick={() => setShowForm(true)}>
            Agregar fecha
          </Button>
        ) : null}
      </div>

      <p className="m-0 mb-3 text-sm text-[var(--tx2)]">
        Excepciones puntuales al horario semanal: días cerrados o con franjas propias.
      </p>

      {actionError ? (
        <p role="alert" className="m-0 mb-2 text-sm font-semibold text-[var(--danger)]">
          {actionError}
        </p>
      ) : null}

      {showForm ? (
        <div className="mb-3">
          <SpecialDateForm
            onSaved={() => {
              setShowForm(false);
              setRefreshKey((key) => key + 1);
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      ) : null}

      {items === null && !listError ? (
        <LoadingState message="Cargando fechas especiales…" />
      ) : null}
      {listError ? (
        <p role="alert" className="m-0 text-sm font-semibold text-[var(--danger)]">{listError}</p>
      ) : null}

      {items !== null && items.length === 0 ? (
        <EmptyState
          title="Sin fechas especiales"
          description="Agrega días festivos o jornadas con horario distinto al habitual."
        />
      ) : null}

      {items !== null && items.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[11px] border border-[var(--border)] px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[var(--tx)]">
                  {formatDate(item.calendar_date)}
                </span>
                {item.is_closed ? (
                  <Badge tone="danger">Cerrado</Badge>
                ) : (
                  <Badge tone="info">{formatSlots(item) || "Horario especial"}</Badge>
                )}
                {item.reason ? (
                  <span className="text-sm text-[var(--tx2)]">{item.reason}</span>
                ) : null}
              </div>
              {canEdit ? (
                <SecondaryButton
                  danger
                  onClick={() => void handleDelete(item)}
                  disabled={busyId === item.id}
                >
                  {busyId === item.id ? "Eliminando…" : "Eliminar"}
                </SecondaryButton>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
