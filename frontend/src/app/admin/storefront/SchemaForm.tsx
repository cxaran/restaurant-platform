"use client";

// Formularios generados desde el JSON Schema que expone el backend por
// plantilla (contratos Pydantic reales — nada duplicado a mano). Soporta el
// subconjunto que emiten esos contratos: objetos, strings (con enum/longitud),
// booleanos, números, objetos anidados opcionales ($ref) y listas de objetos.
// Cualquier forma no soportada cae a un editor JSON crudo (fallback honesto).

import { useId, useState } from "react";

export type JsonSchema = {
  type?: string;
  title?: string;
  description?: string;
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
};

type Json = Record<string, unknown>;

function deref(schema: JsonSchema, defs: Record<string, JsonSchema>): JsonSchema {
  if (schema.$ref) {
    const name = schema.$ref.split("/").pop() ?? "";
    return defs[name] ?? {};
  }
  return schema;
}

/** Desenreda Optional[X]: anyOf [X, null] → {inner, nullable}. */
function unwrap(
  schema: JsonSchema,
  defs: Record<string, JsonSchema>,
): { inner: JsonSchema; nullable: boolean } {
  if (Array.isArray(schema.anyOf)) {
    const nonNull = schema.anyOf.filter((option) => option.type !== "null");
    const nullable = schema.anyOf.length !== nonNull.length;
    if (nonNull.length === 1) return { inner: deref(nonNull[0], defs), nullable };
  }
  return { inner: deref(schema, defs), nullable: false };
}

const rowStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 3 };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700 };
const inputStyle: React.CSSProperties = {
  padding: "7px 10px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.25)",
  fontSize: 13, width: "100%",
};

function JsonFallback({
  label, value, onChange,
}: Readonly<{ label: string; value: unknown; onChange: (next: unknown) => void }>) {
  const [text, setText] = useState(JSON.stringify(value ?? null, null, 1));
  const [bad, setBad] = useState(false);
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label} (JSON)</span>
      <textarea
        rows={3}
        style={{ ...inputStyle, fontFamily: "ui-monospace, monospace" }}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          try {
            onChange(JSON.parse(event.target.value));
            setBad(false);
          } catch {
            setBad(true);
          }
        }}
      />
      {bad ? <span style={{ fontSize: 11, color: "#b3261e" }}>JSON inválido (no guardado)</span> : null}
    </div>
  );
}

