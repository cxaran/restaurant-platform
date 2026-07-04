"use client";

// Destacados por superficie (Turno 11c): el admin elige mensaje, tono
// (brand/soft/accent) y animación; el DISEÑO fija tamaño y posición por
// superficie — un destacado jamás puede crecer y romper el layout. Todas las
// animaciones usan solo opacity/transform y se apagan con
// prefers-reduced-motion (regla global de storefront.css).
//
// Variantes visuales por superficie:
//   global   → cinta superior descartable (slide_down)
//   home     → franja bajo el hero (shimmer)
//   login/register/account → tarjeta (rise/fade)
//   cart     → nudge con badge que late (shimmer + pulse)
//   checkout → fila de chips de confianza (fade/estático)

import Link from "next/link";
import { useEffect, useState } from "react";

import { browserApi } from "@/core/api/browser-client";
import { ctaHref, ctaLabel } from "@/core/restaurant-api/cta";
import {
  toHighlightVM,
  type HighlightVM,
  type PublicHighlight,
} from "@/core/restaurant-api/view-models";

export type HighlightVariant = "ribbon" | "strip" | "card" | "nudge" | "chip";

export function variantForSurface(surface: string): HighlightVariant {
  switch (surface) {
    case "global":
      return "ribbon";
    case "home":
      return "strip";
    case "cart":
      return "nudge";
    case "checkout":
      return "chip";
    default:
      return "card";
  }
}

function HighlightCta({ cta }: Readonly<{ cta: unknown }>) {
  const label = ctaLabel(cta);
  const href = ctaHref(cta);
  if (!label || !href) return null;
  const external = href.startsWith("http") || href.startsWith("tel:");
  return external ? (
    <a className="sf-hl-cta" href={href} rel="noopener noreferrer" target="_blank">
      {label}
    </a>
  ) : (
    <Link className="sf-hl-cta" href={href}>
      {label}
    </Link>
  );
}

export function HighlightBanner({
  highlight,
  variant,
}: Readonly<{ highlight: HighlightVM; variant?: HighlightVariant }>) {
  const resolved = variant ?? variantForSurface(highlight.surface);
  const anim = highlight.animation;
  const marquee = anim === "marquee" && resolved === "ribbon";

  return (
    <div
      className="sf-hl"
      data-variant={resolved}
      data-scheme={highlight.color_scheme}
      data-anim={anim}
      role="note"
    >
      {anim === "shimmer" ? <span className="sf-hl-shimmer" aria-hidden /> : null}
      {highlight.icon ? (
        <span className="sf-hl-icon" data-pulse={anim === "pulse" ? "1" : "0"} aria-hidden>
          {highlight.icon}
        </span>
      ) : null}
      <span className="sf-hl-msg" data-marquee={marquee ? "1" : "0"}>
        {marquee ? (
          <span className="sf-hl-marquee">
            <span>{highlight.title}</span>
            <span aria-hidden>{highlight.title}</span>
          </span>
        ) : (
          <>
            {highlight.eyebrow ? (
              <span className="sf-hl-eyebrow">{highlight.eyebrow}</span>
            ) : null}
            <b className="sf-hl-title">{highlight.title}</b>
            {highlight.subtitle ? (
              <span className="sf-hl-sub">{highlight.subtitle}</span>
            ) : null}
          </>
        )}
      </span>
      <HighlightCta cta={highlight.cta} />
    </div>
  );
}

/** Cinta global sobre el header: descartable por sesión (id en sessionStorage). */
export function GlobalRibbon({ highlights }: Readonly<{ highlights: HighlightVM[] }>) {
  const [dismissed, setDismissed] = useState<string[] | null>(null);

  useEffect(() => {
    // Lectura diferida (callback rAF): evita el mismatch de hidratación y el
    // setState síncrono dentro del efecto.
    const frame = requestAnimationFrame(() => {
      let stored: string[] = [];
      try {
        stored = JSON.parse(sessionStorage.getItem("sf-ribbon-dismissed") ?? "[]");
      } catch {
        stored = [];
      }
      setDismissed(stored);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const visible = dismissed
    ? highlights.find((item) => !dismissed.includes(item.id))
    : null;
  if (!visible) return null;

  return (
    <div className="sf-hl-ribbonwrap">
      <HighlightBanner highlight={visible} variant="ribbon" />
      <button
        type="button"
        className="sf-hl-dismiss"
        aria-label="Cerrar aviso"
        onClick={() => {
          const next = [...(dismissed ?? []), visible.id];
          setDismissed(next);
          try {
            sessionStorage.setItem("sf-ribbon-dismissed", JSON.stringify(next));
          } catch {
            // sin storage el aviso simplemente reaparece: aceptable
          }
        }}
      >
        ✕
      </button>
    </div>
  );
}

/** Slot para páginas CLIENTE (carrito/checkout): consulta la superficie al
 * montar. Las páginas server usan getPublicHighlights + HighlightBanner. */
export function SurfaceHighlights({
  surface,
  variant,
}: Readonly<{ surface: string; variant?: HighlightVariant }>) {
  const [items, setItems] = useState<HighlightVM[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const raw = await browserApi<PublicHighlight[]>(
          `/api/v1/public/storefront/highlights?surface=${encodeURIComponent(surface)}`,
        );
        if (active) setItems(raw.map(toHighlightVM));
      } catch {
        if (active) setItems([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [surface]);

  if (items.length === 0) return null;
  const resolved = variant ?? variantForSurface(surface);
  if (resolved === "chip") {
    return (
      <div className="sf-hl-chiprow">
        {items.map((item) => (
          <HighlightBanner key={item.id} highlight={item} variant="chip" />
        ))}
      </div>
    );
  }
  // Superficies de un solo slot: se muestra el primero (orden del backend).
  return <HighlightBanner highlight={items[0]} variant={resolved} />;
}
