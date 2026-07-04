"use client";

// Detalle de una entrega propia con el lenguaje visual Tony-Tony (tt-card /
// tt-btn / tt-badge): se busca dentro de /courier/deliveries/mine (el backend
// ya filtra por el usuario autenticado). Si no aparece ahí, se responde un
// mensaje 404-like sin revelar si la entrega existe para otro.

import Link from "next/link";
import { useEffect, useState } from "react";

import { ApiRequestError } from "@/core/api/api-error";
import type { MyActiveDelivery } from "@/core/restaurant-api/panel-contracts";
import {
  ActiveDeliveryCard,
  completeDelivery,
  fetchMyDeliveries,
  startDelivery,
} from "../courier-shared";

type LoadState = "loading" | "ready" | "not_mine" | "completed";

export function DeliveryDetail({ deliveryId }: Readonly<{ deliveryId: string }>) {
  const [state, setState] = useState<LoadState>("loading");
  const [delivery, setDelivery] = useState<MyActiveDelivery | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const mine = await fetchMyDeliveries();
        if (!active) return;
        const found = mine.find((item) => item.order_delivery_id === deliveryId) ?? null;
        setDelivery(found);
        setState(found ? "ready" : "not_mine");
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof ApiRequestError ? err.body.message : "Error al cargar la entrega.",
        );
        setState("not_mine");
      }
    })();
    return () => {
      active = false;
    };
  }, [deliveryId]);

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

  async function start() {
    if (!delivery) return;
    const result = await call(() => startDelivery(delivery.order_delivery_id));
    if (result) setDelivery({ ...delivery, assignment_status: "in_progress" });
  }

  async function complete(deliveredToName: string) {
    if (!delivery) return;
    const result = await call(() =>
      completeDelivery(delivery.order_delivery_id, deliveredToName),
    );
    if (result) setState("completed");
  }

  if (state === "loading") {
    return <p style={{ margin: 0, fontSize: 14, color: "var(--tx3)" }}>Cargando entrega…</p>;
  }

  if (state === "completed") {
    return (
      <div
        className="tt-card"
        style={{
          border: "2px solid var(--ok)",
          padding: "16px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        <span className="tt-badge tt-badge-ok">Entregado</span>
        <p role="status" style={{ margin: 0, fontWeight: 800 }}>
          Entrega {delivery?.public_code} marcada como entregada.
        </p>
        <Link href="/panel/reparto" className="tt-btn tt-btn-dark">
          Volver a mi cola de reparto
        </Link>
      </div>
    );
  }

  if (state === "not_mine" || !delivery) {
    return (
      <div
        className="tt-card"
        style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}
      >
        {error ? (
          <p role="alert" style={{ margin: 0, color: "var(--accent)", fontWeight: 800, fontSize: 13.5 }}>
            {error}
          </p>
        ) : (
          <p style={{ margin: 0, fontWeight: 700, fontSize: 13.5, color: "var(--tx2)" }}>
            Esta entrega no está asignada a ti.
          </p>
        )}
        <Link href="/panel/reparto" className="tt-btn tt-btn-ghost">
          Ir a mi cola de reparto
        </Link>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {error ? (
        <p
          role="alert"
          className="tt-card"
          style={{ margin: 0, padding: "10px 14px", color: "var(--accent)", fontWeight: 800, fontSize: 13 }}
        >
          {error}
        </p>
      ) : null}
      <ActiveDeliveryCard
        delivery={delivery}
        busy={busy}
        onStart={() => void start()}
        onComplete={(deliveredToName) => void complete(deliveredToName)}
      />
    </div>
  );
}
