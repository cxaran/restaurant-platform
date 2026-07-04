"use client";

// Cantidades ENTERAS (regla H1): el stepper solo produce enteros >= 1.
// Sin input libre — imposible teclear 0.5, 0 o negativos.
export function QuantityStepper({
  value,
  onChange,
  max,
}: Readonly<{ value: number; onChange: (next: number) => void; max?: number }>) {
  return (
    <span className="sf-stepper" role="group" aria-label="Cantidad">
      <button
        type="button"
        aria-label="Quitar uno"
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <span style={{ minWidth: 22, textAlign: "center", fontWeight: 800 }} aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label="Agregar uno"
        disabled={max !== undefined && value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </span>
  );
}
