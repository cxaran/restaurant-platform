// Selección de la dirección de entrega del cliente (carrito y checkout):
// lógica pura + persistencia local de la ÚLTIMA dirección usada.
//
// Reglas (spec de zonas): con UNA sola dirección guardada se usa esa; con
// varias se recuerda la última seleccionada (localStorage); si no hay
// recuerdo válido se cae a la predeterminada y luego a la primera. El costo
// de envío SIEMPRE lo cotiza el backend con las coordenadas de la dirección;
// una dirección sin ubicación no puede cotizar y la UI lo dice tal cual.

import type { UserAddressRead } from "@/core/restaurant-api/contracts";

const STORAGE_KEY = "sf-delivery-address-id";

export function readRememberedAddressId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Recuerda la última dirección usada (null = captura manual en checkout). */
export function rememberAddressId(addressId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (addressId === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, addressId);
  } catch {
    // Sin almacenamiento disponible: simplemente no se recuerda.
  }
}

/**
 * Dirección efectiva para estimar el envío:
 *  · sin direcciones → null;
 *  · una sola → esa;
 *  · varias → la recordada, si sigue existiendo; si no, la predeterminada;
 *    en último caso la primera (el orden del backend ya trae default primero).
 */
export function resolveSelectedAddress(
  addresses: readonly UserAddressRead[],
  rememberedId: string | null,
): UserAddressRead | null {
  if (addresses.length === 0) return null;
  if (addresses.length === 1) return addresses[0];
  const remembered =
    rememberedId !== null
      ? addresses.find((address) => address.id === rememberedId)
      : undefined;
  if (remembered) return remembered;
  return addresses.find((address) => address.is_default) ?? addresses[0];
}

/** Punto {longitude, latitude} de la dirección, si guardó coordenadas. */
export function addressPoint(
  address: UserAddressRead | null,
): { longitude: number; latitude: number } | null {
  if (!address?.location) return null;
  const [longitude, latitude] = address.location.coordinates;
  return { longitude, latitude };
}

/** Resumen corto para chips/listas: "Casa · Calle 12, Centro". */
export function addressSummary(address: UserAddressRead): string {
  const street = [address.street, address.external_number].filter(Boolean).join(" ");
  const label = address.label?.trim();
  const parts = [label, street, address.neighborhood].filter(
    (part): part is string => Boolean(part && part.trim()),
  );
  return parts.join(" · ");
}
