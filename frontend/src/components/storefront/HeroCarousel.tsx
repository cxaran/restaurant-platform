"use client";

// Carrusel de heros de la portada FIJA: cada hero es una fila de
// storefront_heros con su propia plantilla (split / background / card /
// showcase / minimal). El comportamiento (autoplay, intervalo, transición,
// controles) viene del singleton de settings — el admin configura contenido,
// el diseño fija tamaño y posición (la altura del stage no salta entre
// slides). Autoplay accesible: se pausa al pasar el cursor / enfocar y queda
// estático con prefers-reduced-motion (regla global de storefront.css).

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ctaHref, ctaLabel } from "@/core/restaurant-api/cta";
import { formatMoney, publicFileUrl, sectionScheme } from "@/core/restaurant-api/theme";
import type { CarouselVM, HeroVM } from "@/core/restaurant-api/view-models";

function HeroCta({
  cta,
  variant,
  inverse,
}: Readonly<{ cta: unknown; variant: "solid" | "outline"; inverse: boolean }>) {
  const label = ctaLabel(cta);
  const href = ctaHref(cta);
  if (!label || !href) return null;
  const external = href.startsWith("http") || href.startsWith("tel:");
  const className = variant === "solid" ? "sf-btn" : "sf-btn-outline";
  // En esquemas oscuros el outline hereda el color del texto de la sección.
  const style = variant === "outline" && inverse ? { borderColor: "currentColor", color: "inherit" } : undefined;
  return external ? (
    <a className={className} style={style} href={href} rel="noopener noreferrer" target="_blank">
      {label}
    </a>
  ) : (
    <Link className={className} style={style} href={href}>
      {label}
    </Link>
  );
}

/** Título con fragmento resaltado en color de marca (subcadena exacta). */
function HeroTitle({ hero, inverse }: Readonly<{ hero: HeroVM; inverse: boolean }>) {
  const accentColor = inverse ? "var(--sf-accent)" : "var(--sf-brand)";
  let content: React.ReactNode = hero.title;
  if (hero.title_accent && hero.title.includes(hero.title_accent)) {
    const [before, ...rest] = hero.title.split(hero.title_accent);
    content = (
      <>
        {before}
        <em style={{ fontStyle: "normal", color: accentColor }}>{hero.title_accent}</em>
        {rest.join(hero.title_accent)}
      </>
    );
  }
  return <h1 className="sf-display sf-hero-title">{content}</h1>;
}

function heroImageUrl(hero: HeroVM): string | null {
  return publicFileUrl(hero.image.desktop_file_id ?? hero.image.mobile_file_id);
}

