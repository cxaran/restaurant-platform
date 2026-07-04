"use client";

// Sección "Pagos" del detalle de pedido (1g): lista los pagos registrados
// (payments:read), permite verificar/rechazar los declarados
// (payments:verify) y registrar un pago cuando el pedido no tiene ninguno
// vigente (payments:record). Ocultar botones NO es seguridad — el backend
// vuelve a validar permiso y regla en cada endpoint.

import { useEffect, useState } from "react";

import { ApiRequestError } from "@/core/api/api-error";
import { browserApi } from "@/core/api/browser-client";
import type { OrderRead, PaymentMethodPublic } from "@/core/restaurant-api/panel-contracts";
import { formatMoney } from "@/core/restaurant-api/theme";
import type { components } from "@/generated/openapi";

import {
  PAYMENT_RECORD_BADGE_CLASS,
  PAYMENT_RECORD_STATUS_LABELS,
  formatClock,
} from "./order-meta";
import { CreditRefundControl, PaymentRefundControl } from "./RefundControls";

type PaymentRead = components["schemas"]["PaymentRead"];
type PaymentCreate = components["schemas"]["PaymentCreate"];
type PaymentVerifyRequest = components["schemas"]["PaymentVerifyRequest"];

// Un pago "vigente" bloquea registrar otro (el rechazado/anulado no cuenta).
const ACTIVE_PAYMENT_STATUSES = ["pending", "pending_verification", "paid"];

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiRequestError ? err.body.message : fallback;
}

