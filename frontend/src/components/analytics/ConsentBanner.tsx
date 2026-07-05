"use client";

// Aviso de cookies ANALÍTICAS con control real: hasta aceptar no se carga
// Google Analytics ni se envía ningún evento (lo garantiza el adaptador, no
// este banner). Aceptar inicia la medición sin recargar; rechazar la deja
// apagada. El enlace «Cookies» del footer reabre este aviso para cambiar la
// preferencia. Solo aparece cuando la instalación exige consentimiento.

import Link from "next/link";
import { useSyncExternalStore } from "react";

import {
  denyConsent,
  grantConsent,
  isConsentManaged,
  subscribeAnalyticsState,
} from "@/core/analytics/analytics";
import { readConsent } from "@/core/analytics/consent";

function getSnapshot(): string {
  if (typeof window === "undefined") return "hidden";
  return isConsentManaged() && readConsent() === "unset" ? "visible" : "hidden";
}

export function ConsentBanner() {
  // SSR siempre "hidden": el banner aparece tras hidratar, cuando el estado
  // real (localStorage) es legible — sin parpadeo para quien ya decidió.
  const visibility = useSyncExternalStore(
    subscribeAnalyticsState,
    getSnapshot,
    () => "hidden",
  );
  if (visibility !== "visible") return null;

  return (
    <div
      role="region"
      aria-label="Aviso de cookies"
      className="sf-card"
      style={{
        position: "fixed",
        insetInline: 16,
        bottom: 16,
        zIndex: 60,
        maxWidth: 560,
        marginInline: "auto",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        boxShadow: "0 8px 30px rgba(0,0,0,0.18)",
      }}
    >
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
        Usamos cookies analíticas para entender cómo se usa el sitio y
        mejorarlo. Solo se activan si las aceptas; la cookie de sesión es
        necesaria y no depende de esta elección. Más detalles en los{" "}
        <Link href="/terminos" style={{ fontWeight: 700, textDecoration: "underline" }}>
          Términos y el Aviso de Privacidad
        </Link>
        .
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          className="sf-btn"
          style={{ padding: "8px 18px", fontSize: 13 }}
          onClick={grantConsent}
          data-testid="consent-accept"
        >
          Aceptar
        </button>
        <button
          type="button"
          className="sf-chip"
          style={{ padding: "8px 18px", fontSize: 13 }}
          onClick={denyConsent}
          data-testid="consent-reject"
        >
          Rechazar
        </button>
      </div>
    </div>
  );
}
