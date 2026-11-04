import { Minus, Plus } from "lucide-react";

/**
 * The one variable the page turns on. Slots and weight are what the customer is
 * actually shipping, and every run on the surface re-reads the moment either one
 * changes: rows that cannot take the load step out of the way and the fare on the
 * rows that can recalculates against the published rate.
 */

export type ShippingChoice = {
  slots: number;
  weightKg: number;
  finalMile: boolean;
};

type ShippingControlProps = {
  value: ShippingChoice;
  onChange: (next: ShippingChoice) => void;
};

function Stepper({
  label,
  unit,
  pluralUnit,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  unit: string;
  pluralUnit?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
}) {
  const shownUnit = value === 1 ? unit : (pluralUnit ?? `${unit}s`);
  return (
    <div className="tp-ship__field">
      <span className="tp-label">{label}</span>
      <div className="tp-stepper">
        <button
          type="button"
          className="tp-stepper__btn"
          onClick={() => onChange(Math.max(min, value - step))}
          disabled={value <= min}
          aria-label={`Fewer ${label.toLowerCase()}`}
        >
          <Minus size={13} aria-hidden="true" />
        </button>
        <output className="tp-stepper__value" aria-live="polite">
          {value.toLocaleString()}
          <span className="tp-stepper__unit">{shownUnit}</span>
        </output>
        <button
          type="button"
          className="tp-stepper__btn"
          onClick={() => onChange(Math.min(max, value + step))}
          disabled={value >= max}
          aria-label={`More ${label.toLowerCase()}`}
        >
          <Plus size={13} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export function ShippingControl({ value, onChange }: ShippingControlProps) {
  return (
    <div className="tp-ship" role="group" aria-label="What you are shipping">
      <Stepper
        label="Slots"
        unit="slot"
        value={value.slots}
        min={1}
        max={40}
        step={1}
        onChange={(slots) => onChange({ ...value, slots })}
      />
      <Stepper
        label="Weight"
        unit="kg"
        pluralUnit="kg"
        value={value.weightKg}
        min={0}
        max={15000}
        step={50}
        onChange={(weightKg) => onChange({ ...value, weightKg })}
      />
      <div className="tp-ship__field">
        <span className="tp-label">Delivery</span>
        <div className="tp-segment" role="radiogroup" aria-label="Delivery method">
          <button
            type="button"
            role="radio"
            aria-checked={!value.finalMile}
            className={`tp-segment__opt${!value.finalMile ? " is-on" : ""}`}
            onClick={() => onChange({ ...value, finalMile: false })}
          >
            Collect at hub
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={value.finalMile}
            className={`tp-segment__opt${value.finalMile ? " is-on" : ""}`}
            onClick={() => onChange({ ...value, finalMile: true })}
          >
            Final mile
          </button>
        </div>
      </div>
    </div>
  );
}
