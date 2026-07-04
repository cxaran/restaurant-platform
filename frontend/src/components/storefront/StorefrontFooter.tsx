import type { PublicBusiness } from "@/core/restaurant-api/contracts";

export function StorefrontFooter({ business }: Readonly<{ business: PublicBusiness | null }>) {
  const phones = business?.phones ?? [];
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
          {business?.slogan ? <span>{business.slogan}</span> : null}
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
