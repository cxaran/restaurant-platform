// Footer configurable (Turno 11d/e/f): TRES plantillas fijas en código —
// «barra» (franja mínima de una línea), «columnas» (completo) y «centrado».
// El eslogan y los teléfonos vienen del negocio (el footer solo decide SI se
// muestran); las redes sociales son los únicos datos propios (https validado
// en backend). Los enlaces de las columnas son navegación FIJA del sitio.

import Link from "next/link";

import { CookiePreferencesLink } from "@/components/analytics/CookiePreferencesLink";
import { FooterPhoneLink } from "@/components/storefront/FooterPhoneLink";
import type { PublicBusiness } from "@/core/restaurant-api/contracts";
import type { FooterVM } from "@/core/restaurant-api/view-models";
import { formatTime12h } from "@/core/storefront/schedule-format";

const NETWORK_LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  youtube: "YouTube",
  x: "X",
};

function SocialIcon({ network }: Readonly<{ network: string }>) {
  switch (network) {
    case "instagram":
      return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case "facebook":
      return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M13 22v-8h2.7l.4-3.1H13V8.9c0-.9.25-1.5 1.5-1.5H16V4.6c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.45-4 4.1v2.3H6.9V14h2.7v8H13z" />
        </svg>
      );
    case "whatsapp":
      return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 2a10 10 0 00-8.5 15.3L2 22l4.8-1.5A10 10 0 1012 2zm4.4 12.2c-.24-.12-1.4-.7-1.6-.77-.2-.08-.36-.12-.5.12-.16.24-.6.77-.73.93-.13.16-.27.18-.5.06-.24-.12-1-.37-1.9-1.18-.7-.62-1.18-1.4-1.32-1.63-.13-.24 0-.36.1-.48.1-.1.24-.27.35-.4.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.5-1.23-.7-1.68-.18-.43-.36-.37-.5-.38h-.42c-.14 0-.38.06-.58.3-.2.24-.76.75-.76 1.82 0 1.08.78 2.12.9 2.27.12.16 1.54 2.36 3.74 3.3.52.23.93.36 1.25.46.52.17 1 .14 1.37.09.42-.06 1.4-.57 1.6-1.13.2-.55.2-1.02.14-1.12-.06-.1-.22-.16-.46-.28z" />
        </svg>
      );
    case "tiktok":
      return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M16 3v3.2a4.8 4.8 0 003.5 1.5v2.6a7.3 7.3 0 01-3.5-.9v5.3a5.2 5.2 0 11-5.2-5.2c.27 0 .53.02.8.06v2.7a2.5 2.5 0 102.1 2.46V3H16z" />
        </svg>
      );
    case "youtube":
      return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M21.6 7.2a2.5 2.5 0 00-1.76-1.77C18.25 5 12 5 12 5s-6.25 0-7.84.43A2.5 2.5 0 002.4 7.2 26 26 0 002 12a26 26 0 00.4 4.8 2.5 2.5 0 001.76 1.77C5.75 19 12 19 12 19s6.25 0 7.84-.43a2.5 2.5 0 001.76-1.77A26 26 0 0022 12a26 26 0 00-.4-4.8zM10 15V9l5.2 3L10 15z" />
        </svg>
      );
    case "x":
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M17.6 3h3l-6.6 7.5L22 21h-6.1l-4.8-6.2L5.6 21h-3l7-8L2.4 3h6.3l4.3 5.7L17.6 3zm-1.1 16.2h1.7L7.7 4.7H5.9l10.6 14.5z" />
        </svg>
      );
    default:
      return null;
  }
}

function scheduleText(footer: FooterVM): string | null {
  if (!footer.schedule) return null;
  const slots = footer.schedule.today_slots;
  if (slots.length === 0) return "Hoy no hay servicio";
  return `Hoy · ${slots
    .map((slot) => `${formatTime12h(slot.opens_at ?? "")} – ${formatTime12h(slot.closes_at ?? "")}`)
    .join(" y ")}`;
}

function phoneHref(phone: { phone_normalized: string; is_whatsapp: boolean }): string {
  return phone.is_whatsapp
    ? `https://wa.me/${phone.phone_normalized.replace(/\D/g, "")}`
    : `tel:${phone.phone_normalized}`;
}

