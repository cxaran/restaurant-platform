"use client";

// Editor PLANO del sitio: 4 pestañas (Heros · Destacados · Footer ·
// Apariencia). Guardar es publicar — sin borradores, revisiones ni
// programación; el único gate es `is_active`. La vista previa usa EXACTAMENTE
// los componentes del sitio público (HeroCarousel/HighlightBanner/
// StorefrontFooter) con los tokens del tema activo.
import "@/app/(storefront)/storefront.css";
import "./editor.css";

import { useCallback, useEffect, useRef, useState } from "react";

import { HeroCarousel } from "@/components/storefront/HeroCarousel";
import { HighlightBanner, variantForSurface } from "@/components/storefront/Highlights";
import { StorefrontFooter } from "@/components/storefront/StorefrontFooter";
import { StorefrontThemeProvider } from "@/components/storefront/StorefrontThemeProvider";
import { ApiRequestError } from "@/core/api/api-error";
import {
  FALLBACK_TOKENS,
  parseThemeTokens,
  toHighlightVM,
  type FooterVM,
  type HeroVM,
  type ThemeTokens,
} from "@/core/restaurant-api/view-models";
import {
  createHero,
  createHighlight,
  deleteHero,
  deleteHighlight,
  getConfig,
  patchFooter,
  patchSettings,
  patchTheme,
  sortHeros,
  updateHero,
  updateHighlight,
  uploadImage,
  type Cta,
  type HeroRead,
  type HeroWrite,
  type HighlightRead,
  type HighlightWrite,
  type SocialLink,
  type StorefrontConfig,
} from "./editor-api";

const VIEWS = ["heros", "destacados", "footer", "apariencia"] as const;
type View = (typeof VIEWS)[number];
const VIEW_LABELS: Record<View, string> = {
  heros: "Heros",
  destacados: "Destacados",
  footer: "Footer",
  apariencia: "Apariencia",
};

const HERO_TEMPLATES = [
  { value: "split", label: "Split · texto + imagen" },
  { value: "background", label: "Background · imagen completa" },
  { value: "card", label: "Card · imagen enmarcada" },
  { value: "showcase", label: "Showcase · producto estrella" },
  { value: "minimal", label: "Minimal · anuncio limpio" },
] as const;

const SURFACES = [
  { value: "global", label: "Global · cinta superior" },
  { value: "home", label: "Home · franja bajo el hero" },
  { value: "login", label: "Login · sobre el formulario" },
  { value: "register", label: "Registro · sobre el formulario" },
  { value: "cart", label: "Carrito · nudge superior" },
  { value: "checkout", label: "Checkout · chips de confianza" },
  { value: "account", label: "Cuenta · tarjeta de aviso" },
] as const;

const ANIMATIONS = ["none", "fade_in", "slide_down", "rise", "pulse", "shimmer", "marquee"] as const;
const LINK_TYPES = [
  "menu_page", "credits_page", "internal_route", "anchor", "product",
  "category", "whatsapp", "phone", "external_https",
] as const;
const NETWORKS = ["facebook", "instagram", "tiktok", "whatsapp", "youtube", "x"] as const;

// ---------------------------------------------------------------------------
// Conversores read → write / read → VM de preview
// ---------------------------------------------------------------------------

function heroToWrite(hero: HeroRead): HeroWrite {
  return {
    template: hero.template as HeroWrite["template"],
    is_active: hero.is_active,
    sort_order: hero.sort_order,
    eyebrow: hero.eyebrow ?? null,
    title: hero.title,
    title_accent: hero.title_accent ?? null,
    description: hero.description ?? null,
    primary_cta: (hero.primary_cta as Cta | null) ?? null,
    secondary_cta: (hero.secondary_cta as Cta | null) ?? null,
    product_id: hero.product_id ?? null,
    desktop_file_id: hero.desktop_file_id ?? null,
    mobile_file_id: hero.mobile_file_id ?? null,
    image_alt: hero.image_alt ?? null,
    focal_x: hero.focal_x ?? null,
    focal_y: hero.focal_y ?? null,
    height: hero.height as HeroWrite["height"],
    alignment: hero.alignment as HeroWrite["alignment"],
    color_scheme: hero.color_scheme as HeroWrite["color_scheme"],
    button_variant: hero.button_variant as HeroWrite["button_variant"],
    overlay: hero.overlay as HeroWrite["overlay"],
    image_position: hero.image_position as HeroWrite["image_position"],
  };
}

function heroWriteToVM(id: string, hero: HeroWrite): HeroVM {
  return {
    id,
    template: hero.template ?? "split",
    eyebrow: hero.eyebrow ?? null,
    title: hero.title || "Título del hero",
    title_accent: hero.title_accent ?? null,
    description: hero.description ?? null,
    primary_cta: hero.primary_cta ?? null,
    secondary_cta: hero.secondary_cta ?? null,
    product: null, // el binding real (precio/stock) lo resuelve el backend
    image: {
      desktop_file_id: hero.desktop_file_id ?? null,
      mobile_file_id: hero.mobile_file_id ?? null,
      alt_text: hero.image_alt ?? null,
      focal_x: hero.focal_x ?? null,
      focal_y: hero.focal_y ?? null,
    },
    height: hero.height ?? "regular",
    alignment: hero.alignment ?? "left",
    color_scheme: hero.color_scheme ?? "surface",
    button_variant: hero.button_variant ?? "solid",
    overlay: hero.overlay ?? "soft",
    image_position: hero.image_position ?? "right",
  };
}

