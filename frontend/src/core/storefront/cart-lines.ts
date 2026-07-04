// Lógica pura de líneas del carrito (sin React ni almacenamiento): tipos,
// firma producto+modificadores y operaciones sobre la lista de líneas.
// El store (`cart.tsx`) delega aquí para que esta parte sea testeable en node.

export type CartModifier = { modifier_option_id: string; name: string; quantity: number };

export type CartLine = {
  key: string;
  product_id: string;
  name: string;
  unit_price_hint: string | null;
  quantity: number;
  modifiers: CartModifier[];
  customer_note?: string;
};

export function isValidQuantity(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

/** Firma estable de una línea: mismo producto + mismos modificadores ⇒ misma key. */
export function lineSignature(productId: string, modifiers: readonly CartModifier[]): string {
  return `${productId}:${modifiers
    .map((m) => `${m.modifier_option_id}x${m.quantity}`)
    .sort()
    .join(",")}`;
}

/**
 * Reemplaza la línea `key` por una nueva configuración SIN duplicar: si la
 * firma resultante coincide con otra línea existente, ambas se fusionan
 * (sumando cantidades) en la posición de la línea editada.
 * Cantidades inválidas se rechazan devolviendo la MISMA lista (sin copia),
 * para que el llamador detecte el rechazo por identidad (regla H1).
 */
export function replaceLineIn(
  lines: CartLine[],
  key: string,
  line: Omit<CartLine, "key" | "quantity">,
  quantity: number,
): CartLine[] {
  if (!isValidQuantity(quantity)) return lines;
  if (!lines.some((item) => item.key === key)) return lines;
  const signature = lineSignature(line.product_id, line.modifiers);
  const collision = lines.find((item) => item.key === signature && item.key !== key);
  const replaced: CartLine = {
    ...line,
    key: signature,
    quantity: collision ? quantity + collision.quantity : quantity,
  };
  return lines
    .map((item) => (item.key === key ? replaced : item))
    .filter((item) => item === replaced || item.key !== signature);
}
