"use client";

// Política de pedidos (singleton): canales habilitados como interruptores,
// reglas de registro/aprobación y montos mínimos. PATCH del set editable.

import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FieldError } from "@/components/ui/FieldError";
import { Input } from "@/components/ui/Input";
import { LoadingState } from "@/components/ui/LoadingState";
import type { BusinessSettingsRead, BusinessSettingsUpdate } from "@/core/restaurant-api/contracts";

import { getBusinessSettings, updateBusinessSettings } from "./api";
import { Toggle, apiErrorMessage, apiFieldErrors, labelClass } from "./ui";

type ToggleKey =
  | "allow_online_orders"
  | "allow_delivery"
  | "allow_pickup"
  | "allow_counter_sales"
  | "credits_enabled"
  | "allow_customer_registration"
  | "require_registered_user_for_checkout"
  | "order_approval_required"
  | "online_orders_require_open_hours";

const TOGGLES: ReadonlyArray<{ key: ToggleKey; label: string; description: string }> = [
  {
    key: "allow_online_orders",
    label: "Pedidos en línea",
    description: "Habilita el checkout del sitio público.",
  },
  {
    key: "allow_delivery",
    label: "Entrega a domicilio",
    description: "Permite pedidos con reparto a domicilio.",
  },
  {
    key: "allow_pickup",
    label: "Recolección en tienda",
    description: "Permite pedidos para recoger en el local.",
  },
  {
    key: "allow_counter_sales",
    label: "Venta de mostrador",
    description: "Habilita la captura de ventas en el POS del panel.",
  },
  {
    key: "credits_enabled",
    label: "Programa de créditos",
    description:
      "Acumular y pagar con créditos/puntos. Apagado: no se emiten créditos, no " +
      "se muestran en el sitio ni se permite pagar con ellos. Los saldos existentes " +
      "se conservan y vuelven al reactivarlo.",
  },
  {
    key: "allow_customer_registration",
    label: "Registro de clientes",
    description: "Permite que los clientes creen cuenta en el sitio.",
  },
  {
    key: "require_registered_user_for_checkout",
    label: "Checkout solo con cuenta",
    description: "Exige iniciar sesión para completar un pedido en línea.",
  },
  {
    key: "order_approval_required",
    label: "Aprobación manual de pedidos",
    description: "Los pedidos en línea requieren aprobación antes de prepararse.",
  },
  {
    key: "online_orders_require_open_hours",
    label: "Pedidos web solo en horario de atención",
    description:
      "El checkout del sitio se bloquea fuera del horario (semanal + fechas especiales). " +
      "Requiere horarios configurados: sin horarios el negocio cuenta como cerrado. " +
      "El POS y la captura del panel no se ven afectados.",
  },
];

