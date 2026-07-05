"use client";

// Con el programa de créditos APAGADO, fuerza el carrito a modo dinero en
// cualquier ruta (cubre carrito, checkout y accesos directos con un modo
// «credits» persistido de antes). Los saldos NO se tocan: si el negocio
// reactiva el programa, el cliente vuelve a poder canjear. No renderiza nada.

import { useEffect } from "react";

import { useCart } from "@/core/storefront/cart";
import { useCreditsEnabled } from "@/core/storefront/useCreditsEnabled";

export function CreditsModeGuard() {
  const enabled = useCreditsEnabled();
  const { mode, setMode } = useCart();

  useEffect(() => {
    if (enabled === false && mode === "credits") setMode("money");
  }, [enabled, mode, setMode]);

  return null;
}
