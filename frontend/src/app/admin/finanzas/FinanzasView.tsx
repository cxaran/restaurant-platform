"use client";

// Vista de Finanzas: resumen del periodo (§21.1), libro de movimientos con
// filtros y "cargar más", alta manual con comprobante y anulación con motivo.
// La UI no decide reglas: montos, coherencia dirección/tipo y topes los valida
// el backend y aquí se muestra su mensaje real.

import { useEffect, useMemo, useState } from "react";

import { ApiRequestError } from "@/core/api/api-error";
import { formatMoney } from "@/core/restaurant-api/theme";

import {
  attachEvidence,
  createEntry,
  getSummary,
  listActiveCategories,
  listEntries,
  uploadEvidence,
  voidEntry,
  type BusinessSummary,
  type EntryFilters,
  type FinanceCategory,
  type FinancialEntry,
} from "./api";

const PAGE_SIZE = 50;

const ENTRY_TYPE_LABELS: Record<string, string> = {
  payment_income: "Cobro de pedido",
  manual_income: "Ingreso manual",
  expense: "Gasto",
  delivery_expense: "Gasto de reparto",
  refund: "Devolución",
  adjustment: "Ajuste",
};

// Tipos capturables a mano por dirección (el backend revalida la coherencia).
const MANUAL_TYPES: Record<"income" | "expense", { value: string; label: string }[]> = {
  income: [
    { value: "manual_income", label: "Ingreso manual" },
    { value: "adjustment", label: "Ajuste" },
  ],
  expense: [
    { value: "expense", label: "Gasto" },
    { value: "delivery_expense", label: "Gasto de reparto" },
    { value: "adjustment", label: "Ajuste" },
  ],
};

const DOCUMENT_TYPES: { value: string; label: string }[] = [
  { value: "receipt", label: "Nota / recibo" },
  { value: "invoice_pdf", label: "Factura PDF" },
  { value: "invoice_xml", label: "Factura XML" },
  { value: "payment_proof", label: "Comprobante de pago" },
  { value: "expense_photo", label: "Foto del gasto" },
  { value: "other", label: "Otro" },
];

function localDate(value: Date): string {
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

// /finances/* filtra por datetime [from, to): medianoche local → ISO UTC.
function utcBounds(from: string, to: string): { fromIso?: string; toIso?: string } {
  const out: { fromIso?: string; toIso?: string } = {};
  if (from) out.fromIso = new Date(`${from}T00:00:00`).toISOString();
  if (to) {
    const end = new Date(`${to}T00:00:00`);
    end.setDate(end.getDate() + 1);
    out.toIso = end.toISOString();
  }
  return out;
}

function apiMessage(err: unknown, fallback: string): string {
  return err instanceof ApiRequestError ? err.body.message : fallback;
}

function SummaryCard({
  label,
  value,
  tone = "neutral",
  sub,
}: Readonly<{ label: string; value: string; tone?: "ok" | "danger" | "neutral"; sub?: string }>) {
  const color =
    tone === "ok" ? "var(--ok)" : tone === "danger" ? "var(--accent)" : "var(--tx)";
  return (
    <div
      className="tt-card"
      style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}
    >
      <span className="tt-label">{label}</span>
      <span style={{ fontWeight: 900, fontSize: 20, color }}>{value}</span>
      {sub ? <span style={{ fontSize: 12, color: "var(--tx3)" }}>{sub}</span> : null}
    </div>
  );
}

