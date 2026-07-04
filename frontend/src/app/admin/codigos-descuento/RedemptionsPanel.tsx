"use client";

// Redenciones de un código: cada fila es un SNAPSHOT inmutable del momento de
// reservar (código, nombre y montos), aunque el código se edite después.

import { useEffect, useState } from "react";

import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/Table";
import { ApiRequestError } from "@/core/api/api-error";
import type { DiscountRedemptionListItem } from "@/core/restaurant-api/contracts";
import { formatMoney } from "@/core/restaurant-api/theme";

import { listDiscountRedemptions } from "./api";

const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  reserved: { label: "Reservada", tone: "warn" },
  consumed: { label: "Consumida", tone: "ok" },
  released: { label: "Liberada", tone: "neutral" },
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("es-MX");
}

export function RedemptionsPanel({
  codeId,
  codeLabel,
  onClose,
}: Readonly<{ codeId: string; codeLabel: string; onClose: () => void }>) {
  const [rows, setRows] = useState<DiscountRedemptionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listDiscountRedemptions(codeId)
      .then((items) => {
        if (!cancelled) {
          setRows(items);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof ApiRequestError
              ? err.body.message
              : "No fue posible cargar las redenciones.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [codeId]);

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="m-0 text-base font-semibold text-[var(--tx)]">
          Redenciones del código {codeLabel}
        </h2>
        <button
          type="button"
          className="rounded-[11px] border border-[var(--border2)] px-3 py-1.5 text-sm font-semibold text-[var(--tx)] transition hover:bg-[var(--bg2)]"
          onClick={onClose}
        >
          Cerrar
        </button>
      </div>

      {error ? (
        <p role="alert" className="m-0 text-sm font-semibold text-[var(--danger)]">{error}</p>
      ) : null}

      {rows === null && !error ? <LoadingState message="Cargando redenciones…" /> : null}

      {rows !== null && rows.length === 0 ? (
        <EmptyState title="Sin redenciones" description="Este código todavía no se ha usado." />
      ) : null}

      {rows !== null && rows.length > 0 ? (
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <tr>
                <Th>Estado</Th>
                <Th>Pedido</Th>
                <Th>Fecha</Th>
                <Th>Descuento (snapshot)</Th>
                <Th>Mínimo (snapshot)</Th>
                <Th>Código (snapshot)</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((row) => {
                const meta = STATUS_META[row.status] ?? {
                  label: row.status,
                  tone: "neutral" as BadgeTone,
                };
                return (
                  <Tr key={row.id}>
                    <Td>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      {row.status === "released" && row.release_reason ? (
                        <span className="ml-2 text-xs text-[var(--tx3)]">
                          {row.release_reason}
                        </span>
                      ) : null}
                    </Td>
                    <Td className="font-semibold">{row.order_public_code}</Td>
                    <Td className="text-[var(--tx2)]">
                      <div>Reservada: {formatDateTime(row.reserved_at)}</div>
                      {row.consumed_at ? (
                        <div>Consumida: {formatDateTime(row.consumed_at)}</div>
                      ) : null}
                      {row.released_at ? (
                        <div>Liberada: {formatDateTime(row.released_at)}</div>
                      ) : null}
                    </Td>
                    <Td>{formatMoney(row.discount_amount_snapshot)}</Td>
                    <Td>{formatMoney(row.minimum_order_amount_snapshot)}</Td>
                    <Td className="text-[var(--tx2)]">
                      {row.code_snapshot} · {row.name_snapshot}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </div>
      ) : null}
    </Card>
  );
}
