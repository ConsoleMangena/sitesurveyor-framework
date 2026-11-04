import type { TransportRun } from "./repositories/transportNetwork.ts";
import type { ShippingChoice } from "../components/transport/ShippingControl.tsx";

/**
 * The customer-facing fare rule, single-sourced here because both the manifest
 * row and the booking slip have to quote the same number the database will
 * charge. It mirrors the published formula: the larger of the two dimensions
 * governs, and a final mile is added on top. The database is the authority — a
 * run whose rate changes server-side is re-priced there, not here.
 */

export type BookingMode = "parcel" | "bulk_share" | "charter";

/**
 * The mode a load falls into before anyone chooses otherwise. A charter is never
 * assumed: it buys the whole vehicle, so the visitor has to ask for it, and a
 * row's quoted lift must mean the lift the visitor is actually shopping for.
 */
export function defaultMode(choice: ShippingChoice): BookingMode {
  return choice.weightKg >= 1000 ? "bulk_share" : "parcel";
}

export function money(value: number, currency: string): string {
  return `${currency} ${value.toFixed(2)}`;
}

export function quoteFare(
  run: TransportRun,
  choice: ShippingChoice,
  mode: BookingMode = "parcel",
): number {
  if (mode === "charter") {
    return round2(
      Math.max(run.capacity_slots * run.fare_per_slot, run.capacity_kg * run.fare_per_kg),
    );
  }
  const share = Math.max(choice.slots * run.fare_per_slot, choice.weightKg * run.fare_per_kg);
  return round2(share + (choice.finalMile ? run.fare_final_mile : 0));
}

/** A charter buys the vehicle, so it is only offered while the vehicle is empty. */
export function charterable(run: TransportRun): boolean {
  return run.booked_slots === 0 && run.booked_kg === 0;
}

/** The load as it was stated, without a dimension that is not there. */
export function loadWords(slots: number, weightKg: number): string {
  const space = slots > 0 ? `${slots} slot${slots === 1 ? "" : "s"}` : "";
  const mass = weightKg > 0 ? `${Math.round(weightKg)} kg` : "";
  return [space, mass].filter(Boolean).join(" and ") || "any load";
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
