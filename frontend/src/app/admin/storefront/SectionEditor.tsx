"use client";

// Inspector de una sección del borrador (columna derecha de la pantalla 6a):
// las 4 configs se editan con formularios generados desde el JSON Schema del
// backend, más media por slot (subida real al banco de archivos) y ventanas
// de visibilidad. La cabecera «Configurando · plantilla», el interruptor de
// visibilidad y el pie Quitar/Guardar siguen el handoff Tony-Tony.

import { useEffect, useRef, useState } from "react";

import { ApiRequestError } from "@/core/api/api-error";
import { SchemaForm, type JsonSchema } from "./SchemaForm";
import {
  deleteMedia,
  deleteSection,
  updateSection,
  uploadImage,
  upsertMedia,
  type DraftSection,
  type MediaSlots,
  type TemplateInfo,
} from "./editor-api";

function toDatetimeLocal(value: string | null): string {
  return value ? value.slice(0, 16) : "";
}

const CONFIG_TABS = [
  ["content_config", "Contenido", "content_schema"],
  ["style_config", "Estilo", "style_schema"],
  ["data_binding_config", "Datos", "data_binding_schema"],
  ["behavior_config", "Comportamiento", "behavior_schema"],
] as const;

export function SectionEditor({
  section,
  template,
  media,
  canManageMedia,
  onSaved,
  onDeleted,
  onRegisterSave,
}: Readonly<{
  section: DraftSection;
  template: TemplateInfo | null;
  media: MediaSlots;
  canManageMedia: boolean;
  onSaved: () => void;
  onDeleted: () => void;
  /** Permite a la barra superior (botón «Guardar») disparar el guardado. */
  onRegisterSave?: (save: (() => void) | null) => void;
}>) {
  const [draft, setDraft] = useState<DraftSection>(section);
  const [tab, setTab] = useState<(typeof CONFIG_TABS)[number][0]>("content_config");
  const [slots, setSlots] = useState<MediaSlots>(media);
  const [slotKey, setSlotKey] = useState("main");
  const [altText, setAltText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await action();
      after?.();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.body.message : "No fue posible.");
    } finally {
      setBusy(false);
    }
  }

  const saveRef = useRef<() => void>(() => {});
  // El ref se refresca tras cada render (nunca durante el render, regla
  // react-hooks): así el guardar registrado en la barra superior siempre ve el
  // borrador vigente.
  useEffect(() => {
    saveRef.current = () => {
      void run(
        () =>
          updateSection(section.id, {
            template_key: draft.template_key,
            template_version: draft.template_version,
            section_name: draft.section_name,
            sort_order: draft.sort_order,
            is_visible: draft.is_visible,
            visible_from: draft.visible_from,
            visible_until: draft.visible_until,
            content_config: draft.content_config,
            style_config: draft.style_config,
            data_binding_config: draft.data_binding_config,
            behavior_config: draft.behavior_config,
          }),
        onSaved,
      );
    };
  });
  const save = () => saveRef.current();

  useEffect(() => {
    onRegisterSave?.(() => saveRef.current());
    return () => onRegisterSave?.(null);
  }, [onRegisterSave]);

  async function attachImage(file: File, target: "desktop" | "mobile") {
    await run(async () => {
      const fileId = await uploadImage(file);
      const next = await upsertMedia(section.id, slotKey, {
        [`${target}_file_id`]: fileId,
        ...(altText ? { alt_text: altText } : {}),
      });
      setSlots(next);
    });
  }

  const schemaFor = (key: (typeof CONFIG_TABS)[number][2]): JsonSchema =>
    template?.[key] ?? {};

  const activeTab = CONFIG_TABS.find(([key]) => key === tab) ?? CONFIG_TABS[0];

  return (
    <section className="tt-card sfe-panel" aria-label="Configuración de la sección">
      <header className="sfe-panel-head">
        <span className="tt-label">Configurando</span>
        <h2 className="tt-display" style={{ margin: 0, fontSize: 17 }}>
          {template?.label ?? section.template_key}
        </h2>
        <span style={{ fontSize: 11, color: "var(--tx3)" }}>
          Plantilla: {section.template_key} · v{section.template_version}
        </span>
      </header>

      <div className="sfe-panel-body">
        {error ? (
          <p role="alert" className="sfe-note sfe-note-danger">{error}</p>
        ) : null}

        <div className="sfe-field">
          <label className="sfe-flabel" htmlFor={`sfe-name-${section.id}`}>
            Nombre interno
          </label>
          <input
            id={`sfe-name-${section.id}`}
            className="tt-input"
            placeholder="Nombre visible solo en el editor"
            value={draft.section_name ?? ""}
            onChange={(event) =>
              setDraft({ ...draft, section_name: event.target.value || null })
            }
          />
        </div>

        <div role="tablist" className="tt-seg" aria-label="Configuración por pestañas">
          {CONFIG_TABS.map(([key, label]) => (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={tab === key}
              data-active={tab === key ? "1" : "0"}
              className="tt-seg-item"
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <SchemaForm
          key={`${section.id}-${tab}`}
          schema={schemaFor(activeTab[2])}
          value={draft[activeTab[0]]}
          onChange={(next) => setDraft({ ...draft, [activeTab[0]]: next })}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="tt-label">Visibilidad</span>
          <div
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 10, border: "1px solid var(--border)", borderRadius: 12, padding: "10px 13px",
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 12 }}>Mostrar en la página</span>
            <button
              type="button"
              role="switch"
              aria-checked={draft.is_visible}
              aria-label="Mostrar en la página"
              className="sfe-switch"
              disabled={busy}
              onClick={() => setDraft({ ...draft, is_visible: !draft.is_visible })}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div className="sfe-field">
              <label className="sfe-flabel" htmlFor={`sfe-from-${section.id}`}>Visible desde</label>
              <input
                id={`sfe-from-${section.id}`}
                type="datetime-local"
                className="tt-input"
                value={toDatetimeLocal(draft.visible_from)}
                onChange={(event) =>
                  setDraft({ ...draft, visible_from: event.target.value ? `${event.target.value}:00` : null })
                }
              />
            </div>
            <div className="sfe-field">
              <label className="sfe-flabel" htmlFor={`sfe-until-${section.id}`}>Visible hasta</label>
              <input
                id={`sfe-until-${section.id}`}
                type="datetime-local"
                className="tt-input"
                value={toDatetimeLocal(draft.visible_until)}
                onChange={(event) =>
                  setDraft({ ...draft, visible_until: event.target.value ? `${event.target.value}:00` : null })
                }
              />
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 11, color: "var(--tx3)" }}>
            La visibilidad real por fechas la decide el servidor al publicar.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="tt-label">Imágenes por slot</span>
          {!canManageMedia ? (
            <p style={{ margin: 0, fontSize: 12, color: "var(--tx3)" }}>
              Requiere permiso storefront:manage_media.
            </p>
          ) : (
            <>
              {Object.entries(slots).length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: "var(--tx3)" }}>
                  Sin imágenes en esta sección.
                </p>
              ) : (
                Object.entries(slots).map(([slot, item]) => (
                  <div
                    key={slot}
                    style={{
                      display: "flex", gap: 10, alignItems: "center", fontSize: 12,
                      border: "1px solid var(--border)", borderRadius: 12, padding: "8px 10px",
                    }}
                  >
                    {item.desktop_file_id ? (
                      // eslint-disable-next-line @next/next/no-img-element -- vista previa del banco de archivos
                      <img
                        src={`/api/v1/public/files/${item.desktop_file_id}`}
                        alt={item.alt_text ?? ""}
                        className="sfe-thumb"
                      />
                    ) : (
                      <span className="sfe-thumb" aria-hidden />
                    )}
                    <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
                      <b style={{ fontSize: 12 }}>{slot}</b>
                      <span style={{ color: "var(--tx3)", fontSize: 11 }}>
                        {[item.desktop_file_id ? "escritorio" : null, item.mobile_file_id ? "móvil" : null]
                          .filter(Boolean)
                          .join(" · ") || "sin archivos"}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="sfe-link-danger"
                      disabled={busy}
                      onClick={() =>
                        void run(() => deleteMedia(section.id, slot), () =>
                          setSlots((current) => {
                            const next = { ...current };
                            delete next[slot];
                            return next;
                          }),
                        )
                      }
                    >
                      quitar
                    </button>
                  </div>
                ))
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <div className="sfe-field" style={{ width: 90 }}>
                  <label className="sfe-flabel" htmlFor={`sfe-slot-${section.id}`}>Slot</label>
                  <input
                    id={`sfe-slot-${section.id}`}
                    className="tt-input"
                    value={slotKey}
                    onChange={(event) => setSlotKey(event.target.value)}
                  />
                </div>
                <div className="sfe-field" style={{ flex: 1, minWidth: 120 }}>
                  <label className="sfe-flabel" htmlFor={`sfe-alt-${section.id}`}>Texto alternativo</label>
                  <input
                    id={`sfe-alt-${section.id}`}
                    className="tt-input"
                    placeholder="alt text"
                    value={altText}
                    onChange={(event) => setAltText(event.target.value)}
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {(["desktop", "mobile"] as const).map((target) => (
                  <label key={target} className="sfe-dashed" style={{ flex: 1 }}>
                    Subir {target === "desktop" ? "escritorio" : "móvil"} · png/webp/jpeg
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      style={{ display: "none" }}
                      disabled={busy}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void attachImage(file, target);
                        event.target.value = "";
                      }}
                    />
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <footer className="sfe-panel-foot">
        <button
          type="button"
          className="tt-btn tt-btn-ghost sfe-danger sfe-btn-sm"
          disabled={busy}
          onClick={() => {
            if (window.confirm("¿Quitar esta sección del borrador?")) {
              void run(() => deleteSection(section.id), onDeleted);
            }
          }}
        >
          Quitar
        </button>
        <button
          type="button"
          className="tt-btn tt-btn-success sfe-btn-sm"
          style={{ flex: 1 }}
          disabled={busy}
          onClick={save}
        >
          Guardar sección
        </button>
      </footer>
    </section>
  );
}
