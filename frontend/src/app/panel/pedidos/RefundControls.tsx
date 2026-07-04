"use client";

// Reembolsos (§18.4/§22.5) desde el detalle del pedido, tras payments:refund:
//  · dinero: POST /payments/{id}/refunds — monto + motivo y, opcionalmente,
//    asignación por línea (cantidades ENTERAS; topes acumulados del backend);
//  · créditos: POST /orders/{id}/credit-refunds — una línea canjeada por vez.
// La UI solo precalcula; los topes y reglas los valida el backend y aquí se
// muestra su mensaje real. Un reembolso jamás borra el pago original.

import { useState } from "react";

import { ApiRequestError } from "@/core/api/api-error";
import { browserApi } from "@/core/api/browser-client";
import type { OrderRead } from "@/core/restaurant-api/panel-contracts";
import { formatMoney } from "@/core/restaurant-api/theme";
import type { components } from "@/generated/openapi";

type PaymentRead = components["schemas"]["PaymentRead"];
type RefundCreate = components["schemas"]["RefundCreate"];
type CreditRefundCreate = components["schemas"]["CreditRefundCreate"];

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiRequestError ? err.body.message : fallback;
}

const REFUNDABLE_STATUSES = new Set(["paid", "partially_refunded"]);

type AllocationDraft = { quantity: string; amount: string };

