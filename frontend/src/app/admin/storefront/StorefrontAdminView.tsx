"use client";

// Editor visual completo del storefront: páginas reales, secciones con
// formularios generados desde el JSON Schema del backend, media por slot,
// reorden atómico, layout (header/footer) y tema por presets. El preview usa
// EXACTAMENTE el renderer del sitio público; publicar es la única vía a
// producción y la visibilidad real siempre la decide el servidor.
//
// Presentación según handoff Tony-Tony: pantalla 6a (elementos · vista previa
// · inspector) y pantalla 5a (apariencia: presets de color, acento y fuentes).
import "@/app/(storefront)/storefront.css";
import "./editor.css";

import { useCallback, useEffect, useRef, useState } from "react";

import { CapabilityGate } from "@/components/storefront/CapabilityGate";
import { SectionRenderer } from "@/components/storefront/SectionRenderer";
import { StorefrontThemeProvider } from "@/components/storefront/StorefrontThemeProvider";
import { ApiRequestError } from "@/core/api/api-error";
import { browserApi } from "@/core/api/browser-client";
import {
  FALLBACK_TOKENS,
  parseThemeTokens,
  type StorefrontSectionVM,
  type ThemeTokens,
} from "@/core/restaurant-api/view-models";
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

// Estados de revisión del backend → badge del sistema tt-*.
const REVISION_BADGES: Record<string, { className: string; label: string }> = {
  draft: { className: "tt-badge tt-badge-warn", label: "Borrador" },
  published: { className: "tt-badge tt-badge-ok", label: "Publicada" },
  archived: { className: "tt-badge tt-badge-done", label: "Archivada" },
};

// Claves de fuente autorizadas por el provider del storefront (solo etiquetas
// de presentación; la fuente real la define el preset del backend).
const FONT_LABELS: Record<string, string> = {
  display_slab: "Slab display",
  modern_sans: "Sans moderna",
  classic_serif: "Serif clásica",
  friendly_rounded: "Redondeada",
};

