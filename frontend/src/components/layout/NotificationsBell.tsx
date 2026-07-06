"use client";

// Campana de notificaciones compartida: badge con no-leídas + panel
// desplegable con la lista y «marcar leídas». Funciona en los DOS mundos de
// tokens: variant "tt" (panel/admin) y "sf" (sitio público con sesión).
// Sondea /notifications/me cada 60 s y al abrir el panel — funciona en
// cualquier navegador de PC/Mac/Android/iOS sin permisos del sistema (la
// garantía multiplataforma es campana + correo; push nativo sería mejora).

import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";

import { browserApi } from "@/core/api/browser-client";
import type { components } from "@/generated/openapi";

type MyNotifications = components["schemas"]["MyNotifications"];
type NotificationRead = components["schemas"]["NotificationRead"];

const POLL_MS = 60_000;

const KIND_ICONS: Record<string, string> = {
  order_status: "🧾",
  order_new: "🛎",
  promo: "📣",
};

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("es-MX", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export function NotificationsBell({
  variant = "tt",
}: Readonly<{ variant?: "tt" | "sf" }>) {
  const [data, setData] = useState<MyNotifications | null>(null);
  const [open, setOpen] = useState(false);
  // Posición vertical del panel en móvil (fixed): borde inferior del botón.
  const [panelTop, setPanelTop] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // El contenedor solo mide lo que ocupa el botón (el panel va fuera de flujo),
  // así que su borde inferior es el punto donde debe empezar el panel.
  const measurePanelTop = useCallback(() => {
    if (rootRef.current) {
      setPanelTop(rootRef.current.getBoundingClientRect().bottom + 8);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setData(await browserApi<MyNotifications>("/api/v1/notifications/me?limit=30"));
    } catch {
      // Silencio deliberado: la campana jamás rompe la página que la aloja.
    }
  }, []);

  useEffect(() => {
    // Primera carga diferida (callback): sin setState síncrono en el efecto.
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  // Cierre por clic fuera y por Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    // Recalcular al rotar/redimensionar (cambia el alto del header y la posición
    // del botón, y con ello dónde debe anclarse el panel fijo en móvil).
    function onResize() {
      measurePanelTop();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [open, measurePanelTop]);

  const unread = data?.unread_count ?? 0;
  const items = data?.items ?? [];

  const sf = variant === "sf";
  const panelBg = sf ? "color-mix(in srgb, var(--sf-surface) 30%, white)" : "var(--panel)";
  const borderColor = sf
    ? "color-mix(in srgb, var(--sf-text) 18%, transparent)"
    : "var(--border)";
  const mutedColor = sf
    ? "color-mix(in srgb, var(--sf-text) 55%, var(--sf-surface))"
    : "var(--tx3)";
  const badgeBg = sf ? "var(--sf-brand)" : "var(--accent)";
  const badgeTx = sf ? "var(--sf-text-inverse)" : "var(--on-accent, #fff)";

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      <button
        type="button"
        aria-label={`Notificaciones${unread > 0 ? `: ${unread} sin leer` : ""}`}
        aria-expanded={open}
        title="Notificaciones"
        onClick={() => {
          const next = !open;
          if (next) {
            measurePanelTop();
            void load();
          }
          setOpen(next);
        }}
        style={{
          position: "relative", display: "inline-flex", alignItems: "center",
          justifyContent: "center", width: 36, height: 36, borderRadius: 12,
          border: `1px solid ${borderColor}`, background: "transparent",
          color: "inherit", fontSize: 16, cursor: "pointer",
        }}
      >
        <span aria-hidden>🔔</span>
        {unread > 0 ? (
          <span
            aria-hidden
            style={{
              position: "absolute", top: -6, right: -6, minWidth: 18, height: 18,
              borderRadius: 999, background: badgeBg, color: badgeTx,
              fontSize: 10.5, fontWeight: 900, display: "inline-flex",
              alignItems: "center", justifyContent: "center", padding: "0 5px",
              lineHeight: 1,
            }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notificaciones"
          className="notif-panel"
          style={{
            zIndex: 60,
            background: panelBg,
            color: "inherit",
            border: `1px solid ${borderColor}`,
            borderRadius: 14,
            boxShadow: "0 14px 34px -12px rgba(0,0,0,0.35)",
            display: "flex",
            flexDirection: "column",
            ...(panelTop != null ? { "--notif-top": `${panelTop}px` } : {}),
          } as CSSProperties}
        >
          <div
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 14px", borderBottom: `1px solid ${borderColor}`,
              position: "sticky", top: 0, background: panelBg,
            }}
          >
            <b style={{ fontSize: 13, flex: 1 }}>Notificaciones</b>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() =>
                  void (async () => {
                    try {
                      await browserApi("/api/v1/notifications/me/read-all", { method: "POST" });
                      await load();
                    } catch {
                      // best-effort
                    }
                  })()
                }
                style={{
                  border: "none", background: "transparent", color: "inherit",
                  fontSize: 11.5, fontWeight: 800, cursor: "pointer",
                  textDecoration: "underline", padding: 0,
                }}
              >
                Marcar leídas
              </button>
            ) : null}
          </div>

          {items.length === 0 ? (
            <p style={{ margin: 0, padding: "16px 14px", fontSize: 13, color: mutedColor }}>
              Sin notificaciones todavía.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {items.map((item: NotificationRead) => (
                <li
                  key={item.id}
                  style={{
                    display: "flex", gap: 10, padding: "10px 14px",
                    borderBottom: `1px solid ${borderColor}`, fontSize: 13,
                    opacity: item.read_at ? 0.62 : 1,
                  }}
                >
                  <span aria-hidden style={{ fontSize: 15, flexShrink: 0 }}>
                    {KIND_ICONS[item.kind] ?? "🔔"}
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <b style={{ fontSize: 13 }}>{item.title}</b>
                    <span style={{ fontSize: 12, color: mutedColor }}>{item.body}</span>
                    <span style={{ fontSize: 10.5, color: mutedColor, fontWeight: 700 }}>
                      {formatWhen(item.created_at)}
                    </span>
                  </span>
                  {!item.read_at ? (
                    <span
                      aria-label="No leída"
                      style={{
                        width: 8, height: 8, borderRadius: 999, background: badgeBg,
                        flexShrink: 0, marginTop: 5, marginLeft: "auto",
                      }}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
