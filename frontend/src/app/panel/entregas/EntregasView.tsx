"use client";

// Despacho de envíos con el lenguaje visual interno (tt-card / tt-badge /
// tt-btn): cola global (GET /deliveries/queue) + asignación manual
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
import { CollectionNote, readySinceLabel } from "../reparto/courier-shared";

export function EntregasView({
  canAssign,
  canListStaff,
  canManageStaff = false,
}: Readonly<{ canAssign: boolean; canListStaff: boolean; canManageStaff?: boolean }>) {
  const [queue, setQueue] = useState<AvailableDeliveryItem[]>([]);
  const [staff, setStaff] = useState<StaffProfileRead[]>([]);
  const [selectedCourier, setSelectedCourier] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((value) => value + 1), []);

  // Cola del despachador: carga inicial + refresco cada 30 s (patrón de
  // pedidos/OrdersBoard). El botón «Actualizar» solo adelanta el tick.
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
    const timer = setInterval(() => setTick((value) => value + 1), 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [tick]);

  const [staffTick, setStaffTick] = useState(0);
  useEffect(() => {
    // El personal se lista para el selector (asignar) y para la gestión de
    // capacidad de reparto; basta cualquiera de los dos usos.
    if (!canListStaff || (!canAssign && !canManageStaff)) return;
    let active = true;
    (async () => {
      try {
        const data = await browserApi<StaffProfileRead[]>("/api/v1/profiles/staff");
        if (!active) return;
        setStaff(data.filter((profile) => profile.is_active));
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
  }, [canAssign, canListStaff, canManageStaff, staffTick]);

  const couriers = staff.filter((profile) => profile.can_deliver);

  // Alternar capacidad de reparto (profiles:manage_staff). El PUT es un
  // UPSERT completo: se reenvía el perfil actual con can_deliver invertido
  // para no borrar teléfono/foto/nota.
  const [togglingId, setTogglingId] = useState<string | null>(null);
  async function toggleCanDeliver(profile: StaffProfileRead) {
    setTogglingId(profile.user_id);
    setError(null);
    try {
      await browserApi(`/api/v1/profiles/staff/${encodeURIComponent(profile.user_id)}`, {
        method: "PUT",
        body: {
          display_name: profile.display_name,
          contact_phone: profile.contact_phone ?? null,
          public_contact_phone: profile.public_contact_phone ?? null,
          photo_file_id: profile.photo_file_id ?? null,
          can_deliver: !profile.can_deliver,
          courier_public_note: profile.courier_public_note ?? null,
          is_active: profile.is_active,
        },
      });
      setStaffTick((value) => value + 1);
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.body.message : "No fue posible actualizar el perfil.",
      );
    } finally {
      setTogglingId(null);
    }
  }

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

  return (
    <div className="flex flex-col gap-4">
      {canAssign ? (
        canListStaff ? (
          <div
            className="tt-card"
            style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}
          >
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="tt-label">Repartidor a asignar</span>
              <select
                className="tt-input"
                value={selectedCourier}
                onChange={(event) => setSelectedCourier(event.target.value)}
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
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="tt-label">Motivo (opcional)</span>
              <input
                className="tt-input"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ej. reasignación por zona"
              />
            </label>
            {couriers.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--tx3)" }}>
                No hay personal con reparto habilitado.
              </p>
            ) : null}
          </div>
        ) : (
          <p
            className="tt-card"
            style={{ margin: 0, padding: "14px 16px", fontSize: 13.5, color: "var(--tx2)" }}
          >
            Puedes asignar envíos, pero necesitas el permiso <b>profiles:read</b> para
            listar repartidores. Pide acceso para usar el selector.
          </p>
        )
      ) : null}

      {error ? (
        <p
          role="alert"
          className="tt-card"
          style={{ margin: 0, padding: "10px 14px", color: "var(--accent)", fontWeight: 800, fontSize: 13 }}
        >
          {error}
        </p>
      ) : null}
      {message ? (
        <p
          role="status"
          className="tt-card"
          style={{
            margin: 0,
            padding: "10px 14px",
            border: "1px solid var(--ok)",
            color: "var(--ok)",
            fontWeight: 800,
            fontSize: 13,
          }}
        >
          {message}
        </p>
      ) : null}

      <section className="flex flex-col gap-2.5">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="tt-label">Listos para reparto · {queue.length}</span>
          <button
            type="button"
            className="tt-btn tt-btn-ghost"
            onClick={refresh}
            style={{ marginLeft: "auto", padding: "7px 14px", fontSize: 12 }}
          >
            Actualizar
          </button>
        </div>
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
          queue.map((item) => {
            const readyLabel = readySinceLabel(item.ready_since);
            return (
              <article
                key={item.order_delivery_id}
                className="tt-card"
                style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 9 }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
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
                  <CollectionNote label={item.collection_label} />
                </div>
                {canAssign && canListStaff ? (
                  <button
                    type="button"
                    className="tt-btn tt-btn-primary"
                    disabled={busyId !== null || !selectedCourier}
                    onClick={() => void assign(item)}
                    style={{ width: "100%", padding: 12, borderRadius: 13, fontSize: 14, fontWeight: 900 }}
                  >
                    {busyId === item.order_delivery_id ? "Asignando…" : "Asignar a repartidor"}
                  </button>
                ) : null}
              </article>
            );
          })
        )}
      </section>

      {/* Gestión de capacidad de reparto (profiles:manage_staff): quién puede
          tomar envíos. Quitarla también lo saca de servicio de inmediato. */}
      {canManageStaff && canListStaff ? (
        <section
          className="tt-card"
          style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}
          aria-label="Repartidores del equipo"
        >
          <span className="tt-label">Repartidores del equipo</span>
          {staff.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--tx3)" }}>
              Sin perfiles de personal registrados.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {staff.map((profile) => (
                <li
                  key={profile.user_id}
                  style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13 }}
                >
                  <span style={{ fontWeight: 700, flex: "1 1 160px" }}>{profile.display_name}</span>
                  <span className={`tt-badge ${profile.can_deliver ? "tt-badge-ok" : "tt-badge-done"}`}>
                    {profile.can_deliver
                      ? profile.is_delivery_available
                        ? "Reparte · en servicio"
                        : "Reparte · fuera de servicio"
                      : "No reparte"}
                  </span>
                  <button
                    type="button"
                    className="tt-btn tt-btn-outline"
                    disabled={togglingId === profile.user_id}
                    onClick={() => void toggleCanDeliver(profile)}
                    style={{ padding: "6px 12px", fontSize: 12 }}
                    data-testid={`toggle-deliver-${profile.user_id}`}
                  >
                    {togglingId === profile.user_id
                      ? "Guardando…"
                      : profile.can_deliver
                        ? "Quitar reparto"
                        : "Habilitar reparto"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
