import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type {
  EventRow,
  FirmRow,
  JobRow,
  ListingRow,
  MarketData,
  ProfessionalRow,
} from "../components/market/marketFeed.ts";
import {
  buildRails,
  isFlatMode,
  isNew,
  toItem,
  type MarketRailData,
  type RailItem,
} from "../components/market/marketItems.ts";
import {
  buildMarketDots,
  type MarketDotGroup,
  type MarketDotKind,
} from "../components/market/marketDots.ts";
import { useDebouncedValue } from "./useDebouncedValue.ts";

// ── Types ───────────────────────────────────────────────────────────────────

export type Scope = "all" | "listing" | "professional" | "job" | "firm" | "event";
export type SortKey = "newest" | "popular" | "price-asc" | "price-desc";
export type ListingCategory = "all" | "instrument" | "accessory";

// ── Constants ───────────────────────────────────────────────────────────────

export const FLAT_PAGE_SIZE = 12;

// ── Helpers ─────────────────────────────────────────────────────────────────

export function matches(
  term: string,
  haystack: (string | null | undefined)[],
): boolean {
  if (!term.trim()) return true;
  const needle = term.trim().toLowerCase();
  return haystack.some((field) => (field ?? "").toLowerCase().includes(needle));
}

/** "Harare, Zimbabwe" -> "Zimbabwe"; single-part locations pass through. */
export function countryOf(location: string): string {
  const parts = location.split(",");
  return parts[parts.length - 1].trim();
}

// ── URL param defaults (omitted when at default value) ──────────────────────

const SCOPE_DEFAULT: Scope = "all";
const SORT_DEFAULT: SortKey = "newest";
const CAT_DEFAULT: ListingCategory = "all";
const COUNTRY_DEFAULT = "";

function readScope(params: URLSearchParams): Scope {
  const raw = params.get("scope");
  const valid: Scope[] = ["all", "listing", "professional", "job", "firm", "event"];
  return raw && (valid as string[]).includes(raw) ? (raw as Scope) : SCOPE_DEFAULT;
}

function readSort(params: URLSearchParams): SortKey {
  const raw = params.get("sort");
  const valid: SortKey[] = ["newest", "popular", "price-asc", "price-desc"];
  return raw && (valid as string[]).includes(raw) ? (raw as SortKey) : SORT_DEFAULT;
}

