// Metadatos de presentación del módulo de pedidos (pantalla 1g del handoff).
// Solo etiquetas y agrupaciones visuales: la autoridad de estados y
// transiciones es SIEMPRE el backend (ORDER_TRANSITIONS); aquí solo se decide
// qué botón mostrar y el backend valida cada acción (409 si no procede).

// Espejo visual de ORDER_TRANSITIONS del backend (la autoridad es el backend:
// una transición no permitida responde 409 y se muestra el mensaje real).
export const NEXT_ACTIONS: Record<
  string,
  { to: string; label: string; permission: string }[]
> = {
  // "Revisar pedido" es del EMPLEADO (mueve el pedido a revisión); el
  // repartidor toma ENVÍOS en /panel/reparto y solo después de aprobar.
  submitted: [{ to: "pending_approval", label: "Revisar pedido", permission: "orders:transition" }],
  // Estados de revisión (§16): el envío se ajusta y el pago se verifica en el
  // detalle; estas transiciones solo mueven el pedido al siguiente escalón.
  pending_shipping_review: [
    { to: "pending_payment_verification", label: "Pasar a verificar pago", permission: "orders:transition" },
    { to: "pending_approval", label: "Pasar a aprobación", permission: "orders:transition" },
    { to: "cancelled", label: "Cancelar…", permission: "orders:cancel" },
  ],
  pending_payment_verification: [
    { to: "pending_approval", label: "Pasar a aprobación", permission: "orders:transition" },
    { to: "cancelled", label: "Cancelar…", permission: "orders:cancel" },
  ],
  pending_approval: [
    { to: "approved", label: "Aprobar pedido", permission: "orders:approve" },
    { to: "cancelled", label: "Cancelar…", permission: "orders:cancel" },
  ],
  approved: [
    { to: "preparing", label: "En preparación", permission: "orders:transition" },
    { to: "cancelled", label: "Cancelar…", permission: "orders:cancel" },
  ],
  preparing: [{ to: "ready", label: "Listo", permission: "orders:transition" }],
  ready: [
    { to: "out_for_delivery", label: "En camino", permission: "orders:transition" },
    { to: "completed", label: "Entregado", permission: "orders:transition" },
  ],
  out_for_delivery: [{ to: "completed", label: "Entregado", permission: "orders:transition" }],
};

export const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  submitted: "Nuevo",
  pending_shipping_review: "Revisión de envío",
  pending_payment_verification: "Verificar pago",
  pending_approval: "Por aprobar",
  approved: "Aprobado",
  preparing: "En preparación",
  ready: "Listo",
  out_for_delivery: "En camino",
  completed: "Entregado",
  cancelled: "Cancelado",
};

// Variante del tt-badge por estado (rojo=entrada, ámbar=en proceso,
// verde=listo/en ruta, gris=terminal).
export const STATUS_BADGE_CLASS: Record<string, string> = {
  draft: "tt-badge-done",
  submitted: "tt-badge-new",
  pending_shipping_review: "tt-badge-warn",
  pending_payment_verification: "tt-badge-warn",
  pending_approval: "tt-badge-new",
  approved: "tt-badge-warn",
  preparing: "tt-badge-warn",
  ready: "tt-badge-ok",
  out_for_delivery: "tt-badge-ok",
  completed: "tt-badge-done",
  cancelled: "tt-badge-done",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: "Sin pago",
  pending: "Pago pendiente",
  pending_verification: "Pago por verificar",
  paid: "Pagado",
  partially_refunded: "Reembolso parcial",
  refunded: "Reembolsado",
  voided: "Pago anulado",
};

// Estados de cada registro de pago (payments.status), distintos del estado de
// pago agregado del pedido (payment_status de arriba).
export const PAYMENT_RECORD_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  pending_verification: "Por verificar",
  paid: "Pagado",
  rejected: "Rechazado",
  voided: "Anulado",
  refunded: "Reembolsado",
};

export const PAYMENT_RECORD_BADGE_CLASS: Record<string, string> = {
  pending: "tt-badge-warn",
  pending_verification: "tt-badge-warn",
  paid: "tt-badge-ok",
  rejected: "tt-badge-new",
  voided: "tt-badge-done",
  refunded: "tt-badge-done",
};

// Estados previos a la aprobación (§16): el envío aún puede ajustarse.
export const PRE_APPROVAL_STATUSES: readonly string[] = [
  "draft",
  "submitted",
  "pending_shipping_review",
  "pending_payment_verification",
  "pending_approval",
];

export const FULFILLMENT_LABELS: Record<string, string> = {
  delivery: "A domicilio",
  pickup: "Recoger en tienda",
  counter: "Mostrador",
};

export const SOURCE_LABELS: Record<string, string> = {
  online: "En línea",
  counter: "Mostrador",
  phone: "Teléfono",
  whatsapp: "WhatsApp",
  social: "Redes",
  manual: "Manual",
};

// "Activos" = todo lo que no es terminal ni borrador (los estados de revisión
// se resuelven en el detalle: ajustar envío / verificar pago).
export const ACTIVE_STATUSES: readonly string[] = [
  "submitted",
  "pending_shipping_review",
  "pending_payment_verification",
  "pending_approval",
  "approved",
  "preparing",
  "ready",
  "out_for_delivery",
];

export type OrderFilterKey =
  | "activos"
  | "nuevos"
  | "preparacion"
  | "listos"
  | "camino"
  | "todos";

// Chips de filtro (1g). "statuses: null" = sin filtro (Todos). Los grupos usan
// los estados reales del backend, no los rótulos ilustrativos del diseño.
export const ORDER_FILTERS: {
  key: OrderFilterKey;
  label: string;
  statuses: readonly string[] | null;
}[] = [
  { key: "activos", label: "Activos", statuses: ACTIVE_STATUSES },
  {
    key: "nuevos",
    label: "Nuevos",
    statuses: [
      "submitted",
      "pending_shipping_review",
      "pending_payment_verification",
      "pending_approval",
    ],
  },
  { key: "preparacion", label: "En preparación", statuses: ["approved", "preparing"] },
  { key: "listos", label: "Listos", statuses: ["ready"] },
  { key: "camino", label: "En camino", statuses: ["out_for_delivery"] },
  { key: "todos", label: "Todos", statuses: null },
];

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

// "hace 4 min" para pedidos recientes; después, la hora del día.
export function relativeSince(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  if (minutes < 240) return `hace ${Math.floor(minutes / 60)} h`;
  return formatClock(iso);
}