export function SettingsForm({ canEdit }: Readonly<{ canEdit: boolean }>) {
  const [settings, setSettings] = useState<BusinessSettingsRead | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [toggles, setToggles] = useState<Record<ToggleKey, boolean>>({
    allow_online_orders: false,
    allow_delivery: false,
    allow_pickup: false,
    allow_counter_sales: false,
    credits_enabled: false,
    allow_customer_registration: false,
    require_registered_user_for_checkout: false,
    order_approval_required: false,
    online_orders_require_open_hours: false,
  });
  const [minimumDelivery, setMinimumDelivery] = useState("");
  const [freeShippingFrom, setFreeShippingFrom] = useState("");
  const [ticketFooter, setTicketFooter] = useState("");
  const [ticketPaperSize, setTicketPaperSize] = useState<"thermal_58" | "thermal_80">(
    "thermal_80",
  );

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function applySettings(data: BusinessSettingsRead) {
    setSettings(data);
    setToggles({
      allow_online_orders: data.allow_online_orders,
      allow_delivery: data.allow_delivery,
      allow_pickup: data.allow_pickup,
      allow_counter_sales: data.allow_counter_sales,
      credits_enabled: data.credits_enabled,
      allow_customer_registration: data.allow_customer_registration,
      require_registered_user_for_checkout: data.require_registered_user_for_checkout,
      order_approval_required: data.order_approval_required,
      online_orders_require_open_hours: data.online_orders_require_open_hours,
    });
    setMinimumDelivery(data.minimum_delivery_order_amount ?? "");
    setFreeShippingFrom(data.free_shipping_global_from_amount ?? "");
    setTicketFooter(data.ticket_footer_text ?? "");
    setTicketPaperSize(data.ticket_paper_size === "thermal_58" ? "thermal_58" : "thermal_80");
  }

  useEffect(() => {
    let cancelled = false;
    getBusinessSettings()
      .then((data) => {
        if (!cancelled) applySettings(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(apiErrorMessage(err, "No fue posible cargar la política de pedidos."));
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
      const body: BusinessSettingsUpdate = {
        ...toggles,
        minimum_delivery_order_amount: minimumDelivery.trim() || null,
        free_shipping_global_from_amount: freeShippingFrom.trim() || null,
        ticket_footer_text: ticketFooter.trim() || null,
        ticket_paper_size: ticketPaperSize,
      };
      applySettings(await updateBusinessSettings(body));
      setNotice("Política de pedidos guardada.");
    } catch (err) {
      const errors = apiFieldErrors(err);
      setFieldErrors(errors);
      setGeneralError(
        Object.keys(errors).length > 0
          ? null
          : apiErrorMessage(err, "No fue posible guardar la política de pedidos."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="m-0 mb-3 text-base font-semibold text-[var(--tx)]">Política de pedidos</h2>

      {settings === null && !loadError ? (
        <LoadingState message="Cargando política de pedidos…" />
      ) : null}
      {loadError ? (
        <p role="alert" className="m-0 text-sm font-semibold text-[var(--danger)]">{loadError}</p>
      ) : null}

      {settings !== null ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {generalError ? (
            <p role="alert" className="m-0 text-sm font-semibold text-[var(--danger)]">
              {generalError}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="m-0 text-sm font-semibold text-[var(--ok)]">{notice}</p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            {TOGGLES.map(({ key, label, description }) => (
              <div key={key} className="rounded-[11px] border border-[var(--border)] p-3">
                <Toggle
                  checked={toggles[key]}
                  onChange={(next) => setToggles((prev) => ({ ...prev, [key]: next }))}
                  disabled={!canEdit}
                  label={label}
                  description={description}
                />
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="bs-min-delivery">
                Mínimo para entrega a domicilio (vacío = sin mínimo)
              </label>
              <Input
                id="bs-min-delivery"
                type="number"
                min="0"
                step="0.01"
                disabled={!canEdit}
                value={minimumDelivery}
                onChange={(event) => setMinimumDelivery(event.target.value)}
                aria-describedby={
                  fieldErrors.minimum_delivery_order_amount ? "bs-min-delivery-error" : undefined
                }
              />
              <FieldError
                id="bs-min-delivery-error"
                message={fieldErrors.minimum_delivery_order_amount}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="bs-free-shipping">
                Envío gratis a partir de (vacío = nunca)
              </label>
              <Input
                id="bs-free-shipping"
                type="number"
                min="0"
                step="0.01"
                disabled={!canEdit}
                value={freeShippingFrom}
                onChange={(event) => setFreeShippingFrom(event.target.value)}
                aria-describedby={
                  fieldErrors.free_shipping_global_from_amount
                    ? "bs-free-shipping-error"
                    : undefined
                }
              />
              <FieldError
                id="bs-free-shipping-error"
                message={fieldErrors.free_shipping_global_from_amount}
              />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="bs-ticket-footer">
              Pie del ticket (opcional)
            </label>
            <Input
              id="bs-ticket-footer"
              disabled={!canEdit}
              value={ticketFooter}
              onChange={(event) => setTicketFooter(event.target.value)}
              aria-describedby={fieldErrors.ticket_footer_text ? "bs-ticket-footer-error" : undefined}
            />
            <FieldError id="bs-ticket-footer-error" message={fieldErrors.ticket_footer_text} />
          </div>

          <div>
            <label className={labelClass} htmlFor="bs-ticket-paper">
              Tamaño de hoja del ticket
            </label>
            <select
              id="bs-ticket-paper"
              disabled={!canEdit}
              value={ticketPaperSize}
              onChange={(event) =>
                setTicketPaperSize(event.target.value as "thermal_58" | "thermal_80")
              }
              className="w-full rounded-[11px] border border-[var(--border2)] bg-[var(--bg2)] px-3 py-2.5 text-sm text-[var(--tx)] outline-none transition focus:border-[var(--accent-bd)] focus:shadow-[var(--glow)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="thermal_80">Rollo térmico 80 mm</option>
              <option value="thermal_58">Rollo térmico 58 mm</option>
            </select>
            <p className="mt-1 text-xs text-[var(--tx3)]">
              Formato del ticket PDF que se envía por correo al cliente al completar
              el pedido.
            </p>
          </div>

          {canEdit ? (
            <div>
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando…" : "Guardar política"}
              </Button>
            </div>
          ) : null}
        </form>
      ) : null}
    </Card>
  );
}
