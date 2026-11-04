/**
 * The atom the transport surface sells: not the truck, not the corridor — the
 * unit of capacity. A run is booked against two dimensions at once, and rolls
 * when either one reaches its target, so both are drawn on one shared scale and
 * the meter names which of them governs. Red only appears on the governing
 * dimension of a run that will roll, because red here means "this one is going",
 * never "this one is full".
 */

import { willRoll } from "../../lib/repositories/transportNetwork.ts";

type LoadMeterProps = {
  capacitySlots: number;
  bookedSlots: number;
  capacityKg: number;
  bookedKg: number;
  targetPercent: number;
  loadPercent: number;
  governing: "slots" | "weight";
  status: string;
};

const CELLS_CAP = 24;

function kilograms(value: number): string {
  if (value >= 1000) {
    const tonnes = value / 1000;
    return `${tonnes >= 100 ? Math.round(tonnes) : tonnes.toFixed(1).replace(/\.0$/, "")} t`;
  }
  return `${Math.round(value)} kg`;
}

/**
 * One fraction, one unit: a run's booked mass and its capacity are only
 * comparable when they are stated on the same scale.
 */
function massPair(booked: number, capacity: number): string {
  if (capacity < 1000) return `${Math.round(booked)}/${Math.round(capacity)} kg`;
  const tonnes = (value: number) => {
    const t = value / 1000;
    return (t >= 10 ? Math.round(t) : Number(t.toFixed(2))).toLocaleString();
  };
  return `${tonnes(booked)}/${tonnes(capacity)} t`;
}

export function LoadMeter({
  capacitySlots,
  bookedSlots,
  capacityKg,
  bookedKg,
  targetPercent,
  loadPercent,
  governing,
  status,
}: LoadMeterProps) {
  const slotPercent = capacitySlots > 0 ? (bookedSlots / capacitySlots) * 100 : 0;
  const weightPercent = capacityKg > 0 ? (bookedKg / capacityKg) * 100 : 0;
  const rolling = willRoll(status);
  const short = Math.max(0, targetPercent - loadPercent);

  const neededUnits =
    governing === "slots"
      ? `${Math.ceil((short / 100) * capacitySlots)} slot${
          Math.ceil((short / 100) * capacitySlots) === 1 ? "" : "s"
        }`
      : kilograms((short / 100) * capacityKg);

  const cells = Math.min(capacitySlots, CELLS_CAP);
  const filledCells =
    capacitySlots > 0 ? Math.round((bookedSlots / capacitySlots) * cells) : 0;

  return (
    <div className="tp-load">
      <div className="tp-load__row">
        <span className="tp-load__axis">Slots</span>
        {capacitySlots <= CELLS_CAP ? (
          <span
            className="tp-cells"
            role="meter"
            aria-valuenow={bookedSlots}
            aria-valuemin={0}
            aria-valuemax={capacitySlots}
            aria-label={`${bookedSlots} of ${capacitySlots} slots booked`}
          >
            {Array.from({ length: cells }, (_, index) => (
              <span
                key={index}
                className={`tp-cell${index < filledCells ? " is-booked" : ""}${
                  index < filledCells && governing === "slots" && rolling ? " is-live" : ""
                }`}
              />
            ))}
            <span
              className="tp-track__target tp-track__target--cells"
              style={{ left: `${targetPercent}%` }}
            />
          </span>
        ) : (
          <span
            className="tp-track"
            role="meter"
            aria-valuenow={bookedSlots}
            aria-valuemin={0}
            aria-valuemax={capacitySlots}
            aria-label={`${bookedSlots} of ${capacitySlots} slots booked`}
          >
            <span
              className={`tp-track__fill${
                governing === "slots" && rolling ? " is-live" : ""
              }`}
              style={{ transform: `scaleX(${Math.min(1, slotPercent / 100)})` }}
            />
            <span className="tp-track__target" style={{ left: `${targetPercent}%` }} />
          </span>
        )}
        <span className={`tp-load__figure${governing === "slots" ? " is-governing" : ""}`}>
          {bookedSlots}/{capacitySlots}
        </span>
      </div>

      <div className="tp-load__row">
        <span className="tp-load__axis">Weight</span>
        <span
          className="tp-track"
          role="meter"
          aria-valuenow={Math.round(bookedKg)}
          aria-valuemin={0}
          aria-valuemax={Math.round(capacityKg)}
          aria-label={`${Math.round(bookedKg)} of ${Math.round(capacityKg)} kg booked`}
        >
          <span
            className={`tp-track__fill${governing === "weight" && rolling ? " is-live" : ""}`}
            style={{ transform: `scaleX(${Math.min(1, weightPercent / 100)})` }}
          />
          <span className="tp-track__target" style={{ left: `${targetPercent}%` }} />
        </span>
        <span className={`tp-load__figure${governing === "weight" ? " is-governing" : ""}`}>
          {massPair(bookedKg, capacityKg)}
        </span>
      </div>

      <p className="tp-load__note">
        <span className="tp-load__pct">{loadPercent.toFixed(1)}%</span> loaded —{" "}
        {governing} {governing === "weight" ? "governs" : "govern"}
        {short > 0 ? (
          <>
            {" "}
            · {neededUnits} more rolls it
          </>
        ) : (
          <> · target met</>
        )}
      </p>
    </div>
  );
}
