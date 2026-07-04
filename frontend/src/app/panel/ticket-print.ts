"use client";

// Impresión DIRECTA del ticket 58mm (sin página intermedia ni vista previa):
// se arma el HTML desde el payload inmutable del backend (TicketRead), se
// imprime en un iframe oculto con window.print() y DESPUÉS se registra la
// impresión en la bitácora (registrar antes dejaría impresiones fantasma si
// el cajero cancela el diálogo). En estaciones con Chrome en modo kiosko
// (--kiosk-printing) la impresión sale sin ningún diálogo.

import { browserApi } from "@/core/api/browser-client";
import type {
  TicketPrintCreate,
  TicketPrintRead,
  TicketRead,
} from "@/core/restaurant-api/panel-contracts";
import { formatMoney } from "@/core/restaurant-api/theme";

import { FULFILLMENT_LABELS, PAYMENT_RECORD_STATUS_LABELS } from "./pedidos/order-meta";

function esc(value: string | null | undefined): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function moneyRow(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) && amount !== 0;
}

/** "03/07/2026 - 18:40" como en el mockup 1j. */
function formatTicketDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()} - ${hh}:${min}`;
}

function row(label: string, value: string, bold = false): string {
  return (
    `<div style="display:flex;justify-content:space-between;gap:6px;${bold ? "font-weight:800;" : ""}">` +
    `<span>${esc(label)}</span><span>${esc(value)}</span></div>`
  );
}

/** HTML completo (documento imprimible) del ticket 58mm — diseño 1j. */
export function buildTicketHtml(
  ticket: TicketRead,
  options: Readonly<{ reprint: boolean; copyNumber: number }>,
): string {
  const { totals, delivery, customer } = ticket;
  const cancelled = ticket.status === "cancelled";
  const totalsPending = totals.total === null || totals.total === undefined;

  const lines = (ticket.lines ?? [])
    .map((line) => {
      const amount =
        line.purchase_mode === "credits"
          ? `${line.credits_redeemed} cr.`
          : formatMoney(line.line_total);
      const modifiers = (line.modifiers ?? [])
        .map(
          (modifier) =>
            `<div style="display:flex;justify-content:space-between;gap:6px;padding-left:10px;opacity:.85;">` +
            `<span>+ ${modifier.quantity} × ${esc(modifier.option)}</span>` +
            `<span>${moneyRow(modifier.total) ? esc(formatMoney(modifier.total)) : ""}</span></div>`,
        )
        .join("");
      const note = line.customer_note
        ? `<div style="padding-left:10px;font-style:italic;">* ${esc(line.customer_note)}</div>`
        : "";
      return (
        `<div><div style="display:flex;justify-content:space-between;gap:6px;">` +
        `<span>${line.quantity} × ${esc(line.name)}</span><span>${esc(amount)}</span></div>` +
        modifiers + note + `</div>`
      );
    })
    .join("");

  const payments = (ticket.payments ?? [])
    .map((payment) => {
      const change = moneyRow(payment.change_requested_for_amount)
        ? ` (paga con ${formatMoney(payment.change_requested_for_amount)})`
        : "";
      const paymentStatus =
        payment.status !== "paid"
          ? ` · ${PAYMENT_RECORD_STATUS_LABELS[payment.status] ?? payment.status}`
          : "";
      return (
        `<div><div>Pago: ${esc(payment.method)}${esc(change)}${esc(paymentStatus)}</div>` +
        (moneyRow(payment.change_amount)
          ? row("Cambio", formatMoney(payment.change_amount))
          : "") +
        `</div>`
      );
    })
    .join("");

  const body =
    (cancelled
      ? `<div style="text-align:center;font-weight:800;border:1px solid #000;padding:2px 4px;margin-bottom:6px;">PEDIDO CANCELADO — SOLO INFORMATIVO</div>`
      : "") +
    (ticket.business.logo_file_id
      ? `<img src="/api/v1/public/files/${esc(ticket.business.logo_file_id)}" alt="" style="display:block;margin:0 auto 4px;max-height:44px;max-width:120px;filter:grayscale(1);" />`
      : "") +
    `<div style="text-align:center;font-weight:800;">${esc(ticket.business.trade_name)}</div>` +
    (ticket.business.slogan
      ? `<div style="text-align:center;">${esc(ticket.business.slogan)}</div>`
      : "") +
    (options.reprint
      ? `<div style="text-align:center;font-weight:800;margin-top:4px;">*** REIMPRESIÓN (copia ${options.copyNumber}) ***</div>`
      : "") +
    `<hr />` +
    `<div>Pedido: <b>${esc(ticket.public_code)}</b></div>` +
    `<div>Fecha: ${esc(formatTicketDate(ticket.created_at))}</div>` +
    `<div>Tipo: ${esc(FULFILLMENT_LABELS[ticket.fulfillment_type] ?? ticket.fulfillment_type)}</div>` +
    (ticket.attended_by ? `<div>Atendió: ${esc(ticket.attended_by)}</div>` : "") +
    `<div>Estado: ${esc(ticket.status_label)}</div>` +
    (customer.name || customer.phone || delivery
      ? `<hr />` +
        (customer.name ? `<div>Cliente: ${esc(customer.name)}</div>` : "") +
        (customer.phone ? `<div>Tel: ${esc(customer.phone)}</div>` : "") +
        (delivery
          ? `<div>${esc(delivery.street)}${delivery.external_number ? ` ${esc(delivery.external_number)}` : ""}${delivery.internal_number ? ` int. ${esc(delivery.internal_number)}` : ""}</div>` +
            (delivery.neighborhood || delivery.city
              ? `<div>${esc([delivery.neighborhood, delivery.city].filter(Boolean).join(", "))}</div>`
              : "") +
            (delivery.references ? `<div>Ref: ${esc(delivery.references)}</div>` : "")
          : "")
      : "") +
    `<hr />` +
    lines +
    `<hr />` +
    row("Subtotal", formatMoney(totals.items_subtotal)) +
    (moneyRow(totals.discounts)
      ? row(
          totals.discount_code ? `Descuento (${totals.discount_code})` : "Descuentos",
          `-${formatMoney(totals.discounts)}`,
        )
      : "") +
    (moneyRow(totals.shipping) ? row("Envío", formatMoney(totals.shipping)) : "") +
    row("TOTAL", totalsPending ? "por definir" : formatMoney(totals.total), true) +
    (totals.credits_redeemed > 0
      ? row("Créditos usados", String(totals.credits_redeemed))
      : "") +
    (totals.credits_earned > 0 ? row("Créditos ganados", String(totals.credits_earned)) : "") +
    (payments ? `<hr />${payments}` : "") +
    `<div style="text-align:center;margin-top:8px;">${esc(ticket.business.footer_text ?? "¡Gracias por su compra!")}</div>`;

  return (
    `<!doctype html><html><head><meta charset="utf-8" /><title>Ticket ${esc(ticket.public_code)}</title>` +
    `<style>@page{size:58mm auto;margin:0}` +
    `body{margin:0;width:58mm;font-family:ui-monospace,monospace;font-size:12px;line-height:1.55;color:#111;background:#fff;padding:4mm 3mm;box-sizing:border-box;}` +
    `hr{border:0;border-top:1px dashed #000;margin:4px 0;}</style></head>` +
    `<body>${body}</body></html>`
  );
}

