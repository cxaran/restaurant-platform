"use client";

// Resumen del admin (pantalla 1i del handoff): métricas del rango elegido a
// partir de endpoints REALES — /reports/sales-by-hour, /reports/top-products,
// /finances/summary y /finances/entries. Las tarjetas del diseño sin endpoint
// (cobros por envío, corte de caja, desglose en línea/mostrador) se omiten a
// propósito: aquí no se inventan datos.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ApiRequestError } from "@/core/api/api-error";
import { browserApi } from "@/core/api/browser-client";
import type {
  SalesByHourReport,
  TopProductsReport,
} from "@/core/restaurant-api/contracts";
import { formatMoney } from "@/core/restaurant-api/theme";
import type { components } from "@/generated/openapi";

// Tipos generados sin alias en contracts.ts (ese archivo no se toca aquí):
// siguen viniendo ÚNICAMENTE de src/generated/openapi.ts.
type BusinessSummary = components["schemas"]["BusinessSummaryRead"];
type FinancialEntry = components["schemas"]["FinancialEntryRead"];

type RangeKey = "today" | "week" | "month";

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: "today", label: "Hoy" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mes" },
];

// Etiquetas cosméticas para movimientos sin descripción (no autorizan nada).
const ENTRY_TYPE_LABELS: Record<string, string> = {
  payment_income: "Cobro de pedido",
  manual_income: "Ingreso manual",
  expense: "Gasto",
  delivery_expense: "Gasto de reparto",
  refund: "Devolución",
  adjustment: "Ajuste",
};

