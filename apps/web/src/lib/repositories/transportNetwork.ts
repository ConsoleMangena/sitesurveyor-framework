import { supabase } from "../supabase/client.ts";

/**
 * Reads the public transport surface. Every row here comes from an owner-owned
 * view: the base tables are admin-only under RLS, so a customer — anonymous or
 * signed in — has no path to a vehicle record, a booking, or another person's
 * shipment. A destination city id must be taken from the stops view for the same
 * reason; reading transport_cities directly returns nothing and silently yields
 * an empty offer list.
 */

const FETCH_TIMEOUT_MS = 6_000;

export type TransportCorridor = {
  route_id: string;
  code: string;
  name: string;
  currency: string;
  fare_per_slot: number;
  fare_per_kg: number;
  fare_final_mile: number;
  direct_distance_km: number | null;
  is_sample: boolean;
  route_status: string;
  origin_city_id: string;
  origin_city: string;
  origin_country: string;
  origin_latitude: number;
  origin_longitude: number;
  destination_city_id: string;
  destination_city: string;
  destination_country: string;
  destination_latitude: number;
  destination_longitude: number;
  open_runs: number;
  next_roll_at: string | null;
  live_runs: number;
};

export type TransportRun = {
  departure_id: string;
  route_id: string;
  route_code: string;
  route_name: string;
  currency: string;
  fare_per_slot: number;
  fare_per_kg: number;
  fare_final_mile: number;
  planned_departure_at: string;
  booking_cutoff_at: string;
  backstop_at: string;
  status: string;
  capacity_slots: number;
  capacity_kg: number;
  booked_slots: number;
  booked_kg: number;
  is_sample: boolean;
  is_private_charter: boolean;
  departed_at: string | null;
  arrived_at: string | null;
  load_percent: number;
  target_percent: number;
  governing_dimension: "slots" | "weight";
  vehicle_class: string | null;
  vehicle_verification: string | null;
  origin_city: string;
  destination_city: string;
  last_reported_city: string | null;
  last_reported_at: string | null;
};

export type TransportStop = {
  route_id: string;
  sequence: number;
  dwell_minutes: number;
  stop_offset_km: number | null;
  city_id: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  has_hub: boolean;
};

export type TransportCheckpoint = {
  departure_id: string;
  sequence: number;
  latitude: number;
  longitude: number;
  reported_at: string;
  note: string | null;
  city: string;
  country: string;
};

export type TransportNetwork = {
  corridors: TransportCorridor[];
  runs: TransportRun[];
  stops: TransportStop[];
  checkpoints: TransportCheckpoint[];
};

export type TransportOffer = {
  departure_id: string;
  route_id: string;
  route_code: string;
  route_name: string;
  origin_city_id: string;
  origin_city: string;
  destination_city: string;
  fare_per_slot: number;
  fare_per_kg: number;
  currency: string;
  free_slots: number;
  free_kg: number;
  load_percent: number;
  target_percent: number;
  status: string;
  planned_departure_at: string;
  booking_cutoff_at: string;
  is_sample: boolean;
};

/**
 * The transport views and RPCs are read through a narrow local client rather
 * than the generated `Database` type: the migration that creates them is not
 * applied to the linked project yet, so regenerating types would describe
 * tables the database does not have. The shapes in this file are therefore the
 * single description of what the views return, and they match the columns the
 * view definitions select. Once the migration lands and types are regenerated,
 * this façade can go and `supabase` can be used directly.
 */
type TransportView =
  | "public_transport_corridors"
  | "public_transport_runs"
  | "public_transport_stops"
  | "public_transport_checkpoints"
  | "public_transport_fleet";

type TransportRpcName = "transport_offers_for_city" | "transport_create_booking";

