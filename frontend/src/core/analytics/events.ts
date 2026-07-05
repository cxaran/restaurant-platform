// Catálogo CERRADO de eventos de analítica (GA4). Un evento que no está aquí
// no se puede enviar: los nombres y parámetros permitidos se centralizan para
// que ningún componente invente eventos ni filtre datos personales. Regla
// anti-PII: jamás nombres, teléfonos, correos, direcciones, notas ni contenido
// de formularios; `page_path` lo añade el adaptador (solo pathname, sin query).

export type AnalyticsEventMap = {
  /** Clic en un CTA configurable del hero de la portada. */
  cta_click: {
    cta_name: string;
    cta_location: string;
    destination_type: string;
  };
  /** Clic en un enlace de WhatsApp (footer o CTA). */
  whatsapp_click: { link_location: string };
  /** Clic en un enlace de teléfono (footer o CTA). */
  phone_click: { link_location: string };
  /** Vista del detalle de un producto publicado (catálogo público). */
  view_item: { item_id: string; item_name: string };
  /** Cambio de pestaña de categoría en el menú. */
  view_menu_category: { category_name: string };
  /** Producto agregado al carrito (cualquier superficie). */
  add_to_cart: {
    item_id: string;
    item_name: string;
    quantity: number;
    purchase_mode: string;
  };
  /** Línea eliminada del carrito. */
  remove_from_cart: { item_id: string; item_name: string };
  /** Inicio del checkout con carrito no vacío. */
  begin_checkout: { item_count: number; purchase_mode: string };
  /** CONVERSIÓN PRINCIPAL: pedido creado con éxito (tras confirmar el backend). */
  purchase: {
    transaction_id: string;
    value?: number;
    currency?: string;
    item_count: number;
    fulfillment_type: string;
    purchase_mode: string;
  };
  /** Conversión secundaria: registro completado con éxito. */
  sign_up: { method: string };
  /** Inicio de sesión exitoso. */
  login: { method: string };
};

export type AnalyticsEventName = keyof AnalyticsEventMap;