function localDate(value: Date): string {
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

// Rango en días locales: hoy / semana en curso (desde lunes) / mes en curso.
function rangeDays(range: RangeKey): { from: string; to: string } {
  const now = new Date();
  const to = localDate(now);
  if (range === "today") return { from: to, to };
  if (range === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return { from: localDate(start), to };
  }
  return { from: localDate(new Date(now.getFullYear(), now.getMonth(), 1)), to };
}

// /finances/* filtra por datetime ([from, to)): medianoche local → ISO UTC.
function utcBounds(from: string, to: string): { fromIso: string; toIso: string } {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  end.setDate(end.getDate() + 1);
  return { fromIso: start.toISOString(), toIso: end.toISOString() };
}

function hourLabel(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}${hour < 12 ? "am" : "pm"}`;
}

function todayHuman(): string {
  const text = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Color de barra estilo 1i: pico en acento, vecinas cobre, resto neutro.
function barColor(index: number, peakIndex: number): string {
  if (index === peakIndex) return "var(--accent)";
  if (Math.abs(index - peakIndex) === 1) return "#C97E52";
  return "var(--border2)";
}

function progressColor(rank: number): string {
  if (rank === 0) return "var(--accent)";
  if (rank === 1) return "#C97E52";
  return "var(--border2)";
}

function MetricCard({
  label,
  value,
  sub,
  variant = "light",
  valueColor,
}: {
  label: string;
  value: string;
  sub: string;
  variant?: "dark" | "light" | "green";
  valueColor?: string;
}) {
  const surface =
    variant === "dark"
      ? { background: "var(--side-bg)", color: "var(--side-strong)", border: "1px solid var(--side-bg)" }
      : variant === "green"
        ? { background: "var(--ok)", color: "#F0F8F2", border: "1px solid var(--ok)" }
        : { background: "var(--panel)", color: "var(--tx)", border: "1px solid var(--border)" };
  const muted =
    variant === "dark" ? "var(--side-tx)" : variant === "green" ? "#BEDCC8" : "var(--tx3)";
  return (
    <div
      style={{
        ...surface,
        borderRadius: 16,
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 5,
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.5px",
          textTransform: "uppercase",
          color: muted,
        }}
      >
        {label}
      </span>
      <span className="tt-display" style={{ fontSize: 28, color: valueColor }}>
        {value}
      </span>
      <span style={{ fontSize: 12, color: muted }}>{sub}</span>
    </div>
  );
}

export function ResumenView() {
  const [range, setRange] = useState<RangeKey>("today");
  const [salesByHour, setSalesByHour] = useState<SalesByHourReport | null>(null);
  const [topProducts, setTopProducts] = useState<TopProductsReport | null>(null);
  const [summary, setSummary] = useState<BusinessSummary | null>(null);
  const [entries, setEntries] = useState<FinancialEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const { from, to } = rangeDays(range);
    const { fromIso, toIso } = utcBounds(from, to);
    const reportRange = `?date_from=${from}&date_to=${to}`;
    const financeRange = `?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`;
    Promise.all([
      browserApi<SalesByHourReport>(`/api/v1/reports/sales-by-hour${reportRange}`),
      browserApi<TopProductsReport>(`/api/v1/reports/top-products${reportRange}&limit=5`),
      browserApi<BusinessSummary>(`/api/v1/finances/summary${financeRange}`),
      browserApi<FinancialEntry[]>(`/api/v1/finances/entries${financeRange}&limit=6`),
    ])
      .then(([hours, products, businessSummary, movements]) => {
        if (cancelled) return;
        setSalesByHour(hours);
        setTopProducts(products);
        setSummary(businessSummary);
        setEntries(movements);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSalesByHour(null);
        setTopProducts(null);
        setSummary(null);
        setEntries(null);
        setError(
          err instanceof ApiRequestError
            ? err.body.message
            : "No fue posible cargar el resumen.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const hourItems = useMemo(() => salesByHour?.items ?? [], [salesByHour]);
  const totalSales = hourItems.reduce(
    (acc, item) => acc + (Number.parseFloat(item.money_total) || 0),
    0,
  );
  const ordersCount = hourItems.reduce((acc, item) => acc + item.orders_count, 0);

  // Barras continuas entre la primera y la última hora con ventas.
  const chart = useMemo(() => {
    if (hourItems.length === 0) return [];
    const byHour = new Map(
      hourItems.map((item) => [item.hour, Number.parseFloat(item.money_total) || 0]),
    );
    const hours = hourItems.map((item) => item.hour);
    const min = Math.min(...hours);
    const max = Math.max(...hours);
    const bars: Array<{ hour: number; amount: number }> = [];
    for (let hour = min; hour <= max; hour += 1) {
      bars.push({ hour, amount: byHour.get(hour) ?? 0 });
    }
    return bars;
  }, [hourItems]);
  const maxAmount = Math.max(1, ...chart.map((bar) => bar.amount));
  const peakIndex = chart.reduce(
    (best, bar, index) => (bar.amount > chart[best].amount ? index : best),
    0,
  );

  const products = topProducts?.items ?? [];
  const maxUnits = Math.max(1, ...products.map((item) => item.units));

  const expenseTotal = Number.parseFloat(summary?.expense_total ?? "0") || 0;
  const refundTotal = Number.parseFloat(summary?.refund_total ?? "0") || 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <header className="flex flex-wrap items-center gap-4">
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 className="tt-display" style={{ margin: 0, fontSize: 24 }}>
            Resumen
          </h1>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--muted-btn-tx)" }}>
            {todayHuman()}
          </p>
        </div>
        <div className="tt-seg" role="tablist" aria-label="Rango del resumen">
          {RANGES.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={range === item.key}
              className="tt-seg-item"
              data-active={range === item.key ? "1" : undefined}
              onClick={() => {
                // El "cargando" arranca en el evento (no en el efecto) para no
                // provocar renders en cascada (regla react-hooks).
                setLoading(true);
                setRange(item.key);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--accent)" }}>
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="tt-card" style={{ padding: 22, fontSize: 14, color: "var(--tx3)" }}>
          Cargando resumen…
        </div>
      ) : !error ? (
        <>
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              variant="dark"
              label="Ventas totales"
              value={formatMoney(totalSales)}
              sub={`${ordersCount} ${ordersCount === 1 ? "pedido completado" : "pedidos completados"}`}
            />
            <MetricCard
              label="Ingresos registrados"
              value={formatMoney(summary?.income_total ?? 0)}
              sub={`${summary?.entry_count ?? 0} movimientos en finanzas`}
            />
            <MetricCard
              label="Gastos"
              value={expenseTotal > 0 ? `−${formatMoney(expenseTotal)}` : formatMoney(0)}
              valueColor={expenseTotal > 0 ? "var(--accent)" : undefined}
              sub={
                refundTotal > 0
                  ? `Devoluciones −${formatMoney(refundTotal)}`
                  : "Sin devoluciones en el rango"
              }
            />
            <MetricCard
              variant="green"
              label="Resultado neto"
              value={formatMoney(summary?.net_result ?? 0)}
              sub="Ingresos − gastos − devoluciones"
            />
          </div>

          <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div
              className="tt-card"
              style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                <span style={{ fontWeight: 800, fontSize: 15 }}>Ventas por hora</span>
                <span style={{ fontSize: 12, color: "var(--tx3)" }}>
                  {chart.length > 0
                    ? `pico ${hourLabel(chart[peakIndex].hour)}–${hourLabel(chart[peakIndex].hour + 1)}`
                    : salesByHour?.timezone ?? ""}
                </span>
              </div>
              {chart.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: "var(--tx3)" }}>
                  Sin ventas registradas en el rango elegido.
                </p>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 10,
                    height: 150,
                  }}
                >
                  {chart.map((bar, index) => (
                    <div
                      key={bar.hour}
                      title={`${hourLabel(bar.hour)} · ${formatMoney(bar.amount)}`}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        gap: 6,
                      }}
                    >
                      <div
                        aria-hidden
                        style={{
                          width: "100%",
                          borderRadius: "8px 8px 4px 4px",
                          background: barColor(index, peakIndex),
                          height: `${Math.max(4, Math.round((bar.amount / maxAmount) * 100))}%`,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 11,
                          color: index === peakIndex ? "var(--accent)" : "var(--tx3)",
                          fontWeight: index === peakIndex ? 800 : 400,
                        }}
                      >
                        {hourLabel(bar.hour)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div
                style={{
                  borderTop: "1px solid var(--border)",
                  paddingTop: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 9,
                }}
              >
                <span style={{ fontWeight: 800, fontSize: 15 }}>
                  {range === "today" ? "Más vendidos hoy" : "Más vendidos"}
                </span>
                {products.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: "var(--tx3)" }}>
                    Sin productos vendidos en el rango elegido.
                  </p>
                ) : (
                  products.map((item, rank) => (
                    <div
                      key={item.product_name}
                      style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}
                    >
                      <span
                        style={{
                          width: 180,
                          fontWeight: 600,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={item.product_name}
                      >
                        {item.product_name}
                      </span>
                      <div
                        aria-hidden
                        style={{
                          flex: 1,
                          height: 10,
                          borderRadius: 999,
                          background: "var(--seg-bg)",
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.max(4, Math.round((item.units / maxUnits) * 100))}%`,
                            height: "100%",
                            borderRadius: 999,
                            background: progressColor(rank),
                          }}
                        />
                      </div>
                      <span style={{ fontWeight: 800, width: 30, textAlign: "right" }}>
                        {item.units}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
              <div
                className="tt-card"
                style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10 }}
              >
                <span style={{ fontWeight: 800, fontSize: 15 }}>
                  {range === "today" ? "Fórmula del día" : "Fórmula del periodo"}
                </span>
                <div
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    fontSize: 13,
                    lineHeight: 1.9,
                    color: "var(--tx2)",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <span style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span>Ingresos registrados</span>
                    <span style={{ fontWeight: 700 }}>{formatMoney(summary?.income_total ?? 0)}</span>
                  </span>
                  <span style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span>− Gastos y egresos</span>
                    <span style={{ fontWeight: 700, color: "var(--accent)" }}>
                      −{formatMoney(summary?.expense_total ?? 0)}
                    </span>
                  </span>
                  <span style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span>− Devoluciones</span>
                    <span style={{ fontWeight: 700, color: "var(--accent)" }}>
                      −{formatMoney(summary?.refund_total ?? 0)}
                    </span>
                  </span>
                </div>
                <div
                  style={{
                    borderTop: "2px solid var(--tx)",
                    paddingTop: 8,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    fontWeight: 900,
                    fontSize: 17,
                  }}
                >
                  <span>Ganancia neta</span>
                  <span style={{ color: "var(--ok)" }}>{formatMoney(summary?.net_result ?? 0)}</span>
                </div>
              </div>

              <div
                className="tt-card"
                style={{
                  padding: "18px 20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  flex: 1,
                }}
              >
                <span style={{ fontWeight: 800, fontSize: 15 }}>Últimos movimientos</span>
                {!entries || entries.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: "var(--tx3)" }}>
                    Sin movimientos registrados en el rango.
                  </p>
                ) : (
                  entries.map((entry) => {
                    const voided = entry.status === "voided";
                    const label =
                      entry.description ||
                      entry.counterparty_name ||
                      ENTRY_TYPE_LABELS[entry.entry_type] ||
                      entry.entry_type;
                    return (
                      <div
                        key={entry.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          fontSize: 13,
                        }}
                      >
                        <span
                          style={{
                            color: "var(--tx2)",
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={label}
                        >
                          {label}
                          {voided ? " · anulado" : ""}
                        </span>
                        <span
                          style={{
                            fontWeight: 800,
                            whiteSpace: "nowrap",
                            color: voided
                              ? "var(--tx3)"
                              : entry.direction === "income"
                                ? "var(--ok)"
                                : "var(--accent)",
                            textDecoration: voided ? "line-through" : undefined,
                          }}
                        >
                          {entry.direction === "income" ? "+" : "−"}
                          {formatMoney(entry.amount)}
                        </span>
                      </div>
                    );
                  })
                )}
                <Link
                  href="/admin/reportes"
                  style={{
                    marginTop: "auto",
                    borderTop: "1px solid var(--border)",
                    paddingTop: 10,
                    fontSize: 13,
                    fontWeight: 800,
                    color: "inherit",
                  }}
                >
                  Ver finanzas completas
                </Link>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
