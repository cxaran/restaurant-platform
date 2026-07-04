"use client";

// Vista de administración de códigos de descuento: lista con búsqueda simple,
// alta/edición (con discount_codes:manage) y redenciones por código. Sin
// generador automático de códigos y sin métricas de campaña (decisión de
// producto): el texto del código siempre lo escribe el administrador.

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { LoadingState } from "@/components/ui/LoadingState";
import { Select } from "@/components/ui/Select";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/Table";
import { ApiRequestError } from "@/core/api/api-error";
import type {
  DiscountCodeListItem,
  DiscountCodeRead,
} from "@/core/restaurant-api/contracts";
import { formatMoney } from "@/core/restaurant-api/theme";

import { getDiscountCode, listDiscountCodes } from "./api";
import { DiscountCodeForm } from "./DiscountCodeForm";
import { RedemptionsPanel } from "./RedemptionsPanel";

type ActiveFilter = "all" | "active" | "inactive";

type PanelState =
  | { type: "none" }
  | { type: "form"; initial: DiscountCodeRead | null }
  | { type: "redemptions"; codeId: string; codeLabel: string };

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("es-MX");
}

function formatValidity(item: DiscountCodeListItem): string {
  if (!item.valid_from && !item.valid_until) return "Siempre vigente";
  const from = item.valid_from ? `Desde ${formatDateTime(item.valid_from)}` : null;
  const until = item.valid_until ? `Hasta ${formatDateTime(item.valid_until)}` : null;
  return [from, until].filter(Boolean).join(" · ");
}

export function DiscountCodesView({
  canManage,
  canSearchProfiles,
}: Readonly<{ canManage: boolean; canSearchProfiles: boolean }>) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<ActiveFilter>("all");
  const [items, setItems] = useState<DiscountCodeListItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [panel, setPanel] = useState<PanelState>({ type: "none" });
  const [detailBusyId, setDetailBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Debounce corto para la búsqueda escrita; el backend filtra por q/is_active.
    const timer = setTimeout(() => {
      listDiscountCodes({
        q: q.trim() || undefined,
        isActive: filter === "all" ? null : filter === "active",
      })
        .then((rows) => {
          if (cancelled) return;
          setItems(rows);
          setListError(null);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setListError(
            err instanceof ApiRequestError
              ? err.body.message
              : "No fue posible cargar los códigos de descuento.",
          );
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, filter, refreshKey]);

  async function openEdit(item: DiscountCodeListItem) {
    setDetailBusyId(item.id);
    setNotice(null);
    try {
      const detail = await getDiscountCode(item.id);
      setPanel({ type: "form", initial: detail });
    } catch (err) {
      setListError(
        err instanceof ApiRequestError
          ? err.body.message
          : "No fue posible cargar el código para editarlo.",
      );
    } finally {
      setDetailBusyId(null);
    }
  }

  function handleSaved(saved: DiscountCodeRead, wasNew: boolean) {
    setPanel({ type: "none" });
    setNotice(
      wasNew
        ? `Código ${saved.code} creado.`
        : `Código ${saved.code} actualizado.`,
    );
    setRefreshKey((key) => key + 1);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-xs font-semibold text-[var(--tx3)]" htmlFor="dc-q">
            Buscar
          </label>
          <Input
            id="dc-q"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Código o nombre"
            autoComplete="off"
          />
        </div>
        <div className="w-44">
          <label className="mb-1 block text-xs font-semibold text-[var(--tx3)]" htmlFor="dc-active">
            Estado
          </label>
          <Select
            id="dc-active"
            value={filter}
            onChange={(event) => setFilter(event.target.value as ActiveFilter)}
          >
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </Select>
        </div>
        {canManage ? (
          <Button type="button" onClick={() => { setNotice(null); setPanel({ type: "form", initial: null }); }}>
            Nuevo código
          </Button>
        ) : null}
      </Card>

      {notice ? (
        <p role="status" className="m-0 text-sm font-semibold text-[var(--ok)]">{notice}</p>
      ) : null}
      {listError ? (
        <p role="alert" className="m-0 text-sm font-semibold text-[var(--danger)]">{listError}</p>
      ) : null}

      {panel.type === "form" ? (
        <DiscountCodeForm
          key={panel.initial?.id ?? "new"}
          initial={panel.initial}
          canSearchProfiles={canSearchProfiles}
          onSaved={handleSaved}
          onCancel={() => setPanel({ type: "none" })}
        />
      ) : null}

      {panel.type === "redemptions" ? (
        <RedemptionsPanel
          codeId={panel.codeId}
          codeLabel={panel.codeLabel}
          onClose={() => setPanel({ type: "none" })}
        />
      ) : null}

      {items === null && !listError ? (
        <LoadingState message="Cargando códigos…" />
      ) : null}

      {items !== null && items.length === 0 ? (
        <EmptyState
          title="Sin códigos de descuento"
          description="Crea un código para ofrecer un descuento en el checkout del sitio público."
        />
      ) : null}

      {items !== null && items.length > 0 ? (
        <Card className="overflow-x-auto p-0">
          <Table>
            <THead>
              <tr>
                <Th>Código</Th>
                <Th>Nombre</Th>
                <Th>Descuento</Th>
                <Th>Compra mínima</Th>
                <Th>Vigencia</Th>
                <Th>Tipo</Th>
                <Th>Estado</Th>
                <Th className="text-right">Acciones</Th>
              </tr>
            </THead>
            <TBody>
              {items.map((item) => (
                <Tr key={item.id}>
                  <Td className="font-semibold">{item.code}</Td>
                  <Td>{item.name}</Td>
                  <Td>{formatMoney(item.discount_amount)}</Td>
                  <Td>{formatMoney(item.minimum_order_amount)}</Td>
                  <Td className="text-[var(--tx2)]">{formatValidity(item)}</Td>
                  <Td>
                    <Badge tone={item.target_customer_user_id ? "info" : "neutral"}>
                      {item.target_customer_user_id ? "Personal" : "General"}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge tone={item.is_active ? "ok" : "neutral"}>
                      {item.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </Td>
                  <Td className="text-right">
                    <span className="inline-flex gap-2">
                      {canManage ? (
                        <button
                          type="button"
                          className="rounded-[9px] border border-[var(--border2)] px-2.5 py-1 text-xs font-semibold text-[var(--tx)] transition hover:bg-[var(--bg2)] disabled:opacity-60"
                          onClick={() => void openEdit(item)}
                          disabled={detailBusyId === item.id}
                        >
                          {detailBusyId === item.id ? "Abriendo…" : "Editar"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="rounded-[9px] border border-[var(--border2)] px-2.5 py-1 text-xs font-semibold text-[var(--tx)] transition hover:bg-[var(--bg2)]"
                        onClick={() => {
                          setNotice(null);
                          setPanel({ type: "redemptions", codeId: item.id, codeLabel: item.code });
                        }}
                      >
                        Redenciones
                      </button>
                    </span>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}
