"use client";

// Ficha 360 del cliente: búsqueda (GET /profiles/customers), notas internas
// (PUT upsert — se reenvía el perfil completo para no borrar campos),
// créditos del ledger (§22: saldo = SUM(delta), ajuste SIEMPRE con motivo) y
// sus pedidos (GET /orders?customer_user_id=). La UI muestra el mensaje real
// del backend ante cualquier regla (p. ej. ajuste que dejaría saldo negativo).

import { useEffect, useState } from "react";

import { ApiRequestError } from "@/core/api/api-error";
import { browserApi } from "@/core/api/browser-client";
import { formatMoney } from "@/core/restaurant-api/theme";
import type { components } from "@/generated/openapi";

type CustomerProfile = components["schemas"]["CustomerProfileRead"];
type CreditTotals = components["schemas"]["CreditTotalsRead"];
type CreditMovement = components["schemas"]["CreditMovementRead"];
type CreditAdjustmentCreate = components["schemas"]["CreditAdjustmentCreate"];
type OrdersPage = components["schemas"]["OffsetPage_OrderListItem_"];
type OrderListItem = components["schemas"]["OrderListItem"];

const MOVEMENT_LABELS: Record<string, string> = {
  earn: "Ganados por pedido",
  redeem_reserve: "Reserva de canje",
  redeem_consume: "Canje consumido",
  redeem_release: "Reserva liberada",
  manual_adjustment: "Ajuste manual",
  refund: "Devolución",
};

function apiMessage(err: unknown, fallback: string): string {
  return err instanceof ApiRequestError ? err.body.message : fallback;
}

