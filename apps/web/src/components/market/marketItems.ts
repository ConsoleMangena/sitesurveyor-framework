import { assetMediaUrl } from "../../lib/repositories/assetMedia.ts";
import { portfolioMediaUrl } from "../../lib/repositories/portfolioMedia.ts";
import type {
  EventRow,
  FirmRow,
  JobRow,
  ListingRow,
  MarketData,
  ProfessionalRow,
} from "./marketFeed.ts";
import { MARKET_DOT_COLORS, type MarketDotKind } from "./marketDots.ts";

const NEW_WINDOW_MS = 7 * 24 * 60 * 60_000;

/** Items shown per rail before "See all" takes over. */
export const RAIL_CAP = 12;

/**
 * Flat editorial-rows mode replaces the Discovery Rails whenever the user has
 * an active search, a non-default sort, or an explicit "See all" scope.
 */
export function isFlatMode(
  search: string,
  sort: string,
  seeAll: MarketRailData | null,
): boolean {
  return search.trim() !== "" || sort !== "newest" || seeAll !== null;
}

export function isNew(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false;
  const time = Date.parse(createdAt);
  if (!Number.isFinite(time)) return false;
  const age = Date.now() - time;
  return age >= 0 && age < NEW_WINDOW_MS;
}

export interface RailItem {
  kind: MarketDotKind;
  id: string;
  title: string;
  meta: string;
  location: string;
  priceLabel: string;
  photoUrl: string | null;
  createdAt: string;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  verified: boolean;
}

export interface MarketRailData {
  id: string;
  title: string;
  accent: string;
  kinds: MarketDotKind[];
  items: RailItem[];
}

export function toListingItem(row: ListingRow): RailItem {
  return {
    kind: "listing",
    id: row.id,
    title: row.name,
    meta: [
      row.category === "accessory" ? "Accessory" : row.type,
      row.condition,
      row.listing_type === "hire" ? "hire" : null,
    ]
      .filter(Boolean)
      .join(" · "),
    location: row.location,
    priceLabel: `${row.price.toLocaleString()} ${row.currency}${
      row.listing_type === "hire" ? "/day" : ""
    }`,
    photoUrl: assetMediaUrl(row.photos?.[0] ?? null),
    createdAt: row.created_at,
    lat: row.latitude,
    lng: row.longitude,
    rating: null,
    verified: false,
  };
}

export function toProfessionalItem(row: ProfessionalRow): RailItem {
  return {
    kind: "professional",
    id: row.id,
    title: row.name,
    meta: [row.title, row.discipline, row.experience].filter(Boolean).join(" · "),
    location: row.location,
    priceLabel: `${row.rate.toLocaleString()} ${row.currency}/${row.rate_per ?? "day"}`,
    photoUrl: portfolioMediaUrl(row.avatar_path ?? null),
    createdAt: row.created_at,
    lat: row.latitude,
    lng: row.longitude,
    rating: row.rating ?? null,
    verified: Boolean(row.is_verified),
  };
}

export function toJobItem(row: JobRow): RailItem {
  return {
    kind: "job",
    id: row.id,
    title: row.title ?? "",
    meta: [row.discipline, row.employment_type].filter(Boolean).join(" · "),
    location: row.location,
    priceLabel:
      // feed normalizes DB-NULL rates to 0 (marketFeed toJobRows); surface both as Negotiable
      row.rate != null && row.rate > 0
        ? `${row.rate.toLocaleString()} ${row.currency}/${row.rate_per ?? "day"}`
        : "Negotiable",
    photoUrl: null,
    createdAt: row.created_at,
    lat: row.latitude,
    lng: row.longitude,
    rating: null,
    verified: false,
  };
}

export function toFirmItem(row: FirmRow): RailItem {
  return {
    kind: "firm",
    id: row.id,
    title: row.name,
    meta: (row.services ?? []).slice(0, 3).join(" · "),
    location: row.location,
    priceLabel: `${(row.services ?? []).length} services`,
    photoUrl: null,
    createdAt: row.created_at,
    lat: row.latitude,
    lng: row.longitude,
    rating: null,
    verified: Boolean(row.verified),
  };
}

