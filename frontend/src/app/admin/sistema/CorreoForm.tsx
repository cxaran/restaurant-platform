"use client";

// Correo saliente: transporte (del entorno / SMTP propio / Resend), remitente,
// credenciales (secretos write-only) y estado del transporte. Incluye la acción
// de enviar un correo de prueba real con la configuración vigente.

import { useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FieldError } from "@/components/ui/FieldError";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { SystemSettingsUpdate } from "@/core/restaurant-api/contracts";

import type { SectionProps } from "./SistemaView";
import { sendTestEmail, updateSystemSettings } from "./api";
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

function toOptionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function CorreoForm({ settings, canEdit, onSaved }: SectionProps) {
  const [mode, setMode] = useState<"environment" | "smtp" | "resend">(
    settings.email_mode as "environment" | "smtp" | "resend",
  );
  const [fromAddress, setFromAddress] = useState(settings.email_from_address ?? "");
  const [fromName, setFromName] = useState(settings.email_from_name ?? "");
  const [smtpHost, setSmtpHost] = useState(settings.email_smtp_host ?? "");
  const [smtpPort, setSmtpPort] = useState(settings.email_smtp_port?.toString() ?? "");
  const [smtpUsername, setSmtpUsername] = useState(settings.email_smtp_username ?? "");
  const [smtpTls, setSmtpTls] = useState(settings.email_smtp_tls);
  const [smtpSsl, setSmtpSsl] = useState(settings.email_smtp_ssl);
  const [smtpPassword, setSmtpPassword] = useState("");
  const [resendApiKey, setResendApiKey] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [testRecipient, setTestRecipient] = useState("");
  const [testError, setTestError] = useState<string | null>(null);
  const [testNotice, setTestNotice] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving || !canEdit) return;
    setFieldErrors({});
    setGeneralError(null);
    setNotice(null);
    setSaving(true);
    try {
      const body: SystemSettingsUpdate = {
        email_mode: mode,
        email_from_address: fromAddress.trim() || null,
        email_from_name: fromName.trim() || null,
        email_smtp_host: smtpHost.trim() || null,
        email_smtp_port: toOptionalInt(smtpPort),
        email_smtp_username: smtpUsername.trim() || null,
        email_smtp_tls: smtpTls,
        email_smtp_ssl: smtpSsl,
      };
      // Secretos write-only: solo se envían si el usuario escribió uno nuevo
      // (vacío = conservar el guardado; nunca se borran desde aquí sin querer).
      if (smtpPassword) body.email_smtp_password = smtpPassword;
      if (resendApiKey) body.email_resend_api_key = resendApiKey;

      onSaved(await updateSystemSettings(settings.id, body));
      setSmtpPassword("");
      setResendApiKey("");
      setNotice("Configuración de correo guardada.");
    } catch (err) {
      const errors = apiFieldErrors(err);
      setFieldErrors(errors);
      setGeneralError(
        Object.keys(errors).length > 0
          ? null
          : apiErrorMessage(err, "No fue posible guardar la configuración de correo."),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSendTest(event: FormEvent) {
    event.preventDefault();
    if (testing || !canEdit) return;
    setTestError(null);
    setTestNotice(null);
    setTesting(true);
    try {
      const updated = await sendTestEmail(settings.id, {
        recipient: testRecipient.trim() || null,
      });
      onSaved(updated);
      setTestNotice(
        updated.email_last_test_status === "ok"
          ? "Correo de prueba enviado. Revisa la bandeja del destinatario."
          : "Se registró el intento; revisa el estado del transporte abajo.",
      );
    } catch (err) {
      setTestError(apiErrorMessage(err, "No fue posible enviar el correo de prueba."));
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card>
      <SectionHeader title="Correo saliente">
        Cómo se envían los correos (verificación, recuperación, notificaciones). El
        modo «del entorno» usa el SMTP del despliegue (Mailpit en desarrollo); SMTP y
        Resend usan las credenciales que guardas aquí, cifradas.
      </SectionHeader>

      <div className="mb-4 rounded-[11px] border border-[var(--border)] bg-[var(--bg2)] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[var(--tx3)]">Estado del transporte:</span>
          {settings.email_transport_reason ? (
            <Badge tone="warn">No utilizable</Badge>
          ) : (
            <Badge tone="ok">Utilizable</Badge>
          )}
          {settings.email_last_test_status ? (
            <Badge tone={settings.email_last_test_status === "ok" ? "ok" : "danger"}>
              Última prueba: {settings.email_last_test_status === "ok" ? "correcta" : "fallida"}
            </Badge>
          ) : null}
        </div>
        {settings.email_transport_reason ? (
          <HelpText>{settings.email_transport_reason}</HelpText>
        ) : null}
        {settings.email_last_test_error ? (
          <HelpText>Detalle de la última prueba: {settings.email_last_test_error}</HelpText>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div>
          <label className={labelClass} htmlFor="ss-email-mode">Transporte</label>
          <Select
            id="ss-email-mode"
            disabled={!canEdit}
            value={mode}
            onChange={(event) => setMode(event.target.value as typeof mode)}
          >
            <option value="environment">Del entorno (Mailpit en desarrollo)</option>
            <option value="smtp">SMTP propio</option>
            <option value="resend">Resend</option>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="ss-from-address">Remitente</label>
            <Input
              id="ss-from-address"
              type="email"
              disabled={!canEdit}
              value={fromAddress}
              onChange={(event) => setFromAddress(event.target.value)}
              aria-describedby={fieldErrors.email_from_address ? "ss-from-address-error" : undefined}
            />
            <HelpText>Correo desde el que salen los mensajes (modos SMTP/Resend).</HelpText>
            <FieldError id="ss-from-address-error" message={fieldErrors.email_from_address} />
          </div>
          <div>
            <label className={labelClass} htmlFor="ss-from-name">Nombre del remitente</label>
            <Input
              id="ss-from-name"
              disabled={!canEdit}
              value={fromName}
              onChange={(event) => setFromName(event.target.value)}
              aria-describedby={fieldErrors.email_from_name ? "ss-from-name-error" : undefined}
            />
            <FieldError id="ss-from-name-error" message={fieldErrors.email_from_name} />
          </div>
        </div>

        {mode === "smtp" ? (
          <div className="flex flex-col gap-4 rounded-[11px] border border-[var(--border)] bg-[var(--bg2)] p-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="ss-smtp-host">Servidor SMTP</label>
                <Input
                  id="ss-smtp-host"
                  disabled={!canEdit}
                  value={smtpHost}
                  onChange={(event) => setSmtpHost(event.target.value)}
                  aria-describedby={fieldErrors.email_smtp_host ? "ss-smtp-host-error" : undefined}
                />
                <FieldError id="ss-smtp-host-error" message={fieldErrors.email_smtp_host} />
              </div>
              <div>
                <label className={labelClass} htmlFor="ss-smtp-port">Puerto SMTP</label>
                <Input
                  id="ss-smtp-port"
                  type="number"
                  min={1}
                  max={65535}
                  disabled={!canEdit}
                  value={smtpPort}
                  onChange={(event) => setSmtpPort(event.target.value)}
                  aria-describedby={fieldErrors.email_smtp_port ? "ss-smtp-port-error" : undefined}
                />
                <FieldError id="ss-smtp-port-error" message={fieldErrors.email_smtp_port} />
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor="ss-smtp-username">Usuario SMTP</label>
              <Input
                id="ss-smtp-username"
                disabled={!canEdit}
                value={smtpUsername}
                onChange={(event) => setSmtpUsername(event.target.value)}
                aria-describedby={fieldErrors.email_smtp_username ? "ss-smtp-username-error" : undefined}
              />
              <FieldError id="ss-smtp-username-error" message={fieldErrors.email_smtp_username} />
            </div>
            <SecretField
              id="ss-smtp-password"
              label="Contraseña SMTP"
              configured={settings.email_smtp_password_configured}
              value={smtpPassword}
              onChange={setSmtpPassword}
              disabled={!canEdit}
              error={fieldErrors.email_smtp_password}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Toggle
                checked={smtpTls}
                onChange={setSmtpTls}
                disabled={!canEdit}
                label="STARTTLS"
                description="Cifrado por actualización de conexión (puertos 587/25)."
              />
              <Toggle
                checked={smtpSsl}
                onChange={setSmtpSsl}
                disabled={!canEdit}
                label="SSL directo"
                description="Conexión cifrada desde el inicio (puerto 465)."
              />
            </div>
          </div>
        ) : null}

        {mode === "resend" ? (
          <div className="rounded-[11px] border border-[var(--border)] bg-[var(--bg2)] p-3">
            <SecretField
              id="ss-resend-key"
              label="API key de Resend"
              configured={settings.email_resend_api_key_configured}
              value={resendApiKey}
              onChange={setResendApiKey}
              disabled={!canEdit}
              error={fieldErrors.email_resend_api_key}
              help="Se obtiene en el panel de Resend → API Keys. Se guarda cifrada."
            />
          </div>
        ) : null}

        <Feedback error={generalError} notice={notice} />

        {canEdit ? (
          <div>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Guardar correo"}
            </Button>
          </div>
        ) : null}
      </form>

      {canEdit ? (
        <form
          onSubmit={handleSendTest}
          className="mt-4 flex flex-col gap-2 border-t border-[var(--border)] pt-4"
          noValidate
        >
          <label className={labelClass} htmlFor="ss-test-recipient">
            Enviar un correo de prueba
          </label>
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-[220px] flex-1">
              <Input
                id="ss-test-recipient"
                type="email"
                disabled={testing}
                value={testRecipient}
                onChange={(event) => setTestRecipient(event.target.value)}
                placeholder="Destinatario (vacío = tu propio correo)"
              />
            </div>
            <Button type="submit" disabled={testing}>
              {testing ? "Enviando…" : "Enviar prueba"}
            </Button>
          </div>
          <HelpText>
            Envía un mensaje real con el transporte configurado arriba; guarda primero
            si cambiaste algo.
          </HelpText>
          <Feedback error={testError} notice={testNotice} />
        </form>
      ) : null}
    </Card>
  );
}