type TransportClient = {
  from: (relation: TransportView) => {
    select: (columns: string) => TransportClientQuery;
  };
  rpc: (
    fn: TransportRpcName,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

type TransportClientQuery = PromiseLike<{ data: unknown[] | null; error: unknown }> & {
  in: (column: string, values: readonly string[]) => TransportClientQuery;
  order: (column: string, options?: { ascending?: boolean }) => TransportClientQuery;
};

const db = supabase as unknown as TransportClient;

function withTimeout<T>(
  query: PromiseLike<{ data: unknown[] | null; error: unknown }>,
  label: string,
): Promise<T[]> {
  return new Promise<T[]>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Fetching ${label} timed out`)),
      FETCH_TIMEOUT_MS,
    );
    query.then(
      ({ data, error }) => {
        clearTimeout(timer);
        if (error) reject(error);
        else resolve((data ?? []) as T[]);
      },
      (cause) => {
        clearTimeout(timer);
        reject(cause);
      },
    );
  });
}

export async function fetchTransportNetwork(): Promise<TransportNetwork> {
  const [corridors, runs, stops, checkpoints] = await Promise.all([
    withTimeout<TransportCorridor>(
      db.from("public_transport_corridors").select("*").order("code"),
      "corridors",
    ),
    withTimeout<TransportRun>(
      db
        .from("public_transport_runs")
        .select("*")
        .in("status", [
          "open",
          "quorum_met",
          "overdue",
          "rolling",
          "in_transit",
          "at_destination",
        ])
        .order("planned_departure_at"),
      "runs",
    ),
    withTimeout<TransportStop>(
      db.from("public_transport_stops").select("*").order("sequence"),
      "stops",
    ),
    withTimeout<TransportCheckpoint>(
      db.from("public_transport_checkpoints").select("*").order("sequence"),
      "checkpoints",
    ),
  ]);

  return { corridors, runs, stops, checkpoints };
}

/** Runs that could still take a load to one destination, bookable right now. */
export async function fetchOffersForCity(destinationCityId: string): Promise<TransportOffer[]> {
  const { data, error } = await db.rpc("transport_offers_for_city", {
    p_destination_city_id: destinationCityId,
  });
  if (error) throw error;
  return (data ?? []) as TransportOffer[];
}

/** The city id behind a place name, taken through the view a customer can read. */
export function cityIdFromStops(stops: TransportStop[], city: string): string | null {
  return stops.find((stop) => stop.city === city)?.city_id ?? null;
}

/**
 * A vehicle that has physically left its origin — the only thing a plate on the
 * map or an "on the road" count may claim. `rolling` means loading at the hub,
 * which is not a road.
 */
export function isOnTheRoad(status: string): boolean {
  return status === "in_transit" || status === "at_destination";
}

/**
 * A run whose governing dimension has reached the point of rolling, so the meter
 * may draw red on it. A run that has already arrived is not included: its load
 * filled, but red promises a roll that this row no longer has ahead of it.
 */
export function willRoll(status: string): boolean {
  return status === "quorum_met" || status === "rolling" || status === "in_transit";
}

export type TransportBooking = {
  id: string;
  tracking_code: string;
  departure_id: string;
  slots: number;
  weight_kg: number;
  fee: number;
  currency: string;
  fee_status: string;
  status: string;
};

export type NewBooking = {
  workspaceId: string;
  departureId: string;
  mode: "parcel" | "bulk_share" | "charter";
  slots: number;
  weightKg: number;
  contents: string;
  pickupCityId: string;
  dropoffCityId: string;
  recipientName: string;
  recipientPhone: string | null;
  fulfilment: "hub_collection" | "final_mile";
};

/**
 * Holds space on a run. The database prices the lift, reserves the capacity and
 * refuses a specimen run; the fee comes back unpaid because nothing here takes
 * money — the run cannot roll until a person confirms it.
 */
export async function createTransportBooking(input: NewBooking): Promise<TransportBooking> {
  const { data, error } = await db.rpc("transport_create_booking", {
    p_workspace_id: input.workspaceId,
    p_departure_id: input.departureId,
    p_mode: input.mode,
    p_slots: input.slots,
    p_weight_kg: input.weightKg,
    p_contents: input.contents,
    p_pickup_city_id: input.pickupCityId,
    p_dropoff_city_id: input.dropoffCityId,
    p_recipient_name: input.recipientName,
    p_recipient_phone: input.recipientPhone?.trim() ? input.recipientPhone.trim() : null,
    p_fulfilment: input.fulfilment,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("The booking was not returned");
  return row as TransportBooking;
}
