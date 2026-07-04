"use client";

// Ticket 58mm: el payload lo arma el backend desde snapshots inmutables
// (TicketRead); esta vista solo lo imprime y registra la impresión (bitácora).

import { useEffect, useState } from "react";

import { ApiRequestError } from "@/core/api/api-error";
import { browserApi } from "@/core/api/browser-client";
import type { TicketPrintCreate, TicketRead } from "@/core/restaurant-api/panel-contracts";
import { formatMoney } from "@/core/restaurant-api/theme";

function moneyRow(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) && amount !== 0;
}

export function TicketView({ orderId }: Readonly<{ orderId: string }>) {
  const [ticket, setTicket] = useState<TicketRead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await browserApi<TicketRead>(
          `/api/v1/orders/${encodeURIComponent(orderId)}/ticket`,
        );
        if (active) setTicket(data);
      } catch (err) {
        if (active) {
          setError(
            err instanceof ApiRequestError ? err.body.message : "Error al cargar el ticket.",
          );
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [orderId]);

  async function printTicket() {
    setMessage(null);
    try {
      await browserApi(`/api/v1/orders/${encodeURIComponent(orderId)}/ticket-prints`, {
        method: "POST",
        body: { print_type: "customer_receipt", copy_number: 1 } satisfies TicketPrintCreate,
      });
      window.print();
      setMessage("Impresión registrada en la bitácora.");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.body.message : "No fue posible registrar.");
    }
  }

  if (error) return <p role="alert" style={{ color: "#b3261e", fontWeight: 700 }}>{error}</p>;
  if (!ticket) return <p style={{ opacity: 0.7 }}>Cargando ticket…</p>;

  const { totals } = ticket;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
      <div
        id="ticket-58mm"
        style={{
          width: 230,
          fontFamily: "ui-monospace, monospace",
          fontSize: 12,
          border: "1px dashed rgba(0,0,0,0.4)",
          padding: "12px 10px",
          background: "#fff",
          color: "#111",
        }}
      >
        <div style={{ textAlign: "center", fontWeight: 800 }}>{ticket.business.trade_name}</div>
        {ticket.business.slogan ? (
          <div style={{ textAlign: "center" }}>{ticket.business.slogan}</div>
        ) : null}
        <hr />
        <div>Pedido: <b>{ticket.public_code}</b></div>
        <div>Estado: {ticket.status_label}</div>
        {ticket.customer.name ? <div>Cliente: {ticket.customer.name}</div> : null}
        <hr />
        {ticket.lines.map((line, index) => (
          <div key={index}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
              <span>{line.quantity} × {line.name}</span>
              <span>
                {line.purchase_mode === "credits"
                  ? `${line.credits_redeemed} cr.`
                  : formatMoney(line.line_total)}
              </span>
            </div>
            {(line.modifiers ?? []).map((modifier, modifierIndex) => (
              <div key={modifierIndex} style={{ display: "flex", justifyContent: "space-between", gap: 6, paddingLeft: 10, opacity: 0.85 }}>
                <span>+ {modifier.quantity} × {modifier.option}</span>
                <span>{moneyRow(modifier.total) ? formatMoney(modifier.total) : ""}</span>
              </div>
            ))}
          </div>
        ))}
        <hr />
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Subtotal</span>
          <span>{formatMoney(totals.items_subtotal)}</span>
        </div>
        {moneyRow(totals.discounts) ? (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Descuentos</span>
            <span>-{formatMoney(totals.discounts)}</span>
          </div>
        ) : null}
        {moneyRow(totals.shipping) ? (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Envío</span>
            <span>{formatMoney(totals.shipping)}</span>
          </div>
        ) : null}
        {totals.total !== null && totals.total !== undefined ? (
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800 }}>
            <span>Total</span>
            <span>{formatMoney(totals.total)}</span>
          </div>
        ) : null}
        {totals.credits_redeemed > 0 ? (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Créditos usados</span>
            <span>{totals.credits_redeemed}</span>
          </div>
        ) : null}
        {totals.credits_earned > 0 ? (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Créditos ganados</span>
            <span>{totals.credits_earned}</span>
          </div>
        ) : null}
        {(ticket.payments ?? []).length > 0 ? <hr /> : null}
        {(ticket.payments ?? []).map((payment, index) => (
          <div key={index}>
            {payment.method}
            {moneyRow(payment.change_amount) ? ` · cambio ${formatMoney(payment.change_amount)}` : ""}
          </div>
        ))}
        <div style={{ textAlign: "center", marginTop: 8 }}>
          {ticket.business.footer_text ?? "¡Gracias por su compra!"}
        </div>
      </div>
      <button type="button" onClick={() => void printTicket()} style={{ padding: "10px 18px", borderRadius: 10, fontWeight: 900 }}>
        Imprimir y registrar
      </button>
      {message ? <p role="status" style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>{message}</p> : null}
    </div>
  );
}
