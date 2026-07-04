"use client";

// Editor visual completo del storefront: páginas reales, secciones con
// formularios generados desde el JSON Schema del backend, media por slot,
// reorden atómico, layout (header/footer) y tema por presets. El preview usa
// EXACTAMENTE el renderer del sitio público; publicar es la única vía a
// producción y la visibilidad real siempre la decide el servidor.
import "@/app/(storefront)/storefront.css";

import { useCallback, useEffect, useState } from "react";

import { CapabilityGate } from "@/components/storefront/CapabilityGate";
import { SectionRenderer } from "@/components/storefront/SectionRenderer";
import { StorefrontThemeProvider } from "@/components/storefront/StorefrontThemeProvider";
import { ApiRequestError } from "@/core/api/api-error";
import { browserApi } from "@/core/api/browser-client";
import { FALLBACK_TOKENS, type StorefrontSectionVM } from "@/core/restaurant-api/view-models";
import {
  addSection,
  applyTheme,
  createPreviewLink,
  getDraft,
  getLayout,
  getPages,
  getTemplates,
  getThemePresets,
  patchDraftMeta,
  publishPage,
  putLayout,
  schedulePublish,
  unschedulePublish,
  sortSections,
  type DraftRevision,
  type DraftSection,
  type LayoutConfig,
  type MediaSlots,
  type PageSummary,
  type PreviewLinkResult,
  type TemplateInfo,
  type ThemePreset,
} from "./editor-api";
import { SchemaForm } from "./SchemaForm";
import { SectionEditor } from "./SectionEditor";

const btn: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 8, fontWeight: 800, fontSize: 13,
  border: "1px solid rgba(0,0,0,0.3)", background: "transparent", cursor: "pointer",
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("es-MX");
}

type PreviewSection = DraftSection & { media?: MediaSlots };

function toRendererSections(sections: PreviewSection[]): StorefrontSectionVM[] {
  return sections.map((section) => ({
    template_key: section.template_key,
    template_version: section.template_version,
    sort_order: section.sort_order,
    content: section.content_config ?? {},
    style: section.style_config ?? {},
    behavior: section.behavior_config ?? {},
    data: null,
    media: (section.media ?? {}) as StorefrontSectionVM["media"],
  }));
}

