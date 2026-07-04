"use client";

// Ticket 58mm: el payload lo arma el backend desde snapshots inmutables; esta
// vista solo lo imprime y registra la impresión (bitácora real).

import { useEffect, useState } from "react";

import { ApiRequestError } from "@/core/api/api-error";
import { browserApi } from "@/core/api/browser-client";
import { formatMoney } from "@/core/restaurant-api/theme";

type TicketPayload = {
  public_code: string;
  status_label: string;
  business: { trade_name: string; slogan?: string | null };
  lines: { name: string; quantity: number; total?: string | null }[];
  totals: Record<string, string | null | undefined>;
  payments: { method: string; status?: string; change_amount?: string | null }[];
};

export function TicketView({ orderId }: Readonly<{ orderId: string }>) {
  const [ticket, setTicket] = useState<TicketPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await browserApi<TicketPayload>(
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
        body: { print_type: "customer_receipt" },
      });
      window.print();
      setMessage("Impresión registrada en la bitácora.");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.body.message : "No fue posible registrar.");
    }
  }

  if (error) return <p role="alert" style={{ color: "#b3261e", fontWeight: 700 }}>{error}</p>;
  if (!ticket) return <p style={{ opacity: 0.7 }}>Cargando ticket…</p>;

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
        <hr />
        {ticket.lines.map((line, index) => (
          <div key={index} style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
            <span>{line.quantity} × {line.name}</span>
            <span>{line.total ? formatMoney(line.total) : ""}</span>
          </div>
        ))}
        <hr />
        {Object.entries(ticket.totals).map(([key, value]) =>
          value ? (
            <div key={key} style={{ display: "flex", justifyContent: "space-between", fontWeight: key === "total" ? 800 : 400 }}>
              <span>{key}</span>
              <span>{formatMoney(value)}</span>
            </div>
          ) : null,
        )}
        <hr />
        {ticket.payments.map((payment, index) => (
          <div key={index}>
            {payment.method}
            {payment.change_amount ? ` · cambio ${formatMoney(payment.change_amount)}` : ""}
          </div>
        ))}
        <div style={{ textAlign: "center", marginTop: 8 }}>¡Gracias por su compra!</div>
      </div>
      <button type="button" onClick={() => void printTicket()} style={{ padding: "10px 18px", borderRadius: 10, fontWeight: 900 }}>
        Imprimir y registrar
      </button>
      {message ? <p role="status" style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>{message}</p> : null}
    </div>
  );
}
