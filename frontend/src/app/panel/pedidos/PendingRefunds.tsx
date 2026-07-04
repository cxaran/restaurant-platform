"use client";

// Cola de conciliación H5: pedidos cancelados con cobro cuya devolución sigue
// abierta. Vive como ICONO DE ALERTA con contador en la barra del título del
// módulo Pedidos (no roba espacio al tablero); el detalle se abre en un
// diálogo accesible. Solo se monta con payments:read (lo decide PanelShell);
// el backend revalida el permiso en el endpoint. Con payments:refund cada
// pendiente se puede RESOLVER en el diálogo (expandir → reembolsar); al
// cubrir el monto, el pedido sale de la cola y el contador baja.

import { useEffect, useRef, useState } from "react";

import { ApiRequestError } from "@/core/api/api-error";
import { browserApi } from "@/core/api/browser-client";
import type { CancelledWithPaymentItem, OrderRead } from "@/core/restaurant-api/panel-contracts";
import { formatMoney } from "@/core/restaurant-api/theme";
import type { components } from "@/generated/openapi";

import { PaymentRefundControl } from "./RefundControls";

type PaymentRead = components["schemas"]["PaymentRead"];

const RESOLUTION_LABELS: Record<string, string> = {
  refund_now: "Reembolso registrado",
  refund_pending: "Reembolso pendiente",
  retain: "Pago retenido",
};

export function PendingRefundsAlert({
  canRefund = false,
}: Readonly<{ canRefund?: boolean }>) {
  const [items, setItems] = useState<CancelledWithPaymentItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await browserApi<CancelledWithPaymentItem[]>(
          "/api/v1/orders/cancellations/pending-refunds",
        );
        if (active) {
          setItems(data);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof ApiRequestError
              ? err.body.message
              : "No fue posible cargar la cola de devoluciones.",
          );
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [tick]);

  // Sin pendientes ni error no hay nada que avisar: cero cromo extra.
  if (error === null && items.length === 0) return null;

  return (
    <>
      <button
        type="button"
        aria-label={`Cancelados con cobro pendiente de devolver: ${items.length}`}
        title="Cancelados con cobro pendiente de devolver"
        onClick={() => {
          setTick((value) => value + 1); // refresca la cola al abrir
          setOpen(true);
        }}
        style={{
          position: "relative", display: "inline-flex", alignItems: "center",
          justifyContent: "center", width: 38, height: 38, borderRadius: 12,
          border: "2px solid var(--accent)", background: "transparent",
          color: "var(--accent)", fontSize: 17, cursor: "pointer", flexShrink: 0,
        }}
      >
        <span aria-hidden>⚠</span>
        <span
          aria-hidden
          style={{
            position: "absolute", top: -7, right: -7, minWidth: 19, height: 19,
            borderRadius: 999, background: "var(--accent)", color: "var(--on-accent, #fff)",
            fontSize: 11, fontWeight: 900, display: "inline-flex", alignItems: "center",
            justifyContent: "center", padding: "0 5px", lineHeight: 1,
          }}
        >
          {error ? "!" : items.length}
        </span>
      </button>

      {open ? (
        <PendingRefundsDialog
          items={items}
          error={error}
          canRefund={canRefund}
          onClose={() => setOpen(false)}
          onResolved={() => setTick((value) => value + 1)}
        />
      ) : null}
    </>
  );
}

function PendingRefundsDialog({
  items,
  error,
  canRefund,
  onClose,
  onResolved,
}: Readonly<{
  items: CancelledWithPaymentItem[];
  error: string | null;
  canRefund: boolean;
  onClose: () => void;
  onResolved: () => void;
}>) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(28,21,18,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Cancelados con cobro pendiente de devolver"
        tabIndex={-1}
        className="tt-card"
        style={{
          width: "min(680px, 100%)", maxHeight: "min(80dvh, 640px)", overflowY: "auto",
          padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10,
          outline: "none",
        }}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16, color: "var(--accent)", flex: 1 }}>
            ⚠ Cancelados con cobro pendiente de devolver ({items.length})
          </h2>
          <button
            type="button"
            className="tt-btn tt-btn-ghost"
            style={{ padding: "4px 10px", fontSize: 12 }}
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>

        {error ? (
          <p role="alert" style={{ margin: 0, color: "var(--accent)", fontSize: 13, fontWeight: 700 }}>
            {error}
          </p>
        ) : items.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--tx3)" }}>
            Sin devoluciones pendientes: la cola quedó al día.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {items.map((item) => (
              <PendingRefundItem
                key={item.order_id}
                item={item}
                canRefund={canRefund}
                onResolved={onResolved}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PendingRefundItem({
  item,
  canRefund,
  onResolved,
}: Readonly<{
  item: CancelledWithPaymentItem;
  canRefund: boolean;
  onResolved: () => void;
}>) {
  const [expanded, setExpanded] = useState(false);
  const [order, setOrder] = useState<OrderRead | null>(null);
  const [payments, setPayments] = useState<PaymentRead[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // El pedido y sus pagos se cargan al expandir (la cola sigue ligera).
  useEffect(() => {
    if (!expanded || order !== null) return;
    let active = true;
    (async () => {
      try {
        const [orderData, paymentData] = await Promise.all([
          browserApi<OrderRead>(`/api/v1/orders/${item.order_id}`),
          browserApi<PaymentRead[]>(`/api/v1/orders/${item.order_id}/payments`),
        ]);
        if (!active) return;
        setOrder(orderData);
        setPayments(paymentData);
      } catch (err) {
        if (active) {
          setLoadError(
            err instanceof ApiRequestError ? err.body.message : "No fue posible cargar el pedido.",
          );
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [expanded, order, item.order_id]);

  return (
    <li style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "baseline" }}>
        <span style={{ fontWeight: 900, minWidth: 90 }}>{item.public_code}</span>
        <span className="tt-badge tt-badge-warn">
          Pendiente: {formatMoney(item.outstanding_amount)}
        </span>
        <span style={{ color: "var(--tx2)" }}>
          {item.cancellation_money_resolution
            ? RESOLUTION_LABELS[item.cancellation_money_resolution] ?? item.cancellation_money_resolution
            : "Sin resolución"}
          {item.cancellation_resolution_note ? ` · ${item.cancellation_resolution_note}` : ""}
        </span>
        {item.cancelled_at ? (
          <span style={{ fontSize: 12, color: "var(--tx3)" }}>
            {new Date(item.cancelled_at).toLocaleString("es-MX", {
              day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
            })}
          </span>
        ) : null}
        {canRefund ? (
          <button
            type="button"
            className="tt-btn tt-btn-ghost"
            onClick={() => setExpanded((value) => !value)}
            style={{ padding: "4px 10px", fontSize: 12, marginLeft: "auto" }}
          >
            {expanded ? "Ocultar" : "Resolver…"}
          </button>
        ) : null}
      </div>

      {expanded ? (
        loadError ? (
          <p role="alert" style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--accent)" }}>
            {loadError}
          </p>
        ) : order === null ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--tx3)" }}>Cargando pedido…</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 8 }}>
            {payments
              .filter((payment) => ["paid", "partially_refunded"].includes(payment.status))
              .map((payment) => (
                <PaymentRefundControl
                  key={payment.id}
                  payment={payment}
                  order={order}
                  onDone={() => {
                    setOrder(null);
                    setExpanded(false);
                    onResolved();
                  }}
                />
              ))}
          </div>
        )
      ) : null}
    </li>
  );
}
