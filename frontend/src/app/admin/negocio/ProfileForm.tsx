"use client";

// Perfil del negocio (singleton): identidad pública, el interruptor operativo
// «Aceptando pedidos» y el LOGO institucional (almacenado en la base como
// stored_file y usado como favicon y junto al título en sitio, panel y admin).

import { useEffect, useRef, useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FieldError } from "@/components/ui/FieldError";
import { Input } from "@/components/ui/Input";
import { LoadingState } from "@/components/ui/LoadingState";
import type { BusinessProfileRead, BusinessProfileUpdate } from "@/core/restaurant-api/contracts";

import { getBusinessProfile, updateBusinessProfile, uploadBusinessLogo } from "./api";
import { SecondaryButton, Toggle, apiErrorMessage, apiFieldErrors, labelClass } from "./ui";

export function ProfileForm({ canEdit }: Readonly<{ canEdit: boolean }>) {
  const [profile, setProfile] = useState<BusinessProfileRead | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [tradeName, setTradeName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [slogan, setSlogan] = useState("");
  const [email, setEmail] = useState("");
  const [mainAddress, setMainAddress] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [timezone, setTimezone] = useState("");
  const [orderPrefix, setOrderPrefix] = useState("");
  const [acceptingOrders, setAcceptingOrders] = useState(true);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  function applyProfile(data: BusinessProfileRead) {
    setProfile(data);
    setTradeName(data.trade_name);
    setLegalName(data.legal_name ?? "");
    setSlogan(data.slogan ?? "");
    setEmail(data.email ?? "");
    setMainAddress(data.main_address ?? "");
    setCurrencyCode(data.currency_code);
    setTimezone(data.timezone);
    setOrderPrefix(data.order_prefix);
    setAcceptingOrders(data.is_accepting_orders);
  }

  useEffect(() => {
    let cancelled = false;
    getBusinessProfile()
      .then((data) => {
        if (!cancelled) applyProfile(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(apiErrorMessage(err, "No fue posible cargar el perfil del negocio."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving || !canEdit) return;
    setFieldErrors({});
    setGeneralError(null);
    setNotice(null);
    setSaving(true);
    try {
      const body: BusinessProfileUpdate = {
        trade_name: tradeName.trim(),
        legal_name: legalName.trim() || null,
        slogan: slogan.trim() || null,
        email: email.trim() || null,
        main_address: mainAddress.trim() || null,
        currency_code: currencyCode.trim(),
        timezone: timezone.trim(),
        order_prefix: orderPrefix.trim(),
        is_accepting_orders: acceptingOrders,
      };
      applyProfile(await updateBusinessProfile(body));
      setNotice("Perfil guardado.");
    } catch (err) {
      const errors = apiFieldErrors(err);
      setFieldErrors(errors);
      setGeneralError(
        Object.keys(errors).length > 0
          ? null
          : apiErrorMessage(err, "No fue posible guardar el perfil del negocio."),
      );
    } finally {
      setSaving(false);
    }
  }

  // El logo se guarda de inmediato (subida + PATCH), sin esperar al submit del
  // perfil: cambiarlo es una acción puntual, no parte del borrador del formulario.
  async function handleLogoSelected(file: File) {
    if (logoBusy || !canEdit) return;
    setLogoBusy(true);
    setLogoError(null);
    setNotice(null);
    try {
      const fileId = await uploadBusinessLogo(file);
      applyProfile(await updateBusinessProfile({ logo_file_id: fileId }));
      setNotice("Logo guardado: se mostrará junto al título y como favicon del sitio.");
    } catch (err) {
      setLogoError(apiErrorMessage(err, "No fue posible subir el logo."));
    } finally {
      setLogoBusy(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  async function handleLogoRemove() {
    if (logoBusy || !canEdit) return;
    setLogoBusy(true);
    setLogoError(null);
    setNotice(null);
    try {
      applyProfile(await updateBusinessProfile({ logo_file_id: null }));
      setNotice("Logo eliminado: el sitio vuelve al monograma con la inicial.");
    } catch (err) {
      setLogoError(apiErrorMessage(err, "No fue posible quitar el logo."));
    } finally {
      setLogoBusy(false);
    }
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-base font-semibold text-[var(--tx)]">Perfil</h2>
        {profile ? (
          <Badge tone={profile.is_accepting_orders ? "ok" : "danger"}>
            {profile.is_accepting_orders ? "Aceptando pedidos" : "Pedidos pausados"}
          </Badge>
        ) : null}
      </div>

      {profile === null && !loadError ? <LoadingState message="Cargando perfil…" /> : null}
      {loadError ? (
        <p role="alert" className="m-0 text-sm font-semibold text-[var(--danger)]">{loadError}</p>
      ) : null}

      {profile !== null ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="rounded-[11px] border border-[var(--border)] bg-[var(--bg2)] p-3">
            <Toggle
              checked={acceptingOrders}
              onChange={setAcceptingOrders}
              disabled={!canEdit}
              label="Aceptando pedidos"
              description="Al apagarlo, el sitio público deja de recibir pedidos de inmediato."
            />
          </div>

          <div className="rounded-[11px] border border-[var(--border)] bg-[var(--bg2)] p-3">
            <span className={labelClass}>Logo</span>
            <div className="flex flex-wrap items-center gap-3">
              {profile.logo_file_id ? (
                // eslint-disable-next-line @next/next/no-img-element -- archivo dinámico servido por el backend
                <img
                  src={`/api/v1/public/files/${profile.logo_file_id}`}
                  alt="Logo actual del negocio"
                  width={56}
                  height={56}
                  className="h-14 w-14 rounded-[11px] border border-[var(--border)] bg-white object-contain"
                />
              ) : (
                <span
                  aria-hidden
                  className="flex h-14 w-14 items-center justify-center rounded-[11px] border border-dashed border-[var(--border2)] text-xl font-bold text-[var(--tx3)]"
                >
                  {(tradeName.trim().charAt(0) || "·").toUpperCase()}
                </span>
              )}
              <div className="flex flex-1 flex-col gap-1.5">
                <p className="m-0 text-xs text-[var(--tx3)]">
                  Se muestra junto al título en el sitio público, el panel y el admin,
                  y como favicon. PNG, WebP o JPEG de hasta 5 MB (sin SVG).
                </p>
                {canEdit ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/webp,image/jpeg"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void handleLogoSelected(file);
                      }}
                    />
                    <SecondaryButton
                      onClick={() => logoInputRef.current?.click()}
                      disabled={logoBusy}
                    >
                      {logoBusy
                        ? "Guardando…"
                        : profile.logo_file_id
                          ? "Reemplazar logo"
                          : "Subir logo"}
                    </SecondaryButton>
                    {profile.logo_file_id ? (
                      <SecondaryButton onClick={handleLogoRemove} disabled={logoBusy} danger>
                        Quitar logo
                      </SecondaryButton>
                    ) : null}
                  </div>
                ) : null}
                <FieldError id="bp-logo-error" message={logoError ?? undefined} />
              </div>
            </div>
          </div>

          {generalError ? (
            <p role="alert" className="m-0 text-sm font-semibold text-[var(--danger)]">
              {generalError}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="m-0 text-sm font-semibold text-[var(--ok)]">{notice}</p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="bp-trade-name">Nombre comercial</label>
              <Input
                id="bp-trade-name"
                required
                disabled={!canEdit}
                value={tradeName}
                onChange={(event) => setTradeName(event.target.value)}
                aria-describedby={fieldErrors.trade_name ? "bp-trade-name-error" : undefined}
              />
              <FieldError id="bp-trade-name-error" message={fieldErrors.trade_name} />
            </div>
            <div>
              <label className={labelClass} htmlFor="bp-legal-name">Razón social (opcional)</label>
              <Input
                id="bp-legal-name"
                disabled={!canEdit}
                value={legalName}
                onChange={(event) => setLegalName(event.target.value)}
                aria-describedby={fieldErrors.legal_name ? "bp-legal-name-error" : undefined}
              />
              <FieldError id="bp-legal-name-error" message={fieldErrors.legal_name} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="bp-slogan">Eslogan (opcional)</label>
              <Input
                id="bp-slogan"
                disabled={!canEdit}
                value={slogan}
                onChange={(event) => setSlogan(event.target.value)}
                aria-describedby={fieldErrors.slogan ? "bp-slogan-error" : undefined}
              />
              <FieldError id="bp-slogan-error" message={fieldErrors.slogan} />
            </div>
            <div>
              <label className={labelClass} htmlFor="bp-email">Correo público (opcional)</label>
              <Input
                id="bp-email"
                type="email"
                disabled={!canEdit}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-describedby={fieldErrors.email ? "bp-email-error" : undefined}
              />
              <FieldError id="bp-email-error" message={fieldErrors.email} />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="bp-address">Dirección principal (opcional)</label>
            <Input
              id="bp-address"
              disabled={!canEdit}
              value={mainAddress}
              onChange={(event) => setMainAddress(event.target.value)}
              aria-describedby={fieldErrors.main_address ? "bp-address-error" : undefined}
            />
            <FieldError id="bp-address-error" message={fieldErrors.main_address} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={labelClass} htmlFor="bp-currency">Moneda (ISO 4217)</label>
              <Input
                id="bp-currency"
                required
                maxLength={3}
                disabled={!canEdit}
                value={currencyCode}
                onChange={(event) => setCurrencyCode(event.target.value.toUpperCase())}
                aria-describedby={fieldErrors.currency_code ? "bp-currency-error" : undefined}
              />
              <FieldError id="bp-currency-error" message={fieldErrors.currency_code} />
            </div>
            <div>
              <label className={labelClass} htmlFor="bp-timezone">Zona horaria (IANA)</label>
              <Input
                id="bp-timezone"
                required
                disabled={!canEdit}
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                placeholder="America/Mexico_City"
                aria-describedby={fieldErrors.timezone ? "bp-timezone-error" : undefined}
              />
              <FieldError id="bp-timezone-error" message={fieldErrors.timezone} />
            </div>
            <div>
              <label className={labelClass} htmlFor="bp-prefix">Prefijo de pedidos</label>
              <Input
                id="bp-prefix"
                required
                disabled={!canEdit}
                value={orderPrefix}
                onChange={(event) => setOrderPrefix(event.target.value)}
                aria-describedby={fieldErrors.order_prefix ? "bp-prefix-error" : undefined}
              />
              <FieldError id="bp-prefix-error" message={fieldErrors.order_prefix} />
            </div>
          </div>

          {canEdit ? (
            <div>
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando…" : "Guardar perfil"}
              </Button>
            </div>
          ) : null}
        </form>
      ) : null}
    </Card>
  );
}
