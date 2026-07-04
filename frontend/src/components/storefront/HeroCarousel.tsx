"use client";

// Hero con rotación (§34.1): UNA plantilla con slides — split/background/minimal
// son variantes de cada slide, no plantillas separadas. Sin autoplay: rotación
// manual accesible (controles, teclado, indicadores) y sin movimiento si el
// usuario prefiere reducirlo.

import { useState, type ReactNode } from "react";

export type HeroSlideVM = {
  variant?: "split" | "background" | "minimal";
  eyebrow?: string | null;
  title: string;
  description?: string | null;
  primary_cta?: unknown;
  secondary_cta?: unknown;
  // Los CTA llegan YA renderizados desde el Server Component (un callback no
  // puede cruzar la frontera server→client; los elementos sí son serializables).
  primaryCtaNode?: ReactNode;
  secondaryCtaNode?: ReactNode;
};

export function HeroCarousel({
  slides,
  background,
  color,
  alignment,
  mediaUrl = null,
  mediaAlt = "",
}: Readonly<{
  slides: HeroSlideVM[];
  background: string;
  color: string;
  alignment: "left" | "center";
  mediaUrl?: string | null;
  mediaAlt?: string;
}>) {
  const [index, setIndex] = useState(0);
  const slide = slides[Math.min(index, slides.length - 1)];
  const multiple = slides.length > 1;

  const titleParts = slide.title.split(" ");
  const lastWord = titleParts.length > 1 ? titleParts.pop() : null;

  return (
    <section
      aria-roledescription={multiple ? "carrusel" : undefined}
      aria-label="Portada"
      style={{ background, color }}
    >
      <div
        className="sf-container"
        style={{
          display: "grid",
          gridTemplateColumns: slide.variant === "split" ? "minmax(0, 1.1fr) minmax(0, 0.9fr)" : "1fr",
          gap: 32,
          alignItems: "center",
          paddingBlock: slide.variant === "minimal" ? 34 : 54,
          textAlign: alignment,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: alignment === "center" ? "center" : "flex-start" }}>
          {slide.eyebrow ? (
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--sf-brand)" }}>
              {slide.eyebrow}
            </div>
          ) : null}
          <h1 className="sf-display" style={{ fontSize: "clamp(34px, 6vw, 54px)", lineHeight: 1.05, margin: 0 }}>
            {lastWord ? (
              <>
                {titleParts.join(" ")} <span style={{ color: "var(--sf-brand)" }}>{lastWord}</span>
              </>
            ) : (
              slide.title
            )}
          </h1>
          {slide.description ? (
            <p className="sf-muted" style={{ fontSize: 17, lineHeight: 1.55, maxWidth: 460, margin: 0 }}>
              {slide.description}
            </p>
          ) : null}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: alignment === "center" ? "center" : "flex-start" }}>
            {slide.primaryCtaNode}
            {slide.secondaryCtaNode}
          </div>
        </div>
        {slide.variant === "split" ? (
          <div
            className="sf-imgbox"
            style={{ minHeight: 220, alignSelf: "stretch" }}
            aria-hidden={mediaUrl ? undefined : true}
          >
            {/* Slot de imagen del hero: se renderiza cuando el payload publicado
                incluya media. La ADMINISTRACIÓN de media aún no tiene API
                (plan §4) — sin botones de carga simulada. */}
            {mediaUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- media publicada del backend
              <img
                src={mediaUrl}
                alt={mediaAlt}
                style={{ maxWidth: "100%", maxHeight: 320, objectFit: "contain" }}
              />
            ) : (
              <span className="sf-display" style={{ fontSize: 52, opacity: 0.18 }}>◐</span>
            )}
          </div>
        ) : null}
      </div>
      {multiple ? (
        <div
          className="sf-container"
          style={{ display: "flex", gap: 10, alignItems: "center", paddingBottom: 18, justifyContent: "center" }}
        >
          <button
            type="button"
            className="sf-chip"
            aria-label="Anterior"
            onClick={() => setIndex((index - 1 + slides.length) % slides.length)}
          >
            ‹
          </button>
          {slides.map((item, i) => (
            <button
              key={`${item.title}-${i}`}
              type="button"
              aria-label={`Ir a portada ${i + 1}`}
              aria-current={i === index}
              onClick={() => setIndex(i)}
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                border: "none",
                cursor: "pointer",
                background: i === index ? "var(--sf-brand)" : "color-mix(in srgb, currentColor 30%, transparent)",
              }}
            />
          ))}
          <button
            type="button"
            className="sf-chip"
            aria-label="Siguiente"
            onClick={() => setIndex((index + 1) % slides.length)}
          >
            ›
          </button>
        </div>
      ) : null}
    </section>
  );
}
