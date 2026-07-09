import type { Metadata } from "next";
import Link from "next/link";

import { getPublicBusiness, getPublicSchedule } from "@/core/restaurant-api/business";
import { formatTime12h } from "@/core/storefront/schedule-format";

// Página de HORARIO de atención: la semana completa (7 días) derivada del horario
// semanal recurrente del negocio. Enlazada desde el footer y desde el carrito
// cuando el pedido web está bloqueado por horario. Composición fija en código.

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Horario de atención" };

const DAY_NAMES = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

export default async function SchedulePage() {
  const [schedule, business] = await Promise.all([
    getPublicSchedule(),
    getPublicBusiness(),
  ]);
  const name = business?.trade_name ?? "nuestro restaurante";
  const days = schedule?.days ?? [];
  const today = schedule?.today_weekday ?? -1;
  const hasAny = days.some((day) => day.slots.length > 0);

  return (
    <div className="sf-container" style={{ paddingBlock: 24, maxWidth: 560 }}>
      <div className="sf-cart-head">
        <Link href="/" className="sf-pd-back sf-cart-back" aria-label="Volver al inicio">
          ‹
        </Link>
        <h1 className="sf-display" style={{ fontSize: 26, margin: 0, flex: 1 }}>
          Horario de atención
        </h1>
      </div>

      {schedule ? (
        <div
          role="status"
          className="sf-card"
          style={{
            padding: "10px 16px",
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontWeight: 700,
          }}
        >
          <span aria-hidden>{schedule.is_open_now ? "🟢" : "🔴"}</span>
          <span>{schedule.is_open_now ? "Abierto ahora" : "Cerrado ahora"}</span>
        </div>
      ) : null}

      {hasAny ? (
        <ul
          className="sf-card"
          style={{
            listStyle: "none",
            margin: 0,
            padding: "6px 4px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {days.map((day) => {
            const isToday = day.day_of_week === today;
            return (
              <li
                key={day.day_of_week}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 14px",
                  borderRadius: 10,
                  ...(isToday ? { background: "var(--sf-surface-muted)" } : {}),
                }}
              >
                <span style={{ fontWeight: isToday ? 800 : 700 }}>
                  {DAY_NAMES[day.day_of_week]}
                  {isToday ? " · hoy" : ""}
                </span>
                <span
                  className={day.slots.length === 0 ? "sf-muted" : undefined}
                  style={{ textAlign: "right" }}
                >
                  {day.slots.length === 0
                    ? "Cerrado"
                    : day.slots
                        .map((slot) => `${formatTime12h(slot.opens_at)} – ${formatTime12h(slot.closes_at)}`)
                        .join(" y ")}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="sf-card" style={{ padding: 24, textAlign: "center" }}>
          <p className="sf-muted" style={{ margin: 0 }}>
            El horario de atención aún no está publicado. Escríbenos o llámanos para
            confirmar.
          </p>
        </div>
      )}

      <p className="sf-muted" style={{ fontSize: 12, marginTop: 12 }}>
        Horario de {name}. Puede variar en días festivos.
      </p>
    </div>
  );
}
