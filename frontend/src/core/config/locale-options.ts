// Opciones precargadas para selectores de zona horaria y moneda. Compartidas
// entre el perfil del negocio (/admin/negocio) y la configuración de backups
// (/admin/backups). El backend valida el valor real (IANA completa / ISO 4217);
// esto solo precarga las opciones usuales de la región.

export type LabeledOption = { value: string; label: string };

// Zonas horarias IANA más comunes (América Latina + referencias globales).
export const COMMON_TIMEZONES: ReadonlyArray<LabeledOption> = [
  { value: "America/Mexico_City", label: "Ciudad de México (America/Mexico_City)" },
  { value: "America/Tijuana", label: "Tijuana (America/Tijuana)" },
  { value: "America/Monterrey", label: "Monterrey (America/Monterrey)" },
  { value: "America/Cancun", label: "Cancún (America/Cancun)" },
  { value: "America/Hermosillo", label: "Hermosillo (America/Hermosillo)" },
  { value: "America/Bogota", label: "Bogotá (America/Bogota)" },
  { value: "America/Lima", label: "Lima (America/Lima)" },
  { value: "America/Santiago", label: "Santiago (America/Santiago)" },
  { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires (America/Argentina/Buenos_Aires)" },
  { value: "America/Guatemala", label: "Guatemala (America/Guatemala)" },
  { value: "America/Costa_Rica", label: "San José (America/Costa_Rica)" },
  { value: "America/New_York", label: "Nueva York (America/New_York)" },
  { value: "America/Chicago", label: "Chicago (America/Chicago)" },
  { value: "America/Los_Angeles", label: "Los Ángeles (America/Los_Angeles)" },
  { value: "Europe/Madrid", label: "Madrid (Europe/Madrid)" },
  { value: "UTC", label: "UTC" },
];

// Monedas ISO 4217 más comunes de la región.
export const COMMON_CURRENCIES: ReadonlyArray<LabeledOption> = [
  { value: "MXN", label: "MXN — Peso mexicano" },
  { value: "USD", label: "USD — Dólar estadounidense" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "COP", label: "COP — Peso colombiano" },
  { value: "ARS", label: "ARS — Peso argentino" },
  { value: "CLP", label: "CLP — Peso chileno" },
  { value: "PEN", label: "PEN — Sol peruano" },
  { value: "GTQ", label: "GTQ — Quetzal guatemalteco" },
  { value: "CRC", label: "CRC — Colón costarricense" },
  { value: "BRL", label: "BRL — Real brasileño" },
  { value: "CAD", label: "CAD — Dólar canadiense" },
];

/** Opciones con el valor actual incluido aunque no esté en la lista precargada. */
export function withCurrent(
  options: ReadonlyArray<LabeledOption>,
  current: string,
): ReadonlyArray<LabeledOption> {
  if (!current || options.some((option) => option.value === current)) return options;
  return [{ value: current, label: current }, ...options];
}
