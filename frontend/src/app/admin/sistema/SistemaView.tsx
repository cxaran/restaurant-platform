"use client";

// Vista de configuración del sistema: carga el singleton UNA vez y compone las
// secciones. Cada sección edita su propio subconjunto y hace su PATCH; al
// guardar (o ejecutar una acción) devuelve el read completo y ``handleSaved``
// refresca el estado compartido, de modo que los datos derivados (motivo del
// transporte de correo, flags *_configured, dominio verificado) quedan al día en
// todas las secciones sin recargar la página.

import { useEffect, useState } from "react";

import { Card } from "@/components/ui/Card";
import { LoadingState } from "@/components/ui/LoadingState";
import type { SystemSettingsRead } from "@/core/restaurant-api/contracts";

import { AccesoForm } from "./AccesoForm";
import { AnaliticaForm } from "./AnaliticaForm";
import { CorreoForm } from "./CorreoForm";
import { DominioPanel } from "./DominioPanel";
import { GoogleLoginForm } from "./GoogleLoginForm";
import { getSystemSettings } from "./api";
import { apiErrorMessage } from "./ui";

export function SistemaView({ canEdit }: Readonly<{ canEdit: boolean }>) {
  const [settings, setSettings] = useState<SystemSettingsRead | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSystemSettings()
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(
            apiErrorMessage(err, "No fue posible cargar la configuración del sistema."),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadError) {
    return (
      <Card>
        <p role="alert" className="m-0 text-sm font-semibold text-[var(--danger)]">
          {loadError}
        </p>
      </Card>
    );
  }

  if (settings === null) {
    return (
      <Card>
        <LoadingState message="Cargando configuración…" />
      </Card>
    );
  }

  const shared = { settings, canEdit, onSaved: setSettings };

  return (
    <div className="flex flex-col gap-3.5">
      <AccesoForm {...shared} />
      <CorreoForm {...shared} />
      <AnaliticaForm {...shared} />
      <GoogleLoginForm {...shared} />
      <DominioPanel {...shared} />
    </div>
  );
}

// Contrato común de cada sección: el read compartido (para display/derivados y
// seed), el permiso de edición y el callback para publicar el read actualizado.
export type SectionProps = Readonly<{
  settings: SystemSettingsRead;
  canEdit: boolean;
  onSaved: (updated: SystemSettingsRead) => void;
}>;
