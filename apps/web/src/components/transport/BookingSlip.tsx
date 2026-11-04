import { useState } from "react";
import type { TransportCorridor, TransportRun, TransportStop } from "../../lib/repositories/transportNetwork.ts";
import { createTransportBooking, type TransportBooking } from "../../lib/repositories/transportNetwork.ts";
import type { ShippingChoice } from "./ShippingControl.tsx";
import { charterable, defaultMode, loadWords, money, quoteFare, type BookingMode } from "../../lib/transportQuote.ts";

/**
 * The slip that turns a chosen lift into a held space on a run. It prices the
 * way the database prices — the larger of the two dimensions, plus a final mile
 * — and it is explicit that booking does not take money: the fee comes back
 * unpaid, and a run cannot roll while anything it carries is still unpaid.
 */

const MODES: { value: BookingMode; label: string; hint: string }[] = [
  { value: "parcel", label: "Shared lift", hint: "Space on a pooled run" },
  { value: "bulk_share", label: "Tonnage share", hint: "Heavy load, still pooled" },
  { value: "charter", label: "Whole vehicle", hint: "Buy every unit on the run" },
];

type BookingSlipProps = {
  run: TransportRun;
  corridor: TransportCorridor | undefined;
  stops: TransportStop[];
  choice: ShippingChoice;
  workspaceId: string;
  recipientName: string;
  onBooked: (booking: TransportBooking) => void;
};

export function BookingSlip({
  run,
  corridor,
  stops,
  choice,
  workspaceId,
  recipientName,
  onBooked,
}: BookingSlipProps) {
  const chain = stops.filter((stop) => stop.route_id === run.route_id).sort((a, b) => a.sequence - b.sequence);
  const dropoff = chain.find(
    (stop) => stop.city_id === corridor?.destination_city_id || stop.city === run.destination_city,
  );
  const pickupOptions = dropoff ? chain.filter((stop) => stop.sequence < dropoff.sequence) : [];

  const [mode, setMode] = useState<BookingMode>(defaultMode(choice));
  const [pickupCityId, setPickupCityId] = useState(
    pickupOptions[0]?.city_id ?? "",
  );
  const [contents, setContents] = useState("");
  const [recipient, setRecipient] = useState(recipientName);
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fee = quoteFare(run, choice, mode);
  /** Spoken instead of implied: a disabled button that never explains itself is a dead end. */
  const missingFields = [
    pickupCityId === "" ? "where it is picked up" : null,
    contents.trim() === "" ? "what is on it" : null,
    recipient.trim() === "" ? "who is receiving it" : null,
    mode !== "charter" && choice.slots === 0 && choice.weightKg === 0
      ? "how much space you need"
      : null,
  ].filter((item): item is string => item !== null);
  const canSubmit = !pending && missingFields.length === 0;

  async function submit() {
    if (!canSubmit || !dropoff) return;
    setPending(true);
    setError(null);
    try {
      const booking = await createTransportBooking({
        workspaceId,
        departureId: run.departure_id,
        mode,
        slots: mode === "charter" ? run.capacity_slots : choice.slots,
        weightKg: mode === "charter" ? run.capacity_kg : choice.weightKg,
        contents: contents.trim(),
        pickupCityId,
        dropoffCityId: dropoff.city_id,
        recipientName: recipient.trim(),
        recipientPhone: phone.trim() || null,
        fulfilment: choice.finalMile ? "final_mile" : "hub_collection",
      });
      onBooked(booking);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The booking could not be held");
      setPending(false);
    }
  }

  return (
    <form
      className="tp-slip"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="tp-ship__field">
        <span className="tp-label" id={`tp-mode-${run.departure_id}`}>
          What you are buying
        </span>
        <div className="tp-segment" role="radiogroup" aria-labelledby={`tp-mode-${run.departure_id}`}>
          {MODES.map((option) => {
            const disabled = option.value === "charter" && !charterable(run);
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={mode === option.value}
                title={disabled ? "Only available while the run is empty" : option.hint}
                disabled={disabled}
                className={`tp-segment__opt${mode === option.value ? " is-on" : ""}`}
                onClick={() => setMode(option.value)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="tp-slip__grid">
        <label className="tp-field">
          <span className="tp-label">Picking up from</span>
          <select value={pickupCityId} onChange={(event) => setPickupCityId(event.target.value)}>
            {pickupOptions.map((stop) => (
              <option key={stop.city_id} value={stop.city_id}>
                {stop.city}
                {stop.has_hub ? " (hub)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="tp-field">
          <span className="tp-label">Dropping at</span>
          <input value={dropoff ? `${dropoff.city}${dropoff.has_hub ? " (hub)" : ""}` : ""} readOnly />
        </label>
        <label className="tp-field">
          <span className="tp-label">What is on it</span>
          <input
            value={contents}
            onChange={(event) => setContents(event.target.value)}
            placeholder="e.g. Total station and prisms"
            required
          />
        </label>
        <label className="tp-field">
          <span className="tp-label">Recipient</span>
          <input value={recipient} onChange={(event) => setRecipient(event.target.value)} required />
        </label>
        <label className="tp-field">
          <span className="tp-label">Contact number (optional)</span>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            inputMode="tel"
            placeholder="For the delivery call"
          />
        </label>
      </div>

      <p className="tp-slip__fee">
        <span>
          {mode === "charter"
            ? `${loadWords(run.capacity_slots, run.capacity_kg)}, whole vehicle`
            : `${loadWords(choice.slots, choice.weightKg)} · ${
                choice.finalMile ? "final mile" : "collect at hub"
              }`}
        </span>
        <b>{money(fee, run.currency)}</b>
      </p>

      {error && (
        <p className="tp-error" role="alert">
          {error}
        </p>
      )}

      <div className="tp-run__actions">
        <button type="submit" className="tp-primary" disabled={!canSubmit}>
          {pending ? "Holding space…" : `Hold this space — ${money(fee, run.currency)}`}
        </button>
        <span className="tp-run__refusal">
          {canSubmit || pending
            ? "Nothing is charged here. The fee stays outstanding until it is settled, and the run cannot roll with unpaid load on it."
            : `Add ${missingFields.join(", ")} to hold the space.`}
        </span>
      </div>
    </form>
  );
}
