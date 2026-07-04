import type { PublicBusiness } from "@/core/restaurant-api/contracts";

// Identidad de marca: logo + nombre comercial + slogan desde configuración
// pública. El nombre usa la fuente display del tema (no hay campo backend para
// una fuente exclusiva de marca; fallback documentado en el plan §3).
// `logoUrl` llega YA VERIFICADO por content-type raster (§D, riesgo H8):
// null significa "sin logo seguro" → monograma textual.
export function BrandLockup({
  business,
  logoUrl = null,
  compact = false,
}: Readonly<{ business: PublicBusiness | null; logoUrl?: string | null; compact?: boolean }>) {
  const name = business?.trade_name ?? "Mi Restaurante";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 12, minWidth: 0 }}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- archivo dinámico servido por el backend
        <img
          src={logoUrl}
          alt=""
          width={compact ? 38 : 46}
          height={compact ? 38 : 46}
          style={{ objectFit: "contain", flexShrink: 0 }}
        />
      ) : (
        <span
          aria-hidden
          className="sf-display"
          style={{
            width: compact ? 38 : 46,
            height: compact ? 38 : 46,
            borderRadius: "50%",
            background: "var(--sf-brand)",
            color: "var(--sf-text-inverse)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: compact ? 18 : 22,
            flexShrink: 0,
          }}
        >
          {name.charAt(0).toUpperCase()}
        </span>
      )}
      <span style={{ display: "inline-flex", flexDirection: "column", minWidth: 0 }}>
        <span
          className="sf-display"
          style={{
            fontSize: compact ? 16 : 19,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {name}
        </span>
        {!compact && business?.slogan ? (
          <span className="sf-muted" style={{ fontSize: 12 }}>{business.slogan}</span>
        ) : null}
      </span>
    </span>
  );
}