function FieldControl({
  name, schema, nullable, value, onChange, defs,
}: Readonly<{
  name: string;
  schema: JsonSchema;
  nullable: boolean;
  value: unknown;
  onChange: (next: unknown) => void;
  defs: Record<string, JsonSchema>;
}>) {
  const id = useId();
  const label = schema.title ?? name;

  if (Array.isArray(schema.enum)) {
    return (
      <div style={rowStyle}>
        <label htmlFor={id} style={labelStyle}>{label}</label>
        <select
          id={id}
          style={inputStyle}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
        >
          {nullable || value === undefined ? <option value="">—</option> : null}
          {schema.enum.map((option) => (
            <option key={String(option)} value={String(option)}>{String(option)}</option>
          ))}
        </select>
      </div>
    );
  }

  if (schema.type === "boolean") {
    return (
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
        <input
          type="checkbox"
          checked={value === true || (value === undefined && schema.default === true)}
          onChange={(event) => onChange(event.target.checked)}
        />
        {label}
      </label>
    );
  }

  if (schema.type === "integer" || schema.type === "number") {
    return (
      <div style={rowStyle}>
        <label htmlFor={id} style={labelStyle}>{label}</label>
        <input
          id={id}
          type="number"
          style={inputStyle}
          step={schema.type === "integer" ? 1 : "any"}
          min={schema.minimum}
          max={schema.maximum}
          value={typeof value === "number" ? value : ""}
          onChange={(event) => {
            const raw = event.target.value;
            if (raw === "") return onChange(null);
            const parsed = schema.type === "integer" ? Number.parseInt(raw, 10) : Number(raw);
            onChange(Number.isFinite(parsed) ? parsed : null);
          }}
        />
      </div>
    );
  }

  if (schema.type === "string") {
    const long = (schema.maxLength ?? 0) > 140;
    return (
      <div style={rowStyle}>
        <label htmlFor={id} style={labelStyle}>{label}</label>
        {long ? (
          <textarea
            id={id}
            rows={2}
            maxLength={schema.maxLength}
            style={inputStyle}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value === "" && nullable ? null : event.target.value)}
          />
        ) : (
          <input
            id={id}
            maxLength={schema.maxLength}
            style={inputStyle}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value === "" && nullable ? null : event.target.value)}
          />
        )}
      </div>
    );
  }

  if (schema.type === "object" && schema.properties) {
    const enabled = value !== null && value !== undefined;
    return (
      <fieldset style={{ border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
        <legend style={{ fontSize: 12, fontWeight: 800, padding: "0 4px" }}>
          {nullable ? (
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => onChange(event.target.checked ? {} : null)}
              />
              {label}
            </label>
          ) : (
            label
          )}
        </legend>
        {enabled || !nullable ? (
          <SchemaForm
            schema={schema}
            defs={defs}
            value={(value as Json) ?? {}}
            onChange={(next) => onChange(next)}
          />
        ) : null}
      </fieldset>
    );
  }

  if (schema.type === "array" && schema.items) {
    const itemSchema = deref(schema.items, defs);
    const list = Array.isArray(value) ? (value as Json[]) : [];
    if (itemSchema.type !== "object" || !itemSchema.properties) {
      return <JsonFallback label={label} value={value} onChange={onChange} />;
    }
    return (
      <div style={{ ...rowStyle, gap: 8 }}>
        <span style={labelStyle}>{label}</span>
        {list.map((item, index) => (
          <fieldset key={index} style={{ border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "8px 10px" }}>
            <legend style={{ fontSize: 11, fontWeight: 800, padding: "0 4px", display: "flex", gap: 8 }}>
              #{index + 1}
              <button
                type="button"
                onClick={() => onChange(list.filter((_, i) => i !== index))}
                style={{ border: "none", background: "transparent", cursor: "pointer", color: "#b3261e", fontWeight: 800 }}
              >
                quitar
              </button>
            </legend>
            <SchemaForm
              schema={itemSchema}
              defs={defs}
              value={item}
              onChange={(next) => onChange(list.map((current, i) => (i === index ? next : current)))}
            />
          </fieldset>
        ))}
        {(schema.maxItems === undefined || list.length < schema.maxItems) ? (
          <button
            type="button"
            onClick={() => onChange([...list, {}])}
            style={{ alignSelf: "flex-start", fontSize: 12, fontWeight: 800, padding: "5px 12px", borderRadius: 8, border: "1px dashed rgba(0,0,0,0.4)", background: "transparent", cursor: "pointer" }}
          >
            + Agregar
          </button>
        ) : null}
      </div>
    );
  }

  return <JsonFallback label={label} value={value} onChange={onChange} />;
}

export function SchemaForm({
  schema, defs, value, onChange,
}: Readonly<{
  schema: JsonSchema;
  defs?: Record<string, JsonSchema>;
  value: Json;
  onChange: (next: Json) => void;
}>) {
  const allDefs = { ...(schema.$defs ?? {}), ...(defs ?? {}) };
  const properties = schema.properties ?? {};
  const names = Object.keys(properties);
  if (names.length === 0) {
    return <p style={{ fontSize: 12, opacity: 0.65, margin: 0 }}>Esta configuración no tiene campos.</p>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {names.map((name) => {
        const { inner, nullable } = unwrap(properties[name], allDefs);
        return (
          <FieldControl
            key={name}
            name={name}
            schema={inner}
            nullable={nullable}
            defs={allDefs}
            value={value[name]}
            onChange={(next) => {
              const updated = { ...value };
              if (next === null || next === undefined) delete updated[name];
              else updated[name] = next;
              onChange(updated);
            }}
          />
        );
      })}
    </div>
  );
}
