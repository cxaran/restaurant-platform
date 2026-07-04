"use client";

// Inspector de una sección del borrador: las 4 configs se editan con
// formularios generados desde el JSON Schema del backend, más media por slot
// (subida real al banco de archivos) y ventanas de visibilidad.

import { useState } from "react";

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

const btn: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 8, fontWeight: 800, fontSize: 13,
  border: "1px solid rgba(0,0,0,0.3)", background: "transparent", cursor: "pointer",
};

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
}: Readonly<{
  section: DraftSection;
  template: TemplateInfo | null;
  media: MediaSlots;
  canManageMedia: boolean;
  onSaved: () => void;
  onDeleted: () => void;
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

  function save() {
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
  }

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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <strong style={{ fontSize: 14 }}>{template?.label ?? section.template_key}</strong>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, fontWeight: 700 }}>
          <input
            type="checkbox"
            checked={draft.is_visible}
            onChange={(event) => setDraft({ ...draft, is_visible: event.target.checked })}
          />
          Visible
        </label>
        <button type="button" style={{ ...btn, marginLeft: "auto" }} disabled={busy} onClick={save}>
          Guardar sección
        </button>
        <button
          type="button"
          style={{ ...btn, color: "#b3261e" }}
          disabled={busy}
          onClick={() => {
            if (window.confirm("¿Quitar esta sección del borrador?")) {
              void run(() => deleteSection(section.id), onDeleted);
            }
          }}
        >
          Quitar
        </button>
      </div>

      {error ? <p role="alert" style={{ margin: 0, color: "#b3261e", fontWeight: 700, fontSize: 13 }}>{error}</p> : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label style={{ fontSize: 12, fontWeight: 700 }}>
          Visible desde
          <input
            type="datetime-local"
            value={toDatetimeLocal(draft.visible_from)}
            onChange={(event) =>
              setDraft({ ...draft, visible_from: event.target.value ? `${event.target.value}:00` : null })
            }
            style={{ width: "100%", padding: "6px 8px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.25)" }}
          />
        </label>
        <label style={{ fontSize: 12, fontWeight: 700 }}>
          Visible hasta
          <input
            type="datetime-local"
            value={toDatetimeLocal(draft.visible_until)}
            onChange={(event) =>
              setDraft({ ...draft, visible_until: event.target.value ? `${event.target.value}:00` : null })
            }
            style={{ width: "100%", padding: "6px 8px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.25)" }}
          />
        </label>
      </div>
      <p style={{ margin: 0, fontSize: 11, opacity: 0.65 }}>
        La visibilidad real por fechas la decide el servidor al publicar.
      </p>

      <div role="tablist" style={{ display: "flex", gap: 6 }}>
        {CONFIG_TABS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            style={{ ...btn, padding: "6px 12px", fontSize: 12, background: tab === key ? "rgba(0,0,0,0.1)" : "transparent" }}
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

      <fieldset style={{ border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        <legend style={{ fontSize: 12, fontWeight: 800, padding: "0 4px" }}>Imágenes por slot</legend>
        {!canManageMedia ? (
          <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>Requiere permiso storefront:manage_media.</p>
        ) : (
          <>
            {Object.entries(slots).length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>Sin imágenes en esta sección.</p>
            ) : (
              Object.entries(slots).map(([slot, item]) => (
                <div key={slot} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
                  <b>{slot}</b>
                  <span>{item.desktop_file_id ? "🖥️" : ""}{item.mobile_file_id ? "📱" : ""}</span>
                  {item.desktop_file_id ? (
                    // eslint-disable-next-line @next/next/no-img-element -- vista previa del banco de archivos
                    <img src={`/api/v1/public/files/${item.desktop_file_id}`} alt={item.alt_text ?? ""} style={{ height: 34, borderRadius: 6 }} />
                  ) : null}
                  <button
                    type="button"
                    style={{ ...btn, padding: "3px 10px", fontSize: 11, color: "#b3261e", marginLeft: "auto" }}
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
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 12 }}>
              <input
                aria-label="Slot"
                value={slotKey}
                onChange={(event) => setSlotKey(event.target.value)}
                style={{ width: 90, padding: "5px 8px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.25)" }}
              />
              <input
                aria-label="Texto alternativo"
                placeholder="alt text"
                value={altText}
                onChange={(event) => setAltText(event.target.value)}
                style={{ flex: 1, minWidth: 120, padding: "5px 8px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.25)" }}
              />
              {(["desktop", "mobile"] as const).map((target) => (
                <label key={target} style={{ ...btn, padding: "5px 10px", fontSize: 11 }}>
                  Subir {target === "desktop" ? "escritorio" : "móvil"}
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
      </fieldset>
    </div>
  );
}
