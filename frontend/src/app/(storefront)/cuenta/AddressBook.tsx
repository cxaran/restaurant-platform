"use client";

// Libreta de direcciones del cliente (/cuenta): crear, editar, predeterminar y
// eliminar (baja lógica) direcciones PROPIAS vía /users/me/addresses. Las
// coordenadas se capturan con el mismo LocationPicker del checkout y SOLO se
// guardan cuando el cliente decide guardar la dirección — obtener el permiso
// temporal de geolocalización nunca persiste nada por sí solo.
//
// Captura asistida (mismos principios que checkout/POS/panel): la dirección
// del pin se SUGIERE (jamás pisa en silencio lo escrito), la dirección escrita
// acerca el mapa sin seleccionar ubicación, y se avisa si el pin queda lejos.

import { useEffect, useMemo, useRef, useState } from "react";

import { LocationPicker, type PickedPoint } from "@/components/map/LocationPicker";
import { ApiRequestError } from "@/core/api/api-error";
import { browserApi } from "@/core/api/browser-client";
import {
  distanceMeters,
  reverseGeocode,
  searchAddress,
  type AddressSuggestion,
  type GeoSearchMatch,
} from "@/core/geo/geocoding";
import type {
  UserAddressCreate,
  UserAddressRead,
  UserAddressUpdate,
} from "@/core/restaurant-api/contracts";

type FormState = {
  label: string;
  street: string;
  external_number: string;
  internal_number: string;
  neighborhood: string;
  city: string;
  postal_code: string;
  references: string;
  contact_phone: string;
  is_default: boolean;
  point: PickedPoint | null;
};

const EMPTY_FORM: FormState = {
  label: "",
  street: "",
  external_number: "",
  internal_number: "",
  neighborhood: "",
  city: "",
  postal_code: "",
  references: "",
  contact_phone: "",
  is_default: false,
  point: null,
};

function addressToForm(address: UserAddressRead): FormState {
  return {
    label: address.label ?? "",
    street: address.street,
    external_number: address.external_number ?? "",
    internal_number: address.internal_number ?? "",
    neighborhood: address.neighborhood ?? "",
    city: address.city ?? "",
    postal_code: address.postal_code ?? "",
    references: address.references ?? "",
    contact_phone: address.contact_phone ?? "",
    is_default: address.is_default ?? false,
    point: address.location
      ? {
          longitude: address.location.coordinates[0],
          latitude: address.location.coordinates[1],
        }
      : null,
  };
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiRequestError ? err.body.message : fallback;
}

