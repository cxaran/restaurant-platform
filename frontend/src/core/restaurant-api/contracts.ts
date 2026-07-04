// Aliases type-only sobre los tipos generados del dominio restaurante.
// Nunca replicar contratos a mano: si algo falta aquí, se regenera OpenAPI.
import type { components } from "@/generated/openapi";

export type PublicBusiness = components["schemas"]["PublicBusinessRead"];
export type PublicBusinessPhone = components["schemas"]["PublicBusinessPhone"];
export type PublicLegalTerms = components["schemas"]["PublicLegalTermsRead"];
export type PublicLegalCoupon = components["schemas"]["PublicLegalCoupon"];
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

// Códigos de descuento: cotización pública (checkout web con dinero) y
// administración (lista/detalle/alta/edición/redenciones).
export type DiscountQuoteRequest = components["schemas"]["DiscountQuoteRequest"];
export type DiscountQuoteResult = components["schemas"]["DiscountQuoteResult"];
export type DiscountCodeListItem = components["schemas"]["DiscountCodeListItem"];
export type DiscountCodeRead = components["schemas"]["DiscountCodeRead"];
export type DiscountCodeCreate = components["schemas"]["DiscountCodeCreate"];
export type DiscountCodeUpdate = components["schemas"]["DiscountCodeUpdate"];
export type DiscountRedemptionListItem = components["schemas"]["DiscountRedemptionListItem"];
// Búsqueda de clientes por teléfono (ayuda para códigos personales; requiere profiles:read).
export type CustomerProfileRead = components["schemas"]["CustomerProfileRead"];

// Reportes operativos (ventas registradas, no utilidad): /reports/*.
export type SalesByHourReport = components["schemas"]["SalesByHourReport"];
export type SalesByHourItem = components["schemas"]["SalesByHourItem"];
export type TopProductsReport = components["schemas"]["TopProductsReport"];
export type TopProductItem = components["schemas"]["TopProductItem"];

// Configuración del negocio (/admin/negocio): perfil, política operativa,
// teléfonos, horario semanal y fechas especiales.
export type BusinessProfileRead = components["schemas"]["BusinessProfileRead"];
export type BusinessProfileUpdate = components["schemas"]["BusinessProfileUpdate"];
export type BusinessSettingsRead = components["schemas"]["BusinessSettingsRead"];
export type BusinessSettingsUpdate = components["schemas"]["BusinessSettingsUpdate"];
export type BusinessPhoneRead = components["schemas"]["BusinessPhoneRead"];
export type BusinessPhoneCreate = components["schemas"]["BusinessPhoneCreate"];
export type BusinessPhoneUpdate = components["schemas"]["BusinessPhoneUpdate"];
export type WeeklyHourRead = components["schemas"]["WeeklyHourRead"];
export type WeeklyHourSlot = components["schemas"]["WeeklyHourSlot"];
export type WeeklyHoursReplace = components["schemas"]["WeeklyHoursReplace"];
export type SpecialDateRead = components["schemas"]["SpecialDateRead"];
export type SpecialDateCreate = components["schemas"]["SpecialDateCreate"];
export type SpecialDateSlotInput = components["schemas"]["SpecialDateSlotInput"];

export type CreditTotalsRead = components["schemas"]["CreditTotalsRead"];
export type CreditMovementRead = components["schemas"]["CreditMovementRead"];
export type CustomerProfileSelfRead = components["schemas"]["CustomerProfileSelfRead"];
export type UserAddressRead = components["schemas"]["UserAddressRead"];
export type UserAddressCreate = components["schemas"]["UserAddressCreate"];
export type UserAddressUpdate = components["schemas"]["UserAddressUpdate"];
export type GeoPoint = components["schemas"]["GeoPoint"];

// Envío: cotización pública ESTIMADA (checkout/carrito/POS) y administración
// de zonas de entrega + tarifas (/admin/zona-entrega).
export type PublicShippingQuoteRequest = components["schemas"]["PublicShippingQuoteRequest"];
export type PublicShippingQuoteResult = components["schemas"]["PublicShippingQuoteResult"];
export type DeliveryZoneListItem = components["schemas"]["DeliveryZoneListItem"];
export type DeliveryZonePage = components["schemas"]["OffsetPage_DeliveryZoneListItem_"];
export type DeliveryZoneRead = components["schemas"]["DeliveryZoneRead"];
export type DeliveryZoneCreate = components["schemas"]["DeliveryZoneCreate"];
export type DeliveryZoneUpdate = components["schemas"]["DeliveryZoneUpdate"];
export type ShippingRateRead = components["schemas"]["ShippingRateRead"];
export type ShippingRateCreate = components["schemas"]["ShippingRateCreate"];
export type ShippingRateUpdate = components["schemas"]["ShippingRateUpdate"];

// Catálogo administrativo (/admin/catalogo): categorías, productos, imágenes
// y grupos de modificadores.
export type CategoryListItem = components["schemas"]["CategoryListItem"];
export type CategoryRead = components["schemas"]["CategoryRead"];
export type CategoryCreate = components["schemas"]["CategoryCreate"];
export type CategoryUpdate = components["schemas"]["CategoryUpdate"];
export type CategoryPage = components["schemas"]["OffsetPage_CategoryListItem_"];
export type ProductListItem = components["schemas"]["ProductListItem"];
export type ProductRead = components["schemas"]["ProductRead"];
export type ProductCreate = components["schemas"]["ProductCreate"];
export type ProductUpdate = components["schemas"]["ProductUpdate"];
export type ProductPage = components["schemas"]["OffsetPage_ProductListItem_"];
export type ProductImageRead = components["schemas"]["ProductImageRead"];
export type ProductImageAttach = components["schemas"]["ProductImageAttach"];
export type ProductModifierGroupRead = components["schemas"]["ProductModifierGroupRead"];
export type ProductModifierGroupItem = components["schemas"]["ProductModifierGroupItem"];
export type ProductModifierGroupsReplace = components["schemas"]["ProductModifierGroupsReplace"];
export type ModifierGroupListItem = components["schemas"]["ModifierGroupListItem"];
export type ModifierGroupPage = components["schemas"]["OffsetPage_ModifierGroupListItem_"];
export type SortOrderReplace = components["schemas"]["SortOrderReplace"];
export type StoredFileRead = components["schemas"]["StoredFileRead"];