export function ClientesView({
  canManage,
  canSeeCredits,
  canAdjustCredits,
  canSeeOrders,
}: Readonly<{
  canManage: boolean;
  canSeeCredits: boolean;
  canAdjustCredits: boolean;
  canSeeOrders: boolean;
}>) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<CustomerProfile[] | null>(null);
  const [selected, setSelected] = useState<CustomerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  async function search() {
    const cleaned = term.trim();
    if (cleaned.length < 2) {
      setError("Escribe al menos 2 caracteres para buscar.");
      return;
    }
    setSearching(true);
    setError(null);
    try {
      // Con puros dígitos (y separadores) se busca por teléfono; si no, por nombre.
      const digits = cleaned.replace(/[\s()+-]/g, "");
      const params = new URLSearchParams(
        /^\d{3,}$/.test(digits) ? { phone: digits } : { q: cleaned },
      );
      params.set("limit", "30");
      const data = await browserApi<CustomerProfile[]>(
        `/api/v1/profiles/customers?${params.toString()}`,
      );
      setResults(data);
      setSelected(data.length === 1 ? data[0] : null);
    } catch (err) {
      setError(apiMessage(err, "No fue posible buscar clientes."));
    } finally {
      setSearching(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <form
        className="tt-card"
        style={{ padding: "12px 16px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <input
          className="tt-input"
          placeholder="Nombre o teléfono del cliente…"
          aria-label="Buscar cliente"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          style={{ flex: "1 1 240px" }}
        />
        <button type="submit" className="tt-btn tt-btn-primary" disabled={searching} style={{ fontSize: 13 }}>
          {searching ? "Buscando…" : "Buscar"}
        </button>
      </form>

      {error ? (
        <p role="alert" style={{ margin: 0, color: "var(--accent)", fontWeight: 700, fontSize: 13 }}>{error}</p>
      ) : null}

      {results !== null ? (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <ul
            style={{
              listStyle: "none", margin: 0, padding: 0,
              flex: "1 1 260px", maxWidth: 380,
              display: "flex", flexDirection: "column", gap: 8,
            }}
          >
            {results.length === 0 ? (
              <li className="tt-card" style={{ padding: "14px 16px", fontSize: 13, color: "var(--tx3)" }}>
                Sin clientes que coincidan.
              </li>
            ) : (
              results.map((customer) => (
                <li key={customer.user_id}>
                  <button
                    type="button"
                    className="tt-card"
                    onClick={() => setSelected(customer)}
                    aria-pressed={selected?.user_id === customer.user_id}
                    style={{
                      width: "100%", textAlign: "left", cursor: "pointer", font: "inherit",
                      padding: "12px 14px", display: "flex", flexDirection: "column", gap: 2,
                      border: selected?.user_id === customer.user_id
                        ? "2px solid var(--accent)"
                        : "1px solid var(--border)",
                    }}
                  >
                    <span style={{ fontWeight: 800, fontSize: 14 }}>{customer.full_name}</span>
                    <span style={{ fontSize: 12, color: "var(--tx3)" }}>
                      {customer.phone}
                      {customer.email ? ` · ${customer.email}` : ""}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>

          {selected ? (
            <CustomerCard
              key={selected.user_id}
              customer={selected}
              canManage={canManage}
              canSeeCredits={canSeeCredits}
              canAdjustCredits={canAdjustCredits}
              canSeeOrders={canSeeOrders}
              onUpdated={(updated) => {
                setSelected(updated);
                setResults((current) =>
                  (current ?? []).map((row) => (row.user_id === updated.user_id ? updated : row)),
                );
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CustomerCard({
  customer,
  canManage,
  canSeeCredits,
  canAdjustCredits,
  canSeeOrders,
  onUpdated,
}: Readonly<{
  customer: CustomerProfile;
  canManage: boolean;
  canSeeCredits: boolean;
  canAdjustCredits: boolean;
  canSeeOrders: boolean;
  onUpdated: (customer: CustomerProfile) => void;
}>) {
  const [notes, setNotes] = useState(customer.internal_notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [totals, setTotals] = useState<CreditTotals | null>(null);
  const [movements, setMovements] = useState<CreditMovement[]>([]);
  const [creditsError, setCreditsError] = useState<string | null>(null);
  const [creditsTick, setCreditsTick] = useState(0);

  const [orders, setOrders] = useState<OrderListItem[]>([]);

  useEffect(() => {
    if (!canSeeCredits) return;
    let active = true;
    (async () => {
      try {
        const [totalsData, movementsData] = await Promise.all([
          browserApi<CreditTotals>(`/api/v1/credits/users/${customer.user_id}`),
          browserApi<CreditMovement[]>(`/api/v1/credits/users/${customer.user_id}/movements?limit=20`),
        ]);
        if (!active) return;
        setTotals(totalsData);
        setMovements(movementsData);
        setCreditsError(null);
      } catch (err) {
        if (active) setCreditsError(apiMessage(err, "No fue posible cargar los créditos."));
      }
    })();
    return () => {
      active = false;
    };
  }, [customer.user_id, canSeeCredits, creditsTick]);

  useEffect(() => {
    if (!canSeeOrders) return;
    let active = true;
    (async () => {
      try {
        const page = await browserApi<OrdersPage>(
          `/api/v1/orders?customer_user_id=${customer.user_id}&limit=10`,
        );
        if (active) setOrders(page.items);
      } catch {
        if (active) setOrders([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [customer.user_id, canSeeOrders]);

  async function saveNotes() {
    setSavingNotes(true);
    setNotesError(null);
    setNotice(null);
    try {
      // Upsert completo: se reenvía el perfil vigente con las notas editadas.
      const updated = await browserApi<CustomerProfile>(
        `/api/v1/profiles/customers/${customer.user_id}`,
        {
          method: "PUT",
          body: {
            full_name: customer.full_name,
            phone: customer.phone,
            email: customer.email ?? null,
            internal_notes: notes.trim() || null,
          },
        },
      );
      onUpdated(updated);
      setNotice("Notas guardadas.");
    } catch (err) {
      setNotesError(apiMessage(err, "No fue posible guardar las notas."));
    } finally {
      setSavingNotes(false);
    }
  }

  return (
    <div style={{ flex: "2 1 380px", display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <div className="tt-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="tt-display" style={{ fontSize: 18 }}>{customer.full_name}</span>
        <span style={{ fontSize: 13, color: "var(--tx2)" }}>
          {customer.phone}
          {customer.email ? ` · ${customer.email}` : ""}
          {" · cliente desde "}
          {new Date(customer.created_at).toLocaleDateString("es-MX", { dateStyle: "medium" })}
        </span>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700 }}>
          Notas internas (solo el equipo)
          <textarea
            className="tt-input"
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={!canManage}
            placeholder="Preferencias, acuerdos, incidencias…"
            style={{ fontWeight: 400, resize: "vertical" }}
          />
        </label>
        {canManage ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className="tt-btn tt-btn-outline"
              disabled={savingNotes}
              onClick={() => void saveNotes()}
              style={{ fontSize: 13 }}
            >
              {savingNotes ? "Guardando…" : "Guardar notas"}
            </button>
            {notice ? <span role="status" style={{ fontSize: 12, color: "var(--ok)", fontWeight: 700 }}>{notice}</span> : null}
          </div>
        ) : null}
        {notesError ? (
          <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--accent)", fontWeight: 700 }}>{notesError}</p>
        ) : null}
      </div>

      {canSeeCredits ? (
        <div className="tt-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="tt-label">Créditos</span>
          {creditsError ? (
            <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--accent)", fontWeight: 700 }}>{creditsError}</p>
          ) : totals === null ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--tx3)" }}>Cargando créditos…</p>
          ) : (
            <>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
                <span><b style={{ fontSize: 18 }}>{totals.available}</b> disponibles</span>
                <span style={{ color: "var(--tx3)" }}>{totals.earned} ganados · {totals.redeemed} canjeados</span>
              </div>
              {canAdjustCredits ? (
                <AdjustCreditsForm userId={customer.user_id} onDone={() => setCreditsTick((t) => t + 1)} />
              ) : null}
              {movements.length > 0 ? (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  {movements.map((movement) => (
                    <li key={movement.id} style={{ display: "flex", gap: 8, fontSize: 12.5, alignItems: "baseline", flexWrap: "wrap" }}>
                      <span style={{ color: "var(--tx3)", whiteSpace: "nowrap" }}>
                        {new Date(movement.occurred_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
                      </span>
                      <span style={{ flex: 1, minWidth: 140 }}>
                        {MOVEMENT_LABELS[movement.entry_type] ?? movement.entry_type}
                        {movement.description ? ` — ${movement.description}` : ""}
                      </span>
                      <span style={{ fontWeight: 800, color: movement.credit_delta >= 0 ? "var(--ok)" : "var(--accent)" }}>
                        {movement.credit_delta >= 0 ? "+" : ""}
                        {movement.credit_delta}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {canSeeOrders && orders.length > 0 ? (
        <div className="tt-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="tt-label">Pedidos recientes</span>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {orders.map((order) => (
              <li key={order.id} style={{ display: "flex", gap: 10, fontSize: 13, alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 800 }}>{order.public_code}</span>
                <span style={{ color: "var(--tx3)" }}>
                  {new Date(order.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
                </span>
                <span className="tt-badge tt-badge-done">{order.status}</span>
                <span style={{ marginLeft: "auto", fontWeight: 800 }}>
                  {order.purchase_mode === "credits"
                    ? "Créditos"
                    : formatMoney(order.total_money_amount ?? order.items_subtotal_amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function AdjustCreditsForm({
  userId,
  onDone,
}: Readonly<{ userId: string; onDone: () => void }>) {
  const [delta, setDelta] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const parsed = Number.parseInt(delta, 10);
    if (Number.isNaN(parsed) || parsed === 0 || !description.trim()) {
      setError("Indica un delta distinto de cero y el motivo.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await browserApi(`/api/v1/credits/adjustments`, {
        method: "POST",
        body: {
          user_id: userId,
          delta: parsed,
          description: description.trim(),
        } satisfies CreditAdjustmentCreate,
      });
      setDelta("");
      setDescription("");
      onDone();
    } catch (err) {
      setError(apiMessage(err, "No fue posible ajustar los créditos."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          className="tt-input"
          inputMode="numeric"
          placeholder="+/− créditos"
          aria-label="Delta de créditos"
          value={delta}
          onChange={(event) => setDelta(event.target.value)}
          style={{ width: 120, fontSize: 13 }}
        />
        <input
          className="tt-input"
          placeholder="Motivo del ajuste (obligatorio)"
          aria-label="Motivo del ajuste"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          style={{ flex: "1 1 200px", fontSize: 13 }}
        />
        <button
          type="button"
          className="tt-btn tt-btn-outline"
          disabled={busy}
          onClick={() => void submit()}
          style={{ fontSize: 13 }}
        >
          {busy ? "Ajustando…" : "Ajustar"}
        </button>
      </div>
      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--accent)", fontWeight: 700 }}>{error}</p>
      ) : null}
    </div>
  );
}
