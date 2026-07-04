"use client";

// Vista de reportes: dos tarjetas ("Ventas por hora" y "Más vendidos") sobre
// los endpoints tipados /api/v1/reports/*. Barras simples con CSS (sin
// librerías) retintadas al lenguaje 1i (tt-card, tt-display, tokens); las
// cifras se etiquetan como ventas registradas.

import { useEffect, useState } from "react";

import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/Table";
import { ApiRequestError } from "@/core/api/api-error";
import { browserApi } from "@/core/api/browser-client";
import type {
  SalesByHourReport,
  TopProductsReport,
} from "@/core/restaurant-api/contracts";
import { formatMoney } from "@/core/restaurant-api/theme";

function todayLocal(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function rangeQuery(dateFrom: string, dateTo: string): string {
  const search = new URLSearchParams();
  if (dateFrom) search.set("date_from", dateFrom);
  if (dateTo) search.set("date_to", dateTo);
  const query = search.toString();
  return query ? `?${query}` : "";
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function ReportsView() {
  const today = todayLocal();
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [salesByHour, setSalesByHour] = useState<SalesByHourReport | null>(null);
  const [topProducts, setTopProducts] = useState<TopProductsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Debounce corto (mismo patrón que otras vistas admin): evita disparar la
    // consulta en cada tecleo del rango y el setState síncrono en el efecto.
    const timer = setTimeout(() => {
      setLoading(true);
      Promise.all([
        browserApi<SalesByHourReport>(
          `/api/v1/reports/sales-by-hour${rangeQuery(dateFrom, dateTo)}`,
        ),
        browserApi<TopProductsReport>(
          `/api/v1/reports/top-products${rangeQuery(dateFrom, dateTo)}`,
        ),
      ])
        .then(([hours, products]) => {
          if (cancelled) return;
          setSalesByHour(hours);
          setTopProducts(products);
          setError(null);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setSalesByHour(null);
          setTopProducts(null);
          setError(
            err instanceof ApiRequestError
              ? err.body.message
              : "No fue posible cargar los reportes.",
          );
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [dateFrom, dateTo]);

  const maxHourTotal = Math.max(
    1,
    ...(salesByHour?.items ?? []).map((item) => Number.parseFloat(item.money_total) || 0),
  );

  return (
    <div className="flex flex-col gap-3.5">
      <div
        className="tt-card flex flex-wrap items-end gap-3"
        style={{ padding: "16px 20px" }}
      >
        <label className="flex flex-col gap-1">
          <span className="tt-label">Desde</span>
          <input
            type="date"
            className="tt-input"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(event) => setDateFrom(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="tt-label">Hasta</span>
          <input
            type="date"
            className="tt-input"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </label>
        {salesByHour ? (
          <p className="m-0 text-xs text-[var(--tx3)]">
            Zona horaria del negocio: {salesByHour.timezone}
          </p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="m-0 text-sm font-semibold text-[var(--accent)]">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3.5 lg:grid-cols-2">
        <div className="tt-card" style={{ padding: "18px 20px" }}>
          <h2 className="m-0 text-[15px] font-extrabold">Ventas por hora</h2>
          <p className="mb-3 mt-1 text-xs text-[var(--tx3)]">
            Ventas registradas (dinero) por hora del día.
          </p>
          {loading ? (
            <LoadingState message="Cargando ventas por hora..." />
          ) : !salesByHour || salesByHour.items.length === 0 ? (
            <EmptyState
              title="Sin ventas registradas"
              description="No hay ventas registradas en el rango elegido."
            />
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {salesByHour.items.map((item) => {
                const amount = Number.parseFloat(item.money_total) || 0;
                const width = Math.max(2, Math.round((amount / maxHourTotal) * 100));
                const isPeak = amount === maxHourTotal;
                return (
                  <li key={item.hour} className="flex items-center gap-2 text-sm">
                    <span
                      className="w-12 shrink-0 tabular-nums"
                      style={{
                        color: isPeak ? "var(--accent)" : "var(--tx3)",
                        fontWeight: isPeak ? 800 : 400,
                      }}
                    >
                      {hourLabel(item.hour)}
                    </span>
                    <span
                      className="min-w-0 flex-1 rounded-full"
                      style={{ background: "var(--seg-bg)" }}
                    >
                      <span
                        aria-hidden
                        className="block h-2.5 rounded-full"
                        style={{
                          width: `${width}%`,
                          background: isPeak ? "var(--accent)" : "#C97E52",
                        }}
                      />
                    </span>
                    <span className="w-24 shrink-0 text-right font-extrabold tabular-nums">
                      {formatMoney(item.money_total)}
                    </span>
                    <span className="w-20 shrink-0 text-right text-xs text-[var(--tx3)]">
                      {item.orders_count} {item.orders_count === 1 ? "pedido" : "pedidos"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="tt-card" style={{ padding: "18px 20px" }}>
          <h2 className="m-0 text-[15px] font-extrabold">Más vendidos</h2>
          <p className="mb-3 mt-1 text-xs text-[var(--tx3)]">
            Productos con más unidades y ventas registradas en el rango.
          </p>
          {loading ? (
            <LoadingState message="Cargando más vendidos..." />
          ) : !topProducts || topProducts.items.length === 0 ? (
            <EmptyState
              title="Sin ventas registradas"
              description="No hay productos vendidos en el rango elegido."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <Tr>
                    <Th>Producto</Th>
                    <Th className="text-right">Unidades</Th>
                    <Th className="text-right">Ventas registradas</Th>
                    <Th className="text-right">Créditos canjeados</Th>
                  </Tr>
                </THead>
                <TBody>
                  {topProducts.items.map((item) => (
                    <Tr key={item.product_name}>
                      <Td>{item.product_name}</Td>
                      <Td className="text-right tabular-nums">{item.units}</Td>
                      <Td className="text-right font-semibold tabular-nums">
                        {formatMoney(item.money_total)}
                      </Td>
                      <Td className="text-right tabular-nums">{item.credits_redeemed}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
