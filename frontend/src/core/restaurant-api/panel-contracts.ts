// Aliases type-only de los contratos que consume el panel operativo (/panel).
// Nunca replicar contratos a mano: si algo falta aquí, se regenera OpenAPI.
import type { components } from "@/generated/openapi";

// Pedidos
export type OrderListItem = components["schemas"]["OrderListItem"];
export type OrderRead = components["schemas"]["OrderRead"];
export type OrderTransitionRequest = components["schemas"]["OrderTransitionRequest"];
export type CancelledWithPaymentItem = components["schemas"]["CancelledWithPaymentItem"];

// Reparto / entregas
export type MyActiveDelivery = components["schemas"]["MyActiveDelivery"];
export type AvailableDeliveryItem = components["schemas"]["AvailableDeliveryItem"];
export type AssignmentRead = components["schemas"]["AssignmentRead"];
export type AssignCourierRequest = components["schemas"]["AssignCourierRequest"];
export type CourierSummaryRead = components["schemas"]["CourierSummaryRead"];
export type StaffProfileRead = components["schemas"]["StaffProfileRead"];

// POS
export type PosSaleRequest = components["schemas"]["PosSaleRequest"];
export type PosSaleResult = components["schemas"]["PosSaleResult"];

// Tickets (GET /orders/{id}/ticket responde TicketRead)
export type TicketRead = components["schemas"]["TicketRead"];
export type TicketPrintCreate = components["schemas"]["TicketPrintCreate"];