/** Imprime el HTML en un iframe oculto: sin navegación, sin vista previa propia. */
function printHtml(html: string): Promise<void> {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    if (doc === null) {
      iframe.remove();
      resolve();
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
    // Pequeña espera para que cargue el logo; window.print() bloquea mientras
    // el diálogo está abierto (en kiosko imprime directo, sin diálogo).
    window.setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        // Entornos sin impresión (headless): se continúa con el registro.
      }
      window.setTimeout(() => {
        iframe.remove();
        resolve();
      }, 250);
    }, 200);
  });
}

/**
 * Flujo completo: payload → impresión directa → registro en bitácora.
 * Devuelve el número de copia registrado (1 = primera impresión).
 */
export async function printOrderTicket(orderId: string): Promise<number> {
  const encoded = encodeURIComponent(orderId);
  const ticket = await browserApi<TicketRead>(`/api/v1/orders/${encoded}/ticket`);
  // La copia se deriva del historial de recibos ya registrados; si la
  // bitácora no responde se asume primera copia (el registro posterior manda).
  const prints = await browserApi<TicketPrintRead[]>(
    `/api/v1/orders/${encoded}/ticket-prints`,
  ).catch(() => [] as TicketPrintRead[]);
  const receipts = prints.filter((item) => item.print_type === "customer_receipt");
  const copyNumber = receipts.length + 1;

  await printHtml(buildTicketHtml(ticket, { reprint: receipts.length > 0, copyNumber }));

  await browserApi(`/api/v1/orders/${encoded}/ticket-prints`, {
    method: "POST",
    body: {
      print_type: "customer_receipt",
      copy_number: copyNumber,
    } satisfies TicketPrintCreate,
  });
  return copyNumber;
}
