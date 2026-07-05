"use client";

// Analítica del sitio (GA4): medición del sitio público con Google Analytics 4.
// El panel y el admin nunca se miden. El ID de medición es público por diseño.

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FieldError } from "@/components/ui/FieldError";
import { Input } from "@/components/ui/Input";
import type { SystemSettingsUpdate } from "@/core/restaurant-api/contracts";

import type { SectionProps } from "./SistemaView";
import { updateSystemSettings } from "./api";
import {
  Feedback,
  HelpText,
  SectionHeader,
  Toggle,
  apiErrorMessage,
  apiFieldErrors,
  labelClass,
} from "./ui";

export function AnaliticaForm({ settings, canEdit, onSaved }: SectionProps) {
  const [enabled, setEnabled] = useState(settings.analytics_enabled);
  const [measurementId, setMeasurementId] = useState(
    settings.analytics_ga4_measurement_id ?? "",
  );
  const [requireConsent, setRequireConsent] = useState(settings.analytics_require_consent);
  const [debugMode, setDebugMode] = useState(settings.analytics_debug_mode);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving || !canEdit) return;
    setFieldErrors({});
    setGeneralError(null);
    setNotice(null);
    setSaving(true);
    try {
      const body: SystemSettingsUpdate = {
        analytics_enabled: enabled,
        analytics_ga4_measurement_id: measurementId.trim() || null,
        analytics_require_consent: requireConsent,
        analytics_debug_mode: debugMode,
      };
      onSaved(await updateSystemSettings(settings.id, body));
      setNotice("Analítica guardada.");
    } catch (err) {
      const errors = apiFieldErrors(err);
      setFieldErrors(errors);
      setGeneralError(
        Object.keys(errors).length > 0
          ? null
          : apiErrorMessage(err, "No fue posible guardar la analítica."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <SectionHeader title="Analítica del sitio (GA4)">
        Mide visitas y acciones del sitio público con Google Analytics 4. El panel y el
        admin nunca se miden.
      </SectionHeader>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div className="rounded-[11px] border border-[var(--border)] bg-[var(--bg2)] p-3">
          <Toggle
            checked={enabled}
            onChange={setEnabled}
            disabled={!canEdit}
            label="Medir el sitio con GA4"
            description="Requiere el ID de medición configurado abajo."
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="ss-ga4-id">ID de medición de GA4</label>
          <Input
            id="ss-ga4-id"
            disabled={!canEdit}
            value={measurementId}
            onChange={(event) => setMeasurementId(event.target.value)}
            placeholder="G-XXXXXXXXXX"
            aria-describedby={fieldErrors.analytics_ga4_measurement_id ? "ss-ga4-id-error" : undefined}
          />
          <HelpText>
            Formato G-XXXXXXXXXX. En Google Analytics: Administración → Flujos de datos →
            tu flujo web → ID de medición. Es un identificador público.
          </HelpText>
          <FieldError id="ss-ga4-id-error" message={fieldErrors.analytics_ga4_measurement_id} />
        </div>

        <div className="rounded-[11px] border border-[var(--border)] bg-[var(--bg2)] p-3">
          <Toggle
            checked={requireConsent}
            onChange={setRequireConsent}
            disabled={!canEdit}
            label="Exigir consentimiento de cookies"
            description="Hasta que el visitante acepte, no se carga GA ni se envía ningún evento."
          />
        </div>

        <div className="rounded-[11px] border border-[var(--border)] bg-[var(--bg2)] p-3">
          <Toggle
            checked={debugMode}
            onChange={setDebugMode}
            disabled={!canEdit}
            label="Modo de depuración (DebugView)"
            description="Envía los eventos a GA4 DebugView para validar la medición. Apagar en operación normal."
          />
        </div>

        <Feedback error={generalError} notice={notice} />

        {canEdit ? (
          <div>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Guardar analítica"}
            </Button>
          </div>
        ) : null}
      </form>
    </Card>
  );
}