export function FinanzasView({
  canRecord,
  canVoid,
}: Readonly<{ canRecord: boolean; canVoid: boolean }>) {
  // Rango por defecto: el mes en curso.
  const now = new Date();
  const [dateFrom, setDateFrom] = useState(localDate(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [dateTo, setDateTo] = useState(localDate(now));
  const [direction, setDirection] = useState("");
  const [entryType, setEntryType] = useState("");

  const [summary, setSummary] = useState<BusinessSummary | null>(null);
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categories, setCategories] = useState<FinanceCategory[]>([]);

  const filters = useMemo<EntryFilters>(() => {
    const { fromIso, toIso } = utcBounds(dateFrom, dateTo);
    return {
      fromIso,
      toIso,
      direction: direction || undefined,
      entryType: entryType || undefined,
    };
  }, [dateFrom, dateTo, direction, entryType]);

  // Recarga por tick (mismo patrón que el tablero de pedidos): todo setState
  // ocurre tras el await; los cambios de filtro refetchean vía `filters`.
  const [reloadTick, setReloadTick] = useState(0);
  const refresh = () => setReloadTick((tick) => tick + 1);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [summaryData, page] = await Promise.all([
          // El summary exige rango completo: sin fechas se omite.
          filters.fromIso && filters.toIso
            ? getSummary(filters.fromIso, filters.toIso)
            : Promise.resolve(null),
          listEntries(filters, PAGE_SIZE, 0),
        ]);
        if (!active) return;
        setSummary(summaryData);
        setEntries(page);
        setHasMore(page.length === PAGE_SIZE);
        setError(null);
      } catch (err) {
        if (active) setError(apiMessage(err, "No fue posible cargar las finanzas."));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [filters, reloadTick]);

  useEffect(() => {
    if (!canRecord) return;
    let active = true;
    listActiveCategories()
      .then((data) => {
        if (active) setCategories(data);
      })
      .catch(() => {
        if (active) setCategories([]);
      });
    return () => {
      active = false;
    };
  }, [canRecord]);

  async function loadMore() {
    try {
      const page = await listEntries(filters, PAGE_SIZE, entries.length);
      setEntries((current) => [...current, ...page]);
      setHasMore(page.length === PAGE_SIZE);
    } catch (err) {
      setError(apiMessage(err, "No fue posible cargar más movimientos."));
    }
  }

  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ── Filtros de periodo y tipo ─────────────────────────────────── */}
      <div className="tt-card" style={{ padding: "12px 16px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12, fontWeight: 700 }}>
          Desde
          <input type="date" className="tt-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12, fontWeight: 700 }}>
          Hasta
          <input type="date" className="tt-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12, fontWeight: 700 }}>
          Dirección
          <select className="tt-input" value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="">Todas</option>
            <option value="income">Ingresos</option>
            <option value="expense">Egresos</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12, fontWeight: 700 }}>
          Tipo
          <select className="tt-input" value={entryType} onChange={(e) => setEntryType(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(ENTRY_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <button type="button" className="tt-btn tt-btn-ghost" onClick={refresh} style={{ padding: "9px 14px", fontSize: 13 }}>
          Actualizar
        </button>
      </div>

      {error ? (
        <p role="alert" style={{ margin: 0, color: "var(--accent)", fontWeight: 700, fontSize: 13 }}>{error}</p>
      ) : null}

      {/* ── Resumen del periodo (§21.1) ───────────────────────────────── */}
      {summary ? (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          <SummaryCard label="Ingresos" value={formatMoney(summary.income_total)} tone="ok" />
          <SummaryCard label="Egresos" value={formatMoney(summary.expense_total)} tone="danger" />
          <SummaryCard label="Devoluciones" value={formatMoney(summary.refund_total)} tone="danger" />
          <SummaryCard
            label="Resultado neto"
            value={formatMoney(summary.net_result)}
            tone={Number.parseFloat(summary.net_result) >= 0 ? "ok" : "danger"}
            sub={`${summary.entry_count} movimientos en el periodo`}
          />
        </div>
      ) : null}

      {canRecord ? <NewEntryForm categories={categories} onCreated={refresh} /> : null}

      {/* ── Libro de movimientos ──────────────────────────────────────── */}
      <div className="tt-card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <p style={{ margin: 0, padding: "16px 18px", fontSize: 13, color: "var(--tx3)" }}>Cargando movimientos…</p>
        ) : entries.length === 0 ? (
          <p style={{ margin: 0, padding: "16px 18px", fontSize: 13, color: "var(--tx3)" }}>
            Sin movimientos con los filtros elegidos.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                categoryName={entry.category_id ? categoryNames.get(entry.category_id) ?? null : null}
                canVoid={canVoid}
                onChanged={refresh}
              />
            ))}
          </ul>
        )}
        {hasMore ? (
          <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)" }}>
            <button type="button" className="tt-btn tt-btn-outline" onClick={() => void loadMore()} style={{ fontSize: 13 }}>
              Cargar más
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Fila del libro ───────────────────────────────────────────────────────
function EntryRow({
  entry,
  categoryName,
  canVoid,
  onChanged,
}: Readonly<{
  entry: FinancialEntry;
  categoryName: string | null;
  canVoid: boolean;
  onChanged: () => void;
}>) {
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const voided = entry.status === "voided";
  const isExpense = entry.direction === "expense";
  const label = ENTRY_TYPE_LABELS[entry.entry_type] ?? entry.entry_type;

  async function confirmVoid() {
    if (!reason.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await voidEntry(entry.id, reason.trim());
      setVoiding(false);
      onChanged();
    } catch (err) {
      setError(apiMessage(err, "No fue posible anular el movimiento."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      style={{
        padding: "12px 16px",
        borderBottom: "1px solid var(--border)",
        display: "flex", flexDirection: "column", gap: 6,
        opacity: voided ? 0.6 : 1,
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--tx3)", whiteSpace: "nowrap" }}>
          {new Date(entry.occurred_at).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
        </span>
        <span className={`tt-badge ${isExpense ? "tt-badge-warn" : "tt-badge-ok"}`}>{label}</span>
        {voided ? <span className="tt-badge tt-badge-new">Anulado</span> : null}
        <span style={{ flex: 1, minWidth: 120, fontSize: 13, fontWeight: 600 }}>
          {entry.description || entry.counterparty_name || "—"}
          {categoryName ? (
            <span style={{ color: "var(--tx3)", fontWeight: 400 }}> · {categoryName}</span>
          ) : null}
        </span>
        <span style={{ fontWeight: 900, fontSize: 15, color: isExpense ? "var(--accent)" : "var(--ok)", whiteSpace: "nowrap" }}>
          {isExpense ? "−" : "+"}
          {formatMoney(entry.amount)}
        </span>
      </div>

      {entry.invoice_folio || entry.counterparty_name ? (
        <span style={{ fontSize: 12, color: "var(--tx3)" }}>
          {entry.counterparty_name ? `Contraparte: ${entry.counterparty_name}` : null}
          {entry.counterparty_name && entry.invoice_folio ? " · " : null}
          {entry.invoice_folio ? `Folio: ${entry.invoice_folio}` : null}
        </span>
      ) : null}
      {voided && entry.void_reason ? (
        <span style={{ fontSize: 12, color: "var(--tx3)" }}>Motivo de anulación: {entry.void_reason}</span>
      ) : null}

      {(entry.attachments ?? []).length > 0 ? (
        <span style={{ fontSize: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(entry.attachments ?? []).map((attachment, index) => (
            <a
              key={attachment.id}
              href={`/api/v1/files/${attachment.file_id}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--accent)", fontWeight: 700 }}
            >
              Comprobante {index + 1}
              {attachment.description ? ` (${attachment.description})` : ""}
            </a>
          ))}
        </span>
      ) : null}

      {canVoid && !voided ? (
        voiding ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              className="tt-input"
              placeholder="Motivo de la anulación (obligatorio)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ flex: 1, minWidth: 200, fontSize: 13 }}
            />
            <button type="button" className="tt-btn tt-btn-outline-accent" disabled={busy || !reason.trim()} onClick={() => void confirmVoid()} style={{ fontSize: 12 }}>
              {busy ? "Anulando…" : "Confirmar anulación"}
            </button>
            <button type="button" className="tt-btn tt-btn-ghost" disabled={busy} onClick={() => setVoiding(false)} style={{ fontSize: 12 }}>
              Cancelar
            </button>
          </div>
        ) : (
          <div>
            <button type="button" className="tt-btn tt-btn-ghost" onClick={() => setVoiding(true)} style={{ fontSize: 12, padding: "5px 10px" }}>
              Anular…
            </button>
          </div>
        )
      ) : null}
      {error ? (
        <span role="alert" style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700 }}>{error}</span>
      ) : null}
    </li>
  );
}

// ── Alta manual con comprobante opcional ─────────────────────────────────
function NewEntryForm({
  categories,
  onCreated,
}: Readonly<{ categories: FinanceCategory[]; onCreated: () => void }>) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"income" | "expense">("expense");
  const [entryType, setEntryType] = useState("expense");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => {
    const d = new Date();
    d.setSeconds(0, 0);
    // datetime-local sin zona: recorte del ISO local.
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [description, setDescription] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState("receipt");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const typeOptions = MANUAL_TYPES[direction];
  const directionCategories = categories.filter((category) => category.direction === direction);

  function pickDirection(next: "income" | "expense") {
    setDirection(next);
    setEntryType(MANUAL_TYPES[next][0].value);
    setCategoryId("");
  }

  async function submit() {
    const parsed = Number.parseFloat(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("El monto debe ser mayor que cero.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const entry = await createEntry({
        direction,
        entry_type: entryType as "manual_income" | "expense" | "delivery_expense" | "adjustment",
        amount: amount.trim(),
        occurred_at: new Date(occurredAt).toISOString(),
        ...(categoryId ? { category_id: categoryId } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(counterparty.trim() ? { counterparty_name: counterparty.trim() } : {}),
      });
      if (file) {
        // El movimiento YA existe: un fallo del comprobante no lo revierte.
        try {
          const fileId = await uploadEvidence(file);
          await attachEvidence(entry.id, {
            file_id: fileId,
            document_type: documentType as "receipt",
          });
        } catch (err) {
          setNotice(apiMessage(err, "Movimiento registrado, pero el comprobante no se pudo adjuntar."));
        }
      }
      setAmount("");
      setDescription("");
      setCounterparty("");
      setFile(null);
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(apiMessage(err, "No fue posible registrar el movimiento."));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="tt-btn tt-btn-primary" onClick={() => setOpen(true)} style={{ fontSize: 13 }}>
          Registrar movimiento
        </button>
        {notice ? <span role="status" style={{ fontSize: 12, color: "var(--tx2)" }}>{notice}</span> : null}
      </div>
    );
  }

  const labelStyle = { display: "flex", flexDirection: "column" as const, gap: 3, fontSize: 12, fontWeight: 700 };

  return (
    <div className="tt-card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <span className="tt-display" style={{ fontSize: 16 }}>Nuevo movimiento manual</span>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label style={labelStyle}>
          Dirección
          <select className="tt-input" value={direction} onChange={(e) => pickDirection(e.target.value as "income" | "expense")}>
            <option value="expense">Egreso</option>
            <option value="income">Ingreso</option>
          </select>
        </label>
        <label style={labelStyle}>
          Tipo
          <select className="tt-input" value={entryType} onChange={(e) => setEntryType(e.target.value)}>
            {typeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Categoría (opcional)
          <select className="tt-input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Sin categoría</option>
            {directionCategories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Monto
          <input className="tt-input" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label style={labelStyle}>
          Fecha y hora
          <input type="datetime-local" className="tt-input" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
        </label>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label style={{ ...labelStyle, flex: 1, minWidth: 220 }}>
          Concepto
          <input className="tt-input" placeholder="¿Qué se pagó o recibió?" value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label style={{ ...labelStyle, flex: 1, minWidth: 180 }}>
          Contraparte (opcional)
          <input className="tt-input" placeholder="Proveedor / persona" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
        </label>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={labelStyle}>
          Comprobante (opcional)
          <input
            type="file"
            accept="application/pdf,text/xml,image/png,image/jpeg,image/webp"
            className="tt-input"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ padding: 8 }}
          />
        </label>
        {file ? (
          <label style={labelStyle}>
            Tipo de documento
            <select className="tt-input" value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
              {DOCUMENT_TYPES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {error ? (
        <p role="alert" style={{ margin: 0, color: "var(--accent)", fontSize: 13, fontWeight: 700 }}>{error}</p>
      ) : null}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="tt-btn tt-btn-primary" disabled={busy} onClick={() => void submit()} style={{ fontSize: 13 }}>
          {busy ? "Registrando…" : "Registrar"}
        </button>
        <button type="button" className="tt-btn tt-btn-ghost" disabled={busy} onClick={() => setOpen(false)} style={{ fontSize: 13 }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