function highlightToWrite(row: HighlightRead): HighlightWrite {
  return {
    surface: row.surface as HighlightWrite["surface"],
    is_active: row.is_active,
    sort_order: row.sort_order,
    icon: row.icon ?? null,
    eyebrow: row.eyebrow ?? null,
    title: row.title,
    subtitle: row.subtitle ?? null,
    cta: (row.cta as Cta | null) ?? null,
    animation: row.animation as HighlightWrite["animation"],
    color_scheme: row.color_scheme as HighlightWrite["color_scheme"],
    starts_at: row.starts_at ?? null,
    ends_at: row.ends_at ?? null,
  };
}

// Texto de error de una mutación. Un 422 de validación trae el motivo concreto
// en ``errors[]`` (p. ej. "La plantilla «showcase» requiere elegir un producto")
// mientras que ``message`` es genérico ("Parámetros inválidos"): se muestran los
// detalles cuando existen para que el usuario sepa QUÉ corregir.
function mutationErrorText(err: unknown): string {
  if (err instanceof ApiRequestError) {
    const details = (err.body.errors ?? [])
      .map((item) => item.message)
      .filter((message): message is string => Boolean(message));
    return details.length > 0 ? details.join(" · ") : err.body.message;
  }
  return "No fue posible.";
}

const EMPTY_HERO: HeroWrite = {
  template: "split",
  is_active: true,
  sort_order: 0,
  title: "",
  height: "regular",
  alignment: "left",
  color_scheme: "surface",
  button_variant: "solid",
  overlay: "soft",
  image_position: "right",
};

const EMPTY_HIGHLIGHT: HighlightWrite = {
  surface: "home",
  is_active: true,
  sort_order: 0,
  title: "",
  animation: "fade_in",
  color_scheme: "brand",
};

// ---------------------------------------------------------------------------
// Piezas de formulario
// ---------------------------------------------------------------------------

function Field({
  label,
  children,
}: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="sfe-field">
      <span className="sfe-flabel">{label}</span>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  maxLength,
}: Readonly<{
  value: string | null | undefined;
  onChange: (next: string | null) => void;
  placeholder?: string;
  maxLength?: number;
}>) {
  return (
    <input
      className="tt-input"
      value={value ?? ""}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(event) => onChange(event.target.value || null)}
    />
  );
}

