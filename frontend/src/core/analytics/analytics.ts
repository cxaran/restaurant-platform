// Adaptador CENTRAL de analítica (GA4). Único punto del frontend que conoce
// gtag: ningún componente llama a Google directo. Garantías:
//   - No-op total si la analítica está apagada o falta consentimiento.
//   - Nunca lanza: adblock, red caída o Google ausente no rompen el sitio
//     (los comandos se encolan en dataLayer y gtag.js los procesa al cargar).
//   - Anti-PII estructural: eventos y parámetros salen del catálogo cerrado
//     (events.ts) y `page_path` se calcula del pathname SIN query string
//     (rutas como /reset-password?token=… jamás viajan completas).
//   - Cambiar de proveedor = reescribir este módulo, no la aplicación.

import { readConsent, subscribeConsent, writeConsent } from "./consent";
import type { AnalyticsEventMap, AnalyticsEventName } from "./events";

export type AnalyticsRuntimeConfig = {
  measurementId: string;
  requireConsent: boolean;
  debugMode: boolean;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let config: AnalyticsRuntimeConfig | null = null;
let scriptInjected = false;
let lastPageViewPath: string | null = null;
const stateListeners = new Set<() => void>();

function notifyState(): void {
  for (const listener of stateListeners) listener();
}

/** ¿Se puede medir ahora mismo? (config presente + consentimiento resuelto). */
function isActive(): boolean {
  if (config === null) return false;
  if (!config.requireConsent) return true;
  return readConsent() === "granted";
}

function gtag(..._args: unknown[]): void {
  window.dataLayer = window.dataLayer ?? [];
  // gtag.js exige push del objeto `arguments`, no de un array normal.
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments);
}

function injectScript(): void {
  if (scriptInjected || config === null || typeof window === "undefined") return;
  scriptInjected = true;
  try {
    window.gtag = gtag;
    // Señales publicitarias SIEMPRE negadas: esto mide uso, no perfila anuncios.
    gtag("consent", "default", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "granted",
    });
    gtag("js", new Date());
    gtag("config", config.measurementId, {
      // page_view manual (App Router es SPA): evita duplicados por hidratación.
      send_page_view: false,
      ...(config.debugMode ? { debug_mode: true } : {}),
    });
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.measurementId)}`;
    document.head.appendChild(script);
    // El page_view inicial pudo ocurrir antes del consentimiento: reponerlo.
    if (lastPageViewPath !== null) {
      const path = lastPageViewPath;
      lastPageViewPath = null;
      trackPageView(path);
    }
  } catch {
    // Best-effort: la analítica jamás rompe el sitio.
  }
}

/** Inicializa con la config pública del backend. Idempotente. */
export function initAnalytics(next: AnalyticsRuntimeConfig): void {
  if (config !== null) return;
  config = next;
  if (isActive()) injectScript();
  notifyState();
}

export function grantConsent(): void {
  writeConsent("granted");
  if (isActive()) injectScript();
  notifyState();
}

export function denyConsent(): void {
  writeConsent("denied");
  notifyState();
}

/** ¿Esta instalación gestiona consentimiento? (para el enlace «Cookies»). */
export function isConsentManaged(): boolean {
  return config !== null && config.requireConsent;
}

export function subscribeAnalyticsState(listener: () => void): () => void {
  stateListeners.add(listener);
  const unsubscribeConsent = subscribeConsent(listener);
  return () => {
    stateListeners.delete(listener);
    unsubscribeConsent();
  };
}

/** Pathname actual SIN query string ni hash (anti-PII/credenciales en URL). */
function safePath(): string {
  try {
    return window.location.pathname || "/";
  } catch {
    return "/";
  }
}

export function trackPageView(path: string): void {
  // El pathname llega de usePathname (sin query). Dedupe por ruta consecutiva:
  // re-renders y rehidratación no generan vistas duplicadas.
  if (path === lastPageViewPath) return;
  lastPageViewPath = path;
  if (!isActive()) return;
  try {
    gtag("event", "page_view", {
      page_path: path,
      page_location: `${window.location.origin}${path}`,
    });
  } catch {
    // Best-effort.
  }
}

export function trackEvent<N extends AnalyticsEventName>(
  name: N,
  params: AnalyticsEventMap[N],
): void {
  if (!isActive()) return;
  try {
    gtag("event", name, { ...params, page_path: safePath() });
  } catch {
    // Best-effort.
  }
}