export function StorefrontAdminView({
  permissions,
}: Readonly<{ permissions: string[] }>) {
  const perms = new Set(permissions);
  const canEdit = perms.has("storefront:edit");
  const canPublish = perms.has("storefront:publish");
  const canPreview = perms.has("storefront:preview") || perms.has("storefront:read_draft");
  const canPreviewLink = perms.has("storefront:preview");

  const [pages, setPages] = useState<PageSummary[]>([]);
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [pageKey, setPageKey] = useState("home");
  const [draft, setDraft] = useState<DraftRevision | null>(null);
  const [mediaBySection, setMediaBySection] = useState<Record<string, MediaSlots>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addKey, setAddKey] = useState("");
  const [view, setView] = useState<"secciones" | "layout" | "tema">("secciones");
  const [layout, setLayout] = useState<LayoutConfig | null>(null);
  const [presets, setPresets] = useState<ThemePreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [accent, setAccent] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [scheduleAt, setScheduleAt] = useState("");
  const [previewLink, setPreviewLink] = useState<PreviewLinkResult | null>(null);
  const [previewMinutes, setPreviewMinutes] = useState("");
  const refresh = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [pagesData, templatesData, layoutData, presetsData] = await Promise.all([
          getPages(),
          getTemplates(),
          perms.has("storefront:read_draft") ? getLayout() : Promise.resolve(null),
          perms.has("storefront:manage_theme") ? getThemePresets() : Promise.resolve([]),
        ]);
        if (!active) return;
        setPages(pagesData);
        setTemplates(templatesData);
        setLayout(layoutData);
        setPresets(presetsData);
        if (presetsData.length > 0) {
          setPresetName(presetsData.find((preset) => preset.is_default)?.name ?? presetsData[0].name);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof ApiRequestError ? err.body.message : "Error al cargar el editor.");
        }
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- permisos estables por sesión
  }, []);

  useEffect(() => {
    if (!canPreview) return;
    let active = true;
    (async () => {
      try {
        const [draftData, previewData, pagesData] = await Promise.all([
          getDraft(pageKey),
          browserApi<{ sections: PreviewSection[] }>(
            `/api/v1/storefront/pages/${encodeURIComponent(pageKey)}/preview`,
          ),
          // Refresca el estado real de programación tras cada acción.
          getPages(),
        ]);
        if (!active) return;
        setDraft(draftData);
        setPages(pagesData);
        const media: Record<string, MediaSlots> = {};
        for (const section of previewData.sections) {
          if (section.id && section.media) media[section.id] = section.media;
        }
        setMediaBySection(media);
        setError(null);
      } catch (err) {
        if (!active) return;
        setDraft(null);
        setError(err instanceof ApiRequestError ? err.body.message : "Error al cargar el borrador.");
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- canPreview estable
  }, [pageKey, tick]);

  async function run(action: () => Promise<unknown>, success?: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      if (success) setMessage(success);
      refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.body.message : "No fue posible.");
    } finally {
      setBusy(false);
    }
  }

  function move(sectionId: string, direction: -1 | 1) {
    if (!draft) return;
    const ordered = [...draft.sections].sort((a, b) => a.sort_order - b.sort_order);
    const index = ordered.findIndex((section) => section.id === sectionId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    // Reorden ATÓMICO: el set completo en una sola llamada transaccional.
    void run(() => sortSections(pageKey, ordered.map((section) => section.id)));
  }

  const sections = draft ? [...draft.sections].sort((a, b) => a.sort_order - b.sort_order) : [];
  const currentPage = pages.find((page) => page.page_key === pageKey) ?? null;
  const selected = sections.find((section) => section.id === selectedId) ?? null;
  const selectedTemplate = selected
    ? templates.find((template) => template.key === selected.template_key) ?? null
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label htmlFor="sf-page" style={{ fontWeight: 700, fontSize: 14 }}>Página:</label>
        <select
          id="sf-page"
          value={pageKey}
          onChange={(event) => {
            setSelectedId(null);
            setPreviewLink(null);
            setPageKey(event.target.value);
          }}
          style={{ padding: "8px 12px", borderRadius: 8 }}
        >
          {(pages.length > 0 ? pages : [{ page_key: "home", published_revision_number: null, has_draft: false } as PageSummary]).map((page) => (
            <option key={page.page_key} value={page.page_key}>
              {page.page_key}
              {page.published_revision_number ? ` · v${page.published_revision_number}` : " · sin publicar"}
              {page.has_draft ? " · borrador" : ""}
            </option>
          ))}
        </select>
        {(["secciones", "layout", "tema"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setView(option)}
            style={{ ...btn, background: view === option ? "rgba(0,0,0,0.1)" : "transparent" }}
          >
            {option[0].toUpperCase() + option.slice(1)}
          </button>
        ))}
        {canPublish ? (
          <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="datetime-local"
              aria-label="Programar publicación"
              value={scheduleAt}
              onChange={(event) => setScheduleAt(event.target.value)}
              style={{ padding: "6px 8px", borderRadius: 8 }}
            />
            <button
              type="button"
              style={btn}
              disabled={busy || !scheduleAt}
              onClick={() =>
                void run(
                  () => schedulePublish(pageKey, `${scheduleAt}:00`),
                  "Publicación programada: la ejecutará el servidor a la hora indicada.",
                )
              }
            >
              Programar
            </button>
            <button
              type="button"
              style={btn}
              disabled={busy}
              onClick={() => void run(() => unschedulePublish(pageKey), "Programación cancelada.")}
            >
              Cancelar prog.
            </button>
            <button
              type="button"
              style={btn}
              disabled={busy}
              onClick={() => {
                // Publicar invalida cualquier enlace de preview vigente.
                setPreviewLink(null);
                void run(() => publishPage(pageKey), "Revisión publicada: el sitio ya la muestra.");
              }}
            >
              Publicar ahora
            </button>
          </span>
        ) : null}
      </div>

      {/* Estado REAL de programación reportado por el backend. */}
      {currentPage?.scheduled_publish_at ? (
        <p role="status" style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>
          Programada para {formatDateTime(currentPage.scheduled_publish_at)} (la ejecuta el servidor).
        </p>
      ) : null}
      {currentPage?.schedule_cancelled_reason ? (
        <p
          role="status"
          style={{
            margin: 0, fontSize: 13, fontWeight: 800, color: "#8a4b00",
            background: "rgba(246, 185, 59, 0.18)", border: "1px solid rgba(138, 75, 0, 0.4)",
            borderRadius: 8, padding: "6px 10px",
          }}
        >
          Programación cancelada: {currentPage.schedule_cancelled_reason}
        </p>
      ) : null}

      {canPreviewLink ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            style={btn}
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const minutes = Number.parseInt(previewMinutes, 10);
                setPreviewLink(
                  await createPreviewLink(pageKey, Number.isFinite(minutes) && minutes > 0 ? minutes : undefined),
                );
              })
            }
          >
            Enlace de preview
          </button>
          <label style={{ fontSize: 12, fontWeight: 700, display: "flex", gap: 6, alignItems: "center" }}>
            Minutos
            <input
              type="number"
              min={1}
              placeholder="auto"
              value={previewMinutes}
              onChange={(event) => setPreviewMinutes(event.target.value)}
              style={{ width: 72, padding: "6px 8px", borderRadius: 8 }}
            />
          </label>
          {previewLink ? (
            <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
              <code style={{ padding: "4px 8px", background: "rgba(0,0,0,0.06)", borderRadius: 6, wordBreak: "break-all" }}>
                {`${window.location.origin}${previewLink.url}`}
              </code>
              <button
                type="button"
                style={{ ...btn, padding: "4px 10px", fontSize: 11 }}
                onClick={() =>
                  void navigator.clipboard.writeText(`${window.location.origin}${previewLink.url}`)
                }
              >
                Copiar
              </button>
              <span style={{ opacity: 0.7 }}>
                Expira {formatDateTime(previewLink.expires_at)} · rev #{previewLink.revision_number} · solo
                lectura; se invalida al publicar.
              </span>
            </span>
          ) : null}
        </div>
      ) : null}

      {message ? <p role="status" style={{ margin: 0, fontWeight: 700 }}>{message}</p> : null}
      {error ? <p role="alert" style={{ margin: 0, color: "#b3261e", fontWeight: 700 }}>{error}</p> : null}

      {view === "secciones" ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(230px, 300px) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
          <aside style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {draft ? (
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                Borrador · revisión #{draft.revision_number}
              </div>
            ) : null}
            {sections.map((section, index) => (
              <div
                key={section.id}
                style={{
                  border: `1px solid ${selectedId === section.id ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.2)"}`,
                  borderRadius: 10, padding: "8px 10px", display: "flex", gap: 6, alignItems: "center",
                }}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(section.id)}
                  style={{ flex: 1, textAlign: "left", border: "none", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 700, opacity: section.is_visible ? 1 : 0.5 }}
                >
                  {templates.find((template) => template.key === section.template_key)?.label ?? section.template_key}
                  {section.section_name ? ` · ${section.section_name}` : ""}
                </button>
                {canEdit ? (
                  <>
                    <button type="button" aria-label="Subir" disabled={busy || index === 0} onClick={() => move(section.id, -1)} style={{ ...btn, padding: "2px 8px" }}>↑</button>
                    <button type="button" aria-label="Bajar" disabled={busy || index === sections.length - 1} onClick={() => move(section.id, 1)} style={{ ...btn, padding: "2px 8px" }}>↓</button>
                  </>
                ) : null}
              </div>
            ))}
            {canEdit ? (
              <div style={{ display: "flex", gap: 6 }}>
                <select
                  aria-label="Plantilla nueva"
                  value={addKey}
                  onChange={(event) => setAddKey(event.target.value)}
                  style={{ flex: 1, padding: "7px 10px", borderRadius: 8 }}
                >
                  <option value="">Agregar sección…</option>
                  {templates.map((template) => (
                    <option key={template.key} value={template.key}>{template.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  style={btn}
                  disabled={busy || !addKey}
                  onClick={() => {
                    const template = templates.find((item) => item.key === addKey);
                    if (!template) return;
                    const maxOrder = sections.reduce((max, section) => Math.max(max, section.sort_order), 0);
                    void run(() =>
                      addSection(pageKey, {
                        template_key: template.key,
                        template_version: template.version,
                        sort_order: maxOrder + 10,
                        is_visible: true,
                        content_config: {},
                        style_config: {},
                        data_binding_config: {},
                        behavior_config: {},
                      }),
                    );
                    setAddKey("");
                  }}
                >
                  +
                </button>
              </div>
            ) : null}
            {draft && canEdit ? (
              <fieldset style={{ border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                <legend style={{ fontSize: 12, fontWeight: 800 }}>SEO de la página</legend>
                <input
                  aria-label="Título de la página"
                  placeholder="Título (title)"
                  defaultValue={draft.page_title ?? ""}
                  onBlur={(event) => void run(() => patchDraftMeta(pageKey, { page_title: event.target.value || null }))}
                  style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.25)", fontSize: 12 }}
                />
                <input
                  aria-label="Descripción meta"
                  placeholder="Meta descripción"
                  defaultValue={draft.meta_description ?? ""}
                  onBlur={(event) => void run(() => patchDraftMeta(pageKey, { meta_description: event.target.value || null }))}
                  style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.25)", fontSize: 12 }}
                />
              </fieldset>
            ) : null}
          </aside>

          <div>
            {selected && canEdit ? (
              <SectionEditor
                key={`${selected.id}-${tick}`}
                section={selected}
                template={selectedTemplate}
                media={mediaBySection[selected.id] ?? {}}
                canManageMedia={perms.has("storefront:manage_media")}
                onSaved={refresh}
                onDeleted={() => {
                  setSelectedId(null);
                  refresh();
                }}
              />
            ) : (
              <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
                {canEdit ? "Selecciona una sección para editarla." : "Sin permiso de edición: solo lectura."}
              </p>
            )}
          </div>
        </div>
      ) : null}

      {view === "layout" ? (
        layout && perms.has("storefront:manage_navigation") ? (
          <LayoutPanel layout={layout} templates={templates} busy={busy} onSave={(header, footer) =>
            void run(async () => setLayout(await putLayout(header, footer)), "Layout publicado.")
          } />
        ) : (
          <p style={{ fontSize: 13, opacity: 0.7 }}>Requiere permiso storefront:manage_navigation.</p>
        )
      ) : null}

      {view === "tema" ? (
        perms.has("storefront:manage_theme") ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <select value={presetName} onChange={(event) => setPresetName(event.target.value)} style={{ padding: "8px 12px", borderRadius: 8 }}>
              {presets.map((preset) => (
                <option key={preset.name} value={preset.name}>{preset.name}{preset.is_default ? " (base)" : ""}</option>
              ))}
            </select>
            <label style={{ fontSize: 13, fontWeight: 700, display: "flex", gap: 6, alignItems: "center" }}>
              Acento
              <input type="color" value={accent || "#F59E0B"} onChange={(event) => setAccent(event.target.value)} />
            </label>
            <button type="button" style={btn} disabled={busy || !presetName} onClick={() => void run(() => applyTheme(presetName, accent || undefined), "Tema activado.")}>
              Activar tema
            </button>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Presets neutros; la marca es configuración, no código.</span>
          </div>
        ) : (
          <p style={{ fontSize: 13, opacity: 0.7 }}>Requiere permiso storefront:manage_theme.</p>
        )
      ) : null}

      {canPreview && draft ? (
        <div style={{ border: "1px solid rgba(0,0,0,0.2)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "8px 14px", fontSize: 13, background: "rgba(0,0,0,0.06)" }}>
            <span style={{ fontWeight: 700 }}>Vista previa de borrador · revisión #{draft.revision_number}</span>{" "}
            — mismo renderer que el sitio público; los datos dinámicos y la visibilidad por fechas
            los resuelve el servidor al publicar.
          </div>
          <StorefrontThemeProvider tokens={FALLBACK_TOKENS} fontVars="">
            <SectionRenderer
              sections={toRendererSections(
                sections.map((section) => ({ ...section, media: mediaBySection[section.id] })),
              )}
              preview
            />
          </StorefrontThemeProvider>
        </div>
      ) : null}
    </div>
  );
}

// Layout: el backend SIEMPRE expone los JSON Schema de HeaderConfig/FooterConfig
// en GET /storefront/layout. Sin espejos locales: si faltara el contrato se
// informa (CapabilityGate), jamás se renderiza un esquema inventado en cliente.
function LayoutPanel({
  layout, busy, onSave,
}: Readonly<{
  layout: LayoutConfig;
  templates: TemplateInfo[];
  busy: boolean;
  onSave: (header: Record<string, unknown>, footer: Record<string, unknown>) => void;
}>) {
  const [header, setHeader] = useState(layout.header_config);
  const [footer, setFooter] = useState(layout.footer_config);
  if (!layout.header_schema || !layout.footer_schema) {
    return (
      <CapabilityGate
        title="Layout del sitio"
        state={{
          kind: "missing_endpoint",
          detail:
            "Contrato no disponible: GET /storefront/layout no devolvió header_schema/footer_schema.",
        }}
      >
        {null}
      </CapabilityGate>
    );
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, alignItems: "start" }}>
      <fieldset style={{ border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: 12 }}>
        <legend style={{ fontWeight: 800, fontSize: 13 }}>Header · navegación</legend>
        <SchemaForm schema={layout.header_schema} value={header} onChange={setHeader} />
      </fieldset>
      <fieldset style={{ border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: 12 }}>
        <legend style={{ fontWeight: 800, fontSize: 13 }}>Footer</legend>
        <SchemaForm schema={layout.footer_schema} value={footer} onChange={setFooter} />
      </fieldset>
      <div>
        <button type="button" style={btn} disabled={busy} onClick={() => onSave(header, footer)}>
          Publicar layout (v{layout.version_number ?? 0} → v{(layout.version_number ?? 0) + 1})
        </button>
        <p style={{ fontSize: 11, opacity: 0.65, marginTop: 6 }}>
          Los enlaces son CTAs controlados: el backend rechaza esquemas peligrosos.
        </p>
      </div>
    </div>
  );
}