export function AddressBook({ initial }: Readonly<{ initial: UserAddressRead[] }>) {
  const [addresses, setAddresses] = useState<UserAddressRead[]>(initial);
  const [editing, setEditing] = useState<{ id: string | null; form: FormState } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Captura asistida del formulario abierto.
  const [pinSuggestion, setPinSuggestion] = useState<AddressSuggestion | null>(null);
  const [geoNotice, setGeoNotice] = useState<string | null>(null);
  const [addressMatch, setAddressMatch] = useState<GeoSearchMatch | null>(null);
  const reverseSeqRef = useRef(0);
  const formRef = useRef<FormState | null>(null);
  useEffect(() => {
    formRef.current = editing?.form ?? null;
  });

  function openEditor(next: { id: string | null; form: FormState } | null) {
    // Abrir/cerrar el editor invalida cualquier geocodificación en vuelo y
    // limpia avisos (que un pin viejo no rellene el formulario nuevo).
    reverseSeqRef.current += 1;
    setPinSuggestion(null);
    setGeoNotice(null);
    setAddressMatch(null);
    setEditing(next);
    setError(null);
  }

  function patchForm(patch: Partial<FormState>) {
    setEditing((current) =>
      current === null ? current : { ...current, form: { ...current.form, ...patch } },
    );
  }

  // Pin nuevo → dirección sugerida: con el formulario "virgen" se pre-llena
  // avisando; con texto ya escrito se ofrece para confirmar (nunca se pisa).
  function handleFormPoint(point: PickedPoint | null) {
    patchForm({ point });
    setPinSuggestion(null);
    setGeoNotice(null);
    const seq = ++reverseSeqRef.current;
    if (point === null) return;
    void reverseGeocode(point).then((suggestion) => {
      if (seq !== reverseSeqRef.current || suggestion === null) return;
      const current = formRef.current;
      if (current === null) return;
      const untouched =
        !current.street.trim() &&
        !current.neighborhood.trim() &&
        !current.postal_code.trim() &&
        !current.city.trim();
      if (untouched) {
        setEditing((state) =>
          state === null
            ? state
            : {
                ...state,
                form: {
                  ...state.form,
                  street: suggestion.street,
                  external_number: suggestion.external_number || state.form.external_number,
                  neighborhood: suggestion.neighborhood || state.form.neighborhood,
                  city: suggestion.city || state.form.city,
                  postal_code: suggestion.postal_code || state.form.postal_code,
                },
              },
        );
        setGeoNotice(
          "Dirección tomada del punto del mapa: revísala y completa número y referencias.",
        );
      } else {
        setPinSuggestion(suggestion);
      }
    });
  }

  function applyPinSuggestion() {
    if (pinSuggestion === null) return;
    setEditing((state) =>
      state === null
        ? state
        : {
            ...state,
            form: {
              ...state.form,
              street: pinSuggestion.street,
              external_number: pinSuggestion.external_number || state.form.external_number,
              neighborhood: pinSuggestion.neighborhood || state.form.neighborhood,
              city: pinSuggestion.city || state.form.city,
              postal_code: pinSuggestion.postal_code || state.form.postal_code,
            },
          },
    );
    setPinSuggestion(null);
    setGeoNotice("Dirección actualizada con la del punto del mapa.");
  }

  // Dirección escrita → geocodificar (debounce) para acercar el mapa sin
  // seleccionar ubicación y contrastarla contra el pin.
  const addressQuery = useMemo(() => {
    const form = editing?.form;
    if (!form || form.street.trim().length < 4) return "";
    return [
      [form.street.trim(), form.external_number.trim()].filter(Boolean).join(" "),
      form.neighborhood.trim(),
      form.postal_code.trim(),
      form.city.trim(),
    ]
      .filter(Boolean)
      .join(", ");
  }, [editing?.form]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(
      () => {
        if (addressQuery === "") {
          setAddressMatch(null);
          return;
        }
        void searchAddress(addressQuery).then((match) => {
          if (!cancelled) setAddressMatch(match);
        });
      },
      addressQuery === "" ? 0 : 900,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [addressQuery]);

  const pinDistance = useMemo(() => {
    const point = editing?.form.point ?? null;
    return point !== null && addressMatch !== null ? distanceMeters(point, addressMatch) : null;
  }, [editing?.form.point, addressMatch]);
  const pinFarFromAddress = pinDistance !== null && pinDistance > 300;

  function movePinToAddress() {
    if (addressMatch === null) return;
    reverseSeqRef.current += 1; // movimiento explícito: sin re-sugerencia
    patchForm({ point: { longitude: addressMatch.longitude, latitude: addressMatch.latitude } });
    setPinSuggestion(null);
    setGeoNotice("Pin movido a la dirección escrita: confirma el punto exacto en el mapa.");
  }

  async function reload() {
    try {
      setAddresses(await browserApi<UserAddressRead[]>("/api/v1/users/me/addresses"));
    } catch {
      // Se conserva la lista actual; la siguiente operación reintenta.
    }
  }

  function toNull(value: string): string | null {
    return value.trim() === "" ? null : value.trim();
  }

  async function save() {
    if (editing === null || busy || editing.form.street.trim() === "") return;
    setBusy(true);
    setError(null);
    const { form } = editing;
    const location =
      form.point !== null
        ? {
            type: "Point" as const,
            coordinates: [form.point.longitude, form.point.latitude] as [number, number],
          }
        : null;
    try {
      if (editing.id === null) {
        const payload: UserAddressCreate = {
          label: toNull(form.label),
          street: form.street.trim(),
          external_number: toNull(form.external_number),
          internal_number: toNull(form.internal_number),
          neighborhood: toNull(form.neighborhood),
          city: toNull(form.city),
          postal_code: toNull(form.postal_code),
          references: toNull(form.references),
          contact_phone: toNull(form.contact_phone),
          location,
          is_default: form.is_default,
        };
        await browserApi<UserAddressRead>("/api/v1/users/me/addresses", {
          method: "POST",
          body: payload,
        });
      } else {
        const payload: UserAddressUpdate = {
          label: toNull(form.label),
          street: form.street.trim(),
          external_number: toNull(form.external_number),
          internal_number: toNull(form.internal_number),
          neighborhood: toNull(form.neighborhood),
          city: toNull(form.city),
          postal_code: toNull(form.postal_code),
          references: toNull(form.references),
          contact_phone: toNull(form.contact_phone),
          location,
          is_default: form.is_default,
        };
        await browserApi<UserAddressRead>(
          `/api/v1/users/me/addresses/${encodeURIComponent(editing.id)}`,
          { method: "PATCH", body: payload },
        );
      }
      openEditor(null);
      await reload();
    } catch (err) {
      setError(errorText(err, "No fue posible guardar la dirección."));
    } finally {
      setBusy(false);
    }
  }

  async function makeDefault(address: UserAddressRead) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await browserApi<UserAddressRead>(
        `/api/v1/users/me/addresses/${encodeURIComponent(address.id)}`,
        { method: "PATCH", body: { is_default: true } satisfies UserAddressUpdate },
      );
      await reload();
    } catch (err) {
      setError(errorText(err, "No fue posible marcar la dirección."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(addressId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await browserApi<void>(`/api/v1/users/me/addresses/${encodeURIComponent(addressId)}`, {
        method: "DELETE",
      });
      setConfirmDelete(null);
      await reload();
    } catch (err) {
      setError(errorText(err, "No fue posible eliminar la dirección."));
    } finally {
      setBusy(false);
    }
  }

  function field(
    id: string,
    label: string,
    value: string,
    set: (value: string) => void,
    maxLength?: number,
  ) {
    return (
      <div>
        <label className="sf-label" htmlFor={id}>{label}</label>
        <input
          id={id}
          className="sf-input"
          value={value}
          maxLength={maxLength}
          onChange={(event) => set(event.target.value)}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }} data-testid="address-book">
      {addresses.length === 0 && editing === null ? (
        <p className="sf-muted" style={{ margin: 0, fontSize: 14 }}>
          Aún no tienes direcciones guardadas.
        </p>
      ) : null}

      {addresses.length > 0 ? (
        <div className="sf-rowlist">
          {addresses.map((address) => (
            <div key={address.id} className="sf-rowlist-row" style={{ flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 160 }}>
                <strong>
                  {address.street}
                  {address.external_number ? ` ${address.external_number}` : ""}
                </strong>
                {address.neighborhood ? (
                  <span className="sf-muted"> · {address.neighborhood}</span>
                ) : null}
                {!address.location ? (
                  <span className="sf-muted" style={{ fontSize: 12 }}> · sin ubicación</span>
                ) : null}
              </span>
              {address.label ? <span className="sf-status-chip">{address.label}</span> : null}
              {address.is_default ? (
                <span className="sf-status-chip" data-tone="success">Principal</span>
              ) : null}
              <span style={{ display: "flex", gap: 8 }}>
                {!address.is_default ? (
                  <button
                    type="button"
                    className="sf-chip"
                    onClick={() => void makeDefault(address)}
                    disabled={busy}
                  >
                    Hacer principal
                  </button>
                ) : null}
                <button
                  type="button"
                  className="sf-chip"
                  onClick={() => openEditor({ id: address.id, form: addressToForm(address) })}
                  disabled={busy}
                  data-testid={`address-edit-${address.street}`}
                >
                  Editar
                </button>
                {confirmDelete === address.id ? (
                  <>
                    <button
                      type="button"
                      className="sf-chip"
                      onClick={() => void remove(address.id)}
                      disabled={busy}
                    >
                      Confirmar
                    </button>
                    <button
                      type="button"
                      className="sf-chip"
                      onClick={() => setConfirmDelete(null)}
                      disabled={busy}
                    >
                      No
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="sf-chip"
                    onClick={() => setConfirmDelete(address.id)}
                    disabled={busy}
                  >
                    Eliminar
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {editing === null ? (
        <div>
          <button
            type="button"
            className="sf-btn-outline"
            onClick={() => openEditor({ id: null, form: { ...EMPTY_FORM } })}
            data-testid="address-new"
          >
            Agregar dirección
          </button>
        </div>
      ) : (
        <div className="sf-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="sf-display" style={{ fontSize: 17 }}>
            {editing.id === null ? "Nueva dirección" : "Editar dirección"}
          </div>
          {field("ad-label", "Etiqueta (Casa, Oficina…)", editing.form.label, (v) =>
            setEditing({ ...editing, form: { ...editing.form, label: v } }), 80)}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
            {field("ad-street", "Calle", editing.form.street, (v) =>
              setEditing({ ...editing, form: { ...editing.form, street: v } }), 180)}
            {field("ad-ext", "No. exterior", editing.form.external_number, (v) =>
              setEditing({ ...editing, form: { ...editing.form, external_number: v } }), 30)}
            {field("ad-int", "No. interior", editing.form.internal_number, (v) =>
              setEditing({ ...editing, form: { ...editing.form, internal_number: v } }), 30)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {field("ad-col", "Colonia", editing.form.neighborhood, (v) =>
              setEditing({ ...editing, form: { ...editing.form, neighborhood: v } }), 120)}
            {field("ad-city", "Ciudad", editing.form.city, (v) =>
              setEditing({ ...editing, form: { ...editing.form, city: v } }), 120)}
            {field("ad-cp", "C.P.", editing.form.postal_code, (v) =>
              setEditing({ ...editing, form: { ...editing.form, postal_code: v } }), 20)}
          </div>
          {field("ad-ref", "Referencias", editing.form.references, (v) =>
            setEditing({ ...editing, form: { ...editing.form, references: v } }))}
          {field("ad-phone", "Teléfono de contacto (opcional)", editing.form.contact_phone, (v) =>
            setEditing({ ...editing, form: { ...editing.form, contact_phone: v } }), 30)}

          <div>
            <span className="sf-label">Ubicación (opcional pero recomendada)</span>
            {/* El mapa sigue a la dirección escrita mientras no haya pin; la
                geolocalización SOLO con el botón (flujo público). */}
            <LocationPicker
              value={editing.form.point}
              onChange={handleFormPoint}
              height={220}
              buttonClassName="sf-btn-outline"
              testId="address-location"
              focus={addressMatch}
            />
            <p className="sf-muted" style={{ margin: "6px 0 0", fontSize: 12 }}>
              La ubicación se guarda únicamente al guardar la dirección; con ella el envío se
              cotiza automáticamente al pedir a domicilio.
            </p>
          </div>

          {editing.form.point === null && addressMatch !== null ? (
            <p className="sf-muted" style={{ margin: 0, fontSize: 12 }}>
              Mapa centrado cerca de la dirección escrita; toca el mapa para fijar el pin.
            </p>
          ) : null}

          {geoNotice !== null ? (
            <p role="status" className="sf-muted" style={{ margin: 0, fontSize: 12 }}>
              {geoNotice}
            </p>
          ) : null}

          {pinSuggestion !== null ? (
            <div
              data-testid="address-pin-suggestion"
              className="sf-card"
              style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}
            >
              <span>
                El punto del mapa corresponde aprox. a: <strong>{pinSuggestion.label}</strong>
              </span>
              <span className="sf-muted" style={{ fontSize: 12 }}>
                Ya hay una dirección escrita; no se modificó nada.
              </span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="sf-chip" onClick={applyPinSuggestion}>
                  Usar esta dirección
                </button>
                <button type="button" className="sf-chip" onClick={() => setPinSuggestion(null)}>
                  Mantener lo escrito
                </button>
              </div>
            </div>
          ) : null}

          {pinFarFromAddress && pinDistance !== null ? (
            <div
              role="alert"
              data-testid="address-pin-mismatch"
              className="sf-card"
              style={{
                padding: "12px 16px", display: "flex", flexDirection: "column",
                gap: 8, fontSize: 13, borderLeft: "4px solid #d97706",
              }}
            >
              <span>
                El pin está a ~
                {pinDistance >= 1000
                  ? `${(pinDistance / 1000).toFixed(1)} km`
                  : `${Math.round(pinDistance)} m`}{" "}
                de la dirección escrita. Verifica el punto antes de guardar.
              </span>
              <div>
                <button type="button" className="sf-chip" onClick={movePinToAddress}>
                  Mover pin a la dirección escrita
                </button>
              </div>
            </div>
          ) : null}

          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
            <input
              type="checkbox"
              checked={editing.form.is_default}
              onChange={(event) =>
                setEditing({ ...editing, form: { ...editing.form, is_default: event.target.checked } })
              }
            />
            Usar como dirección principal
          </label>

          {error !== null ? (
            <div className="sf-error" role="alert">{error}</div>
          ) : null}

          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              className="sf-btn"
              onClick={() => void save()}
              disabled={busy || editing.form.street.trim() === ""}
              data-testid="address-save"
            >
              {busy ? "Guardando…" : "Guardar dirección"}
            </button>
            <button
              type="button"
              className="sf-btn-outline"
              onClick={() => openEditor(null)}
              disabled={busy}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error !== null && editing === null ? (
        <div className="sf-error" role="alert">{error}</div>
      ) : null}
    </div>
  );
}