function HeroBody({ hero, creditsEnabled = true }: Readonly<{ hero: HeroVM; creditsEnabled?: boolean }>) {
  const scheme = sectionScheme(hero.color_scheme);
  const inverse = hero.color_scheme !== "surface" && hero.color_scheme !== "surface_muted";
  const centered = hero.alignment === "center";
  const imageUrl = heroImageUrl(hero);
  const focal =
    hero.image.focal_x !== null && hero.image.focal_y !== null
      ? `${Math.round((hero.image.focal_x ?? 0.5) * 100)}% ${Math.round((hero.image.focal_y ?? 0.5) * 100)}%`
      : "center";

  const textCol = (
    <div className="sf-hero-text" data-centered={centered ? "1" : "0"}>
      {hero.eyebrow ? <span className="sf-hero-eyebrow">{hero.eyebrow}</span> : null}
      <HeroTitle hero={hero} inverse={inverse && hero.template === "background"} />
      {hero.description ? <p className="sf-hero-desc">{hero.description}</p> : null}
      <div className="sf-hero-ctas">
        <HeroCta cta={hero.primary_cta} variant={hero.button_variant === "outline" ? "outline" : "solid"} inverse={inverse} />
        <HeroCta cta={hero.secondary_cta} variant="outline" inverse={inverse} />
      </div>
    </div>
  );

  if (hero.template === "background") {
    return (
      <div className="sf-hero-bg" style={{ color: "var(--sf-text-inverse)" }}>
        <div className="sf-hero-bg-media" aria-hidden>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- media publicada del backend
            <img src={imageUrl} alt="" style={{ objectPosition: focal }} />
          ) : null}
        </div>
        <div className="sf-hero-bg-overlay" data-overlay={hero.overlay} aria-hidden />
        <div className="sf-container sf-hero-pad" data-centered={centered ? "1" : "0"}>
          {textCol}
        </div>
      </div>
    );
  }

  if (hero.template === "minimal") {
    return (
      <div className="sf-hero-surface" data-inverse={inverse ? "1" : "0"} style={{ background: scheme.background, color: scheme.color }}>
        <div className="sf-container sf-hero-pad sf-hero-minimal">{textCol}</div>
      </div>
    );
  }

  if (hero.template === "showcase") {
    const product = hero.product;
    const price =
      product?.money_price_amount != null
        ? formatMoney(product.money_price_amount)
        : creditsEnabled && product?.credit_redemption_price != null
          ? `${product.credit_redemption_price} créditos`
          : null;
    return (
      <div className="sf-hero-surface" data-inverse={inverse ? "1" : "0"} style={{ background: scheme.background, color: scheme.color }}>
        <div className="sf-container sf-hero-pad sf-hero-grid" data-image-left={hero.image_position === "left" ? "1" : "0"}>
          {textCol}
          <div className="sf-hero-dish">
            <div className="sf-hero-plate" aria-hidden={imageUrl ? undefined : true}>
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- media publicada del backend
                <img src={imageUrl} alt={hero.image.alt_text ?? product?.name ?? ""} />
              ) : (
                <span className="sf-display sf-hero-glyph">◐</span>
              )}
            </div>
            {product && price ? (
              <span className="sf-hero-price" data-unavailable={product.is_available === false ? "1" : "0"}>
                {product.is_available === false ? "Agotado hoy" : price}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (hero.template === "card") {
    return (
      <div className="sf-hero-surface" data-inverse={inverse ? "1" : "0"} style={{ background: scheme.background, color: scheme.color }}>
        <div className="sf-container sf-hero-pad sf-hero-grid" data-image-left={hero.image_position === "left" ? "1" : "0"}>
          {textCol}
          <div className="sf-hero-cardimg">
            <span className="sf-hero-cardframe" aria-hidden />
            <div className="sf-hero-cardpic">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- media publicada del backend
                <img src={imageUrl} alt={hero.image.alt_text ?? ""} style={{ objectPosition: focal }} />
              ) : (
                <span className="sf-display sf-hero-glyph">◐</span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // split (default)
  return (
    <div className="sf-hero-surface" data-inverse={inverse ? "1" : "0"} style={{ background: scheme.background, color: scheme.color }}>
      <div className="sf-container sf-hero-pad sf-hero-grid" data-image-left={hero.image_position === "left" ? "1" : "0"}>
        {textCol}
        <div className="sf-hero-imgbox" aria-hidden={imageUrl ? undefined : true}>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- media publicada del backend
            <img src={imageUrl} alt={hero.image.alt_text ?? ""} style={{ objectPosition: focal }} />
          ) : (
            <span className="sf-display sf-hero-glyph">◐</span>
          )}
        </div>
      </div>
    </div>
  );
}

const HEIGHT_RANK: Record<string, number> = { compact: 0, regular: 1, tall: 2 };

export function HeroCarousel({
  heros,
  carousel,
  preview = false,
  creditsEnabled = true,
}: Readonly<{ heros: HeroVM[]; carousel: CarouselVM; preview?: boolean; creditsEnabled?: boolean }>) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reduced = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  const multiple = heros.length > 1;
  const current = Math.min(index, Math.max(heros.length - 1, 0));
  const playing = carousel.autoplay && multiple && !paused && !reduced && !preview;

  const advance = useCallback(
    (step: number) => {
      setIndex((value) => (value + step + heros.length) % Math.max(heros.length, 1));
    },
    [heros.length],
  );

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (playing) {
      timerRef.current = setInterval(() => advance(1), carousel.interval_seconds * 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [playing, carousel.interval_seconds, advance, current]);

  if (heros.length === 0) return null;
  const hero = heros[current];
  // La altura del stage es FIJA por carrusel (la mayor configurada): cambiar
  // de slide jamás mueve el layout de la página.
  const tallest = heros.reduce(
    (max, item) => (HEIGHT_RANK[item.height] > HEIGHT_RANK[max] ? item.height : max),
    "compact",
  );

  return (
    <section
      aria-roledescription={multiple ? "carrusel" : undefined}
      aria-label="Portada"
      className="sf-hero"
      data-height={tallest}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div
        key={`${hero.id}-${current}`}
        className="sf-hero-slide"
        data-transition={carousel.transition === "fade" ? "fade" : "slide"}
      >
        <HeroBody hero={hero} creditsEnabled={creditsEnabled} />
      </div>

      {multiple && playing ? (
        <div className="sf-hero-progress" aria-hidden>
          <i style={{ animationDuration: `${carousel.interval_seconds}s` }} key={current} />
        </div>
      ) : null}

      {multiple && carousel.show_arrows ? (
        <>
          <button
            type="button"
            className="sf-hero-arrow"
            data-side="left"
            aria-label="Hero anterior"
            onClick={() => advance(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            className="sf-hero-arrow"
            data-side="right"
            aria-label="Hero siguiente"
            onClick={() => advance(1)}
          >
            ›
          </button>
        </>
      ) : null}

      {multiple && carousel.show_dots ? (
        <div className="sf-hero-dots">
          {heros.map((item, i) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Ir a portada ${i + 1}`}
              aria-current={i === current}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
