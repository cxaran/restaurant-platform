"use client";

// Aprobación con aclaraciones: al aceptar un pedido se pueden registrar una
// aclaración VISIBLE (la ven el cliente en su seguimiento y el repartidor en
// su entrega) y una nota interna (solo el equipo). Ambas opcionales: aprobar
// sin escribir nada sigue siendo un solo clic + confirmar.

import { useEffect, useRef, useState } from "react";

import type { OrderListItem } from "@/core/restaurant-api/panel-contracts";

export function ApproveDialog({
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
  onConfirm: (visibleNote: string | null, internalNote: string | null) => void;
}>) {
  const [visibleNote, setVisibleNote] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  function confirm() {
    onConfirm(visibleNote.trim() || null, internalNote.trim() || null);
  }

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
        aria-labelledby="approve-dialog-title"
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
        <h2 id="approve-dialog-title" className="tt-display" style={{ margin: 0, fontSize: 18 }}>
          Aprobar pedido {order.public_code}
        </h2>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--tx2)" }}>
          Aprobar congela los totales. Si hay algo que aclarar (sustituciones,
          demora, indicación de entrega), regístralo aquí antes de confirmar.
        </p>

        <label style={{ fontSize: 13, fontWeight: 700, display: "block" }}>
          Aclaración visible (opcional)
          <textarea
            className="tt-input"
            value={visibleNote}
            onChange={(event) => setVisibleNote(event.target.value)}
            rows={3}
            placeholder="La ven el cliente y el repartidor. Ej.: «Sin dip ranch: se sustituyó por BBQ»."
            style={{ marginTop: 4, fontWeight: 400, resize: "vertical" }}
            data-testid="approve-visible-note"
          />
        </label>
        <label style={{ fontSize: 13, fontWeight: 700, display: "block" }}>
          Nota interna (opcional)
          <textarea
            className="tt-input"
            value={internalNote}
            onChange={(event) => setInternalNote(event.target.value)}
            rows={2}
            placeholder="Solo la ve el equipo en el panel."
            style={{ marginTop: 4, fontWeight: 400, resize: "vertical" }}
            data-testid="approve-internal-note"
          />
        </label>

        {error ? (
          <p role="alert" style={{ margin: 0, color: "var(--accent)", fontSize: 13, fontWeight: 700 }}>
            {error}
          </p>
        ) : null}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="tt-btn tt-btn-ghost" disabled={busy} onClick={onClose}>
            Volver
          </button>
          <button
            type="button"
            className="tt-btn tt-btn-primary"
            disabled={busy}
            onClick={confirm}
            data-testid="approve-confirm"
          >
            {busy ? "Aprobando…" : "Aprobar pedido"}
          </button>
        </div>
      </div>
    </div>
  );
}
