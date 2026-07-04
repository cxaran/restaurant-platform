"use client";

// Vista del repartidor (§19) con el lenguaje visual Tony-Tony (7a móvil /
// 7b web, dos columnas en desktop). Solo consume la cola que el backend YA
// filtró para este usuario; la privacidad y las reglas de asignación única
// viven en el servidor. La entrega vigente se recarga desde
// GET /courier/deliveries/mine: sobrevive recargas del navegador.

import { useEffect, useState } from "react";

import { ApiRequestError } from "@/core/api/api-error";
import { browserApi } from "@/core/api/browser-client";
import type {
  AssignmentRead,
  AvailableDeliveryItem,
  CourierSummaryRead,
  MyActiveDelivery,
} from "@/core/restaurant-api/panel-contracts";
import { formatMoney } from "@/core/restaurant-api/theme";
import {
  ActiveDeliveryCard,
  CollectionNote,
  completeDelivery,
  DeliveryContactActions,
  DeliveryExtraInfo,
  fetchMyDeliveries,
  readySinceLabel,
  startDelivery,
} from "./courier-shared";

export function RepartoView() {
  const [available, setAvailable] = useState(false);
  const [queue, setQueue] = useState<AvailableDeliveryItem[]>([]);
  const [current, setCurrent] = useState<MyActiveDelivery | null>(null);
  const [summary, setSummary] = useState<CourierSummaryRead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  // Carga inicial + refresco periódico (patrón de pedidos/OrdersBoard): cada
  // tick recarga cola, entrega activa y resumen; el intervalo solo mueve el
  // tick y se limpia junto con el flag `active` para no tocar estado desmontado.
  // La disponibilidad se sincroniza desde el resumen: el servidor es la autoridad.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [queueData, summaryData, mine] = await Promise.all([
          browserApi<AvailableDeliveryItem[]>("/api/v1/courier/available-orders"),
          browserApi<CourierSummaryRead>("/api/v1/courier/summary"),
          fetchMyDeliveries(),
        ]);
        if (!active) return;
        setQueue(queueData);
        setSummary(summaryData);
        setAvailable(summaryData.is_delivery_available);
        setCurrent(mine[0] ?? null);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof ApiRequestError ? err.body.message : "Error al cargar la cola.",
        );
      }
    })();
    const timer = setInterval(() => setTick((value) => value + 1), 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [tick]);

  async function call<T>(action: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      return await action();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.body.message : "No fue posible.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function toggleAvailability() {
    const next = !available;
    const result = await call(() =>
      browserApi("/api/v1/courier/availability", {
        method: "POST",
        body: { is_available: next },
      }),
    );
    if (result !== null) {
      setAvailable(next);
      setTick((value) => value + 1);
    }
  }

  async function take(item: AvailableDeliveryItem) {
    const result = await call(() =>
      browserApi<AssignmentRead>(`/api/v1/courier/deliveries/${item.order_delivery_id}/take`, {
        method: "POST",
      }),
    );
    if (result) {
      setCurrent({ ...item, assignment_status: "assigned" });
      setTick((value) => value + 1);
    }
  }

  async function start() {
    if (!current) return;
    const result = await call(() => startDelivery(current.order_delivery_id));
    if (result) setCurrent({ ...current, assignment_status: "in_progress" });
  }

  async function complete(deliveredToName: string) {
    if (!current) return;
    const result = await call(() =>
      completeDelivery(current.order_delivery_id, deliveredToName),
    );
    if (result) {
      setCurrent(null);
      setTick((value) => value + 1);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Pill de disponibilidad (header 7a/7b): puntito + estado, es el toggle real. */}
      <div className="flex items-center justify-between gap-3">
        <span className="tt-label">Disponibilidad</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void toggleAvailability()}
          aria-pressed={available}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            borderRadius: 999,
            padding: "8px 16px",
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 800,
            cursor: busy ? "not-allowed" : "pointer",
            ...(available
              ? { background: "#e3f0e7", border: "1px solid var(--ok)", color: "#256341" }
              : { background: "var(--panel)", border: "1px solid var(--border2)", color: "var(--tx2)" }),
          }}
        >
          <span
            aria-hidden
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: available ? "var(--ok)" : "var(--tx3)",
            }}
          />
          {available ? "Disponible" : "Ponerme disponible"}
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          className="tt-card"
          style={{ margin: 0, padding: "10px 14px", color: "var(--accent)", fontWeight: 800, fontSize: 13 }}
        >
          {error}
        </p>
      ) : null}

      {/* Móvil (7a): envío en curso → listos → resumen. Desktop (7b): listos a
          la izquierda; envío en curso + resumen a la derecha. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5">
        <section className="order-1 flex flex-col gap-2.5 lg:col-start-2 lg:row-start-1">
          <span className="tt-label">
            Mi envío en curso{current ? " · 1" : ""}
          </span>
          {current ? (
            <ActiveDeliveryCard
              delivery={current}
              busy={busy}
              detailHref={`/panel/reparto/${current.order_delivery_id}`}
              onStart={() => void start()}
              onComplete={(deliveredToName) => void complete(deliveredToName)}
            />
          ) : (
            <div
              style={{
                border: "1px dashed #c9bca1",
                borderRadius: 14,
                padding: 16,
                textAlign: "center",
                fontSize: 13,
                color: "var(--tx3)",
              }}
            >
              No tienes un envío en curso. Toma uno de la lista.
            </div>
          )}
        </section>

        <section className="order-2 flex flex-col gap-2.5 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <span className="tt-label">Listos para salir · {queue.length}</span>
          {queue.length === 0 ? (
            <div
              style={{
                border: "1px dashed #c9bca1",
                borderRadius: 14,
                padding: 16,
                textAlign: "center",
                fontSize: 13,
                color: "var(--tx3)",
              }}
            >
              Los pedidos aparecen aquí cuando cocina los marca como «Listo».
            </div>
          ) : (
            queue.map((item, index) => {
              const readyLabel = readySinceLabel(item.ready_since);
              return (
                <article
                  key={item.order_delivery_id}
                  className="tt-card"
                  style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 9 }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <span style={{ fontWeight: 900, fontSize: 15, minWidth: 0 }}>
                      {item.public_code}
                      {item.customer_name ? ` · ${item.customer_name}` : ""}
                    </span>
                    {readyLabel ? (
                      <span className="tt-badge tt-badge-warn">{readyLabel}</span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--tx2)", lineHeight: 1.45 }}>
                    {item.address_summary}
                    {item.zone_name ? ` · ${item.zone_name}` : ""}
                    <br />
                    <DeliveryExtraInfo delivery={item} />
                    <CollectionNote label={item.collection_label} />
                  </div>
                  <DeliveryContactActions delivery={item} />
                  <button
                    type="button"
                    className={
                      index === 0 && current === null
                        ? "tt-btn tt-btn-primary"
                        : "tt-btn tt-btn-outline-accent"
                    }
                    disabled={busy || current !== null}
                    onClick={() => void take(item)}
                    style={{ width: "100%", padding: 12, borderRadius: 13, fontSize: 14, fontWeight: 900 }}
                  >
                    Tomar este envío
                  </button>
                </article>
              );
            })
          )}
        </section>

        {summary ? (
          <div
            className="order-3 lg:col-start-2 lg:row-start-2"
            style={{
              background: "var(--header-bg)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: "12px 16px",
              display: "flex",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 12,
              fontSize: 13,
              color: "var(--tx2)",
            }}
          >
            <span>
              Hoy:{" "}
              <span style={{ fontWeight: 900, color: "var(--tx)" }}>
                {summary.deliveries_completed}{" "}
                {summary.deliveries_completed === 1 ? "entrega" : "entregas"}
              </span>
            </span>
            <span>
              Envíos cobrados:{" "}
              <span style={{ fontWeight: 900, color: "var(--tx)" }}>
                {formatMoney(summary.shipping_charged)}
              </span>
            </span>
            <span>
              Efectivo por entregar:{" "}
              <span style={{ fontWeight: 900, color: "var(--accent)" }}>
                {formatMoney(summary.cash_collected)}
              </span>
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