/** Reembolso monetario de un pago cobrado, con asignación opcional por línea. */
export function PaymentRefundControl({
  payment,
  order,
  onDone,
}: Readonly<{ payment: PaymentRead; order: OrderRead; onDone: () => void }>) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [bankName, setBankName] = useState("");
  const [allocations, setAllocations] = useState<Record<string, AllocationDraft>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!REFUNDABLE_STATUSES.has(payment.status)) return null;

  const lines = order.lines ?? [];

  function setDraft(lineId: string, patch: Partial<AllocationDraft>) {
    setAllocations((current) => {
      const base = current[lineId] ?? { quantity: "", amount: "" };
      return { ...current, [lineId]: { ...base, ...patch } };
    });
  }

  async function submit() {
    const parsed = Number.parseFloat(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("El monto a devolver debe ser mayor que cero.");
      return;
    }
    if (!reason.trim()) {
      setError("El motivo es obligatorio.");
      return;
    }
    const allocationItems: RefundCreate["allocations"] = [];
    for (const [lineId, draft] of Object.entries(allocations)) {
      const quantity = Number.parseInt(draft.quantity, 10);
      if (!draft.quantity.trim() || Number.isNaN(quantity) || quantity < 1) continue;
      const lineAmount = Number.parseFloat(draft.amount);
      allocationItems.push({
        order_line_id: lineId,
        refunded_quantity: quantity,
        money_refunded_amount:
          draft.amount.trim() && Number.isFinite(lineAmount) ? draft.amount.trim() : "0",
      });
    }
    setBusy(true);
    setError(null);
    try {
      await browserApi(`/api/v1/payments/${payment.id}/refunds`, {
        method: "POST",
        body: {
          amount: amount.trim(),
          reason: reason.trim(),
          allocations: allocationItems,
          ...(reference.trim() ? { transaction_reference: reference.trim() } : {}),
          ...(bankName.trim() ? { bank_name: bankName.trim() } : {}),
        } satisfies RefundCreate,
      });
      setOpen(false);
      setAmount("");
      setReason("");
      setAllocations({});
      onDone();
    } catch (err) {
      setError(errorMessage(err, "No fue posible registrar el reembolso."));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div>
        <button
          type="button"
          className="tt-btn tt-btn-outline-accent"
          onClick={() => setOpen(true)}
          style={{ padding: "7px 14px", fontSize: 12 }}
          data-testid={`refund-open-${payment.id}`}
        >
          Registrar reembolso…
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px dashed var(--border2)", borderRadius: 12, padding: "12px 14px",
        display: "flex", flexDirection: "column", gap: 10,
      }}
    >
      <span style={{ fontWeight: 800, fontSize: 13 }}>
        Reembolso sobre {payment.payment_method_name_snapshot} (
        {formatMoney(payment.received_amount)} cobrados)
      </span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          className="tt-input"
          inputMode="decimal"
          placeholder="Monto a devolver"
          aria-label="Monto a devolver"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          style={{ width: 150, fontSize: 13 }}
        />
        <input
          className="tt-input"
          placeholder="Motivo (obligatorio)"
          aria-label="Motivo del reembolso"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          style={{ flex: "1 1 200px", fontSize: 13 }}
        />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          className="tt-input"
          placeholder="Referencia (opcional)"
          aria-label="Referencia de la devolución"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          style={{ flex: "1 1 160px", fontSize: 13 }}
        />
        <input
          className="tt-input"
          placeholder="Banco (opcional)"
          aria-label="Banco de la devolución"
          value={bankName}
          onChange={(event) => setBankName(event.target.value)}
          style={{ flex: "1 1 140px", fontSize: 13 }}
        />
      </div>

      {lines.length > 0 ? (
        <details>
          <summary style={{ fontSize: 12, fontWeight: 700, cursor: "pointer", color: "var(--tx2)" }}>
            Asignar por línea (opcional; controla los topes por producto)
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {lines.map((line) => {
              const draft = allocations[line.id] ?? { quantity: "", amount: "" };
              return (
                <div key={line.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ flex: "1 1 180px", fontSize: 13 }}>
                    {line.quantity} × {line.product_name_snapshot}
                  </span>
                  <input
                    className="tt-input"
                    inputMode="numeric"
                    placeholder="Cant."
                    aria-label={`Cantidad devuelta de ${line.product_name_snapshot}`}
                    value={draft.quantity}
                    onChange={(event) => setDraft(line.id, { quantity: event.target.value })}
                    style={{ width: 70, fontSize: 13 }}
                  />
                  <input
                    className="tt-input"
                    inputMode="decimal"
                    placeholder="Monto"
                    aria-label={`Monto devuelto de ${line.product_name_snapshot}`}
                    value={draft.amount}
                    onChange={(event) => setDraft(line.id, { amount: event.target.value })}
                    style={{ width: 100, fontSize: 13 }}
                  />
                </div>
              );
            })}
          </div>
        </details>
      ) : null}

      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--accent)" }}>
          {error}
        </p>
      ) : null}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="tt-btn tt-btn-outline-accent"
          disabled={busy}
          onClick={() => void submit()}
          style={{ fontSize: 13 }}
          data-testid="refund-confirm"
        >
          {busy ? "Registrando…" : "Registrar reembolso"}
        </button>
        <button
          type="button"
          className="tt-btn tt-btn-ghost"
          disabled={busy}
          onClick={() => setOpen(false)}
          style={{ fontSize: 13 }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** Devolución de una línea 100% canjeada con créditos (pedido sin dinero). */
export function CreditRefundControl({
  order,
  onDone,
}: Readonly<{ order: OrderRead; onDone: () => void }>) {
  const [open, setOpen] = useState(false);
  const [lineId, setLineId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lines = order.lines ?? [];
  if (order.purchase_mode !== "credits" || lines.length === 0) return null;

  async function submit() {
    const parsedQuantity = Number.parseInt(quantity, 10);
    if (!lineId || Number.isNaN(parsedQuantity) || parsedQuantity < 1 || !reason.trim()) {
      setError("Elige la línea, una cantidad válida y el motivo.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await browserApi(`/api/v1/orders/${order.id}/credit-refunds`, {
        method: "POST",
        body: {
          order_line_id: lineId,
          refunded_quantity: parsedQuantity,
          reason: reason.trim(),
        } satisfies CreditRefundCreate,
      });
      setOpen(false);
      setLineId("");
      setQuantity("1");
      setReason("");
      onDone();
    } catch (err) {
      setError(errorMessage(err, "No fue posible registrar la devolución de créditos."));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div>
        <button
          type="button"
          className="tt-btn tt-btn-outline-accent"
          onClick={() => setOpen(true)}
          style={{ padding: "7px 14px", fontSize: 12 }}
          data-testid="credit-refund-open"
        >
          Devolver créditos…
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px dashed var(--border2)", borderRadius: 12, padding: "12px 14px",
        display: "flex", flexDirection: "column", gap: 8,
      }}
    >
      <span style={{ fontWeight: 800, fontSize: 13 }}>Devolución de línea canjeada</span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select
          className="tt-input"
          value={lineId}
          onChange={(event) => setLineId(event.target.value)}
          aria-label="Línea a devolver"
          style={{ flex: "1 1 200px", fontSize: 13 }}
        >
          <option value="">Elige la línea…</option>
          {lines.map((line) => (
            <option key={line.id} value={line.id}>
              {line.quantity} × {line.product_name_snapshot} ({line.credits_redeemed_total} créditos)
            </option>
          ))}
        </select>
        <input
          className="tt-input"
          inputMode="numeric"
          aria-label="Cantidad devuelta"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          style={{ width: 80, fontSize: 13 }}
        />
      </div>
      <input
        className="tt-input"
        placeholder="Motivo (obligatorio)"
        aria-label="Motivo de la devolución"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        style={{ fontSize: 13 }}
      />
      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--accent)" }}>
          {error}
        </p>
      ) : null}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="tt-btn tt-btn-outline-accent"
          disabled={busy}
          onClick={() => void submit()}
          style={{ fontSize: 13 }}
        >
          {busy ? "Registrando…" : "Registrar devolución"}
        </button>
        <button
          type="button"
          className="tt-btn tt-btn-ghost"
          disabled={busy}
          onClick={() => setOpen(false)}
          style={{ fontSize: 13 }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