const VIEW_LABELS = { secciones: "Secciones", layout: "Layout", tema: "Apariencia" } as const;

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

  // El botón «Guardar» de la barra superior dispara el guardado del inspector.
  const sectionSaveRef = useRef<(() => void) | null>(null);
  const registerSectionSave = useCallback((save: (() => void) | null) => {
    sectionSaveRef.current = save;
  }, []);

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
  const revisionBadge = draft
    ? REVISION_BADGES[draft.status] ?? { className: "tt-badge tt-badge-done", label: draft.status }
    : null;

  const templateLabel = (key: string) =>
    templates.find((template) => template.key === key)?.label ?? key;

  return (
    <div className="sfe-root">
      {/* Barra superior del editor (pantalla 6a). */}
      <div className="tt-card sfe-toolbar">
        <label htmlFor="sf-page" className="tt-label">Página</label>
        <select
          id="sf-page"
          className="sfe-select"
          value={pageKey}
          onChange={(event) => {
            setSelectedId(null);
            setPreviewLink(null);
            setPageKey(event.target.value);
          }}
        >
          {(pages.length > 0 ? pages : [{ page_key: "home", published_revision_number: null, has_draft: false } as PageSummary]).map((page) => (
            <option key={page.page_key} value={page.page_key}>
              {page.page_key}
              {page.published_revision_number ? ` · v${page.published_revision_number}` : " · sin publicar"}
              {page.has_draft ? " · borrador" : ""}
            </option>
          ))}
        </select>
        {revisionBadge ? (
          <span className={revisionBadge.className}>
            {revisionBadge.label} · rev #{draft?.revision_number}
          </span>
        ) : null}
        {currentPage ? (
          currentPage.published_revision_number ? (
            <span className="tt-badge tt-badge-ok">Publicado · v{currentPage.published_revision_number}</span>
          ) : (
            <span className="tt-badge tt-badge-done">Sin publicar</span>
          )
        ) : null}
        <div className="tt-seg" role="tablist" aria-label="Vista del editor">
          {(["secciones", "layout", "tema"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={view === option}
              data-active={view === option ? "1" : "0"}
              className="tt-seg-item"
              onClick={() => setView(option)}
            >
              {VIEW_LABELS[option]}
            </button>
          ))}
        </div>
        <span className="sfe-spacer" />
        {canPublish ? (
          <>
            <input
              type="datetime-local"
              aria-label="Programar publicación"
              className="sfe-input-sm"
              value={scheduleAt}
              onChange={(event) => setScheduleAt(event.target.value)}
            />
            <button
              type="button"
              className="tt-btn tt-btn-ghost sfe-btn-sm"
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
            {currentPage?.scheduled_publish_at ? (
              <button
                type="button"
                className="tt-btn tt-btn-ghost sfe-btn-sm"
                disabled={busy}
                onClick={() => void run(() => unschedulePublish(pageKey), "Programación cancelada.")}
              >
                Cancelar prog.
              </button>
            ) : null}
          </>
        ) : null}
        {canEdit && view === "secciones" ? (
          <button
            type="button"
            className="tt-btn tt-btn-success sfe-btn-sm"
            disabled={busy || !selected}
            onClick={() => sectionSaveRef.current?.()}
          >
            Guardar
          </button>
        ) : null}
        {canPublish ? (
          <button
            type="button"
            className="tt-btn tt-btn-primary sfe-btn-sm"
            disabled={busy}
            onClick={() => {
              // Publicar invalida cualquier enlace de preview vigente.
              setPreviewLink(null);
              void run(() => publishPage(pageKey), "Revisión publicada: el sitio ya la muestra.");
            }}
          >
            Publicar
          </button>
        ) : null}
      </div>

      {/* Estado REAL de programación reportado por el backend. */}
      {currentPage?.scheduled_publish_at ? (
        <p role="status" className="sfe-note">
          Programada para {formatDateTime(currentPage.scheduled_publish_at)} (la ejecuta el servidor).
        </p>
      ) : null}
      {currentPage?.schedule_cancelled_reason ? (
        <p role="status" className="sfe-note">
          Programación cancelada: {currentPage.schedule_cancelled_reason}
        </p>
      ) : null}

      {canPreviewLink ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className="tt-btn tt-btn-ghost sfe-btn-sm"
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
            Vista previa completa
          </button>
          <label style={{ fontSize: 12, fontWeight: 700, display: "flex", gap: 6, alignItems: "center" }}>
            Minutos
            <input
              type="number"
              min={1}
              placeholder="auto"
              className="sfe-input-sm"
              value={previewMinutes}
              onChange={(event) => setPreviewMinutes(event.target.value)}
              style={{ width: 72 }}
            />
          </label>
          {previewLink ? (
            <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
              <code className="sfe-code">{`${window.location.origin}${previewLink.url}`}</code>
              <button
                type="button"
                className="tt-btn tt-btn-ghost"
                style={{ padding: "4px 10px", fontSize: 11 }}
                onClick={() =>
                  void navigator.clipboard.writeText(`${window.location.origin}${previewLink.url}`)
                }
              >
                Copiar
              </button>
              <span style={{ color: "var(--tx3)" }}>
                Expira {formatDateTime(previewLink.expires_at)} · rev #{previewLink.revision_number} · solo
                lectura; se invalida al publicar.
              </span>
            </span>
          ) : null}
        </div>
      ) : null}

      {message ? <p role="status" className="sfe-note sfe-note-ok">{message}</p> : null}
      {error ? <p role="alert" className="sfe-note sfe-note-danger">{error}</p> : null}

      {view === "secciones" ? (
        <div className="sfe-grid">
          {/* Columna izquierda: elementos de la página (6a). */}
          <aside className="sfe-col" aria-label="Elementos de la página">
            <span className="tt-label" style={{ padding: "0 4px" }}>Elementos de la página</span>
            {sections.map((section, index) => (
              <div
                key={section.id}
                className="sfe-el"
                data-active={selectedId === section.id ? "1" : "0"}
                data-hidden={section.is_visible ? "0" : "1"}
              >
                <span className="sfe-el-grip" aria-hidden>⠿</span>
                <button type="button" className="sfe-el-main" onClick={() => setSelectedId(section.id)}>
                  <span className="sfe-el-name">
                    {section.section_name ?? templateLabel(section.template_key)}
                  </span>
                  <span className="sfe-el-sub">
                    {section.is_visible ? `Plantilla: ${templateLabel(section.template_key)}` : "Oculto"}
                  </span>
                </button>
                {canEdit ? (
                  <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <button
                      type="button"
                      className="sfe-icon-btn"
                      aria-label="Subir"
                      disabled={busy || index === 0}
                      onClick={() => move(section.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="sfe-icon-btn"
                      aria-label="Bajar"
                      disabled={busy || index === sections.length - 1}
                      onClick={() => move(section.id, 1)}
                    >
                      ↓
                    </button>
                  </span>
                ) : null}
              </div>
            ))}
            {canEdit ? (
              <div style={{ display: "flex", gap: 6 }}>
                <select
                  aria-label="Plantilla nueva"
                  className="sfe-select"
                  style={{ flex: 1, minWidth: 0 }}
                  value={addKey}
                  onChange={(event) => setAddKey(event.target.value)}
                >
                  <option value="">Plantilla…</option>
                  {templates.map((template) => (
                    <option key={template.key} value={template.key}>{template.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="sfe-dashed"
                  style={{ padding: "8px 12px", whiteSpace: "nowrap" }}
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
                  + Agregar
                </button>
              </div>
            ) : null}
            {draft && canEdit ? (
              <div className="tt-card sfe-form" style={{ padding: "12px 14px" }}>
                <span className="tt-label">SEO de la página</span>
                <div className="sfe-field">
                  <label className="sfe-flabel" htmlFor="sfe-seo-title">Título (title)</label>
                  <input
                    id="sfe-seo-title"
                    className="tt-input"
                    placeholder="Título de la página"
                    defaultValue={draft.page_title ?? ""}
                    onBlur={(event) => void run(() => patchDraftMeta(pageKey, { page_title: event.target.value || null }))}
                  />
                </div>
                <div className="sfe-field">
                  <label className="sfe-flabel" htmlFor="sfe-seo-desc">Meta descripción</label>
                  <input
                    id="sfe-seo-desc"
                    className="tt-input"
                    placeholder="Descripción para buscadores"
                    defaultValue={draft.meta_description ?? ""}
                    onBlur={(event) => void run(() => patchDraftMeta(pageKey, { meta_description: event.target.value || null }))}
                  />
                </div>
              </div>
            ) : null}
            <p className="sfe-note" style={{ marginTop: 4 }}>
              Cada elemento usa una plantilla definida: eliges la plantilla y solo ajustas
              textos, colores e imágenes.
            </p>
          </aside>

          {/* Centro: vista previa con el renderer real del sitio. */}
          <section className="sfe-col" aria-label="Vista previa">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="tt-label">Vista previa · {pageKey}</span>
              {draft ? (
                <span style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 700 }}>
                  Borrador · revisión #{draft.revision_number}
                </span>
              ) : null}
            </div>
            {canPreview && draft ? (
              <div className="sfe-preview-frame">
                <StorefrontThemeProvider tokens={FALLBACK_TOKENS} fontVars="">
                  <SectionRenderer
                    sections={toRendererSections(
                      sections.map((section) => ({ ...section, media: mediaBySection[section.id] })),
                    )}
                    preview
                  />
                </StorefrontThemeProvider>
              </div>
            ) : (
              <div className="tt-card" style={{ padding: 18, fontSize: 13, color: "var(--tx3)" }}>
                {canPreview ? "Sin borrador que previsualizar." : "Sin permiso de preview."}
              </div>
            )}
            <p style={{ margin: 0, fontSize: 11, color: "var(--tx3)" }}>
              Mismo renderer que el sitio público; los datos dinámicos y la visibilidad por
              fechas los resuelve el servidor al publicar.
            </p>
          </section>

          {/* Columna derecha: inspector de la sección seleccionada. */}
          <aside className="sfe-col sfe-inspector-col">
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
                onRegisterSave={registerSectionSave}
              />
            ) : (
              <div className="tt-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="tt-label">Configurando</span>
                <p style={{ margin: 0, fontSize: 13, color: "var(--tx2)" }}>
                  {canEdit
                    ? "Selecciona un elemento de la lista para ajustar su plantilla, textos, colores e imágenes."
                    : "Sin permiso de edición: solo lectura."}
                </p>
              </div>
            )}
          </aside>
        </div>
      ) : null}

      {view === "layout" ? (
        layout && perms.has("storefront:manage_navigation") ? (
          <LayoutPanel layout={layout} templates={templates} busy={busy} onSave={(header, footer) =>
            void run(async () => setLayout(await putLayout(header, footer)), "Layout publicado.")
          } />
        ) : (
          <div className="tt-card" style={{ padding: "16px 18px", fontSize: 13, color: "var(--tx3)" }}>
            Requiere permiso storefront:manage_navigation.
          </div>
        )
      ) : null}

      {view === "tema" ? (
        perms.has("storefront:manage_theme") ? (
          <ThemePanel
            presets={presets}
            presetName={presetName}
            onPresetName={setPresetName}
            accent={accent}
            onAccent={setAccent}
            busy={busy}
            onApply={() => void run(() => applyTheme(presetName, accent || undefined), "Tema activado.")}
            previewSections={
              canPreview && draft
                ? toRendererSections(
                    sections.map((section) => ({ ...section, media: mediaBySection[section.id] })),
                  )
                : null
            }
          />
        ) : (
          <div className="tt-card" style={{ padding: "16px 18px", fontSize: 13, color: "var(--tx3)" }}>
            Requiere permiso storefront:manage_theme.
          </div>
        )
      ) : null}
    </div>
  );
}

