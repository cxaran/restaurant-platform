"use client";

// Dominio de la instalación: muestra el origen público capturado y su estado de
// verificación. Verificar comprueba que el dominio sirve esta instalación, lo
// agrega al allowlist CSRF y lo usa para calcular las URLs de OAuth. El campo es
// opcional: vacío usa el dominio por el que navegas ahora (window.location.origin).

import { useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import type { VerifyDomainRequest } from "@/core/restaurant-api/contracts";

import type { SectionProps } from "./SistemaView";
import { verifyDomain } from "./api";
import { Feedback, HelpText, SectionHeader, apiErrorMessage, labelClass } from "./ui";

export function DominioPanel({ settings, canEdit, onSaved }: SectionProps) {
  const [baseUrl, setBaseUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const verified = Boolean(settings.app_base_url_verified_at);

  async function handleVerify(event: FormEvent) {
    event.preventDefault();
    if (verifying || !canEdit) return;
    setError(null);
    setNotice(null);
    setVerifying(true);
    try {
      // Vacío = el origen actual del navegador (mismo criterio que el asistente
      // de puesta en marcha).
      const candidate = baseUrl.trim() || window.location.origin;
      const body: VerifyDomainRequest = { base_url: candidate };
      onSaved(await verifyDomain(settings.id, body));
      setNotice(`Dominio verificado: ${candidate}`);
      setBaseUrl("");
    } catch (err) {
      setError(apiErrorMessage(err, "No fue posible verificar el dominio."));
    } finally {
      setVerifying(false);
    }
  }

  return (
    <Card>
      <SectionHeader title="Dominio">
        El origen público de esta instalación. Verificarlo confirma que el dominio sirve
        esta app, lo suma al allowlist de seguridad (CSRF) y se usa para las URLs de OAuth.
      </SectionHeader>

      <div className="mb-4 rounded-[11px] border border-[var(--border)] bg-[var(--bg2)] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[var(--tx3)]">Dominio actual:</span>
          <span className="text-sm font-semibold text-[var(--tx)]">
            {settings.app_base_url ?? "sin definir"}
          </span>
          <Badge tone={verified ? "ok" : "neutral"}>
            {verified ? "Verificado" : "Sin verificar"}
          </Badge>
        </div>
        {settings.app_base_url_verified_at ? (
          <HelpText>
            Verificado el {new Date(settings.app_base_url_verified_at).toLocaleString()}.
          </HelpText>
        ) : (
          <HelpText>
            El dominio se captura del navegador durante la puesta en marcha; verifícalo
            para añadirlo al allowlist en tiempo de ejecución.
          </HelpText>
        )}
      </div>

      {canEdit ? (
        <form onSubmit={handleVerify} className="flex flex-col gap-2" noValidate>
          <label className={labelClass} htmlFor="ss-domain">Dominio base (opcional)</label>
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-[240px] flex-1">
              <Input
                id="ss-domain"
                disabled={verifying}
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://tu-dominio (vacío = el dominio actual)"
              />
            </div>
            <Button type="submit" disabled={verifying}>
              {verifying ? "Verificando…" : "Verificar dominio"}
            </Button>
          </div>
          <Feedback error={error} notice={notice} />
        </form>
      ) : null}
    </Card>
  );
}
