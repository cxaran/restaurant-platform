"use client";

// Enlace de contacto telefónico del footer con analítica (whatsapp_click /
// phone_click). Client leaf: el footer sigue siendo server component. Solo se
// mide el clic y su ubicación; el número no viaja a la analítica.

import { trackEvent } from "@/core/analytics/analytics";

export function FooterPhoneLink({
  href,
  isWhatsapp,
  label,
}: Readonly<{ href: string; isWhatsapp: boolean; label: string }>) {
  return (
    <a
      href={href}
      rel="noopener noreferrer"
      target={isWhatsapp ? "_blank" : undefined}
      className="sf-ft-phone"
      onClick={() =>
        trackEvent(isWhatsapp ? "whatsapp_click" : "phone_click", {
          link_location: "footer",
        })
      }
    >
      {isWhatsapp ? "💬 WhatsApp " : "📞 "}
      {label}
    </a>
  );
}