// Apariencia del sitio (pantalla 5a): presets como tarjetas de swatches,
// acento como círculos y fuentes como chips. Mismos controles de siempre
// (preset + acento → POST /storefront/theme); solo cambia la presentación.
function ThemePanel({
  presets, presetName, onPresetName, accent, onAccent, busy, onApply, previewSections,
}: Readonly<{
  presets: ThemePreset[];
  presetName: string;
  onPresetName: (name: string) => void;
  accent: string;
  onAccent: (value: string) => void;
  busy: boolean;
  onApply: () => void;
  previewSections: StorefrontSectionVM[] | null;
}>) {
  const parsedByName = new Map<string, ThemeTokens | null>(
    presets.map((preset) => [preset.name, parseThemeTokens(preset.tokens)]),
  );
  const selectedTokens = parsedByName.get(presetName) ?? null;
  const effectiveAccent = accent || selectedTokens?.colors.accent || "";

  const accentOptions = Array.from(
    new Set(
      presets
        .map((preset) => parsedByName.get(preset.name)?.colors.accent)
        .filter((color): color is string => Boolean(color)),
    ),
  );
  const fontOptions = Array.from(
    new Set(
      presets
        .map((preset) => parsedByName.get(preset.name)?.typography.font_family_key)
        .filter((key): key is string => Boolean(key)),
    ),
  );

  const previewTokens: ThemeTokens = selectedTokens
    ? {
        ...selectedTokens,
        colors: {
          ...selectedTokens.colors,
          ...(effectiveAccent ? { accent: effectiveAccent } : {}),
        },
      }
    : FALLBACK_TOKENS;

  const barsFor = (name: string): string[] => {
    const colors = parsedByName.get(name)?.colors ?? {};
    const preferred = [colors.brand_primary, colors.brand_secondary, colors.surface]
      .filter((color): color is string => Boolean(color));
    return preferred.length === 3 ? preferred : Object.values(colors).slice(0, 3);
  };

  return (
    <div className="sfe-theme-grid">
      <section
        className="tt-card"
        style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}
        aria-label="Colores del sitio"
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 15 }}>Colores del sitio</strong>
          <span style={{ fontSize: 11, color: "var(--tx3)" }}>se aplican a botones, barras y acentos</span>
        </div>
        <div className="sfe-preset-row">
          {presets.map((preset) => (
            <button
              key={preset.name}
              type="button"
              className="sfe-preset"
              data-active={presetName === preset.name ? "1" : "0"}
              onClick={() => onPresetName(preset.name)}
            >
              <span className="sfe-preset-bars">
                {barsFor(preset.name).map((color, index) => (
                  <span key={index} className="sfe-preset-bar" style={{ background: color }} />
                ))}
              </span>
              <span>
                {preset.name}
                {preset.is_default ? " (base)" : ""}
                {presetName === preset.name ? " ✓" : ""}
              </span>
            </button>
          ))}
          {presets.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: "var(--tx3)" }}>Sin presets disponibles.</p>
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          <span className="tt-label">Acento</span>
          {accentOptions.map((color) => (
            <button
              key={color}
              type="button"
              className="sfe-swatch"
              style={{ background: color }}
              aria-label={`Acento ${color}`}
              data-active={effectiveAccent.toLowerCase() === color.toLowerCase() ? "1" : "0"}
              onClick={() => onAccent(color)}
            />
          ))}
          <input
            type="color"
            className="sfe-swatch-custom"
            aria-label="Acento personalizado"
            value={/^#[0-9a-fA-F]{6}$/.test(effectiveAccent) ? effectiveAccent : "#c1272d"}
            onChange={(event) => onAccent(event.target.value)}
          />
          {accent ? (
            <button
              type="button"
              className="sfe-link-danger"
              onClick={() => onAccent("")}
            >
              usar el del preset
            </button>
          ) : null}
        </div>
        {fontOptions.length > 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="tt-label">Fuente</span>
            {fontOptions.map((key) => (
              <span
                key={key}
                className="tt-chip"
                data-active={selectedTokens?.typography.font_family_key === key ? "1" : "0"}
                style={{ cursor: "default" }}
              >
                {FONT_LABELS[key] ?? key}
              </span>
            ))}
            <span style={{ fontSize: 11, color: "var(--tx3)" }}>la fuente la define el preset</span>
          </div>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <button
            type="button"
            className="tt-btn tt-btn-primary sfe-btn-sm"
            disabled={busy || !presetName}
            onClick={onApply}
          >
            Activar tema
          </button>
          <span style={{ fontSize: 11, color: "var(--tx3)" }}>
            Presets neutros; la marca es configuración, no código.
          </span>
        </div>
      </section>

      <section className="sfe-col" aria-label="Vista previa en vivo">
        <span className="tt-label">Vista previa en vivo</span>
        {previewSections ? (
          <div className="sfe-preview-frame">
            <StorefrontThemeProvider tokens={previewTokens} fontVars="">
              <SectionRenderer sections={previewSections} preview />
            </StorefrontThemeProvider>
          </div>
        ) : (
          <div className="tt-card" style={{ padding: 18, fontSize: 13, color: "var(--tx3)" }}>
            Sin borrador que previsualizar.
          </div>
        )}
        <p className="sfe-note">
          La vista usa el preset y acento seleccionados; el sitio público solo cambia al
          pulsar «Activar tema».
        </p>
      </section>
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
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, alignItems: "start" }}>
      <section className="tt-card sfe-form" style={{ padding: "16px 18px" }}>
        <span className="tt-label">Header · navegación</span>
        <SchemaForm schema={layout.header_schema} value={header} onChange={setHeader} />
      </section>
      <section className="tt-card sfe-form" style={{ padding: "16px 18px" }}>
        <span className="tt-label">Footer</span>
        <SchemaForm schema={layout.footer_schema} value={footer} onChange={setFooter} />
      </section>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <button
          type="button"
          className="tt-btn tt-btn-primary sfe-btn-sm"
          style={{ alignSelf: "flex-start" }}
          disabled={busy}
          onClick={() => onSave(header, footer)}
        >
          Publicar layout (v{layout.version_number ?? 0} → v{(layout.version_number ?? 0) + 1})
        </button>
        <p style={{ fontSize: 11, color: "var(--tx3)", margin: 0 }}>
          Los enlaces son CTAs controlados: el backend rechaza esquemas peligrosos.
        </p>
      </div>
    </div>
  );
}
