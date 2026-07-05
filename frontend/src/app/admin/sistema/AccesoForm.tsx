"use client";

// Registro y acceso: nombre de la institución, registro público, recuperación
// de contraseña, verificación de inicio de sesión y duración de las sesiones.
// PATCH del subconjunto editable.

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FieldError } from "@/components/ui/FieldError";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
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

// "" → null (default del despliegue); un entero válido → ese valor.
function toOptionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function AccesoForm({ settings, canEdit, onSaved }: SectionProps) {
  const [institutionName, setInstitutionName] = useState(settings.institution_name ?? "");
  const [publicRegistration, setPublicRegistration] = useState(
    settings.public_registration_enabled,
  );
  const [passwordReset, setPasswordReset] = useState(settings.password_reset_enabled);
  const [loginMode, setLoginMode] = useState<"disabled" | "code" | "link">(
    settings.login_verification_mode as "disabled" | "code" | "link",
  );
  const [customerDays, setCustomerDays] = useState(
    settings.customer_session_days?.toString() ?? "",
  );
  const [staffMinutes, setStaffMinutes] = useState(
    settings.staff_session_minutes?.toString() ?? "",
  );

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
        institution_name: institutionName.trim() || null,
        public_registration_enabled: publicRegistration,
        password_reset_enabled: passwordReset,
        login_verification_mode: loginMode,
        customer_session_days: toOptionalInt(customerDays),
        staff_session_minutes: toOptionalInt(staffMinutes),
      };
      onSaved(await updateSystemSettings(settings.id, body));
      setNotice("Registro y acceso guardados.");
    } catch (err) {
      const errors = apiFieldErrors(err);
      setFieldErrors(errors);
      setGeneralError(
        Object.keys(errors).length > 0
          ? null
          : apiErrorMessage(err, "No fue posible guardar el registro y acceso."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <SectionHeader title="Registro y acceso">
        Quién puede crear cuenta, cómo se recupera y verifica el acceso, y cuánto
        duran las sesiones antes de pedir de nuevo la contraseña.
      </SectionHeader>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div>
          <label className={labelClass} htmlFor="ss-institution">
            Nombre de la institución
          </label>
          <Input
            id="ss-institution"
            disabled={!canEdit}
            value={institutionName}
            onChange={(event) => setInstitutionName(event.target.value)}
            aria-describedby={fieldErrors.institution_name ? "ss-institution-error" : undefined}
          />
          <HelpText>Aparece en membretes y encabezados de los correos.</HelpText>
          <FieldError id="ss-institution-error" message={fieldErrors.institution_name} />
        </div>

        <div className="rounded-[11px] border border-[var(--border)] bg-[var(--bg2)] p-3">
          <Toggle
            checked={publicRegistration}
            onChange={setPublicRegistration}
            disabled={!canEdit}
            label="Registro público"
            description="Permite que cualquiera cree una cuenta por correo desde el sitio."
          />
          {!settings.public_registration_effective && publicRegistration ? (
            <HelpText>Efectivo tras guardar.</HelpText>
          ) : null}
        </div>

        <div className="rounded-[11px] border border-[var(--border)] bg-[var(--bg2)] p-3">
          <Toggle
            checked={passwordReset}
            onChange={setPasswordReset}
            disabled={!canEdit}
            label="Recuperación de contraseña"
            description="Permite restablecer la contraseña por correo desde el login."
          />
          <HelpText>
            Aviso: apagarla con el registro cerrado y un solo administrador puede dejar
            la instalación sin acceso (la única salida sería el seed del servidor).
          </HelpText>
        </div>

        <div>
          <label className={labelClass} htmlFor="ss-login-mode">
            Verificación de inicio de sesión
          </label>
          <Select
            id="ss-login-mode"
            disabled={!canEdit}
            value={loginMode}
            onChange={(event) =>
              setLoginMode(event.target.value as typeof loginMode)
            }
          >
            <option value="disabled">Deshabilitada (solo contraseña)</option>
            <option value="code">Código por correo</option>
            <option value="link">Enlace por correo</option>
          </Select>
          <HelpText>
            Segundo paso por correo en cada inicio de sesión. Requiere un transporte de
            correo utilizable (ver la sección Correo). Los administradores con cobertura
            completa quedan exentos siempre, como garantía anti-bloqueo.
          </HelpText>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="ss-customer-days">
              Sesión del cliente (días)
            </label>
            <Input
              id="ss-customer-days"
              type="number"
              min={1}
              max={365}
              disabled={!canEdit}
              value={customerDays}
              onChange={(event) => setCustomerDays(event.target.value)}
              placeholder={`Default: ${settings.customer_session_days_effective}`}
              aria-describedby={fieldErrors.customer_session_days ? "ss-customer-days-error" : undefined}
            />
            <HelpText>
              Cuánto dura la sesión de un cliente sin roles. La actividad la renueva sola.
              Vacío = default del despliegue.
            </HelpText>
            <FieldError id="ss-customer-days-error" message={fieldErrors.customer_session_days} />
          </div>
          <div>
            <label className={labelClass} htmlFor="ss-staff-minutes">
              Sesión del personal (minutos)
            </label>
            <Input
              id="ss-staff-minutes"
              type="number"
              min={5}
              max={1440}
              disabled={!canEdit}
              value={staffMinutes}
              onChange={(event) => setStaffMinutes(event.target.value)}
              placeholder={`Default: ${settings.staff_session_minutes_effective}`}
              aria-describedby={fieldErrors.staff_session_minutes ? "ss-staff-minutes-error" : undefined}
            />
            <HelpText>
              Cuánto dura sin actividad la sesión de un usuario con roles (panel/admin).
              Vacío = default del despliegue.
            </HelpText>
            <FieldError id="ss-staff-minutes-error" message={fieldErrors.staff_session_minutes} />
          </div>
        </div>

        <Feedback error={generalError} notice={notice} />

        {canEdit ? (
          <div>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Guardar registro y acceso"}
            </Button>
          </div>
        ) : null}
      </form>
    </Card>
  );
}
