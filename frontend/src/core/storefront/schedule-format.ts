// Formato de horas del horario de atención para el SITIO (storefront).
// El backend entrega "HH:MM:SS" (24 h); al cliente se le muestra en 12 h con
// a.m./p.m. usando la convención es-MX, igual que el reloj del POS.

const TIME_12H = new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit" });

/** "HH:MM:SS" o "HH:MM" → "1:00 p.m." (12 h). Devuelve "HH:MM" si no parsea. */
export function formatTime12h(value: string): string {
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return value.slice(0, 5);
  return TIME_12H.format(new Date(2000, 0, 1, h, m));
}
