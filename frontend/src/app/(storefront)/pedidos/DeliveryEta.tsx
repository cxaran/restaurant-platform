"use client";

import { useEffect, useState } from "react";

// Tiempo estimado / restante de entrega en el seguimiento del cliente.
//   · Con hora estimada (pedido aprobado + tarifa con tiempo): cuenta regresiva
//     viva que se refresca sola.
//   · Solo con el estimado de la tarifa (aún sin aprobar): estimado estático.
//   · Sin datos (tiempo nulo): no renderiza NADA.
// El backend es la autoridad: `estimated_delivery_at` = approved_at + minutos y
// solo llega en estados activos de entrega; aquí solo se deriva la presentación.
export function DeliveryEta({
  estimatedDeliveryAt,
  estimatedMinutes,
}: Readonly<{
  estimatedDeliveryAt: string | null;
  estimatedMinutes: number | null;
}>) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!estimatedDeliveryAt) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [estimatedDeliveryAt]);

  const style = { fontSize: 13, fontWeight: 700 } as const;

  if (estimatedDeliveryAt) {
    const etaMs = new Date(estimatedDeliveryAt).getTime();
    if (Number.isNaN(etaMs)) return null;
    const remaining = Math.ceil((etaMs - now) / 60_000);
    const clock = new Date(etaMs).toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return (
      <span className="sf-band-sub" style={style}>
        {remaining > 0
          ? `Tiempo estimado restante: ~${remaining} min · aprox. ${clock}`
          : `Debería llegar en breve · estimado ${clock}`}
      </span>
    );
  }

  if (estimatedMinutes != null) {
    return (
      <span className="sf-band-sub" style={style}>
        Tiempo estimado de entrega: ~{estimatedMinutes} min
      </span>
    );
  }

  return null;
}
