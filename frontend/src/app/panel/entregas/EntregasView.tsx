"use client";

// Despacho de envíos: cola global (GET /deliveries/queue) + asignación manual
// (POST /deliveries/{id}/assign). El selector de repartidor sale de
// GET /profiles/staff (permiso profiles:read); sin ese permiso se muestra la
// cola en solo lectura con una nota.

import { useCallback, useEffect, useState } from "react";

import { ApiRequestError } from "@/core/api/api-error";
import { browserApi } from "@/core/api/browser-client";
import type {
  AssignCourierRequest,
  AssignmentRead,
  AvailableDeliveryItem,
  StaffProfileRead,
} from "@/core/restaurant-api/panel-contracts";

export function EntregasView({
  canAssign,
  canListStaff,
}: Readonly<{ canAssign: boolean; canListStaff: boolean }>) {
  const [queue, setQueue] = useState<AvailableDeliveryItem[]>([]);
  const [couriers, setCouriers] = useState<StaffProfileRead[]>([]);
  const [selectedCourier, setSelectedCourier] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await browserApi<AvailableDeliveryItem[]>("/api/v1/deliveries/queue");
        if (!active) return;
        setQueue(data);
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

  useEffect(() => {
    if (!canAssign || !canListStaff) return;
    let active = true;
    (async () => {
      try {
        const staff = await browserApi<StaffProfileRead[]>("/api/v1/profiles/staff");
        if (!active) return;
        setCouriers(staff.filter((profile) => profile.can_deliver && profile.is_active));
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof ApiRequestError
            ? err.body.message
            : "Error al cargar los repartidores.",
        );
      }
    })();
    return () => {
      active = false;
    };
  }, [canAssign, canListStaff]);

  async function assign(item: AvailableDeliveryItem) {
    if (!selectedCourier) {
      setError("Elige un repartidor antes de asignar.");
      return;
    }
    setBusyId(item.order_delivery_id);
    setError(null);
    setMessage(null);
    try {
      const result = await browserApi<AssignmentRead>(
        `/api/v1/deliveries/${encodeURIComponent(item.order_delivery_id)}/assign`,
        {
          method: "POST",
          body: {
            courier_user_id: selectedCourier,
            ...(reason.trim() ? { reason: reason.trim() } : {}),
          } satisfies AssignCourierRequest,
        },
      );
      setMessage(`${item.public_code} asignado a ${result.courier_name_snapshot}.`);
      refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.body.message : "No fue posible asignar.");
    } finally {
      setBusyId(null);
    }
  }

  const card: React.CSSProperties = {
    border: "1px solid rgba(0,0,0,0.2)",
    borderRadius: 14,
    padding: "14px 16px",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {canAssign ? (
        canListStaff ? (
          <div style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 800 }}>
              Repartidor a asignar
              <select
                value={selectedCourier}
                onChange={(event) => setSelectedCourier(event.target.value)}
                style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.25)" }}
              >
                <option value="">— Elegir repartidor —</option>
                {couriers.map((courier) => (
                  <option key={courier.user_id} value={courier.user_id}>
                    {courier.display_name}
                    {courier.is_delivery_available ? "" : " (fuera de servicio)"}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 13, fontWeight: 700 }}>
              Motivo (opcional)
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ej. reasignación por zona"
                style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.25)" }}
              />
            </label>
            {couriers.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
                No hay personal con reparto habilitado.
              </p>
            ) : null}
          </div>
        ) : (
          <p style={{ ...card, margin: 0, fontSize: 13.5 }}>
            Puedes asignar envíos, pero necesitas el permiso <b>profiles:read</b> para
            listar repartidores. Pide acceso para usar el selector.
          </p>
        )
      ) : null}

      {error ? <p role="alert" style={{ margin: 0, color: "#b3261e", fontWeight: 700 }}>{error}</p> : null}
      {message ? <p role="status" style={{ margin: 0, fontWeight: 700, fontSize: 13.5 }}>{message}</p> : null}

      <section>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Listos para reparto</h2>
          <button type="button" onClick={refresh} style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700 }}>
            Actualizar
          </button>
        </div>
        {queue.length === 0 ? (
          <p style={{ fontSize: 14, opacity: 0.7 }}>Sin envíos esperando repartidor.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {queue.map((item) => (
              <div key={item.order_delivery_id} style={{ ...card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 900 }}>
                    {item.public_code}
                    {item.zone_name ? (
                      <span style={{ fontSize: 12, fontWeight: 800, marginLeft: 8, padding: "2px 10px", borderRadius: 999, background: "rgba(0,0,0,0.08)" }}>
                        {item.zone_name}
                      </span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 13 }}>
                    {item.customer_name ?? "Cliente"} · {item.address_summary}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8 }}>
                    {item.collection_label}
                    {item.ready_since
                      ? ` · listo desde ${new Date(item.ready_since).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`
                      : ""}
                  </div>
                </div>
                {canAssign && canListStaff ? (
                  <button
                    type="button"
                    disabled={busyId !== null || !selectedCourier}
                    onClick={() => void assign(item)}
                    style={{ padding: "10px 16px", borderRadius: 10, fontWeight: 900 }}
                  >
                    {busyId === item.order_delivery_id ? "Asignando…" : "Asignar"}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