export function StorefrontFooter({
  business,
  footer = null,
  logoUrl = null,
}: Readonly<{
  business: PublicBusiness | null;
  footer?: FooterVM | null;
  logoUrl?: string | null;
}>) {
  const template = footer?.template ?? "barra";
  const name = business?.trade_name ?? "Mi Restaurante";
  const slogan = footer?.slogan ?? null;
  const phones = footer?.phones ?? [];
  const social = footer?.social_links ?? [];
  const schedule = footer ? scheduleText(footer) : null;
  const year = new Date().getFullYear();

  const socialRow =
    social.length > 0 ? (
      <div className="sf-ft-social">
        {social.map((link) => (
          <a
            key={link.network}
            href={link.url}
            aria-label={NETWORK_LABEL[link.network] ?? link.network}
            rel="noopener noreferrer"
            target="_blank"
          >
            <SocialIcon network={link.network} />
          </a>
        ))}
      </div>
    ) : null;

  const phonesBlock = phones.map((phone) => (
    <FooterPhoneLink
      key={phone.phone_normalized}
      href={phoneHref(phone)}
      isWhatsapp={phone.is_whatsapp}
      label={phone.phone}
    />
  ));

  const legal = (
    <div className="sf-ft-legal">
      <span>© {year} {name} · Todos los derechos reservados</span>
      <Link href="/horario">Horario</Link>
      <Link href="/terminos">Términos y condiciones</Link>
      {/* Preferencia de cookies analíticas: solo aparece si la instalación
          gestiona consentimiento (analítica activa + consentimiento exigido). */}
      <CookiePreferencesLink />
    </div>
  );

  if (template === "columnas") {
    return (
      <footer className="sf-ft" data-template="columnas" data-scheme={footer?.color_scheme ?? "dark"}>
        <div className="sf-container sf-ft-cols">
          <div className="sf-ft-brandcol">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- logo raster verificado del negocio
                <img src={logoUrl} alt="" style={{ width: 44, height: "auto" }} />
              ) : null}
              <span className="sf-display sf-ft-name">{name}</span>
            </div>
            {slogan ? <span className="sf-display sf-ft-slogan">{slogan}</span> : null}
            {socialRow}
          </div>
          {footer?.show_links !== false ? (
            <>
              <div className="sf-ft-col">
                <span className="sf-ft-h">Menú</span>
                <Link href="/menu">Ver el menú</Link>
                {business?.credits_enabled !== false ? (
                  <Link href="/creditos">Créditos</Link>
                ) : null}
                <Link href="/carrito">Mi carrito</Link>
              </div>
              <div className="sf-ft-col">
                <span className="sf-ft-h">Ayuda</span>
                <Link href="/pedidos">Rastrear pedido</Link>
                <Link href="/cuenta">Mi cuenta</Link>
              </div>
            </>
          ) : null}
          <div className="sf-ft-col">
            <span className="sf-ft-h">Contacto</span>
            {phonesBlock}
            {footer?.address ? <span className="sf-ft-line">📍 {footer.address}</span> : null}
            {schedule ? (
              <Link href="/horario" className="sf-ft-line">🕑 {schedule}</Link>
            ) : null}
          </div>
        </div>
        <div className="sf-container">{legal}</div>
      </footer>
    );
  }

  if (template === "centrado") {
    return (
      <footer className="sf-ft" data-template="centrado" data-scheme={footer?.color_scheme ?? "soft"}>
        <div className="sf-container sf-ft-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo raster verificado del negocio
            <img src={logoUrl} alt="" style={{ width: 50, height: "auto" }} />
          ) : null}
          <span className="sf-display sf-ft-name">{name}</span>
          {slogan ? <span className="sf-display sf-ft-slogan">{slogan}</span> : null}
          {schedule ? (
            <Link href="/horario" className="sf-ft-line">{schedule}</Link>
          ) : null}
          {socialRow}
          {phones.length > 0 ? <div className="sf-ft-phonerow">{phonesBlock}</div> : null}
          {legal}
        </div>
      </footer>
    );
  }

  // barra (franja mínima de una línea)
  return (
    <footer className="sf-ft" data-template="barra" data-scheme={footer?.color_scheme ?? "dark"}>
      <div className="sf-container sf-ft-bar">
        <div className="sf-ft-brandrow">
          <span className="sf-display sf-ft-name">{name}</span>
          {slogan ? <span className="sf-ft-slogan-inline">{slogan}</span> : null}
        </div>
        <div className="sf-ft-barright">
          {phonesBlock}
          {socialRow}
        </div>
        {legal}
      </div>
    </footer>
  );
}
