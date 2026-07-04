"use client";

// Detalle de una entrega propia: se busca dentro de /courier/deliveries/mine
// (el backend ya filtra por el usuario autenticado). Si no aparece ahí, se
// responde un mensaje 404-like sin revelar si la entrega existe para otro.

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
    return <p style={{ opacity: 0.7 }}>Cargando entrega…</p>;
  }

  if (state === "completed") {
    return (
      <div style={{ border: "1px solid rgba(0,0,0,0.2)", borderRadius: 14, padding: "14px 16px" }}>
        <p role="status" style={{ margin: "0 0 10px", fontWeight: 800 }}>
          Entrega {delivery?.public_code} marcada como entregada.
        </p>
        <Link href="/panel/reparto" style={{ fontWeight: 700 }}>Volver a mi cola de reparto</Link>
      </div>
    );
  }

  if (state === "not_mine" || !delivery) {
    return (
      <div style={{ border: "1px solid rgba(0,0,0,0.2)", borderRadius: 14, padding: "14px 16px" }}>
        {error ? (
          <p role="alert" style={{ margin: "0 0 10px", color: "#b3261e", fontWeight: 700 }}>{error}</p>
        ) : (
          <p style={{ margin: "0 0 10px", fontWeight: 700 }}>
            Esta entrega no está asignada a ti.
          </p>
        )}
        <Link href="/panel/reparto" style={{ fontWeight: 700 }}>Ir a mi cola de reparto</Link>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 560 }}>
      {error ? <p role="alert" style={{ margin: 0, color: "#b3261e", fontWeight: 700 }}>{error}</p> : null}
      <ActiveDeliveryCard
        delivery={delivery}
        busy={busy}
        onStart={() => void start()}
        onComplete={(deliveredToName) => void complete(deliveredToName)}
      />
    </div>
  );
}
