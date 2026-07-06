"use client";

// Difusión del administrador: título + mensaje + audiencia → una notificación
// por usuario (campana + correo). El texto es CONTROLADO (límites del
// contrato); jamás HTML libre.

import { useState } from "react";

import { ApiRequestError } from "@/core/api/api-error";
import { browserApi } from "@/core/api/browser-client";

const AUDIENCES = [
  {
    value: "all" as const,
    label: "Todos los usuarios",
    detail: "Clientes y personal: todas las cuentas activas.",
  },
  {
    value: "customers" as const,
    label: "Solo clientes",
    detail: "Cuentas sin rol de personal (los clientes del sitio).",
  },
  {
    value: "staff" as const,
    label: "Solo personal",
    detail: "Cuentas con algún rol asignado (equipo del negocio).",
  },
];

export function NotificationsAdminView() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"all" | "customers" | "staff">("all");
  const [linkUrl, setLinkUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const link = linkUrl.trim();
      const result = await browserApi<{ created: number; audience: string }>(
        "/api/v1/notifications/broadcast",
        {
          method: "POST",
          body: { title, body, audience, ...(link ? { link_url: link } : {}) },
        },
      );
      setMessage(
        `Enviada a ${result.created} usuario${result.created === 1 ? "" : "s"}: ya está en sus campanas y los correos van saliendo.`,
      );
      setTitle("");
      setBody("");
      setLinkUrl("");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.body.message : "No fue posible enviar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 560px)", gap: 14 }}>
      {message ? (
        <p role="status" className="tt-card" style={{ margin: 0, padding: "10px 14px", fontSize: 13, fontWeight: 700, color: "var(--ok, #15803d)" }}>
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="tt-card" style={{ margin: 0, padding: "10px 14px", fontSize: 13, fontWeight: 700, color: "var(--accent)" }}>
          {error}
        </p>
      ) : null}

      <section className="tt-card" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label className="tt-label" htmlFor="ntf-title">Título (asunto del correo)</label>
          <input
            id="ntf-title"
            className="tt-input"
            maxLength={140}
            value={title}
            placeholder="2×1 en boneless este martes"
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label className="tt-label" htmlFor="ntf-body">Mensaje</label>
          <textarea
            id="ntf-body"
            className="tt-input"
            rows={4}
            maxLength={500}
            value={body}
            placeholder="Este martes todas las órdenes de boneless van al 2×1 pidiendo en línea…"
            onChange={(event) => setBody(event.target.value)}
            style={{ resize: "vertical" }}
          />
          <span style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 700 }}>
            {body.length}/500 · texto plano, sin HTML
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label className="tt-label" htmlFor="ntf-link">Enlace al tocar (opcional)</label>
          <input
            id="ntf-link"
            className="tt-input"
            maxLength={500}
            value={linkUrl}
            placeholder="/menu  ·  /creditos  ·  https://…"
            onChange={(event) => setLinkUrl(event.target.value)}
          />
          <span style={{ fontSize: 11, color: "var(--tx3)", fontWeight: 700 }}>
            Ruta interna (empieza con «/») o URL https. Vacío = sin enlace.
          </span>
        </div>

        <fieldset style={{ border: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          <legend className="tt-label" style={{ marginBottom: 6 }}>Audiencia</legend>
          {AUDIENCES.map((option) => (
            <label
              key={option.value}
              style={{
                display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer",
                border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px",
                background: audience === option.value ? "var(--accent-dim, transparent)" : "transparent",
              }}
            >
              <input
                type="radio"
                name="audiencia"
                checked={audience === option.value}
                onChange={() => setAudience(option.value)}
                style={{ marginTop: 3, accentColor: "var(--accent)" }}
              />
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <b style={{ fontSize: 13.5 }}>{option.label}</b>
                <span style={{ fontSize: 12, color: "var(--tx3)" }}>{option.detail}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            className="tt-btn tt-btn-primary"
            disabled={busy || !title.trim() || !body.trim()}
            onClick={() => void send()}
          >
            {busy ? "Enviando…" : "Enviar notificación"}
          </button>
          <span style={{ fontSize: 11.5, color: "var(--tx3)" }}>
            Llega a la campana al instante; los correos salen en segundos y quedan
            auditados (nombres de campos, nunca el contenido).
          </span>
        </div>
      </section>
    </div>
  );
}
