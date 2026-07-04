"use client";

// Botón compartido (pedidos y POS) de impresión DIRECTA del ticket: dispara
// window.print() sin página intermedia ni vista previa propia y registra la
// impresión en la bitácora. El resultado se informa junto al botón.

import { useState } from "react";

import { ApiRequestError } from "@/core/api/api-error";

import { printOrderTicket } from "./ticket-print";

export function TicketPrintButton({
  orderId,
  className = "tt-btn tt-btn-ghost",
  style,
  buttonStyle,
  disabled = false,
}: Readonly<{
  orderId: string | null;
  className?: string;
  style?: React.CSSProperties;
  buttonStyle?: React.CSSProperties;
  disabled?: boolean;
}>) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function run() {
    if (orderId === null || busy) return;
    setBusy(true);
    setNote(null);
    setFailed(false);
    try {
      const copy = await printOrderTicket(orderId);
      setNote(copy > 1 ? `Reimpresión registrada (copia ${copy}).` : "Ticket impreso y registrado.");
    } catch (err) {
      setFailed(true);
      setNote(
        err instanceof ApiRequestError
          ? err.body.message
          : "No fue posible imprimir el ticket.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 4, ...style }}>
      <button
        type="button"
        className={className}
        disabled={disabled || orderId === null || busy}
        onClick={() => void run()}
        data-testid="ticket-print"
        style={{ width: "100%", ...buttonStyle }}
      >
        {busy ? "Imprimiendo…" : "Imprimir ticket"}
      </button>
      {note !== null ? (
        <span
          role="status"
          data-testid="ticket-print-note"
          style={{
            fontSize: 11,
            textAlign: "center",
            fontWeight: 700,
            color: failed ? "var(--accent)" : "var(--tx3)",
          }}
        >
          {note}
        </span>
      ) : null}
    </span>
  );
}
