// Aliases type-only sobre los tipos generados del dominio restaurante.
// Nunca replicar contratos a mano: si algo falta aquí, se regenera OpenAPI.
import type { components } from "@/generated/openapi";

export type PublicBusiness = components["schemas"]["PublicBusinessRead"];
export type PublicBusinessPhone = components["schemas"]["PublicBusinessPhone"];
export type PublicMenuCategory = components["schemas"]["PublicMenuCategory"];
export type PublicProduct = components["schemas"]["PublicProduct"];
export type PublicModifierGroup = components["schemas"]["PublicModifierGroup"];
export type PublicModifierOption = components["schemas"]["PublicModifierOption"];

export type CheckoutRequest = components["schemas"]["CheckoutRequest"];
export type OrderLineInput = components["schemas"]["OrderLineInput"];
export type OrderModifierInput = components["schemas"]["OrderModifierInput"];
export type DeliveryInput = components["schemas"]["DeliveryInput"];
export type MyOrderRead = components["schemas"]["MyOrderRead"];
export type PublicCourierInfo = components["schemas"]["PublicCourierInfo"];

export type CreditTotalsRead = components["schemas"]["CreditTotalsRead"];
export type CreditMovementRead = components["schemas"]["CreditMovementRead"];
export type CustomerProfileSelfRead = components["schemas"]["CustomerProfileSelfRead"];
export type UserAddressRead = components["schemas"]["UserAddressRead"];