function SelectInput<T extends string>({
  value,
  options,
  onChange,
}: Readonly<{
  value: T;
  options: readonly { value: T; label: string }[] | readonly T[];
  onChange: (next: T) => void;
}>) {
  return (
    <select
      className="sfe-select"
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
    >
      {options.map((option) =>
        typeof option === "string" ? (
          <option key={option} value={option}>{option}</option>
        ) : (
          <option key={option.value} value={option.value}>{option.label}</option>
        ),
      )}
    </select>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: Readonly<{ label: string; checked: boolean; onChange: (next: boolean) => void }>) {
  return (
    <label className="sfe-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

/** Imagen del hero capturada DESDE el formulario: el archivo se sube al banco
 * (validación por contenido en backend, SVG bloqueado) y el hero guarda su id.
 * Subir una nueva REEMPLAZA la referencia al guardar; «quitar» la limpia. */
function ImageUploadField({
  label,
  value,
  onChange,
}: Readonly<{
  label: string;
  value: string | null | undefined;
  onChange: (next: string | null) => void;
}>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const stored = await uploadImage(file);
      onChange(stored.id);
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.body.message : "No fue posible subir la imagen.",
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="sfe-field">
      <span className="sfe-flabel">{label}</span>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- archivo del banco servido por el backend
          <img
            src={`/api/v1/files/${value}`}
            alt=""
            style={{
              width: 54, height: 40, objectFit: "cover", borderRadius: 8,
              border: "1px solid var(--border)", flexShrink: 0, background: "var(--panel2)",
            }}
          />
        ) : (
          <span
            aria-hidden
            style={{
              width: 54, height: 40, borderRadius: 8, border: "1px dashed var(--border2)",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, color: "var(--tx3)", flexShrink: 0,
            }}
          >
            🖼
          </span>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label={label}
            disabled={busy}
            style={{ fontSize: 12, maxWidth: 210 }}
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {busy ? (
              <span style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 700 }}>Subiendo…</span>
            ) : value ? (
              <button type="button" className="sfe-link-danger" onClick={() => onChange(null)}>
                quitar imagen
              </button>
            ) : (
              <span style={{ fontSize: 11, color: "var(--tx3)" }}>png · jpg · webp</span>
            )}
          </div>
        </div>
      </div>
      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "var(--danger, #b3261e)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Editor de un CTA controlado (enlaces seguros; el backend revalida). */
function CtaEditor({
  label,
  value,
  onChange,
}: Readonly<{ label: string; value: Cta | null | undefined; onChange: (next: Cta | null) => void }>) {
  const cta = value ?? null;
  return (
    <div className="sfe-group">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="sfe-flabel">{label}</span>
        {cta ? (
          <button type="button" className="sfe-link-danger" onClick={() => onChange(null)}>
            quitar
          </button>
        ) : (
          <button
            type="button"
            className="sfe-link-danger"
            style={{ color: "var(--accent-tx, inherit)" }}
            onClick={() => onChange({ label: "Ver menú", link_type: "menu_page" })}
          >
            + agregar
          </button>
        )}
      </div>
      {cta ? (
        <>
          <Field label="Texto del botón">
            <TextInput value={cta.label} maxLength={60} onChange={(next) => onChange({ ...cta, label: next ?? "" })} />
          </Field>
          <Field label="Tipo de enlace">
            <SelectInput
              value={(cta.link_type ?? "menu_page") as (typeof LINK_TYPES)[number]}
              options={LINK_TYPES}
              onChange={(next) => onChange({ ...cta, link_type: next })}
            />
          </Field>
          {["internal_route", "anchor", "product", "category", "whatsapp", "phone", "external_https"].includes(
            cta.link_type,
          ) ? (
            <Field label="Destino (target)">
              <TextInput
                value={cta.target ?? null}
                maxLength={300}
                placeholder={cta.link_type === "external_https" ? "https://…" : ""}
                onChange={(next) => onChange({ ...cta, target: next })}
              />
            </Field>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vista principal
// ---------------------------------------------------------------------------

export function StorefrontAdminView({
  permissions,
}: Readonly<{ permissions: string[] }>) {
  const perms = new Set(permissions);
  const canEdit = perms.has("storefront:edit");
  const canTheme = perms.has("storefront:manage_theme");

  const [config, setConfig] = useState<StorefrontConfig | null>(null);
  const [view, setView] = useState<View>("heros");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await getConfig();
        if (active) {
          setConfig(data);
          setError(null);
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
  }, [tick]);

  async function run(action: () => Promise<unknown>, success?: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      if (success) setMessage(success);
      refresh();
    } catch (err) {
      setError(mutationErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  const tokens: ThemeTokens =
    (config ? parseThemeTokens(config.active_theme_tokens) : null) ?? FALLBACK_TOKENS;

  return (
    <div className="sfe-root">
      <div className="tt-card sfe-toolbar">
        <div className="tt-seg" role="tablist" aria-label="Sección del editor">
          {VIEWS.map((option) => (
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
        <span style={{ fontSize: 12, color: "var(--tx3)", fontWeight: 700 }}>
          Guardar publica al instante · el único apagador es «activo»
        </span>
      </div>

      {message ? <p role="status" className="sfe-note sfe-note-ok">{message}</p> : null}
      {error ? <p role="alert" className="sfe-note sfe-note-danger">{error}</p> : null}

      {!config ? (
        <div className="tt-card" style={{ padding: 18, fontSize: 13, color: "var(--tx3)" }}>
          Cargando configuración del sitio…
        </div>
      ) : view === "heros" ? (
        <HerosTab config={config} tokens={tokens} canEdit={canEdit} busy={busy} run={run} />
      ) : view === "destacados" ? (
        <HighlightsTab config={config} tokens={tokens} canEdit={canEdit} busy={busy} run={run} />
      ) : view === "footer" ? (
        <FooterTab config={config} tokens={tokens} canEdit={canEdit} busy={busy} run={run} />
      ) : (
        <ThemeTab config={config} canTheme={canTheme} busy={busy} run={run} />
      )}
    </div>
  );
}

type TabProps = Readonly<{
  config: StorefrontConfig;
  tokens: ThemeTokens;
  canEdit: boolean;
  busy: boolean;
  run: (action: () => Promise<unknown>, success?: string) => Promise<void>;
}>;

// ---------------------------------------------------------------------------
// Pestaña Heros
// ---------------------------------------------------------------------------

function HerosTab({ config, tokens, canEdit, busy, run }: TabProps) {
  const heros = config.heros ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<HeroWrite | null>(null);
  const [isNew, setIsNew] = useState(false);

  const selected = heros.find((hero) => hero.id === selectedId) ?? null;

  // Deriva el formulario de la selección DURANTE el render (patrón React de
  // «adjust state while rendering»): sin efectos ni renders en cascada.
  const [synced, setSynced] = useState<{ sel: string | null; cfg: StorefrontConfig } | null>(null);
  if (!synced || synced.sel !== selectedId || synced.cfg !== config) {
    setSynced({ sel: selectedId, cfg: config });
    if (selected) {
      setForm(heroToWrite(selected));
      setIsNew(false);
    } else if (!isNew) {
      setForm(null);
    }
  }

  function startNew() {
    const maxOrder = heros.reduce((max, hero) => Math.max(max, hero.sort_order), 0);
    setSelectedId(null);
    setIsNew(true);
    setForm({ ...EMPTY_HERO, sort_order: maxOrder + 10 });
  }

  function move(id: string, direction: -1 | 1) {
    const ordered = [...heros].sort((a, b) => a.sort_order - b.sort_order).map((hero) => hero.id);
    const index = ordered.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    void run(() => sortHeros(ordered));
  }

  const previewHeros: HeroVM[] = (
    form
      ? [
          ...heros.filter((hero) => hero.id !== selectedId).map((hero) => heroWriteToVM(hero.id, heroToWrite(hero))),
          heroWriteToVM(selectedId ?? "nuevo", form),
        ]
      : heros.map((hero) => heroWriteToVM(hero.id, heroToWrite(hero)))
  ).filter((hero, index) => (form ? true : heros[index]?.is_active !== false));

  const set = (patch: Partial<HeroWrite>) => setForm((prev) => (prev ? { ...prev, ...patch } : prev));

  return (
    <div className="sfe-grid">
      <aside className="sfe-col" aria-label="Heros de la portada">
        <span className="tt-label" style={{ padding: "0 4px" }}>
          Heros · rotan en carrusel
        </span>
        {[...heros].sort((a, b) => a.sort_order - b.sort_order).map((hero, index, list) => (
          <div key={hero.id} className="sfe-el" data-active={selectedId === hero.id ? "1" : "0"} data-hidden={hero.is_active ? "0" : "1"}>
            <span className="sfe-el-grip" aria-hidden>⠿</span>
            <button type="button" className="sfe-el-main" onClick={() => { setIsNew(false); setSelectedId(hero.id); }}>
              <span className="sfe-el-name">{hero.title}</span>
              <span className="sfe-el-sub">
                {HERO_TEMPLATES.find((item) => item.value === hero.template)?.label ?? hero.template}
                {hero.is_active ? "" : " · apagado"}
              </span>
            </button>
            {canEdit ? (
              <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <button type="button" className="sfe-icon-btn" aria-label="Subir" disabled={busy || index === 0} onClick={() => move(hero.id, -1)}>↑</button>
                <button type="button" className="sfe-icon-btn" aria-label="Bajar" disabled={busy || index === list.length - 1} onClick={() => move(hero.id, 1)}>↓</button>
              </span>
            ) : null}
          </div>
        ))}
        {canEdit ? (
          <button type="button" className="sfe-dashed" style={{ padding: "10px 12px" }} disabled={busy} onClick={startNew}>
            + Nuevo hero
          </button>
        ) : null}
        <p className="sfe-note" style={{ marginTop: 4 }}>
          Cada hero usa una plantilla fija (split, background, card, showcase o minimal);
          el showcase vincula un producto REAL: precio y disponibilidad siempre al día.
        </p>
      </aside>

      <section className="sfe-col" aria-label="Vista previa">
        <span className="tt-label">Vista previa · portada</span>
        <div className="sfe-preview-frame">
          <StorefrontThemeProvider tokens={tokens} fontVars="">
            {previewHeros.length > 0 ? (
              <HeroCarousel
                heros={previewHeros}
                carousel={{
                  autoplay: false,
                  interval_seconds: config.settings.hero_interval_seconds,
                  transition: config.settings.hero_transition,
                  show_arrows: true,
                  show_dots: true,
                }}
                preview
              />
            ) : (
              <div style={{ padding: 24, fontSize: 13 }}>Sin heros todavía.</div>
            )}
          </StorefrontThemeProvider>
        </div>
        <p style={{ margin: 0, fontSize: 11, color: "var(--tx3)" }}>
          Mismo renderer del sitio público. El precio del showcase lo resuelve el servidor.
        </p>
      </section>

      <aside className="sfe-col sfe-inspector-col">
        {form && canEdit ? (
          <div className="tt-card sfe-form" style={{ padding: "14px 16px" }}>
            <span className="tt-label">{isNew ? "Nuevo hero" : "Editar hero"}</span>
            <Field label="Plantilla">
              <SelectInput
                value={form.template ?? "split"}
                options={HERO_TEMPLATES}
                onChange={(next) => set({ template: next })}
              />
            </Field>
            <Field label="Antetítulo (eyebrow)">
              <TextInput value={form.eyebrow} maxLength={60} onChange={(next) => set({ eyebrow: next })} />
            </Field>
            <Field label="Título">
              <TextInput value={form.title} maxLength={120} onChange={(next) => set({ title: next ?? "" })} />
            </Field>
            <Field label="Palabra resaltada (subcadena exacta del título)">
              <TextInput value={form.title_accent} maxLength={60} onChange={(next) => set({ title_accent: next })} />
            </Field>
            <Field label="Descripción">
              <TextInput value={form.description} maxLength={300} onChange={(next) => set({ description: next })} />
            </Field>
            <CtaEditor label="CTA principal" value={form.primary_cta} onChange={(next) => set({ primary_cta: next })} />
            <CtaEditor label="CTA secundario" value={form.secondary_cta} onChange={(next) => set({ secondary_cta: next })} />
            {form.template === "showcase" ? (
              <Field label="Producto vinculado (ID del catálogo)">
                <TextInput value={form.product_id} onChange={(next) => set({ product_id: next })} placeholder="uuid del producto" />
              </Field>
            ) : null}
            <ImageUploadField
              label="Imagen escritorio"
              value={form.desktop_file_id}
              onChange={(next) => set({ desktop_file_id: next })}
            />
            <ImageUploadField
              label="Imagen móvil (opcional)"
              value={form.mobile_file_id}
              onChange={(next) => set({ mobile_file_id: next })}
            />
            <Field label="Texto alternativo de la imagen">
              <TextInput value={form.image_alt} maxLength={255} onChange={(next) => set({ image_alt: next })} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Field label="Altura">
                <SelectInput value={form.height ?? "regular"} options={["compact", "regular", "tall"] as const} onChange={(next) => set({ height: next })} />
              </Field>
              <Field label="Alineación">
                <SelectInput value={form.alignment ?? "left"} options={["left", "center"] as const} onChange={(next) => set({ alignment: next })} />
              </Field>
              <Field label="Esquema de color">
                <SelectInput value={form.color_scheme ?? "surface"} options={["surface", "surface_muted", "brand", "brand_inverse", "dark"] as const} onChange={(next) => set({ color_scheme: next })} />
              </Field>
              <Field label="Botones">
                <SelectInput value={form.button_variant ?? "solid"} options={["solid", "outline"] as const} onChange={(next) => set({ button_variant: next })} />
              </Field>
              {form.template === "background" ? (
                <Field label="Overlay">
                  <SelectInput value={form.overlay ?? "soft"} options={["none", "soft", "strong"] as const} onChange={(next) => set({ overlay: next })} />
                </Field>
              ) : null}
              {form.template === "split" || form.template === "card" || form.template === "showcase" ? (
                <Field label="Imagen a la…">
                  <SelectInput value={form.image_position ?? "right"} options={[{ value: "left", label: "izquierda" }, { value: "right", label: "derecha" }] as const} onChange={(next) => set({ image_position: next })} />
                </Field>
              ) : null}
            </div>
            <Toggle label="Activo (visible en el sitio)" checked={form.is_active ?? true} onChange={(next) => set({ is_active: next })} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
              <button
                type="button"
                className="tt-btn tt-btn-primary sfe-btn-sm"
                disabled={busy || !form.title}
                onClick={() =>
                  void run(
                    () => (isNew || !selectedId ? createHero(form) : updateHero(selectedId, form)),
                    "Hero guardado: el sitio ya lo muestra.",
                  )
                }
              >
                {isNew ? "Crear hero" : "Guardar cambios"}
              </button>
              {!isNew && selectedId ? (
                <button
                  type="button"
                  className="tt-btn tt-btn-ghost sfe-btn-sm sfe-danger"
                  disabled={busy}
                  onClick={() => {
                    void run(() => deleteHero(selectedId), "Hero eliminado.");
                    setSelectedId(null);
                    setForm(null);
                  }}
                >
                  Eliminar
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="tt-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="tt-label">Configurando</span>
            <p style={{ margin: 0, fontSize: 13, color: "var(--tx2)" }}>
              {canEdit
                ? "Selecciona un hero o crea uno nuevo para editar plantilla, textos, botones e imagen."
                : "Sin permiso de edición: solo lectura."}
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pestaña Destacados
// ---------------------------------------------------------------------------

function HighlightsTab({ config, tokens, canEdit, busy, run }: TabProps) {
  const highlights = config.highlights ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<HighlightWrite | null>(null);
  const [isNew, setIsNew] = useState(false);

  const selected = highlights.find((row) => row.id === selectedId) ?? null;

  // Mismo patrón que HerosTab: estado derivado de la selección sin efectos.
  const [synced, setSynced] = useState<{ sel: string | null; cfg: StorefrontConfig } | null>(null);
  if (!synced || synced.sel !== selectedId || synced.cfg !== config) {
    setSynced({ sel: selectedId, cfg: config });
    if (selected) {
      setForm(highlightToWrite(selected));
      setIsNew(false);
    } else if (!isNew) {
      setForm(null);
    }
  }

  const set = (patch: Partial<HighlightWrite>) =>
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));

  const toLocal = (value: string | null | undefined) => (value ? value.slice(0, 16) : "");
  const fromLocal = (value: string) => (value ? `${value}:00` : null);

  return (
    <div className="sfe-grid">
      <aside className="sfe-col" aria-label="Destacados por superficie">
        <span className="tt-label" style={{ padding: "0 4px" }}>Destacados</span>
        {SURFACES.map((surface) => {
          const rows = highlights.filter((row) => row.surface === surface.value);
          if (rows.length === 0) return null;
          return (
            <div key={surface.value} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".05em", padding: "0 4px" }}>
                {surface.label}
              </span>
              {rows.map((row) => (
                <div key={row.id} className="sfe-el" data-active={selectedId === row.id ? "1" : "0"} data-hidden={row.is_active ? "0" : "1"}>
                  <button type="button" className="sfe-el-main" onClick={() => { setIsNew(false); setSelectedId(row.id); }}>
                    <span className="sfe-el-name">{row.icon ? `${row.icon} ` : ""}{row.title}</span>
                    <span className="sfe-el-sub">
                      {row.animation}{row.is_active ? "" : " · apagado"}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          );
        })}
        {canEdit ? (
          <button
            type="button"
            className="sfe-dashed"
            style={{ padding: "10px 12px" }}
            disabled={busy}
            onClick={() => {
              setSelectedId(null);
              setIsNew(true);
              setForm({ ...EMPTY_HIGHLIGHT });
            }}
          >
            + Nuevo destacado
          </button>
        ) : null}
        <p className="sfe-note" style={{ marginTop: 4 }}>
          Tú eliges mensaje, tono y animación; el diseño fija tamaño y posición del slot
          en cada superficie — jamás rompe el layout.
        </p>
      </aside>

      <section className="sfe-col" aria-label="Vista previa">
        <span className="tt-label">Vista previa · slot de su superficie</span>
        <div className="sfe-preview-frame" style={{ padding: 16 }}>
          <StorefrontThemeProvider tokens={tokens} fontVars="">
            {form ? (
              <HighlightBanner
                highlight={{
                  id: selectedId ?? "nuevo",
                  surface: form.surface ?? "home",
                  icon: form.icon ?? null,
                  eyebrow: form.eyebrow ?? null,
                  title: form.title || "Texto del destacado",
                  subtitle: form.subtitle ?? null,
                  cta: form.cta ?? null,
                  animation: form.animation ?? "fade_in",
                  color_scheme: form.color_scheme ?? "brand",
                }}
                variant={variantForSurface(form.surface ?? "home")}
              />
            ) : highlights.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {highlights.slice(0, 4).map((row) => (
                  <HighlightBanner key={row.id} highlight={toHighlightVM(row as never)} variant={variantForSurface(row.surface)} />
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13 }}>Sin destacados todavía.</div>
            )}
          </StorefrontThemeProvider>
        </div>
      </section>

      <aside className="sfe-col sfe-inspector-col">
        {form && canEdit ? (
          <div className="tt-card sfe-form" style={{ padding: "14px 16px" }}>
            <span className="tt-label">{isNew ? "Nuevo destacado" : "Editar destacado"}</span>
            <Field label="Superficie (dónde aparece)">
              <SelectInput value={form.surface ?? "home"} options={SURFACES} onChange={(next) => set({ surface: next })} />
            </Field>
            <Field label="Ícono / badge corto (emoji)">
              <TextInput value={form.icon} maxLength={16} onChange={(next) => set({ icon: next })} placeholder="🚚" />
            </Field>
            <Field label="Antetítulo (tarjetas login/cuenta)">
              <TextInput value={form.eyebrow} maxLength={60} onChange={(next) => set({ eyebrow: next })} />
            </Field>
            <Field label="Título">
              <TextInput value={form.title} maxLength={140} onChange={(next) => set({ title: next ?? "" })} />
            </Field>
            <Field label="Subtítulo">
              <TextInput value={form.subtitle} maxLength={200} onChange={(next) => set({ subtitle: next })} />
            </Field>
            <CtaEditor label="CTA" value={form.cta} onChange={(next) => set({ cta: next })} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Field label="Animación">
                <SelectInput value={form.animation ?? "fade_in"} options={ANIMATIONS} onChange={(next) => set({ animation: next })} />
              </Field>
              <Field label="Tono">
                <SelectInput value={form.color_scheme ?? "brand"} options={["brand", "soft", "accent", "success"] as const} onChange={(next) => set({ color_scheme: next })} />
              </Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Field label="Visible desde (opcional)">
                <input type="datetime-local" className="tt-input" value={toLocal(form.starts_at)} onChange={(event) => set({ starts_at: fromLocal(event.target.value) })} />
              </Field>
              <Field label="Visible hasta (opcional)">
                <input type="datetime-local" className="tt-input" value={toLocal(form.ends_at)} onChange={(event) => set({ ends_at: fromLocal(event.target.value) })} />
              </Field>
            </div>
            <Toggle label="Activo (visible en el sitio)" checked={form.is_active ?? true} onChange={(next) => set({ is_active: next })} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
              <button
                type="button"
                className="tt-btn tt-btn-primary sfe-btn-sm"
                disabled={busy || !form.title}
                onClick={() =>
                  void run(
                    () => (isNew || !selectedId ? createHighlight(form) : updateHighlight(selectedId, form)),
                    "Destacado guardado: el sitio ya lo muestra.",
                  )
                }
              >
                {isNew ? "Crear destacado" : "Guardar cambios"}
              </button>
              {!isNew && selectedId ? (
                <button
                  type="button"
                  className="tt-btn tt-btn-ghost sfe-btn-sm sfe-danger"
                  disabled={busy}
                  onClick={() => {
                    void run(() => deleteHighlight(selectedId), "Destacado eliminado.");
                    setSelectedId(null);
                    setForm(null);
                  }}
                >
                  Eliminar
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="tt-card" style={{ padding: "16px 18px" }}>
            <span className="tt-label">Configurando</span>
            <p style={{ margin: 0, fontSize: 13, color: "var(--tx2)" }}>
              {canEdit
                ? "Selecciona un destacado o crea uno nuevo. Cada superficie tiene su propio slot fijo."
                : "Sin permiso de edición: solo lectura."}
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pestaña Footer
// ---------------------------------------------------------------------------

function FooterTab({ config, tokens, canEdit, busy, run }: TabProps) {
  const [form, setForm] = useState(() => ({
    template: config.footer.template as "barra" | "columnas" | "centrado",
    show_slogan: config.footer.show_slogan,
    show_phones: config.footer.show_phones,
    show_schedule: config.footer.show_schedule,
    show_links: config.footer.show_links,
    note: config.footer.note ?? null,
    color_scheme: config.footer.color_scheme as "dark" | "soft" | "brand",
    social_links: (config.footer.social_links ?? []) as SocialLink[],
  }));

  const previewFooter: FooterVM = {
    template: form.template,
    color_scheme: form.color_scheme,
    slogan: form.show_slogan ? form.note ?? "Eslogan del negocio" : null,
    phones: form.show_phones
      ? [{ label: null, phone: "844 123 4567", phone_normalized: "+528441234567", is_whatsapp: true }]
      : [],
    schedule: form.show_schedule ? { is_open_now: true, today_slots: [{ opens_at: "13:00:00", closes_at: "23:00:00" }] } : null,
    show_links: form.show_links,
    address: null,
    social_links: form.social_links,
  };

  const setLink = (index: number, patch: Partial<SocialLink>) =>
    setForm((prev) => ({
      ...prev,
      social_links: prev.social_links.map((link, i) => (i === index ? { ...link, ...patch } : link)),
    }));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 380px) 1fr", gap: 16, alignItems: "start" }}>
      <section className="tt-card sfe-form" style={{ padding: "16px 18px" }}>
        <span className="tt-label">Footer · plantilla y contenido</span>
        <Field label="Plantilla">
          <SelectInput
            value={form.template}
            options={[
              { value: "barra", label: "Barra · franja mínima" },
              { value: "columnas", label: "Columnas · completo" },
              { value: "centrado", label: "Centrado · compacto" },
            ] as const}
            onChange={(next) => setForm((prev) => ({ ...prev, template: next }))}
          />
        </Field>
        <Field label="Color">
          <SelectInput
            value={form.color_scheme}
            options={[
              { value: "dark", label: "Oscuro de marca" },
              { value: "soft", label: "Superficie suave" },
              { value: "brand", label: "Color de marca" },
            ] as const}
            onChange={(next) => setForm((prev) => ({ ...prev, color_scheme: next }))}
          />
        </Field>
        <Toggle label="Mostrar eslogan del negocio" checked={form.show_slogan} onChange={(next) => setForm((prev) => ({ ...prev, show_slogan: next }))} />
        <Field label="Nota que sustituye al eslogan (opcional)">
          <TextInput value={form.note} maxLength={200} onChange={(next) => setForm((prev) => ({ ...prev, note: next }))} />
        </Field>
        <Toggle label="Mostrar teléfonos públicos" checked={form.show_phones} onChange={(next) => setForm((prev) => ({ ...prev, show_phones: next }))} />
        <Toggle label="Mostrar horario de hoy" checked={form.show_schedule} onChange={(next) => setForm((prev) => ({ ...prev, show_schedule: next }))} />
        <Toggle label="Mostrar columnas de enlaces (plantilla columnas)" checked={form.show_links} onChange={(next) => setForm((prev) => ({ ...prev, show_links: next }))} />

        <span className="tt-label" style={{ marginTop: 8 }}>Redes sociales (https)</span>
        {form.social_links.map((link, index) => (
          <div key={index} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <SelectInput value={link.network} options={NETWORKS} onChange={(next) => setLink(index, { network: next })} />
            <input
              className="tt-input"
              style={{ flex: 1 }}
              value={link.url}
              placeholder="https://…"
              onChange={(event) => setLink(index, { url: event.target.value })}
            />
            <button
              type="button"
              className="sfe-icon-btn"
              aria-label="Quitar red"
              onClick={() => setForm((prev) => ({ ...prev, social_links: prev.social_links.filter((_, i) => i !== index) }))}
            >
              ✕
            </button>
          </div>
        ))}
        {form.social_links.length < 6 ? (
          <button
            type="button"
            className="sfe-dashed"
            style={{ padding: "8px 12px" }}
            onClick={() =>
              setForm((prev) => ({
                ...prev,
                social_links: [...prev.social_links, { network: "instagram", url: "https://" }],
              }))
            }
          >
            + Agregar red
          </button>
        ) : null}

        {canEdit ? (
          <button
            type="button"
            className="tt-btn tt-btn-primary sfe-btn-sm"
            style={{ alignSelf: "flex-start", marginTop: 8 }}
            disabled={busy}
            onClick={() => void run(() => patchFooter(form), "Footer guardado: el sitio ya lo muestra.")}
          >
            Guardar footer
          </button>
        ) : null}
      </section>

      <section className="sfe-col" aria-label="Vista previa del footer">
        <span className="tt-label">Vista previa</span>
        <div className="sfe-preview-frame">
          <StorefrontThemeProvider tokens={tokens} fontVars="">
            <StorefrontFooter business={null} footer={previewFooter} />
          </StorefrontThemeProvider>
        </div>
        <p className="sfe-note">
          El eslogan y los teléfonos reales vienen del perfil del negocio; aquí solo decides
          si se muestran. Las redes exigen enlaces https (el backend los valida).
        </p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pestaña Apariencia (tema + metadatos + carrusel + mantenimiento)
// ---------------------------------------------------------------------------

function ThemeTab({
  config,
  canTheme,
  busy,
  run,
}: Readonly<{
  config: StorefrontConfig;
  canTheme: boolean;
  busy: boolean;
  run: (action: () => Promise<unknown>, success?: string) => Promise<void>;
}>) {
  const settings = config.settings;
  const [presetName, setPresetName] = useState(settings.theme_preset);
  const [accent, setAccent] = useState(settings.theme_accent ?? "");
  const [siteTitle, setSiteTitle] = useState(settings.site_title ?? "");
  const [siteDescription, setSiteDescription] = useState(settings.site_description ?? "");
  const [enabled, setEnabled] = useState(settings.storefront_enabled);
  const [maintenance, setMaintenance] = useState(settings.maintenance_message ?? "");
  const [autoplay, setAutoplay] = useState(settings.hero_autoplay);
  const [interval, setIntervalSeconds] = useState(settings.hero_interval_seconds);
  const [transition, setTransition] = useState(settings.hero_transition as "slide" | "fade");
  const [showArrows, setShowArrows] = useState(settings.hero_show_arrows);
  const [showDots, setShowDots] = useState(settings.hero_show_dots);

  const presets = config.theme_presets ?? [];
  const parsedByName = new Map(
    presets.map((preset) => [preset.name, parseThemeTokens(preset.tokens)]),
  );

  const barsFor = (name: string): string[] => {
    const colors = parsedByName.get(name)?.colors ?? {};
    const preferred = [colors.brand_primary, colors.brand_secondary, colors.surface].filter(
      (color): color is string => Boolean(color),
    );
    return preferred.length === 3 ? preferred : Object.values(colors).slice(0, 3);
  };

  if (!canTheme) {
    return (
      <div className="tt-card" style={{ padding: "16px 18px", fontSize: 13, color: "var(--tx3)" }}>
        Requiere permiso storefront:manage_theme.
      </div>
    );
  }

  return (
    <div className="sfe-theme-grid">
      <section className="tt-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }} aria-label="Colores del sitio">
        <strong style={{ fontSize: 15 }}>Colores del sitio</strong>
        <div className="sfe-preset-row">
          {presets.map((preset) => (
            <button key={preset.name} type="button" className="sfe-preset" data-active={presetName === preset.name ? "1" : "0"} onClick={() => setPresetName(preset.name)}>
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
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          <span className="tt-label">Acento</span>
          <input
            type="color"
            className="sfe-swatch-custom"
            aria-label="Acento personalizado"
            value={/^#[0-9a-fA-F]{6}$/.test(accent) ? accent : "#c1272d"}
            onChange={(event) => setAccent(event.target.value)}
          />
          {accent ? (
            <button type="button" className="sfe-link-danger" onClick={() => setAccent("")}>
              usar el del preset
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className="tt-btn tt-btn-primary sfe-btn-sm"
          style={{ alignSelf: "flex-start" }}
          disabled={busy || !presetName}
          onClick={() =>
            void run(
              () => patchTheme({ theme_preset: presetName, theme_accent: accent || null }),
              "Tema activado en todo el sitio.",
            )
          }
        >
          Activar tema
        </button>
        <span style={{ fontSize: 11, color: "var(--tx3)" }}>
          Presets neutros; la marca es configuración, no código.
        </span>
      </section>

      <section className="tt-card sfe-form" style={{ padding: "16px 18px" }} aria-label="Metadatos y carrusel">
        <span className="tt-label">Metadatos del sitio</span>
        <Field label="Título (title)">
          <TextInput value={siteTitle} maxLength={120} onChange={(next) => setSiteTitle(next ?? "")} placeholder="Nombre del negocio por defecto" />
        </Field>
        <Field label="Descripción para buscadores">
          <TextInput value={siteDescription} maxLength={300} onChange={(next) => setSiteDescription(next ?? "")} />
        </Field>

        <span className="tt-label" style={{ marginTop: 8 }}>Carrusel de heros</span>
        <Toggle label="Autoplay (se pausa al pasar el cursor)" checked={autoplay} onChange={setAutoplay} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Field label="Intervalo (segundos)">
            <input
              type="number"
              min={4}
              max={12}
              className="tt-input"
              value={interval}
              onChange={(event) => setIntervalSeconds(Number.parseInt(event.target.value, 10) || 6)}
            />
          </Field>
          <Field label="Transición">
            <SelectInput value={transition} options={["slide", "fade"] as const} onChange={setTransition} />
          </Field>
        </div>
        <Toggle label="Mostrar flechas" checked={showArrows} onChange={setShowArrows} />
        <Toggle label="Mostrar puntos" checked={showDots} onChange={setShowDots} />

        <span className="tt-label" style={{ marginTop: 8 }}>Disponibilidad</span>
        <Toggle label="Sitio público encendido" checked={enabled} onChange={setEnabled} />
        {!enabled ? (
          <Field label="Mensaje de mantenimiento">
            <TextInput value={maintenance} onChange={(next) => setMaintenance(next ?? "")} />
          </Field>
        ) : null}

        <button
          type="button"
          className="tt-btn tt-btn-primary sfe-btn-sm"
          style={{ alignSelf: "flex-start", marginTop: 8 }}
          disabled={busy}
          onClick={() =>
            void run(
              () =>
                patchSettings({
                  site_title: siteTitle || null,
                  site_description: siteDescription || null,
                  storefront_enabled: enabled,
                  maintenance_message: maintenance || null,
                  hero_autoplay: autoplay,
                  hero_interval_seconds: Math.min(12, Math.max(4, interval)),
                  hero_transition: transition,
                  hero_show_arrows: showArrows,
                  hero_show_dots: showDots,
                }),
              "Ajustes guardados.",
            )
          }
        >
          Guardar ajustes
        </button>
      </section>
    </div>
  );
}
