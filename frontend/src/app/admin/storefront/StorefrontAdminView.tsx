"use client";

// Editor mínimo honesto: solo capacidades con API real (preview de borrador y
// publicar). Todo lo demás se marca "pendiente de API" — nada simulado.
// El preview reutiliza EXACTAMENTE el renderer del sitio público.
import "@/app/(storefront)/storefront.css";

import { useEffect, useState } from "react";

import { SectionRenderer } from "@/components/storefront/SectionRenderer";
import { StorefrontThemeProvider } from "@/components/storefront/StorefrontThemeProvider";
import { ApiRequestError } from "@/core/api/api-error";
import { browserApi } from "@/core/api/browser-client";
import { FALLBACK_TOKENS, type StorefrontSectionVM } from "@/core/restaurant-api/view-models";

// GET /storefront/pages ya existe: el selector usa el listado REAL del
// backend (páginas con su estado publicado/borrador); nada sembrado en código.
type PageSummary = {
  page_key: string;
  slug: string;
  published_revision_number: number | null;
  has_draft: boolean;
};

// Backend fase 1 COMPLETO (media, layout, reorder, schemas, páginas): lo que
// sigue pendiente aquí es UI del editor visual, no contratos del servidor.
const PENDING_CAPABILITIES = [
  "Editor visual de secciones/formularios desde JSON Schema: UI en el siguiente incremento (API lista).",
  "Carga de imágenes por slot y edición de navegación: UI en el siguiente incremento (API lista).",
  "Programar publicación: scheduled_publish_at existe pero no hay job backend que publique.",
  "Enlace de preview firmado: el preview requiere permiso administrativo.",
];

type PreviewSection = {
  template_key: string;
  template_version: number;
  sort_order: number;
  content_config: Record<string, unknown>;
  style_config: Record<string, unknown>;
  data_binding_config: Record<string, unknown>;
  behavior_config: Record<string, unknown>;
  media?: Record<string, StorefrontSectionVM["media"][string]>;
};

type PreviewPayload = {
  page_key: string;
  revision_number: number;
  sections: PreviewSection[];
};

/** El preview entrega claves *_config (contrato admin); el renderer usa el VM público. */
function toRendererSections(sections: PreviewSection[]): StorefrontSectionVM[] {
  return sections.map((section) => ({
    template_key: section.template_key,
    template_version: section.template_version,
    sort_order: section.sort_order,
    content: section.content_config ?? {},
    style: section.style_config ?? {},
    behavior: section.behavior_config ?? {},
    data: null, // el borrador no resuelve bindings: el preview los muestra vacíos
    media: section.media ?? {},
  }));
}

export function StorefrontAdminView({
  canPreview,
  canPublish,
}: Readonly<{ canPreview: boolean; canPublish: boolean }>) {
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [pageKey, setPageKey] = useState("home");
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(canPreview);

  useEffect(() => {
    if (!canPreview) return;
    let active = true;
    (async () => {
      try {
        const data = await browserApi<PageSummary[]>("/api/v1/storefront/pages");
        if (active) setPages(data);
      } catch {
        if (active) setPages([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [canPreview]);

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
        <label htmlFor="sf-page" style={{ fontWeight: 700, fontSize: 14 }}>Página:</label>
        <select
          id="sf-page"
          value={pageKey}
          onChange={(event) => {
            setBusy(canPreview);
            setMessage(null);
            setPageKey(event.target.value);
          }}
          style={{ padding: "8px 12px", borderRadius: 8 }}
        >
          {(pages.length > 0 ? pages : [{ page_key: "home", slug: "/", published_revision_number: null, has_draft: false }]).map((page) => (
            <option key={page.page_key} value={page.page_key}>
              {page.page_key}
              {page.published_revision_number ? ` · v${page.published_revision_number}` : " · sin publicar"}
              {page.has_draft ? " · borrador" : ""}
            </option>
          ))}
        </select>
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
            <SectionRenderer sections={toRendererSections(preview.sections)} preview />
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
