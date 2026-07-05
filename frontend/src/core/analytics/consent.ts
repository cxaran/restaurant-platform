// Consentimiento de cookies ANALÍTICAS (solo eso: la cookie de sesión es
// necesaria y no pasa por aquí). Persistido en localStorage con notificación a
// suscriptores para que el banner y el enlace «Cookies» reaccionen sin recargar.

export type ConsentState = "granted" | "denied" | "unset";

const STORAGE_KEY = "rp-analytics-consent-v1";

let cached: ConsentState | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function readConsent(): ConsentState {
  if (cached !== null) return cached;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cached = raw === "granted" || raw === "denied" ? raw : "unset";
  } catch {
    cached = "unset";
  }
  return cached;
}

export function writeConsent(state: "granted" | "denied"): void {
  cached = state;
  try {
    window.localStorage.setItem(STORAGE_KEY, state);
  } catch {
    // Sin almacenamiento (modo privado estricto): la elección vive esta sesión.
  }
  notify();
}

/** Vuelve a «sin decidir» para reabrir el aviso (enlace «Cookies» del footer). */
export function resetConsent(): void {
  cached = "unset";
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ídem: mejor esfuerzo.
  }
  notify();
}

export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
