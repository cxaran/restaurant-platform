"use client";

// Editor mínimo honesto: solo capacidades con API real (preview de borrador y
// publicar). Todo lo demás se marca "pendiente de API" — nada simulado.
// El preview reutiliza EXACTAMENTE el renderer del sitio público.
import "@/app/(storefront)/storefront.css";

import { useEffect, useState } from "react";

import { CapabilityGate } from "@/components/storefront/CapabilityGate";
import { SectionRenderer } from "@/components/storefront/SectionRenderer";
import { StorefrontThemeProvider } from "@/components/storefront/StorefrontThemeProvider";
import { ApiRequestError } from "@/core/api/api-error";
import { browserApi } from "@/core/api/browser-client";
import { FALLBACK_TOKENS, type StorefrontSectionVM } from "@/core/restaurant-api/view-models";

// Sin GET /storefront/pages no hay listado de entidades persistidas: este
// editor abre ÚNICAMENTE la página pública principal conocida y la selección
// de páginas queda como capacidad pendiente de API. Nada de listas de páginas
// sembradas (IDs/UUIDs) como fuente de verdad en frontend (plan §4).
const MAIN_PAGE_KEY = "home";

const PENDING_CAPABILITIES = [
  "Edición de header/footer y navegación: sin contratos header_config/footer_config.",
  "Formularios por plantilla: el backend aún no expone su JSON Schema.",
  "Reordenar con arrastre: no hay operación atómica de reorden.",
  "Programar publicación: scheduled_publish_at existe pero no hay job que publique.",
  "Enlace de preview firmado: el preview requiere permiso administrativo.",
];

type PreviewPayload = {
  page_key: string;
  revision_number: number;
  sections: StorefrontSectionVM[];
};

export function StorefrontAdminView({
  canPreview,
  canPublish,
}: Readonly<{ canPreview: boolean; canPublish: boolean }>) {
  const pageKey = MAIN_PAGE_KEY;
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(canPreview);

  // El efecto solo sincroniza con el backend: todo setState ocurre tras el
  // await (callback), nunca en el cuerpo síncrono del efecto.
  useEffect(() => {
    if (!canPreview) return;
    let active = true;
    (async () => {
      try {
        const data = await browserApi<PreviewPayload>(
          `/api/v1/storefront/pages/${encodeURIComponent(pageKey)}/preview`,
        );
        if (!active) return;
        setPreview(data);
        setError(null);
      } catch (err) {
        if (!active) return;
        setPreview(null);
        setError(
          err instanceof ApiRequestError ? err.body.message : "Error al cargar el preview.",
        );
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [pageKey, canPreview]);

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      await browserApi(`/api/v1/storefront/pages/${encodeURIComponent(pageKey)}/publish`, {
        method: "POST",
      });
      setMessage("Revisión publicada. El sitio público ya muestra esta versión.");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.body.message : "No fue posible publicar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>
          Página: portada del sitio («{MAIN_PAGE_KEY}»)
        </span>
        {canPublish ? (
          <button type="button" onClick={publish} disabled={busy} style={{ padding: "8px 16px", borderRadius: 8, fontWeight: 700 }}>
            Publicar borrador
          </button>
        ) : (
          <span style={{ fontSize: 13, opacity: 0.7 }}>Sin permiso de publicación.</span>
        )}
      </div>

      {message ? <p role="status" style={{ margin: 0, fontWeight: 600 }}>{message}</p> : null}
      {error ? <p role="alert" style={{ margin: 0, color: "#b3261e", fontWeight: 600 }}>{error}</p> : null}

      <CapabilityGate
        title="Selección de páginas del sitio"
        state={{
          kind: "missing_endpoint",
          detail:
            "No existe GET /storefront/pages: por ahora solo se edita la portada. El listado real de páginas llegará con ese contrato.",
        }}
      >
        {null}
      </CapabilityGate>

      <CapabilityGate
        title="Administración de imagen por sección"
        state={{
          kind: "missing_endpoint",
          detail: "Requiere endpoint de media Storefront aún no disponible.",
        }}
      >
        {null}
      </CapabilityGate>

      <details>
        <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
          Otras capacidades pendientes de API backend ({PENDING_CAPABILITIES.length})
        </summary>
        <ul style={{ fontSize: 13, lineHeight: 1.7 }}>
          {PENDING_CAPABILITIES.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </details>

      {!canPreview ? (
        <p style={{ margin: 0, fontSize: 14 }}>No tienes permiso para previsualizar borradores.</p>
      ) : preview ? (
        <div style={{ border: "1px solid rgba(0,0,0,0.2)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "8px 14px", fontSize: 13, background: "rgba(0,0,0,0.06)" }}>
            <span style={{ fontWeight: 700 }}>
              Vista previa de borrador · revisión #{preview.revision_number}
            </span>{" "}
            — mismo renderer que el sitio público. La visibilidad real en producción (ventanas
            por fecha, secciones ocultas) la decide el servidor.
          </div>
          <StorefrontThemeProvider tokens={FALLBACK_TOKENS} fontVars="">
            <SectionRenderer sections={preview.sections} preview />
          </StorefrontThemeProvider>
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 14, opacity: 0.7 }}>
          {busy ? "Cargando preview…" : "Sin borrador para mostrar."}
        </p>
      )}
    </div>
  );
}
