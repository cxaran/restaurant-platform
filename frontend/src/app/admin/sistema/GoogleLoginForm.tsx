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
  const [copied, setCopied] = useState(false);

  // URI de redirección que Google pide al crear el client ID. El backend usa el
  // dominio VERIFICADO de la instalación (google_login.py::redirect_uri).
  const domainVerified = Boolean(settings.app_base_url && settings.app_base_url_verified_at);
  const redirectUri = settings.app_base_url
    ? `${settings.app_base_url.replace(/\/+$/, "")}/api/v1/auth/google/callback`
    : null;

  async function copyRedirectUri() {
    if (!redirectUri) return;
    try {
      await navigator.clipboard.writeText(redirectUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles: el texto queda seleccionable a mano.
    }
  }

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

      <div className="mb-4 rounded-[11px] border border-[var(--border)] bg-[var(--bg2)] p-3">
        <p className="m-0 text-[13px] font-semibold">URI de redirección autorizado</p>
        <HelpText>
          Al crear el ID de cliente OAuth en Google Cloud (tipo «Aplicación web»),
          Google pide un «URI de redirección autorizado». Usa exactamente este:
        </HelpText>
        {redirectUri ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded-[7px] border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[12.5px] break-all">
              {redirectUri}
            </code>
            <button
              type="button"
              onClick={copyRedirectUri}
              className="rounded-[9px] border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-xs font-semibold text-[var(--tx)] transition hover:opacity-80"
            >
              {copied ? "Copiado ✓" : "Copiar"}
            </button>
          </div>
        ) : (
          <p className="m-0 mt-2 text-[13px]">
            <code>https://tu-dominio/api/v1/auth/google/callback</code> — declara primero
            el dominio de la instalación en la sección <strong>Dominio</strong>.
          </p>
        )}
        {redirectUri && !domainVerified ? (
          <HelpText>
            El dominio aún no está verificado: el flujo con Google usará este URI solo
            cuando la verificación de la sección <strong>Dominio</strong> esté completa.
          </HelpText>
        ) : null}
      </div>

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
