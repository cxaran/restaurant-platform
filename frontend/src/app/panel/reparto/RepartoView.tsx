"use client";

// Vista del repartidor (§19), mobile-first. Solo consume la cola que el
// backend YA filtró para este usuario; la privacidad y las reglas de
// asignación única viven en el servidor. La entrega vigente se recarga desde
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
  completeDelivery,
  fetchMyDeliveries,
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
        setCurrent(mine[0] ?? null);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof ApiRequestError ? err.body.message : "Error al cargar la cola.",
        );
      }
    })();
    return () => {
      active = false;
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

  const card: React.CSSProperties = {
    border: "1px solid rgba(0,0,0,0.2)",
    borderRadius: 14,
    padding: "14px 16px",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 560 }}>
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800 }}>Disponibilidad</div>
          <div style={{ fontSize: 13, opacity: 0.75 }}>
            {available ? "Recibiendo envíos" : "Fuera de servicio"}
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void toggleAvailability()}
          aria-pressed={available}
          style={{
            padding: "10px 18px", borderRadius: 999, fontWeight: 800,
            border: "1px solid rgba(0,0,0,0.3)",
            background: available ? "#33855322" : "transparent",
          }}
        >
          {available ? "Disponible" : "Ponerme disponible"}
        </button>
      </div>

      {error ? <p role="alert" style={{ margin: 0, color: "#b3261e", fontWeight: 700 }}>{error}</p> : null}

      {current ? (
        <ActiveDeliveryCard
          delivery={current}
          busy={busy}
          detailHref={`/panel/reparto/${current.order_delivery_id}`}
          onStart={() => void start()}
          onComplete={(deliveredToName) => void complete(deliveredToName)}
        />
      ) : null}

      <section>
        <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Listos para salir</h2>
        {queue.length === 0 ? (
          <p style={{ fontSize: 14, opacity: 0.7 }}>Sin envíos en cola.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {queue.map((item) => (
              <div key={item.order_delivery_id} style={{ ...card, display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 900 }}>{item.public_code}</div>
                  <div style={{ fontSize: 13 }}>{item.address_summary}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8 }}>
                    {item.collection_label}
                    {item.zone_name ? ` · ${item.zone_name}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy || current !== null}
                  onClick={() => void take(item)}
                  style={{ padding: "10px 16px", borderRadius: 10, fontWeight: 900 }}
                >
                  Tomar
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {summary ? (
        <div style={{ ...card, display: "flex", gap: 18, fontSize: 14 }}>
          <span><b>{summary.deliveries_completed}</b> entregas hoy</span>
          <span>Efectivo: <b>{formatMoney(summary.cash_collected)}</b></span>
          <span>Envíos: <b>{formatMoney(summary.shipping_charged)}</b></span>
        </div>
      ) : null}
    </div>
  );
}
