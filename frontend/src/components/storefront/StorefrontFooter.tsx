import type { PublicBusiness } from "@/core/restaurant-api/contracts";
import type { StorefrontLayoutVM } from "@/core/restaurant-api/view-models";

export function StorefrontFooter({
  business,
  layout = null,
}: Readonly<{ business: PublicBusiness | null; layout?: StorefrontLayoutVM }>) {
  const showPhones = layout?.footer?.show_phones !== false;
  const note = typeof layout?.footer?.note === "string" ? layout.footer.note : null;
  const phones = showPhones ? business?.phones ?? [] : [];
  return (
    <footer
      style={{
        marginTop: "auto",
        background: "var(--sf-brand-2)",
        color: "color-mix(in srgb, var(--sf-text-inverse) 78%, transparent)",
      }}
    >
      <div
        className="sf-container"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 18,
          alignItems: "center",
          justifyContent: "space-between",
          paddingBlock: 24,
          fontSize: 14,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            className="sf-display"
            style={{ color: "var(--sf-text-inverse)", fontSize: 16, textTransform: "uppercase" }}
          >
            {business?.trade_name ?? "Mi Restaurante"}
          </span>
          {note ? <span>{note}</span> : business?.slogan ? <span>{business.slogan}</span> : null}
        </div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontWeight: 600 }}>
          {phones.map((phone) => (
            <a
              key={phone.phone_normalized}
              href={
                phone.is_whatsapp
                  ? `https://wa.me/${phone.phone_normalized.replace(/\D/g, "")}`
                  : `tel:${phone.phone_normalized}`
              }
              rel="noopener noreferrer"
              target={phone.is_whatsapp ? "_blank" : undefined}
              style={{ color: "inherit", textDecoration: "none" }}
            >
              {phone.is_whatsapp ? "WhatsApp " : "Tel. "}
              {phone.phone}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
