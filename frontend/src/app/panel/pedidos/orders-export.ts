// Export CSV del explorador de pedidos (Fase 1.5): toma el listado YA filtrado
// (mismos criterios que el tablero) y arma un CSV con los datos finales de cada
// pedido. No hay lógica de negocio aquí — solo presentación de OrderListItem,
// cuya autoridad es el backend. El archivo lleva BOM UTF-8 para que Excel
// respete los acentos.

import type { OrderListItem } from "@/core/restaurant-api/panel-contracts";

import {
  FULFILLMENT_LABELS,
  PAYMENT_STATUS_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
} from "./order-meta";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

// Instante real → dd/mm/aaaa hh:mm en la zona local (consistente con la tabla).
function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function money(value: string | null | undefined): string {
  return value ?? "";
}

type Column = { label: string; value: (order: OrderListItem) => string };

const COLUMNS: readonly Column[] = [
  { label: "Folio", value: (order) => order.public_code },
  { label: "Estado", value: (order) => STATUS_LABELS[order.status] ?? order.status },
  {
    label: "Pago",
    value: (order) => PAYMENT_STATUS_LABELS[order.payment_status] ?? order.payment_status,
  },
  { label: "Canal", value: (order) => SOURCE_LABELS[order.source] ?? order.source },
  {
    label: "Entrega",
    value: (order) => FULFILLMENT_LABELS[order.fulfillment_type] ?? order.fulfillment_type,
  },
  {
    label: "Modo",
    value: (order) => (order.purchase_mode === "credits" ? "Créditos" : "Dinero"),
  },
  { label: "Cliente", value: (order) => order.customer_name_snapshot ?? "" },
  { label: "Subtotal", value: (order) => money(order.items_subtotal_amount) },
  { label: "Envío", value: (order) => money(order.shipping_total_amount) },
  { label: "Total", value: (order) => money(order.total_money_amount) },
  { label: "Método de pago", value: (order) => order.payment_method_label ?? "" },
  { label: "Aprobado por", value: (order) => order.approved_by_name ?? "" },
  { label: "Aprobado", value: (order) => formatDateTime(order.approved_at) },
  { label: "Completado", value: (order) => formatDateTime(order.completed_at) },
  { label: "Cancelado", value: (order) => formatDateTime(order.cancelled_at) },
  { label: "Creado", value: (order) => formatDateTime(order.created_at) },
];

// Escapado CSV RFC 4180: entrecomilla si hay coma, comilla o salto de línea y
// duplica las comillas internas.
function escapeCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildOrdersCsv(orders: readonly OrderListItem[]): string {
  const header = COLUMNS.map((column) => escapeCell(column.label)).join(",");
  const rows = orders.map((order) =>
    COLUMNS.map((column) => escapeCell(column.value(order))).join(","),
  );
  return [header, ...rows].join("\r\n");
}

// Descarga el CSV con BOM UTF-8. Se aísla en su propia función para poder
// probar buildOrdersCsv sin tocar el DOM.
export function downloadOrdersCsv(orders: readonly OrderListItem[], filename: string): void {
  const csv = buildOrdersCsv(orders);
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
