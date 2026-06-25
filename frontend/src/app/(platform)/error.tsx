"use client";

import { Button } from "@/components/ui/Button";

export default function PlatformError({ reset }: Readonly<{ reset: () => void }>) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center">
      <h2 className="text-lg font-semibold text-slate-900">No se pudo cargar la plataforma</h2>
      <p className="mt-2 text-sm text-slate-500">
        Ocurrió un problema al preparar tus módulos. Vuelve a intentarlo en un momento.
      </p>
      <div className="mt-6 flex justify-center">
        <Button onClick={reset}>Reintentar</Button>
      </div>
    </div>
  );
}
