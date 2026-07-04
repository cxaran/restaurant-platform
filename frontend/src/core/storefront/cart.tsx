"use client";

// Carrito local del sitio público. NO es fuente de verdad económica: guarda
// referencias (id, nombre, precio de menú como texto informativo) y el backend
// recalcula TODO en el checkout. Cantidades: SIEMPRE enteros >= 1 (regla H1).
//
// localStorage es un sistema externo → se integra con useSyncExternalStore
// (snapshot vacío en SSR; el cliente hidrata desde el almacenamiento real).

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

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

const STORAGE_KEY = "rp-storefront-cart-v1";
const EMPTY: CartLine[] = [];

function isValidQuantity(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function loadStoredLines(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    return parsed.filter(
      (line): line is CartLine =>
        typeof line === "object" &&
        line !== null &&
        typeof (line as CartLine).product_id === "string" &&
        isValidQuantity((line as CartLine).quantity),
    );
  } catch {
    return EMPTY;
  }
}

// --- store externo (module-level) ---
let cache: CartLine[] | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): CartLine[] {
  cache ??= loadStoredLines();
  return cache;
}

function getServerSnapshot(): CartLine[] {
  return EMPTY;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setCart(next: CartLine[]): void {
  cache = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // almacenamiento lleno o bloqueado: el carrito sigue en memoria
  }
  for (const listener of listeners) listener();
}

type CartContextValue = {
  lines: CartLine[];
  count: number;
  subtotalHint: number;
  addLine: (line: Omit<CartLine, "key" | "quantity">, quantity?: number) => void;
  setQuantity: (key: string, quantity: number) => void;
  removeLine: (key: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: Readonly<{ children: ReactNode }>) {
  const lines = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const addLine = useCallback(
    (line: Omit<CartLine, "key" | "quantity">, quantity = 1) => {
      if (!isValidQuantity(quantity)) return;
      const current = getSnapshot();
      const signature = `${line.product_id}:${line.modifiers
        .map((m) => `${m.modifier_option_id}x${m.quantity}`)
        .sort()
        .join(",")}`;
      const existing = current.find((item) => item.key === signature);
      setCart(
        existing
          ? current.map((item) =>
              item.key === signature ? { ...item, quantity: item.quantity + quantity } : item,
            )
          : [...current, { ...line, key: signature, quantity }],
      );
    },
    [],
  );

  const setQuantity = useCallback((key: string, quantity: number) => {
    // Rechazo, no corrección: nunca floor/parseInt sobre valores inválidos.
    if (!isValidQuantity(quantity)) return;
    setCart(getSnapshot().map((item) => (item.key === key ? { ...item, quantity } : item)));
  }, []);

  const removeLine = useCallback((key: string) => {
    setCart(getSnapshot().filter((item) => item.key !== key));
  }, []);

  const clear = useCallback(() => setCart([]), []);

  const value = useMemo<CartContextValue>(() => {
    const count = lines.reduce((sum, line) => sum + line.quantity, 0);
    const subtotalHint = lines.reduce((sum, line) => {
      const price = Number.parseFloat(line.unit_price_hint ?? "");
      return Number.isFinite(price) ? sum + price * line.quantity : sum;
    }, 0);
    return { lines, count, subtotalHint, addLine, setQuantity, removeLine, clear };
  }, [lines, addLine, setQuantity, removeLine, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart requiere CartProvider");
  return context;
}