function readCat(params: URLSearchParams): ListingCategory {
  const raw = params.get("cat");
  const valid: ListingCategory[] = ["all", "instrument", "accessory"];
  return raw && (valid as string[]).includes(raw) ? (raw as ListingCategory) : CAT_DEFAULT;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useMarketFilters(data: MarketData | null) {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read initial values from URL
  const searchParam = searchParams.get("q") ?? "";
  const scope = readScope(searchParams);
  const sort = readSort(searchParams);
  const listingCategory = readCat(searchParams);
  const country = searchParams.get("country") ?? COUNTRY_DEFAULT;
  const remoteOnly = searchParams.get("remote") === "1";

  // Controlled search input for immediate typing response, with debouncing for queries
  const [search, setSearch] = useState(searchParam);
  const debouncedSearch = useDebouncedValue(search, 250);

  // Writer: updates one or more params, omitting defaults
  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === "") {
              next.delete(key);
            } else {
              next.set(key, value);
            }
          }
          // Strip defaults
          if (next.get("scope") === SCOPE_DEFAULT) next.delete("scope");
          if (next.get("sort") === SORT_DEFAULT) next.delete("sort");
          if (next.get("cat") === CAT_DEFAULT) next.delete("cat");
          if (!next.get("country")) next.delete("country");
          if (next.get("remote") !== "1") next.delete("remote");
          if (!next.get("q")) next.delete("q");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Sync external search changes (e.g. back/forward or clear) back to input
  useEffect(() => {
    if (searchParam !== search && searchParam !== debouncedSearch) {
      setSearch(searchParam);
    }
  }, [searchParam]);

  // Sync debounced search to URL
  useEffect(() => {
    const currentParam = searchParams.get("q") ?? "";
    const trimmed = debouncedSearch.trim();
    if (trimmed !== currentParam) {
      updateParams({ q: trimmed || null });
    }
  }, [debouncedSearch, searchParams, updateParams]);

  // State setters that sync to URL
  const setScope = useCallback(
    (value: Scope) => updateParams({ scope: value }),
    [updateParams],
  );
  const setSort = useCallback(
    (value: SortKey) => updateParams({ sort: value }),
    [updateParams],
  );
  const setListingCategory = useCallback(
    (value: ListingCategory) => updateParams({ cat: value }),
    [updateParams],
  );
  const setCountry = useCallback(
    (value: string) => updateParams({ country: value || null }),
    [updateParams],
  );
  const setRemoteOnly = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const current = prev.get("remote") === "1";
          const resolved = typeof value === "function" ? value(current) : value;
          if (resolved) next.set("remote", "1");
          else next.delete("remote");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // ── Non-URL state ───────────────────────────────────────────────────────

  const [seeAll, setSeeAll] = useState<MarketRailData | null>(null);
  const [flatLimit, setFlatLimit] = useState(FLAT_PAGE_SIZE);

  // ── Derived: place filter ───────────────────────────────────────────────

  const matchesPlace = useCallback(
    (row: { is_remote: boolean | null; country: string | null }) =>
      (!remoteOnly || Boolean(row.is_remote)) && (!country || row.country === country),
    [remoteOnly, country],
  );

  // ── Derived: filtered rows ──────────────────────────────────────────────

  const filteredListings = useMemo(
    () =>
      (data?.listings ?? [])
        .filter((row) => listingCategory === "all" || row.category === listingCategory)
        .filter(matchesPlace)
        .filter((row) =>
          matches(debouncedSearch, [
            row.name,
            row.type,
            row.seller,
            row.location,
            row.description,
          ]),
        ),
    [data, debouncedSearch, listingCategory, matchesPlace],
  );

  const filteredProfessionals = useMemo(
    () =>
      (data?.professionals ?? [])
        .filter(matchesPlace)
        .filter((row) =>
          matches(debouncedSearch, [
            row.name,
            row.title,
            row.discipline,
            row.location,
            row.bio,
          ]),
        ),
    [data, debouncedSearch, matchesPlace],
  );

  const filteredJobs = useMemo(
    () =>
      (data?.jobs ?? [])
        .filter(matchesPlace)
        .filter((row) =>
          matches(debouncedSearch, [
            row.title,
            row.discipline,
            row.location,
            row.description,
            row.company,
          ]),
        ),
    [data, debouncedSearch, matchesPlace],
  );

  const filteredFirms = useMemo(
    () =>
      (data?.firms ?? [])
        .filter(matchesPlace)
        .filter((row) => matches(debouncedSearch, [row.name, row.location, row.about])),
    [data, debouncedSearch, matchesPlace],
  );

  const filteredEvents = useMemo(
    () =>
      (data?.events ?? [])
        .filter(matchesPlace)
        .filter((row) =>
          matches(debouncedSearch, [
            row.title,
            row.provider,
            row.kind,
            row.location,
            row.description,
          ]),
        ),
    [data, debouncedSearch, matchesPlace],
  );

  // ── Derived: distinct countries ─────────────────────────────────────────

  const countries = useMemo(() => {
    const found = new Set<string>();
    for (const row of [
      ...(data?.listings ?? []),
      ...(data?.professionals ?? []),
      ...(data?.jobs ?? []),
      ...(data?.firms ?? []),
      ...(data?.events ?? []),
    ]) {
      if (row.country) found.add(row.country);
    }
    return [...found].sort((a, b) => a.localeCompare(b));
  }, [data]);

  // ── Derived: search highlight keys for globe ────────────────────────────

  const matchKeys = useMemo(() => {
    if (!debouncedSearch.trim()) return null;
    const keys = new Set<string>();
    for (const row of filteredListings) keys.add(`listing:${row.id}`);
    for (const row of filteredProfessionals) keys.add(`professional:${row.id}`);
    for (const row of filteredJobs) keys.add(`job:${row.id}`);
    for (const row of filteredFirms) keys.add(`firm:${row.id}`);
    for (const row of filteredEvents) keys.add(`event:${row.id}`);
    return keys;
  }, [
    debouncedSearch,
    filteredListings,
    filteredProfessionals,
    filteredJobs,
    filteredFirms,
    filteredEvents,
  ]);

  // ── Derived: sorting ───────────────────────────────────────────────────

  const priceDir = sort === "price-asc" ? 1 : -1;

  const sortedListings = useMemo(() => {
    const rows = [...filteredListings];
    if (sort === "popular") {
      rows.sort(
        (a, b) =>
          b.saves - a.saves ||
          Date.parse(b.updated_at ?? b.created_at) - Date.parse(a.updated_at ?? a.created_at),
      );
    } else if (sort === "newest") {
      rows.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    } else {
      rows.sort((a, b) => (a.price - b.price) * priceDir);
    }
    return rows;
  }, [filteredListings, sort, priceDir]);

  const sortedProfessionals = useMemo(() => {
    const rows = [...filteredProfessionals];
    if (sort === "popular") {
      rows.sort(
        (a, b) =>
          b.saves - a.saves || (b.rating ?? 0) - (a.rating ?? 0),
      );
    } else if (sort === "newest") {
      rows.sort((a, b) =>
        (b.created_at ? Date.parse(b.created_at) : 0) -
        (a.created_at ? Date.parse(a.created_at) : 0),
      );
    } else {
      rows.sort((a, b) => (a.rate - b.rate) * priceDir);
    }
    return rows;
  }, [filteredProfessionals, sort, priceDir]);

  const sortedJobs = useMemo(() => {
    const rows = [...filteredJobs];
    if (sort === "popular") {
      rows.sort(
        (a, b) =>
          b.saves - a.saves ||
          Date.parse(b.updated_at ?? b.created_at) - Date.parse(a.updated_at ?? a.created_at),
      );
    } else if (sort === "newest") {
      rows.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    } else {
      rows.sort(
        (a, b) =>
          ((a.rate ?? Number.MAX_SAFE_INTEGER) -
            (b.rate ?? Number.MAX_SAFE_INTEGER)) * priceDir,
      );
    }
    return rows;
  }, [filteredJobs, sort, priceDir]);

  const sortedFirms = useMemo(() => {
    const rows = [...filteredFirms];
    if (sort === "popular") {
      rows.sort((a, b) => b.saves - a.saves || b.rating - a.rating);
    } else if (sort === "newest") {
      rows.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    } else {
      rows.sort((a, b) => a.name.localeCompare(b.name));
    }
    return rows;
  }, [filteredFirms, sort]);

  const sortedEvents = useMemo(() => {
    const rows = [...filteredEvents];
    if (sort === "popular") {
      rows.sort((a, b) => b.saves - a.saves);
    } else if (sort === "newest") {
      rows.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
    } else {
      rows.sort((a, b) => (a.price - b.price) * priceDir);
    }
    return rows;
  }, [filteredEvents, sort, priceDir]);

  // ── Derived: rails + flat mode ──────────────────────────────────────────

  const flatMode = isFlatMode(debouncedSearch, sort, seeAll);

  const rails = useMemo(
    () => (data ? buildRails(data, listingCategory, scope) : []),
    [data, listingCategory, scope],
  );
  const visibleRails = useMemo(
    () =>
      rails.filter(
        (rail) => scope === "all" || rail.kinds.includes(scope as MarketDotKind),
      ),
    [rails, scope],
  );

  const flatItems: RailItem[] = useMemo(() => {
    if (!data) return [];
    const allowed = seeAll
      ? new Set<string>(seeAll.kinds)
      : scope === "all"
        ? null
        : new Set<string>([scope]);
    const collect = (
      kind: MarketDotKind,
      rows: Array<ListingRow | ProfessionalRow | JobRow | FirmRow | EventRow>,
    ) => (allowed === null || allowed.has(kind) ? rows.map((row) => toItem(kind, row)) : []);
    const merged = [
      ...collect("listing", sortedListings),
      ...collect("professional", sortedProfessionals),
      ...collect("job", sortedJobs),
      ...collect("firm", sortedFirms),
      ...collect("event", sortedEvents),
    ];
    return sort === "newest"
      ? merged.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      : merged;
  }, [data, seeAll, scope, sort, sortedListings, sortedProfessionals, sortedJobs, sortedFirms, sortedEvents]);

  const visibleFlatItems = useMemo(
    () => flatItems.slice(0, flatLimit),
    [flatItems, flatLimit],
  );

  // ── Derived: globe dots (scope + location; search stays a registry tool) ──

  const toSource = useCallback(
    (row: {
      id: string;
      location: string;
      latitude: number | null;
      longitude: number | null;
      name?: string | null;
      title?: string | null;
    }) => ({
      id: row.id,
      name: row.name ?? row.title ?? "",
      location: row.location,
      latitude: row.latitude,
      longitude: row.longitude,
    }),
    [],
  );

  const scopeGroups: MarketDotGroup[] = useMemo(() => {
    const all = {
      listings: data?.listings ?? [],
      professionals: data?.professionals ?? [],
      jobs: data?.jobs ?? [],
      firms: data?.firms ?? [],
      events: data?.events ?? [],
    };
    const scoped =
      scope === "all"
        ? all
        : {
            listings: scope === "listing" ? all.listings : [],
            professionals: scope === "professional" ? all.professionals : [],
            jobs: scope === "job" ? all.jobs : [],
            firms: scope === "firm" ? all.firms : [],
            events: scope === "event" ? all.events : [],
          };
    return [
      { rows: scoped.listings.map(toSource), kind: "listing" as const },
      {
        rows: scoped.professionals.map(toSource),
        kind: "professional" as const,
      },
      { rows: scoped.jobs.map(toSource), kind: "job" as const },
      { rows: scoped.firms.map(toSource), kind: "firm" as const },
      { rows: scoped.events.map(toSource), kind: "event" as const },
    ];
  }, [data, scope, toSource]);

  const dots = useMemo(
    () => (data === null ? null : buildMarketDots(scopeGroups)),
    [data, scopeGroups],
  );

  const totalPoints = useMemo(
    () => buildMarketDots(scopeGroups, Number.POSITIVE_INFINITY).length,
    [scopeGroups],
  );

  const isCapped = dots !== null && totalPoints > dots.length;
  const hiddenPointsCount =
    dots !== null ? Math.max(0, totalPoints - dots.length) : 0;

  // ── Derived: pulse stats + benchmarks ─────────────────────────────────

  const addedThisWeek = useMemo(() => {
    if (!data) return 0;
    return [
      data.listings,
      data.professionals.map((row) => ({ created_at: row.created_at ?? "" })),
      data.jobs,
      data.firms,
      data.events,
    ]
      .flat()
      .filter((row) => isNew(row.created_at)).length;
  }, [data]);

  const liveTotals = useMemo(() => {
    if (!data) return null;
    const rows = [
      ...data.listings,
      ...data.professionals,
      ...data.jobs,
      ...data.firms,
      ...data.events,
    ];
    return {
      items: rows.length,
      countries: new Set(rows.map((row) => countryOf(row.location)).filter(Boolean))
        .size,
    };
  }, [data]);

  const benchmarks = useMemo(() => {
    const hireRows = filteredListings.filter(
      (row) => row.listing_type === "hire",
    );
    const groups = new Map<string, number[]>();
    for (const row of hireRows) {
      const bucket = groups.get(row.type ?? "other") ?? [];
      bucket.push(row.price);
      groups.set(row.type ?? "other", bucket);
    }
    return [...groups.entries()]
      .map(([type, prices]) => {
        prices.sort((a, b) => a - b);
        const mid = Math.floor(prices.length / 2);
        const median =
          prices.length % 2 === 1
            ? prices[mid]
            : (prices[mid - 1] + prices[mid]) / 2;
        return { type, median, count: prices.length };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [filteredListings]);

  // ── See-all + clear ───────────────────────────────────────────────────

  const handleSeeAll = useCallback(
    (rail: MarketRailData) => {
      setSeeAll(rail);
      setSearch("");
      setFlatLimit(FLAT_PAGE_SIZE);
      const targetScope = rail.kinds.length === 1 ? rail.kinds[0] : "all";
      updateParams({
        q: null,
        scope: targetScope === "all" ? null : targetScope,
      });
    },
    [updateParams],
  );

  const clearFlatMode = useCallback(() => {
    setSeeAll(null);
    setSearch("");
    setFlatLimit(FLAT_PAGE_SIZE);
    updateParams({ q: null, sort: null });
  }, [updateParams]);

  const resetAllFilters = useCallback(() => {
    setSeeAll(null);
    setSearch("");
    setFlatLimit(FLAT_PAGE_SIZE);
    updateParams({
      q: null,
      scope: null,
      sort: null,
      cat: null,
      country: null,
      remote: null,
    });
  }, [updateParams]);

  return {
    // Filter state
    search,
    debouncedSearch,
    scope,
    sort,
    listingCategory,
    country,
    remoteOnly,

    // Filter setters
    setSearch,
    setScope,
    setSort,
    setListingCategory,
    setCountry,
    setRemoteOnly,

    // Filtered rows
    filteredListings,
    filteredProfessionals,
    filteredJobs,
    filteredFirms,
    filteredEvents,

    // Sorted rows
    sortedListings,
    sortedProfessionals,
    sortedJobs,
    sortedFirms,
    sortedEvents,

    // Country list
    countries,

    // Globe highlight keys
    matchKeys,

    // Globe dots & point capping
    scopeGroups,
    dots,
    totalPoints,
    isCapped,
    hiddenPointsCount,

    // Flat mode
    flatMode,
    flatItems,
    flatLimit,
    setFlatLimit,
    visibleFlatItems,
    FLAT_PAGE_SIZE,

    // Rails
    rails,
    visibleRails,

    // See-all
    seeAll,
    setSeeAll,
    handleSeeAll,
    clearFlatMode,
    resetAllFilters,

    // Stats
    addedThisWeek,
    liveTotals,
    benchmarks,
  };
}
