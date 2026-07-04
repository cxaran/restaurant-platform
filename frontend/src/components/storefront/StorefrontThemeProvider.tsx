import type { CSSProperties, ReactNode } from "react";

import { resolveFontKey, themeToCssVars } from "@/core/restaurant-api/theme";
import type { ThemeTokens } from "@/core/restaurant-api/view-models";

// Regla central: público y preview usan ESTE mismo provider; la única
// diferencia entre ambos es la revisión consultada.
export function StorefrontThemeProvider({
  tokens,
  fontVars,
  children,
}: Readonly<{
  tokens: ThemeTokens;
  /** Clases de next/font que definen --sf-font-display / --sf-font-body. */
  fontVars: string;
  children: ReactNode;
}>) {
  const fontKey = resolveFontKey(tokens.typography.font_family_key);
  // Cada clave autorizada apunta a la variable que definen las clases de
  // next/font cargadas en el layout; jamás una fuente arbitraria remota.
  const display: Record<string, string> = {
    display_slab: "var(--font-sf-slab)",
    modern_sans: "var(--font-sf-sans)",
    classic_serif: "var(--font-sf-serif)",
    friendly_rounded: "var(--font-sf-rounded)",
  };
  const vars = {
    ...themeToCssVars(tokens),
    "--sf-font-display": display[fontKey],
    "--sf-font-body": "var(--font-sf-sans)",
  } as CSSProperties;
  return (
    <div className={`sf-root ${fontVars}`} style={vars} data-sf-font={fontKey}>
      {children}
    </div>
  );
}