function PaymentRow({
  payment,
  canVerify,
  busy,
  onVerify,
}: Readonly<{
  payment: PaymentRead;
  canVerify: boolean;
  busy: boolean;
  onVerify: (approve: boolean, rejectedReason?: string) => void;
}>) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const pendingVerification = payment.status === "pending_verification";

  const facts = [
    `Esperado ${formatMoney(payment.expected_amount)}`,
    payment.status === "paid" ? `Recibido ${formatMoney(payment.received_amount)}` : null,
    payment.change_requested_for_amount
      ? `Paga con ${formatMoney(payment.change_requested_for_amount)} · cambio ${formatMoney(payment.change_amount)}`
      : null,
    payment.transaction_reference ? `Ref. ${payment.transaction_reference}` : null,
    payment.bank_name ? `Banco ${payment.bank_name}` : null,
    payment.terminal_name ? `Terminal ${payment.terminal_name}` : null,
    payment.card_last_four ? `Tarjeta •••• ${payment.card_last_four}` : null,
  ].filter(Boolean);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 800, fontSize: 14 }}>{payment.payment_method_name_snapshot}</span>
        <span className={`tt-badge ${PAYMENT_RECORD_BADGE_CLASS[payment.status] ?? "tt-badge-done"}`}>
          {(PAYMENT_RECORD_STATUS_LABELS[payment.status] ?? payment.status).toUpperCase()}
        </span>
        <span style={{ fontSize: 12, color: "var(--tx3)", marginLeft: "auto" }}>
          {formatClock(payment.created_at)}
        </span>
      </div>
      <div style={{ fontSize: 13, color: "var(--tx2)" }}>{facts.join(" · ")}</div>
      {payment.rejected_reason ? (
        <div style={{ fontSize: 13, color: "var(--accent)", fontWeight: 600 }}>
          Motivo del rechazo: {payment.rejected_reason}
        </div>
      ) : null}
      {payment.notes ? (
        <div style={{ fontSize: 13, color: "var(--muted-btn-tx)" }}>«{payment.notes}»</div>
      ) : null}

      {canVerify && pendingVerification ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {rejecting ? (
            <>
              <input
                className="tt-input"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Motivo del rechazo (obligatorio)"
                aria-label="Motivo del rechazo"
                style={{ flex: "1 1 180px", padding: "8px 12px", fontSize: 13 }}
              />
              <button
                type="button"
                className="tt-btn tt-btn-outline-accent"
                disabled={busy || !reason.trim()}
                onClick={() => onVerify(false, reason.trim())}
                style={{ padding: "8px 14px", fontSize: 13 }}
              >
                Confirmar rechazo
              </button>
              <button
                type="button"
                className="tt-btn tt-btn-ghost"
                disabled={busy}
                onClick={() => setRejecting(false)}
                style={{ padding: "8px 14px", fontSize: 13 }}
              >
                Volver
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="tt-btn tt-btn-success"
                disabled={busy}
                onClick={() => onVerify(true)}
                style={{ padding: "8px 16px", fontSize: 13 }}
              >
                Aprobar
              </button>
              <button
                type="button"
                className="tt-btn tt-btn-outline-accent"
                disabled={busy}
                onClick={() => setRejecting(true)}
                style={{ padding: "8px 16px", fontSize: 13 }}
              >
                Rechazar…
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function RecordPaymentForm({
  orderId,
  onDone,
}: Readonly<{ orderId: string; onDone: () => void }>) {
  const [methods, setMethods] = useState<PaymentMethodPublic[]>([]);
  const [open, setOpen] = useState(false);
  const [methodCode, setMethodCode] = useState<string | null>(null);
  const [billAmount, setBillAmount] = useState("");
  const [reference, setReference] = useState("");
  const [bankName, setBankName] = useState("");
  const [terminalName, setTerminalName] = useState("");
  const [cardLastFour, setCardLastFour] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await browserApi<PaymentMethodPublic[]>("/api/v1/pos/payment-methods");
        if (!active) return;
        setMethods(data);
        setMethodCode((prev) => prev ?? data[0]?.code ?? null);
      } catch {
        if (active) setMethods([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const method = methods.find((item) => item.code === methodCode) ?? null;
  const invalidCard = cardLastFour.trim() !== "" && !/^\d{4}$/.test(cardLastFour.trim());
  const blocked =
    method === null
      ? "No hay métodos de pago disponibles."
      : method.requires_transaction_reference && !reference.trim()
        ? "Este método requiere la referencia de la transacción."
        : method.requires_bank_name && !bankName.trim()
          ? "Este método requiere el banco emisor."
          : invalidCard
            ? "Los últimos 4 dígitos deben ser exactamente 4 números."
            : null;

  async function submit() {
    if (method === null || blocked !== null || busy) return;
    setBusy(true);
    setError(null);
    try {
      // El monto esperado lo deriva el backend (se omite expected_amount).
      const body: PaymentCreate = {
        method_code: method.code,
        ...(method.allows_cash_change && billAmount.trim()
          ? { change_requested_for_amount: billAmount.trim() }
          : {}),
        ...(reference.trim() ? { transaction_reference: reference.trim() } : {}),
        ...(bankName.trim() ? { bank_name: bankName.trim() } : {}),
        ...(terminalName.trim() ? { terminal_name: terminalName.trim() } : {}),
        ...(cardLastFour.trim() ? { card_last_four: cardLastFour.trim() } : {}),
      };
      await browserApi(`/api/v1/orders/${orderId}/payments`, { method: "POST", body });
      setOpen(false);
      setBillAmount("");
      setReference("");
      setBankName("");
      setTerminalName("");
      setCardLastFour("");
      onDone();
    } catch (err) {
      setError(errorMessage(err, "No fue posible registrar el pago."));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="tt-btn tt-btn-outline"
        onClick={() => setOpen(true)}
        style={{ alignSelf: "flex-start", padding: "8px 16px", fontSize: 13 }}
      >
        Registrar pago
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="tt-label">Método de pago</span>
        <select
          className="tt-input"
          value={methodCode ?? ""}
          onChange={(event) => setMethodCode(event.target.value || null)}
          style={{ padding: "8px 12px", fontSize: 13 }}
        >
          {methods.map((item) => (
            <option key={item.code} value={item.code}>
              {item.display_name}
            </option>
          ))}
        </select>
      </label>
      {method?.instructions ? (
        <p style={{ margin: 0, fontSize: 12, color: "var(--tx3)" }}>{method.instructions}</p>
      ) : null}
      {method?.allows_cash_change ? (
        <input
          className="tt-input"
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          value={billAmount}
          onChange={(event) => setBillAmount(event.target.value)}
          placeholder="¿Con cuánto paga? (opcional)"
          aria-label="Monto con el que paga"
          style={{ padding: "8px 12px", fontSize: 13 }}
        />
      ) : null}
      {method?.requires_transaction_reference ? (
        <input
          className="tt-input"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="Referencia de la transacción"
          aria-label="Referencia de la transacción"
          style={{ padding: "8px 12px", fontSize: 13 }}
        />
      ) : null}
      {method?.requires_bank_name ? (
        <input
          className="tt-input"
          value={bankName}
          onChange={(event) => setBankName(event.target.value)}
          placeholder="Banco emisor"
          aria-label="Banco emisor"
          style={{ padding: "8px 12px", fontSize: 13 }}
        />
      ) : null}
      {method !== null && !method.allows_cash_change ? (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="tt-input"
            value={terminalName}
            onChange={(event) => setTerminalName(event.target.value)}
            placeholder="Terminal (opcional)"
            aria-label="Terminal"
            style={{ flex: 1, padding: "8px 12px", fontSize: 13 }}
          />
          <input
            className="tt-input"
            value={cardLastFour}
            onChange={(event) => setCardLastFour(event.target.value)}
            placeholder="Últimos 4 dígitos"
            aria-label="Últimos 4 dígitos de la tarjeta"
            inputMode="numeric"
            maxLength={4}
            style={{ flex: 1, padding: "8px 12px", fontSize: 13 }}
          />
        </div>
      ) : null}
      {error ?? blocked ? (
        <p role={error ? "alert" : undefined} style={{ margin: 0, fontSize: 12, fontWeight: 700, color: error ? "var(--accent)" : "var(--tx3)" }}>
          {error ?? blocked}
        </p>
      ) : null}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="tt-btn tt-btn-success"
          disabled={busy || blocked !== null}
          onClick={() => void submit()}
          style={{ padding: "8px 16px", fontSize: 13 }}
        >
          {busy ? "Registrando…" : "Registrar pago"}
        </button>
        <button
          type="button"
          className="tt-btn tt-btn-ghost"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          style={{ padding: "8px 16px", fontSize: 13 }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function OrderPayments({
  order,
  perms,
  onChanged,
}: Readonly<{
  order: OrderRead;
  perms: Set<string>;
  onChanged: () => void;
}>) {
  const [payments, setPayments] = useState<PaymentRead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  const orderId = order.id;
  // Se refresca con cada detalle nuevo (el tablero repide el detalle cada 30 s)
  // y tras cada acción local (tick).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await browserApi<PaymentRead[]>(`/api/v1/orders/${order.id}/payments`);
        if (!active) return;
        setPayments(data);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(errorMessage(err, "No fue posible cargar los pagos."));
      }
    })();
    return () => {
      active = false;
    };
  }, [order, tick]);

  async function verify(paymentId: string, approve: boolean, rejectedReason?: string) {
    setBusy(true);
    setError(null);
    try {
      const body: PaymentVerifyRequest = approve
        ? { approve: true }
        : { approve: false, rejected_reason: rejectedReason ?? "" };
      await browserApi(`/api/v1/payments/${paymentId}/verify`, { method: "POST", body });
      setTick((value) => value + 1);
      onChanged();
    } catch (err) {
      setError(errorMessage(err, "No fue posible verificar el pago."));
    } finally {
      setBusy(false);
    }
  }

  const list = payments ?? [];
  const hasActivePayment = list.some((payment) => ACTIVE_PAYMENT_STATUSES.includes(payment.status));
  // Los pedidos por créditos jamás llevan pagos monetarios (invariante §15).
  const canRecord =
    perms.has("payments:record") &&
    payments !== null &&
    !hasActivePayment &&
    order.purchase_mode !== "credits" &&
    order.status !== "cancelled";

  return (
    <div
      style={{
        border: "1px solid var(--border)", borderRadius: 14, padding: "14px 16px",
        display: "flex", flexDirection: "column", gap: 12,
      }}
    >
      <span className="tt-label">Pagos</span>
      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--accent)" }}>
          {error}
        </p>
      ) : null}
      {payments === null ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--tx3)" }}>Cargando pagos…</p>
      ) : list.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--tx3)" }}>Sin pagos registrados.</p>
      ) : (
        list.map((payment) => (
          <div key={payment.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <PaymentRow
              payment={payment}
              canVerify={perms.has("payments:verify")}
              busy={busy}
              onVerify={(approve, reason) => void verify(payment.id, approve, reason)}
            />
            {perms.has("payments:refund") ? (
              <PaymentRefundControl
                payment={payment}
                order={order}
                onDone={() => {
                  setTick((value) => value + 1);
                  onChanged();
                }}
              />
            ) : null}
          </div>
        ))
      )}
      {perms.has("payments:refund") ? (
        <CreditRefundControl order={order} onDone={onChanged} />
      ) : null}
      {canRecord ? <RecordPaymentForm key={orderId} orderId={orderId} onDone={() => {
        setTick((value) => value + 1);
        onChanged();
      }} /> : null}
    </div>
  );
}