export function toEventItem(row: EventRow): RailItem {
  return {
    kind: "event",
    id: row.id,
    title: row.title ?? "",
    meta: [row.kind, row.provider].filter(Boolean).join(" · "),
    location: row.location,
    priceLabel: row.price > 0 ? `${row.price.toLocaleString()} ${row.currency}` : "Free",
    photoUrl: null,
    createdAt: row.created_at,
    lat: row.latitude,
    lng: row.longitude,
    rating: null,
    verified: false,
  };
}

export function toItem(
  kind: MarketDotKind,
  row: ListingRow | ProfessionalRow | JobRow | FirmRow | EventRow,
): RailItem {
  switch (kind) {
    case "listing":
      return toListingItem(row as ListingRow);
    case "professional":
      return toProfessionalItem(row as ProfessionalRow);
    case "job":
      return toJobItem(row as JobRow);
    case "firm":
      return toFirmItem(row as FirmRow);
    case "event":
      return toEventItem(row as EventRow);
  }
}

export type RailsCategory = "all" | "instrument" | "accessory";
export type RailsScope = "all" | MarketDotKind;

const byCreatedDesc = (a: RailItem, b: RailItem) =>
  Date.parse(b.createdAt) - Date.parse(a.createdAt);

export function buildRails(
  data: MarketData,
  listingCategory: RailsCategory,
  scope: RailsScope,
): MarketRailData[] {
  const inScope = (kind: MarketDotKind) => scope === "all" || scope === kind;

  const listings = data.listings
    .filter((row) => listingCategory === "all" || row.category === listingCategory)
    .map(toListingItem);
  const professionals = data.professionals.map(toProfessionalItem);
  const jobs = data.jobs.map(toJobItem);
  const firms = data.firms.map(toFirmItem);
  // Events are pre-sorted by upcoming start so the rail (and its slice) lead
  // with the soonest dates; RailItem itself does not carry starts_at.
  const events = data.events
    .slice()
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    .map(toEventItem);

  const scoped = (items: RailItem[], kind: MarketDotKind) =>
    inScope(kind) ? items : [];

  const fresh = [...scoped(listings, "listing"), ...scoped(professionals, "professional"),
    ...scoped(jobs, "job"), ...scoped(firms, "firm"), ...scoped(events, "event")]
    .sort(byCreatedDesc)
    .slice(0, RAIL_CAP);

  const prosByRating = [...scoped(professionals, "professional")].sort(
    (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
  );
  const firmsVerifiedFirst = [...scoped(firms, "firm")].sort(
    (a, b) => Number(b.verified) - Number(a.verified),
  );

  const rails: MarketRailData[] = [
    {
      id: "fresh",
      title: "Fresh on the market",
      accent: MARKET_DOT_COLORS.listing,
      kinds: ["listing", "professional", "job", "firm", "event"],
      items: fresh,
    },
    {
      id: "gear",
      title: "Instruments & gear",
      accent: MARKET_DOT_COLORS.listing,
      kinds: ["listing"],
      items: [...scoped(listings, "listing")].sort(byCreatedDesc).slice(0, RAIL_CAP),
    },
    {
      id: "professionals",
      title: "Top rated professionals",
      accent: MARKET_DOT_COLORS.professional,
      kinds: ["professional"],
      items: prosByRating.slice(0, RAIL_CAP),
    },
    {
      id: "jobs",
      title: "Open jobs",
      accent: MARKET_DOT_COLORS.job,
      kinds: ["job"],
      items: [...scoped(jobs, "job")].sort(byCreatedDesc).slice(0, RAIL_CAP),
    },
    {
      id: "firms",
      title: "Survey firms",
      accent: MARKET_DOT_COLORS.firm,
      kinds: ["firm"],
      items: firmsVerifiedFirst.slice(0, RAIL_CAP),
    },
    {
      id: "events",
      title: "Training & events",
      accent: MARKET_DOT_COLORS.event,
      kinds: ["event"],
      // already sorted by starts_at ascending in the `events` pre-pass
      items: scoped(events, "event").slice(0, RAIL_CAP),
    },
  ];

  return rails;
}
