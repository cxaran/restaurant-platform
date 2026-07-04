"use client";

// H5: cancelar con cobro exige decisión humana explícita sobre el dinero.
// Diálogo accesible propio: role="dialog", aria-modal, foco inicial y Escape.

import { useEffect, useRef, useState } from "react";

import type {
  OrderListItem,
  OrderTransitionRequest,
} from "@/core/restaurant-api/panel-contracts";

export type CancelResolution = NonNullable<OrderTransitionRequest["payment_resolution"]>;

const RESOLUTION_OPTIONS: { value: CancelResolution; label: string; detail: string }[] = [
  {
    value: "refund_now",
    label: "Reembolso registrado ahora",
    detail: "El dinero ya se devolvió y queda registrado en este momento.",
  },
  {
    value: "refund_pending",
    label: "Reembolso pendiente de procesar",
    detail: "La devolución queda abierta en la cola de conciliación.",
  },
  {
    value: "retain",
    label: "Retener el pago (excepcional)",
    detail: "El negocio conserva el cobro; requiere motivo obligatorio.",
  },
];

export function CancelDialog({
  order,
  busy,
  error,
  onClose,
  onConfirm,
}: Readonly<{
  order: OrderListItem;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (resolution: CancelResolution | null, reason: string | null) => void;
}>) {
  const hasPayments = order.payment_status !== "unpaid";
  const [resolution, setResolution] = useState<CancelResolution | null>(null);
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  function confirm() {
    if (hasPayments && resolution === null) {
      setLocalError("Elige cómo se resuelve el cobro antes de cancelar.");
      return;
    }
    if (resolution === "retain" && reason.trim().length === 0) {
      setLocalError("El motivo es obligatorio para retener el pago.");
      return;
    }
    setLocalError(null);
    onConfirm(
      hasPayments ? resolution : null,
      resolution === "retain" ? reason.trim() : null,
    );
  }

  const shownError = error ?? localError;

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(28,21,18,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, zIndex: 50,
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-dialog-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !busy) onClose();
        }}
        style={{
          background: "var(--panel)", color: "var(--tx)",
          borderRadius: 16, border: "1px solid var(--border2)",
          boxShadow: "0 24px 48px rgba(28,21,18,0.25)",
          padding: "18px 20px", maxWidth: 460, width: "100%",
          display: "flex", flexDirection: "column", gap: 12, outline: "none",
        }}
      >
        <h2 id="cancel-dialog-title" className="tt-display" style={{ margin: 0, fontSize: 18 }}>
          Cancelar pedido {order.public_code}
        </h2>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--tx2)" }}>
          Cancelar <b>no reembolsa</b> automáticamente: la devolución del dinero
          es una decisión aparte y queda registrada.
        </p>

        {hasPayments ? (
          <fieldset style={{ border: "1px solid var(--border2)", borderRadius: 12, padding: "10px 12px", margin: 0 }}>
            <legend style={{ fontSize: 13, fontWeight: 800, padding: "0 6px" }}>
              Este pedido tiene pagos registrados. ¿Qué pasa con el cobro?
            </legend>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {RESOLUTION_OPTIONS.map((option) => (
                <label key={option.value} style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "flex-start" }}>
                  <input
                    type="radio"
                    name="payment-resolution"
                    value={option.value}
                    checked={resolution === option.value}
                    onChange={() => setResolution(option.value)}
                    style={{ marginTop: 2, accentColor: "var(--accent)" }}
                  />
                  <span>
                    <span style={{ fontWeight: 800, display: "block" }}>{option.label}</span>
                    <span style={{ color: "var(--tx2)" }}>{option.detail}</span>
                  </span>
                </label>
              ))}
              {resolution === "retain" ? (
                <label style={{ fontSize: 13, fontWeight: 700, display: "block" }}>
                  Motivo (obligatorio)
                  <textarea
                    className="tt-input"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={3}
                    style={{ marginTop: 4, fontWeight: 400, resize: "vertical" }}
                  />
                </label>
              ) : null}
            </div>
          </fieldset>
        ) : (
          <p style={{ margin: 0, fontSize: 13.5 }}>
            Este pedido no tiene pagos registrados. ¿Cancelarlo?
          </p>
        )}

        {shownError ? (
          <p role="alert" style={{ margin: 0, color: "var(--accent)", fontSize: 13, fontWeight: 700 }}>
            {shownError}
          </p>
        ) : null}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="tt-btn tt-btn-ghost" disabled={busy} onClick={onClose}>
            Volver
          </button>
          <button type="button" className="tt-btn tt-btn-outline-accent" disabled={busy} onClick={confirm}>
            {busy ? "Cancelando…" : "Cancelar pedido"}
          </button>
        </div>
      </div>
    </div>
  );
}
