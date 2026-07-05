"use client";

// Inicio de sesión con Google: muestra «Continuar con Google» en el login.
// Requiere client ID y client secret (write-only, cifrado). El alta de cuentas
// nuevas exige además el registro público habilitado (sección Registro y acceso).

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
  SecretField,
  SectionHeader,
  Toggle,
  apiErrorMessage,
  apiFieldErrors,
  labelClass,
} from "./ui";

export function GoogleLoginForm({ settings, canEdit, onSaved }: SectionProps) {
  const [enabled, setEnabled] = useState(settings.google_login_enabled);
  const [clientId, setClientId] = useState(settings.google_auth_client_id ?? "");
  const [clientSecret, setClientSecret] = useState("");

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
        google_login_enabled: enabled,
        google_auth_client_id: clientId.trim() || null,
      };
      // Secreto write-only: solo se envía si el usuario escribió uno nuevo.
      if (clientSecret) body.google_auth_client_secret = clientSecret;

      onSaved(await updateSystemSettings(settings.id, body));
      setClientSecret("");
      setNotice("Inicio de sesión con Google guardado.");
    } catch (err) {
      const errors = apiFieldErrors(err);
      setFieldErrors(errors);
      setGeneralError(
        Object.keys(errors).length > 0
          ? null
          : apiErrorMessage(err, "No fue posible guardar el inicio de sesión con Google."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <SectionHeader title="Inicio de sesión con Google">
        Añade el botón «Continuar con Google» en el login. Necesita las credenciales
        OAuth de un proyecto de Google Cloud. El alta de cuentas nuevas exige además el
        registro público habilitado.
      </SectionHeader>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div className="rounded-[11px] border border-[var(--border)] bg-[var(--bg2)] p-3">
          <Toggle
            checked={enabled}
            onChange={setEnabled}
            disabled={!canEdit}
            label="Habilitar inicio de sesión con Google"
            description="Requiere client ID y client secret configurados abajo."
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="ss-google-client-id">
            Client ID de Google
          </label>
          <Input
            id="ss-google-client-id"
            disabled={!canEdit}
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            placeholder="xxxxx.apps.googleusercontent.com"
            aria-describedby={fieldErrors.google_auth_client_id ? "ss-google-client-id-error" : undefined}
          />
          <HelpText>
            En Google Cloud → APIs y servicios → Credenciales → tu ID de cliente OAuth 2.0.
          </HelpText>
          <FieldError id="ss-google-client-id-error" message={fieldErrors.google_auth_client_id} />
        </div>

        <SecretField
          id="ss-google-client-secret"
          label="Client secret de Google"
          configured={settings.google_auth_client_secret_configured}
          value={clientSecret}
          onChange={setClientSecret}
          disabled={!canEdit}
          error={fieldErrors.google_auth_client_secret}
          help="Se guarda cifrado; nunca vuelve a mostrarse."
        />

        <Feedback error={generalError} notice={notice} />

        {canEdit ? (
          <div>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Guardar Google"}
            </Button>
          </div>
        ) : null}
      </form>
    </Card>
  );
}
