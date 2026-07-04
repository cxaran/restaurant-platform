"use client";

// Horario semanal: editor por día (0=lunes … 6=domingo, contrato del backend).
// Un día SIN franjas se interpreta como cerrado. «Guardar horario» envía el
// PUT con el SET COMPLETO (el contrato reemplaza todo lo anterior); los
// slot_number se renumeran 1..n por día al guardar.

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { LoadingState } from "@/components/ui/LoadingState";
import type { WeeklyHourSlot } from "@/core/restaurant-api/contracts";

import { listWeeklyHours, replaceWeeklyHours } from "./api";
import { SecondaryButton, apiErrorMessage, timeToInput } from "./ui";

const DAY_LABELS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const;

type DraftSlot = { opens_at: string; closes_at: string };
type DraftWeek = DraftSlot[][]; // índice = day_of_week (0=lunes … 6=domingo)

function emptyWeek(): DraftWeek {
  return Array.from({ length: 7 }, () => []);
}

export function WeeklyHoursEditor({ canEdit }: Readonly<{ canEdit: boolean }>) {
  const [week, setWeek] = useState<DraftWeek | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listWeeklyHours()
      .then((rows) => {
        if (cancelled) return;
        const next = emptyWeek();
        for (const row of rows) {
          next[row.day_of_week]?.push({
            opens_at: timeToInput(row.opens_at),
            closes_at: timeToInput(row.closes_at),
          });
        }
        setWeek(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(apiErrorMessage(err, "No fue posible cargar el horario semanal."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function updateSlot(day: number, index: number, patch: Partial<DraftSlot>) {
    setWeek((prev) => {
      if (!prev) return prev;
      const next = prev.map((slots) => slots.slice());
      next[day][index] = { ...next[day][index], ...patch };
      return next;
    });
  }

  function addSlot(day: number) {
    setWeek((prev) => {
      if (!prev) return prev;
      const next = prev.map((slots) => slots.slice());
      next[day].push({ opens_at: "", closes_at: "" });
      return next;
    });
  }

  function removeSlot(day: number, index: number) {
    setWeek((prev) => {
      if (!prev) return prev;
      const next = prev.map((slots) => slots.slice());
      next[day].splice(index, 1);
      return next;
    });
  }

  async function handleSave() {
    if (!week || saving || !canEdit) return;
    setSaveError(null);
    setNotice(null);

    const slots: WeeklyHourSlot[] = [];
    for (let day = 0; day < week.length; day += 1) {
      for (let index = 0; index < week[day].length; index += 1) {
        const slot = week[day][index];
        if (!slot.opens_at || !slot.closes_at) {
          setSaveError(
            `${DAY_LABELS[day]}: la franja ${index + 1} necesita hora de apertura y de cierre.`,
          );
          return;
        }
        slots.push({
          day_of_week: day,
          slot_number: index + 1,
          opens_at: slot.opens_at,
          closes_at: slot.closes_at,
        });
      }
    }

    setSaving(true);
    try {
      const rows = await replaceWeeklyHours({ slots });
      const next = emptyWeek();
      for (const row of rows) {
        next[row.day_of_week]?.push({
          opens_at: timeToInput(row.opens_at),
          closes_at: timeToInput(row.closes_at),
        });
      }
      setWeek(next);
      setNotice("Horario semanal guardado.");
    } catch (err) {
      setSaveError(apiErrorMessage(err, "No fue posible guardar el horario semanal."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-base font-semibold text-[var(--tx)]">Horario semanal</h2>
        {canEdit && week !== null ? (
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Guardando…" : "Guardar horario"}
          </Button>
        ) : null}
      </div>

      <p className="m-0 mb-3 text-sm text-[var(--tx2)]">
        Un día sin franjas se muestra como cerrado. Al guardar se reemplaza el horario
        completo.
      </p>

      {week === null && !loadError ? <LoadingState message="Cargando horario…" /> : null}
      {loadError ? (
        <p role="alert" className="m-0 text-sm font-semibold text-[var(--danger)]">{loadError}</p>
      ) : null}
      {saveError ? (
        <p role="alert" className="m-0 mb-2 text-sm font-semibold text-[var(--danger)]">
          {saveError}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="m-0 mb-2 text-sm font-semibold text-[var(--ok)]">{notice}</p>
      ) : null}

      {week !== null ? (
        <div className="flex flex-col gap-2">
          {DAY_LABELS.map((dayLabel, day) => (
            <div
              key={dayLabel}
              className="flex flex-col gap-2 rounded-[11px] border border-[var(--border)] px-3 py-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-24 text-sm font-semibold text-[var(--tx)]">{dayLabel}</span>
                  {week[day].length === 0 ? <Badge tone="neutral">Cerrado</Badge> : null}
                </div>
                {canEdit ? (
                  <SecondaryButton onClick={() => addSlot(day)}>Agregar franja</SecondaryButton>
                ) : null}
              </div>
              {week[day].length > 0 ? (
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {week[day].map((slot, index) => (
                    // Franjas posicionales sin id propio: el índice es la identidad.
                    <li key={index} className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--tx3)]">
                        Abre
                        <Input
                          type="time"
                          className="w-32"
                          disabled={!canEdit}
                          value={slot.opens_at}
                          onChange={(event) =>
                            updateSlot(day, index, { opens_at: event.target.value })
                          }
                        />
                      </label>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--tx3)]">
                        Cierra
                        <Input
                          type="time"
                          className="w-32"
                          disabled={!canEdit}
                          value={slot.closes_at}
                          onChange={(event) =>
                            updateSlot(day, index, { closes_at: event.target.value })
                          }
                        />
                      </label>
                      {canEdit ? (
                        <SecondaryButton danger onClick={() => removeSlot(day, index)}>
                          Quitar
                        </SecondaryButton>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
