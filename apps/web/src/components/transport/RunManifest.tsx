import type {
  TransportCheckpoint,
  TransportCorridor,
  TransportRun,
  TransportStop,
} from "../../lib/repositories/transportNetwork.ts";
import { LoadMeter } from "./LoadMeter.tsx";
import { StationSpine } from "./StationSpine.tsx";
import type { ShippingChoice } from "./ShippingControl.tsx";
import { charterable, defaultMode, money, quoteFare } from "../../lib/transportQuote.ts";

/**
 * One run in the consolidation table. The row is the manifest: what is on the
 * vehicle, how much more it needs before it is worth rolling, and where it was
 * last actually seen. A specimen run says so in its own stamp, because nothing
 * on this page may read as a service that has been announced.
 */

const STATUS_WORD: Record<string, string> = {
  draft: "not opened",
  open: "taking load",
  quorum_met: "target met",
  overdue: "past its date",
  rolling: "loading",
  in_transit: "on the road",
  at_destination: "arrived",
  closed: "closed",
  cancelled: "cancelled",
  expired: "expired",
};

const STATUS_TONE: Record<string, string> = {
  open: "",
  quorum_met: "is-live",
  overdue: "is-short",
  rolling: "is-live",
  in_transit: "is-live",
  at_destination: "is-met",
  expired: "is-short",
  cancelled: "is-short",
};

function clock(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type RunManifestProps = {
  run: TransportRun;
  corridor: TransportCorridor | undefined;
  stops: TransportStop[];
  trail: TransportCheckpoint[];
  choice: ShippingChoice;
  isOpen: boolean;
  signedIn: boolean;
  onFocus: (run: TransportRun) => void;
  onBook: (run: TransportRun) => void;
};

export function RunManifest({
  run,
  corridor,
  stops,
  trail,
  choice,
  isOpen,
  signedIn,
  onFocus,
  onBook,
}: RunManifestProps) {
  const fits =
    choice.slots <= run.capacity_slots - run.booked_slots &&
    choice.weightKg <= run.capacity_kg - run.booked_kg;
  const bookable = (run.status === "open" || run.status === "quorum_met") && !run.is_sample;
  const fare = quoteFare(run, choice, defaultMode(choice));

  return (
    <article
      className={`tp-run${run.is_sample ? " is-specimen" : ""}${isOpen ? " is-open" : ""}`}
      aria-label={`${run.route_code} to ${run.destination_city}, ${
        STATUS_WORD[run.status] ?? run.status
      }`}
    >
      <header className="tp-run__head">
        <div className="tp-run__ident">
          <span className="tp-run__code">{run.route_code}</span>
          <h3 className="tp-run__title">
            {run.origin_city} <span className="tp-run__arrow" aria-hidden="true">→</span>{" "}
            {run.destination_city}
          </h3>
          <p className="tp-run__vehicle">
            {run.vehicle_class ?? "Vehicle to be assigned"}
            {run.is_private_charter ? " · bought whole" : ""}
            {charterable(run) && bookable ? " · whole vehicle available" : ""}
          </p>
        </div>
        <div className="tp-run__stamp">
          <span className={`tp-stamp ${STATUS_TONE[run.status] ?? ""}`}>
            {STATUS_WORD[run.status] ?? run.status}
          </span>
          {run.is_sample && <span className="tp-stamp tp-stamp--specimen">specimen</span>}
        </div>
      </header>

      <div className="tp-run__body">
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
        <StationSpine
          stops={stops}
          directDistanceKm={corridor?.direct_distance_km ?? null}
          trail={trail}
        />
      </div>

      {trail.length > 0 && (
        <ol className="tp-trail">
          {trail.map((checkpoint) => (
            <li className="tp-trail__item" key={`${checkpoint.departure_id}-${checkpoint.sequence}`}>
              <span className="tp-trail__when">{clock(checkpoint.reported_at)}</span>
              <span>
                <span className="tp-trail__where">{checkpoint.city}</span>
                {checkpoint.note ? <span className="tp-trail__note"> — {checkpoint.note}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      )}

      <footer className="tp-run__foot">
        <dl className="tp-run__facts">
          <div>
            <dt>Rolls</dt>
            <dd>{clock(run.planned_departure_at)}</dd>
          </div>
          <div>
            <dt>Bookings close</dt>
            <dd>{clock(run.booking_cutoff_at)}</dd>
          </div>
          <div>
            <dt>Your lift</dt>
            <dd className={fits ? "" : "is-short"}>{money(fare, run.currency)}</dd>
          </div>
        </dl>
        <div className="tp-run__actions">
          <button type="button" className="tp-ghost" onClick={() => onFocus(run)}>
            Show on map
          </button>
          {bookable ? (
            <button
              type="button"
              className="tp-primary"
              disabled={!fits}
              onClick={() => onBook(run)}
            >
              {isOpen
                ? "Close the slip"
                : !fits
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
        </div>
      </footer>
    </article>
  );
}
