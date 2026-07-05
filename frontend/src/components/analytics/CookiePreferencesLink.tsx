"use client";

// Enlace «Cookies» del footer: reabre el aviso de consentimiento para cambiar
// la preferencia después. Solo se renderiza cuando la instalación gestiona
// consentimiento (analítica habilitada + consentimiento exigido); en cualquier
// otro caso no ocupa espacio.

import { useSyncExternalStore } from "react";

import {
  isConsentManaged,
  subscribeAnalyticsState,
} from "@/core/analytics/analytics";
import { resetConsent } from "@/core/analytics/consent";

export function CookiePreferencesLink() {
  const managed = useSyncExternalStore(
    subscribeAnalyticsState,
    () => (typeof window === "undefined" ? false : isConsentManaged()),
    () => false,
  );
  if (!managed) return null;

  return (
    <button
      type="button"
      onClick={resetConsent}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        font: "inherit",
        color: "inherit",
        textDecoration: "underline",
        cursor: "pointer",
      }}
    >
      Cookies
    </button>
  );
}
