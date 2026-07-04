"use client";

// Carrito local del sitio público. NO es fuente de verdad económica: guarda
// referencias (id, nombre, precio de menú como texto informativo) y el backend
// recalcula TODO en el checkout. Cantidades: SIEMPRE enteros >= 1 (regla H1).
//
// El estado incluye el MODO de compra (money | credits): un pedido es 100%
// dinero o 100% créditos (nunca híbrido). El modo solo cambia por acción
// explícita del cliente (`setMode`); jamás hay fallback automático a money.
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

import {
  EMPTY_CART_STATE,
  isValidQuantity,
  lineSignature,
  normalizeStoredCart,
  replaceLineIn,
  type CartLine,
  type CartMode,
  type CartModifier,
  type CartState,
} from "./cart-lines";

export type { CartLine, CartMode, CartModifier };

const STORAGE_KEY = "rp-storefront-cart-v1";

function loadStoredState(): CartState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_CART_STATE;
    // Migración tolerante: la v1 guardaba un array de líneas (modo money).
    return normalizeStoredCart(JSON.parse(raw) as unknown);
  } catch {
    return EMPTY_CART_STATE;
  }
}

// --- store externo (module-level) ---
let cache: CartState | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): CartState {
  cache ??= loadStoredState();
  return cache;
}

function getServerSnapshot(): CartState {
  return EMPTY_CART_STATE;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setCart(next: CartState): void {
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
  mode: CartMode;
  count: number;
  subtotalHint: number;
  /** Cambia el modo de compra SIN tocar las líneas (la elegibilidad se valida en la UI antes). */
  setMode: (mode: CartMode) => void;
  addLine: (line: Omit<CartLine, "key" | "quantity">, quantity?: number) => void;
  replaceLine: (key: string, line: Omit<CartLine, "key" | "quantity">, quantity: number) => void;
  setQuantity: (key: string, quantity: number) => void;
  removeLine: (key: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function setLines(lines: CartLine[]): void {
  setCart({ ...getSnapshot(), lines });
}

export function CartProvider({ children }: Readonly<{ children: ReactNode }>) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setMode = useCallback((mode: CartMode) => {
    // Nunca borra líneas ni "corrige" nada: solo registra la decisión del cliente.
    if (getSnapshot().mode === mode) return;
    setCart({ ...getSnapshot(), mode });
  }, []);

  const addLine = useCallback(
    (line: Omit<CartLine, "key" | "quantity">, quantity = 1) => {
      if (!isValidQuantity(quantity)) return;
      const current = getSnapshot().lines;
      const signature = lineSignature(line.product_id, line.modifiers);
      const existing = current.find((item) => item.key === signature);
      setLines(
        existing
          ? current.map((item) =>
              item.key === signature ? { ...item, quantity: item.quantity + quantity } : item,
            )
          : [...current, { ...line, key: signature, quantity }],
      );
    },
    [],
  );

  const replaceLine = useCallback(
    (key: string, line: Omit<CartLine, "key" | "quantity">, quantity: number) => {
      // Edición de una línea: reemplaza (o fusiona por firma), nunca duplica.
      const current = getSnapshot().lines;
      const next = replaceLineIn(current, key, line, quantity);
      if (next !== current) setLines(next);
    },
    [],
  );

  const setQuantity = useCallback((key: string, quantity: number) => {
    // Rechazo, no corrección: nunca floor/parseInt sobre valores inválidos.
    if (!isValidQuantity(quantity)) return;
    setLines(
      getSnapshot().lines.map((item) => (item.key === key ? { ...item, quantity } : item)),
    );
  }, []);

  const removeLine = useCallback((key: string) => {
    setLines(getSnapshot().lines.filter((item) => item.key !== key));
  }, []);

  // Vaciar el carrito conserva el modo: el modo nunca cambia solo.
  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartContextValue>(() => {
    const { lines, mode } = state;
    const count = lines.reduce((sum, line) => sum + line.quantity, 0);
    const subtotalHint = lines.reduce((sum, line) => {
      const price = Number.parseFloat(line.unit_price_hint ?? "");
      return Number.isFinite(price) ? sum + price * line.quantity : sum;
    }, 0);
    return {
      lines,
      mode,
      count,
      subtotalHint,
      setMode,
      addLine,
      replaceLine,
      setQuantity,
      removeLine,
      clear,
    };
  }, [state, setMode, addLine, replaceLine, setQuantity, removeLine, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart requiere CartProvider");
  return context;
}
