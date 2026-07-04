// Presentación compartida de pedidos del cliente (cuenta, lista y seguimiento
// 1e/2a del handoff). Solo DERIVA presentación de campos que ya vienen del
// contrato generado: jamás calcula totales ni estados nuevos.
import type { MyOrderRead } from "@/core/restaurant-api/contracts";
import { formatMoney } from "@/core/restaurant-api/theme";

export type StatusTone = "success" | "warn" | "danger" | "neutral";

/** Tono visual del estado público (badges sólidos y chips suaves). */
export function statusTone(status: string): StatusTone {
  if (status === "completed" || status === "out_for_delivery") return "success";
  if (status === "preparing" || status === "ready") return "warn";
  if (status === "cancelled") return "danger";
  return "neutral";
}

/** Total mostrado: dinero o créditos, según el modo ÍNTEGRO del pedido (§1.3). */
export function orderTotalDisplay(order: MyOrderRead): string {
  if (order.purchase_mode === "credits") {
    return `${order.credits_redeemed_total} créditos`;
  }
  return formatMoney(order.total_money_amount ?? order.items_subtotal_amount);
}

/** Resumen de productos en una línea («1 × Boneless + 1 × Papas»). */
export function orderLinesSummary(order: MyOrderRead): string | null {
  const lines = order.lines ?? [];
  if (lines.length === 0) return null;
  return lines
    .map((line) => `${line.quantity} × ${line.product_name_snapshot}`)
    .join(" + ");
}

export function formatOrderDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

export function formatOrderTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// Línea de tiempo del seguimiento (1e/2a)
// ---------------------------------------------------------------------------

/** Progreso público de la máquina de estados (§16); cancelado no tiene línea. */
const STATUS_RANK: Record<string, number> = {
  draft: 0,
  submitted: 0,
  pending_shipping_review: 0,
  pending_payment_verification: 0,
  pending_approval: 0,
  approved: 1,
  preparing: 2,
  ready: 3,
  out_for_delivery: 4,
  completed: 5,
};

export type TimelineStep = {
  key: string;
  label: string;
  caption: string | null;
  state: "done" | "current" | "todo";
  tone: "success" | "brand";
};

export function buildOrderTimeline(order: MyOrderRead): TimelineStep[] | null {
  const current = STATUS_RANK[order.status];
  if (current === undefined) return null;
  const isDelivery = order.fulfillment_type === "delivery";
  // 1e: el paso activo va en color de marca; 2a («en camino») va en verde.
  const currentTone: TimelineStep["tone"] =
    statusTone(order.status) === "success" ? "success" : "brand";

  const defs: { key: string; rank: number; label: string; currentCaption: string | null }[] = [
    { key: "received", rank: 0, label: "Pedido recibido", currentCaption: order.status_label },
    {
      key: "confirmed",
      rank: 1,
      label: "Pedido confirmado",
      currentCaption: "El negocio confirmó tu pedido",
    },
    {
      key: "preparing",
      rank: 2,
      label: "En preparación",
      currentCaption: "Tu pedido está en la cocina",
    },
    {
      key: "ready",
      rank: 3,
      label: "Listo",
      currentCaption: isDelivery ? "Preparando la entrega" : "Ya puedes pasar por tu pedido",
    },
    ...(isDelivery
      ? [
          {
            key: "out",
            rank: 4,
            label: "En camino",
            currentCaption: order.courier
              ? `${order.courier.name} va en camino`
              : "Tu pedido va en camino",
          },
        ]
      : []),
    { key: "delivered", rank: 5, label: "Entregado", currentCaption: null },
  ];

  return defs.map((def) => {
    const state: TimelineStep["state"] =
      order.status === "completed" || def.rank < current
        ? "done"
        : def.rank === current
          ? "current"
          : "todo";
    let caption: string | null = state === "current" ? def.currentCaption : null;
    if (def.key === "received" && state !== "current") {
      caption = formatOrderTime(order.created_at);
    }
    if (def.key === "delivered" && state === "done" && order.delivery?.delivered_at) {
      caption = formatOrderTime(order.delivery.delivered_at);
    }
    return {
      key: def.key,
      label: def.label,
      caption,
      state,
      tone: state === "done" ? "success" : currentTone,
    };
  });
}
