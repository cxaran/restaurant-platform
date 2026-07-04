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

/** Modo del pedido completo: 100% dinero O 100% créditos (nunca híbrido). */
export type CartMode = "money" | "credits";

/** Estado persistido del carrito: las líneas MÁS el modo de compra. */
export type CartState = {
  mode: CartMode;
  lines: CartLine[];
};

export const EMPTY_CART_STATE: CartState = { mode: "money", lines: [] };

export function isValidQuantity(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

export function isCartMode(value: unknown): value is CartMode {
  return value === "money" || value === "credits";
}

function isCartLine(value: unknown): value is CartLine {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as CartLine).product_id === "string" &&
    Array.isArray((value as CartLine).modifiers) &&
    isValidQuantity((value as CartLine).quantity)
  );
}

/**
 * Migración tolerante del almacenamiento local: la v1 guardaba `CartLine[]`
 * (se interpreta como modo `money`); la forma actual es `{mode, lines}`.
 * Cualquier basura (modo desconocido, líneas corruptas) degrada a un estado
 * seguro sin perder las líneas válidas. El modo NUNCA se inventa: solo un
 * valor explícito "credits" activa el canje.
 */
export function normalizeStoredCart(parsed: unknown): CartState {
  if (Array.isArray(parsed)) {
    return { mode: "money", lines: parsed.filter(isCartLine) };
  }
  if (typeof parsed === "object" && parsed !== null) {
    const candidate = parsed as { mode?: unknown; lines?: unknown };
    return {
      mode: isCartMode(candidate.mode) ? candidate.mode : "money",
      lines: Array.isArray(candidate.lines) ? candidate.lines.filter(isCartLine) : [],
    };
  }
  return EMPTY_CART_STATE;
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
