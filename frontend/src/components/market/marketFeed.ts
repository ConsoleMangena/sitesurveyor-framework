import { useCallback, useState } from "react";

import { supabase } from "../../lib/supabase/client.ts";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import type { Database } from "../../lib/supabase/types.ts";
import type { MarketDotGroup, MarketDotSource } from "./marketDots.ts";

// Supabase types every view column nullable even where the underlying base
// columns are NOT NULL. Normalize those fields once at the fetch boundary so
// consumers can rely on DB truth.
type DbListing = Database["public"]["Views"]["public_market_listings"]["Row"];
type DbProfessional =
  Database["public"]["Views"]["public_market_professionals"]["Row"];
type DbJob = Database["public"]["Views"]["public_market_jobs"]["Row"];
type DbFirm = Database["public"]["Views"]["public_market_firms"]["Row"];
type DbEvent = Database["public"]["Views"]["public_market_events"]["Row"];
type DbPortfolioItem =
  Database["public"]["Views"]["public_market_portfolio_items"]["Row"];

export type ListingRow = Omit<
  DbListing,
  "id" | "name" | "price" | "location" | "created_at"
> & {
  id: string;
  name: string;
  price: number;
  location: string;
  created_at: string;
};
export type ProfessionalRow = Omit<
  DbProfessional,
  "id" | "name" | "rate" | "location" | "created_at"
> & {
  id: string;
  name: string;
  rate: number;
  location: string;
  created_at: string;
};
export type JobRow = Omit<DbJob, "id" | "rate" | "location" | "created_at"> & {
  id: string;
  rate: number;
  location: string;
  created_at: string;
};
export type FirmRow = Omit<
  DbFirm,
  "id" | "name" | "location" | "created_at"
> & {
  id: string;
  name: string;
  location: string;
  created_at: string;
};
export type EventRow = Omit<
  DbEvent,
  "id" | "starts_at" | "price" | "location" | "created_at"
> & {
  id: string;
  starts_at: string;
  price: number;
  location: string;
  created_at: string;
};

export interface MarketData {
  listings: ListingRow[];
  professionals: ProfessionalRow[];
  jobs: JobRow[];
  firms: FirmRow[];
  events: EventRow[];
}

export interface LoadFailure {
  reason: "timeout" | "error";
  message: string;
  missingRelation: boolean;
}

export interface ShowcaseItemRow {
  id: string;
  title: string;
  year: string | null;
  description: string | null;
  image_path: string | null;
}

const toListingRows = (rows: DbListing[]): ListingRow[] =>
  rows.map((r) => ({
    ...r,
    id: r.id ?? "",
    name: r.name ?? "",
    price: r.price ?? 0,
    location: r.location ?? "",
    created_at: r.created_at ?? "",
  }));
const toProfessionalRows = (rows: DbProfessional[]): ProfessionalRow[] =>
  rows.map((r) => ({
    ...r,
    id: r.id ?? "",
    name: r.name ?? "",
    rate: r.rate ?? 0,
    location: r.location ?? "",
    created_at: r.created_at ?? "",
  }));
const toJobRows = (rows: DbJob[]): JobRow[] =>
  rows.map((r) => ({
    ...r,
    id: r.id ?? "",
    rate: r.rate ?? 0,
    location: r.location ?? "",
    created_at: r.created_at ?? "",
  }));
export const toPortfolioItemRows = (rows: DbPortfolioItem[]): ShowcaseItemRow[] =>
  rows
    .filter((r) => r.image_path != null)
    .map((r) => ({
      id: r.id ?? "",
      title: r.title ?? "",
      year: r.year,
      description: r.description,
      image_path: r.image_path,
    }));
const toFirmRows = (rows: DbFirm[]): FirmRow[] =>
  rows.map((r) => ({
    ...r,
    id: r.id ?? "",
    name: r.name ?? "",
    location: r.location ?? "",
    created_at: r.created_at ?? "",
  }));
const toEventRows = (rows: DbEvent[]): EventRow[] =>
  rows.map((r) => ({
    ...r,
    id: r.id ?? "",
    starts_at: r.starts_at ?? "",
    price: r.price ?? 0,
    location: r.location ?? "",
    created_at: r.created_at ?? "",
  }));

const FETCH_TIMEOUT_MS = 12_000;

export async function fetchMarketData(): Promise<MarketData> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const [listingsRes, professionalsRes, jobsRes, firmsRes, eventsRes] =
      await Promise.all([
        supabase
          .from("public_market_listings")
          .select("*")
          .order("created_at", { ascending: false })
          .abortSignal(controller.signal),
        supabase
          .from("public_market_professionals")
          .select("*")
          .abortSignal(controller.signal),
        supabase
          .from("public_market_jobs")
          .select("*")
          .order("created_at", { ascending: false })
          .abortSignal(controller.signal),
        supabase
          .from("public_market_firms")
          .select("*")
          .order("created_at", { ascending: false })
          .abortSignal(controller.signal),
        supabase
          .from("public_market_events")
          .select("*")
          .order("starts_at", { ascending: true })
          .abortSignal(controller.signal),
      ]);
    for (const res of [
      listingsRes,
      professionalsRes,
      jobsRes,
      firmsRes,
      eventsRes,
    ]) {
      if (res.error) throw res.error;
    }
    return {
      listings: toListingRows(listingsRes.data ?? []),
      professionals: toProfessionalRows(professionalsRes.data ?? []),
      jobs: toJobRows(jobsRes.data ?? []),
      firms: toFirmRows(firmsRes.data ?? []),
      events: toEventRows(eventsRes.data ?? []),
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function classifyFailure(error: unknown): LoadFailure {
  const aborted = error instanceof Error && error.name === "AbortError";
  const postgrestError = error as { code?: string; message?: string };
  return {
    reason: aborted ? "timeout" : "error",
    message: !aborted ? (postgrestError.message ?? "Unknown error") : "",
    missingRelation:
      !aborted &&
      (postgrestError.code === "42P01" ||
        postgrestError.code === "PGRST202" ||
        postgrestError.code === "PGRST205" ||
        /does not exist|schema cache|could not find/i.test(
          postgrestError.message ?? "",
        )),
  };
}

/** Live public-market feed with retry; safe to mount in several surfaces. */
export function useMarketFeed() {
  const [data, setData] = useState<MarketData | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async () => {
    try {
      setData(await fetchMarketData());
      setFailure(null);
    } catch (error) {
      setFailure(classifyFailure(error));
    }
  }, []);

  useAsyncAction(load, [load, attempt]);

  // Reset to the loading state synchronously here (event handler, not render)
  // so the globe and registry show placeholders while refetching.
  const retry = useCallback(() => {
    setData(null);
    setFailure(null);
    setAttempt((value) => value + 1);
  }, []);

  return { data, failure, loading: data === null, retry };
}

const toSource = (
  row: {
    id: string;
    location: string;
    latitude: number | null;
    longitude: number | null;
  } & { name?: string | null; title?: string | null },
): MarketDotSource => ({
  id: row.id,
  name: row.name ?? row.title ?? "",
  location: row.location,
  latitude: row.latitude,
  longitude: row.longitude,
});

/** All published rows as globe pin groups (no scope filtering). */
export function marketGroupsFromData(data: MarketData): MarketDotGroup[] {
  return [
    { rows: data.listings.map(toSource), kind: "listing" as const },
    { rows: data.professionals.map(toSource), kind: "professional" as const },
    { rows: data.jobs.map(toSource), kind: "job" as const },
    { rows: data.firms.map(toSource), kind: "firm" as const },
    { rows: data.events.map(toSource), kind: "event" as const },
  ];
}
