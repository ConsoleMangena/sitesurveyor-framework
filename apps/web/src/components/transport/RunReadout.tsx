import type {
  TransportCheckpoint,
  TransportCorridor,
  TransportRun,
  TransportStop,
} from "../../lib/repositories/transportNetwork.ts";
import { LoadMeter } from "./LoadMeter.tsx";
import { STATUS_TONE, STATUS_WORD, clock, vehicleWords } from "./runStatus.ts";
import type { ShippingChoice } from "./ShippingControl.tsx";
import { defaultMode, money, quoteFare } from "../../lib/transportQuote.ts";

/**
 * The trip behind a plate on the plot. The row in the table is a manifest of
 * everything at once, so this reads as one instrument face: where this vehicle
 * actually is, what it is carrying, and the dates that decide whether it rolls.
 * A position is only ever stated as a report.
 */

type RunReadoutProps = {
  run: TransportRun;
  corridor: TransportCorridor | undefined;
  stops: TransportStop[];
  trail: TransportCheckpoint[];
  choice: ShippingChoice;
  signedIn: boolean;
  onClose: () => void;
  onOpenRow: (run: TransportRun) => void;
  onBook: (run: TransportRun) => void;
};

export function RunReadout({
  run,
  corridor,
  stops,
  trail,
  choice,
  signedIn,
  onClose,
  onOpenRow,
  onBook,
}: RunReadoutProps) {
  const fits =
    choice.slots <= run.capacity_slots - run.booked_slots &&
    choice.weightKg <= run.capacity_kg - run.booked_kg;
  const bookable = (run.status === "open" || run.status === "quorum_met") && !run.is_sample;
  const fare = quoteFare(run, choice, defaultMode(choice));
  const last = trail.length > 0 ? trail[trail.length - 1] : null;
  const km = corridor?.direct_distance_km ?? null;

  return (
    <article className="tp-readout" aria-label={`${run.route_code} — trip detail`}>
      <header className="tp-readout__head">
        <div className="tp-run__ident">
          <span className="tp-run__code">{run.route_code}</span>
          <h3 className="tp-run__title">
            {run.origin_city} <span className="tp-run__arrow" aria-hidden="true">→</span>{" "}
            {run.destination_city}
          </h3>
          <p className="tp-run__vehicle">{vehicleWords(run)}</p>
        </div>
        <div className="tp-run__stamp">
          <span className={`tp-stamp ${STATUS_TONE[run.status] ?? ""}`}>
            {STATUS_WORD[run.status] ?? run.status}
          </span>
          {run.is_sample && <span className="tp-stamp tp-stamp--specimen">specimen</span>}
        </div>
        <button type="button" className="tp-ghost tp-readout__close" onClick={onClose}>
          Close
        </button>
      </header>

      <LoadMeter
        capacitySlots={run.capacity_slots}
        bookedSlots={run.booked_slots}
        capacityKg={run.capacity_kg}
        bookedKg={run.booked_kg}
        targetPercent={run.target_percent}
        loadPercent={run.load_percent}
        governing={run.governing_dimension}
        status={run.status}
      />

      <p className="tp-readout__where">
        {last ? (
          <>
            Reported at <b>{last.city}</b> {clock(last.reported_at)}
            {trail.length > 1 ? ` · ${trail.length} reports` : ""}
          </>
        ) : (
          <>
            Waiting at <b>{run.origin_city}</b> — not reported on the road
          </>
        )}
        {` · ${stops.length} stations`}
        {km !== null ? `, ${Math.round(km)} km` : ""}
      </p>

      <dl className="tp-run__facts tp-readout__facts">
        <div>
          <dt>Rolls</dt>
          <dd>{clock(run.planned_departure_at)}</dd>
        </div>
        <div>
          <dt>Bookings close</dt>
          <dd>{clock(run.booking_cutoff_at)}</dd>
        </div>
        <div>
          <dt>Last it can wait</dt>
          <dd>{clock(run.backstop_at)}</dd>
        </div>
        <div>
          <dt>Your lift</dt>
          <dd className={fits ? "" : "is-short"}>{money(fare, run.currency)}</dd>
        </div>
      </dl>

      <footer className="tp-run__actions">
        <button type="button" className="tp-ghost" onClick={() => onOpenRow(run)}>
          Open this run
        </button>
        {bookable ? (
          <button
            type="button"
            className="tp-primary"
            disabled={!fits}
            onClick={() => onBook(run)}
          >
            {!fits
              ? "No room for that"
              : signedIn
                ? "Book a lift"
                : "Sign in to book"}
          </button>
        ) : (
          <span className="tp-run__refusal">
            {run.is_sample
              ? "Specimen run — not open for booking"
              : `Not accepting load (${STATUS_WORD[run.status] ?? run.status})`}
          </span>
        )}
      </footer>
    </article>
  );
}
