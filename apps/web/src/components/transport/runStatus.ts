import type { TransportRun } from "../../lib/repositories/transportNetwork.ts";

/**
 * The words the transport sheet stamps its rows with. The manifest row and the
 * plot readout describe the same run, so they must not invent two vocabularies —
 * and the tone classes carry the one colour rule of this surface, where red is
 * only ever a reading of "this run will roll".
 */

export const STATUS_WORD: Record<string, string> = {
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

export const STATUS_TONE: Record<string, string> = {
  open: "",
  quorum_met: "is-live",
  overdue: "is-short",
  rolling: "is-live",
  in_transit: "is-live",
  at_destination: "is-met",
  expired: "is-short",
  cancelled: "is-short",
};

export function clock(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The vehicle line, stated the same way in the row and in the readout. Which
 * plate a vehicle wears is public; whether anyone has checked it is the part a
 * customer is deciding on, so it is said out loud rather than left implicit.
 */
export function vehicleWords(run: TransportRun): string {
  if (!run.vehicle_class) return "Vehicle to be assigned";
  const state =
    run.vehicle_verification === "verified"
      ? "verified"
      : run.vehicle_verification === "pending"
        ? "awaiting verification"
        : run.vehicle_verification === "suspended"
          ? "verification suspended"
          : null;
  return `${run.vehicle_class}${state ? ` · ${state}` : ""}${
    run.is_private_charter ? " · bought whole" : ""
  }`;
}
