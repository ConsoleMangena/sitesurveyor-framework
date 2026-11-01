import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bookmark,
  ChevronDown,
  Globe2,
  LayoutGrid,
  LogOut,
  PackageSearch,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { cn } from "../../lib/utils.ts";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import { useAuthStore } from "../../lib/auth/auth-store.ts";
import { useMyAvatar } from "../../lib/hooks/useMyAvatar.ts";
import { signOut } from "../../lib/auth/session.ts";
import { getWorkspaceShellAccountLabel } from "../../features/workspace/account.ts";
import { Web3MarketTerminal } from "../../features/web3/components/Web3MarketTerminal.tsx";
import { useSolanaMarketFeed } from "../../features/web3/hooks/useSolanaMarketFeed.ts";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "../../components/ui/avatar.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.tsx";
import {
  buildMarketDots,
  MARKET_DOT_COLORS,
  type MarketDot,
  type MarketDotKind,
} from "../../components/market/marketDots";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select.tsx";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../../components/ui/sheet.tsx";

const PublicMarketGlobe = lazy(
  () => import("../../components/market/PublicMarketGlobe.tsx"),
);
import {
  fetchMarketData,
  classifyFailure,
} from "../../components/market/marketFeed.ts";
import type {
  EventRow,
  FirmRow,
  JobRow,
  ListingRow,
  LoadFailure,
  MarketData,
  ProfessionalRow,
} from "../../components/market/marketFeed.ts";
import { MarketDetailDialog } from "../../components/market/MarketDetailDialog.tsx";
import type { MarketGlobeHandle } from "../../components/market/LeafletGlobe.tsx";
import MarketRail from "../../components/market/MarketRail.tsx";
import FlatResultRow from "../../components/market/FlatResultRow.tsx";
import {
  buildRails,
  isFlatMode,
  isNew,
  toItem,
  type MarketRailData,
  type RailItem,
} from "../../components/market/marketItems.ts";
import { getSavedMarketSearch, saveMarketSearch, removeMarketSearch } from "../../lib/repositories/marketPreferences.ts";
import "../../styles/web3.css";


type Scope = "all" | "listing" | "professional" | "job" | "firm" | "event";
type SortKey = "newest" | "popular" | "price-asc" | "price-desc";
type ListingCategory = "all" | "instrument" | "accessory";

/** Flat results batch size — "Load more" appends this many rows at a time. */
const FLAT_PAGE_SIZE = 12;

function matches(
  term: string,
  haystack: (string | null | undefined)[],
): boolean {
  if (!term.trim()) return true;
  const needle = term.trim().toLowerCase();
  return haystack.some((field) => (field ?? "").toLowerCase().includes(needle));
}

/** "Harare, Zimbabwe" -> "Zimbabwe"; single-part locations pass through. */
function countryOf(location: string): string {
  const parts = location.split(",");
  return parts[parts.length - 1].trim();
}

const MARKET_KINDS = ["listing", "professional", "job", "firm", "event"] as const;

function isMarketKind(value: string): value is MarketDotKind {
  return (MARKET_KINDS as readonly string[]).includes(value);
}

/** Item referenced by ?item=<kind>:<id>, for shareable detail links. */
function readItemParam(): { kind: MarketDotKind; id: string } | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("item");
  if (!raw) return null;
  const [kind, id] = raw.split(":");
  if (!id || !isMarketKind(kind)) return null;
  return { kind, id };
}

/** Keep the open item in the URL so a listing can be linked or shared. */
function syncItemParam(kind: MarketDotKind | null, id?: string): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (kind && id) url.searchParams.set("item", `${kind}:${id}`);
  else url.searchParams.delete("item");
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function PublicMarketPage() {
  const user = useAuthStore((s) => s.user);
  const avatarUrl = useMyAvatar();
  const navigate = useNavigate();
  const market = useSolanaMarketFeed();
  const [marketUserMenuOpen, setMarketUserMenuOpen] = useState(false);
  const [data, setData] = useState<MarketData | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [savedSearch, setSavedSearch] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [scope, setScope] = useState<Scope>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [listingCategory, setListingCategory] = useState<ListingCategory>("all");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [country, setCountry] = useState("");
  const [seeAll, setSeeAll] = useState<MarketRailData | null>(null);
  const [flatLimit, setFlatLimit] = useState(FLAT_PAGE_SIZE);
  const [highlighted, setHighlighted] = useState<{ kind: MarketDotKind; id: string } | null>(
    readItemParam,
  );
  const registryRef = useRef<HTMLDivElement | null>(null);
  const globeRef = useRef<MarketGlobeHandle>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const [selectedId, setSelectedId] = useState<{
    kind: MarketDotKind;
    id: string;
  } | null>(readItemParam);

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

  useEffect(() => {
    let cancelled = false;
    const loadSaved = async () => {
      if (!user) {
        setSavedSearch(window.localStorage.getItem(`surveyor-market-search:${search}:${scope}:${sort}`) === "1");
        return;
      }
      try {
        const saved = await getSavedMarketSearch(search, scope, sort, listingCategory);
        if (!cancelled) setSavedSearch(saved !== null);
      } catch {
        if (!cancelled) setSavedSearch(false);
      }
    };
    void loadSaved();
    return () => { cancelled = true; };
  }, [user, search, scope, sort, listingCategory]);

  const toggleSavedSearch = async () => {
    const key = `surveyor-market-search:${search}:${scope}:${sort}`;
    if (!user) {
      if (savedSearch) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, "1");
      setSavedSearch((value) => !value);
      return;
    }
    try {
      const saved = await getSavedMarketSearch(search, scope, sort, listingCategory);
      if (saved) await removeMarketSearch(saved.id);
      else await saveMarketSearch({ query: search, scope, sort, listing_category: listingCategory });
      setSavedSearch(!saved);
    } catch {
      setSavedSearch(false);
    }
  };

  const failed = failure !== null;
  const loading = data === null;

  const handleSignOut = useCallback(async () => {
    await signOut();
    navigate("/market");
  }, [navigate]);

  // ── Derived: registry rows (search [+ category]) ──

  const matchesPlace = useCallback(
    (row: { is_remote: boolean | null; country: string | null }) =>
      (!remoteOnly || Boolean(row.is_remote)) && (!country || row.country === country),
    [remoteOnly, country],
  );

  const filteredListings = useMemo(
    () =>
      (data?.listings ?? [])
        .filter((row) => listingCategory === "all" || row.category === listingCategory)
        .filter(matchesPlace)
        .filter((row) =>
          matches(search, [
            row.name,
            row.type,
            row.seller,
            row.location,
            row.description,
          ]),
        ),
    [data, search, listingCategory, matchesPlace],
  );

  const filteredProfessionals = useMemo(
    () =>
      (data?.professionals ?? [])
        .filter(matchesPlace)
        .filter((row) =>
          matches(search, [
            row.name,
            row.title,
            row.discipline,
            row.location,
            row.bio,
          ]),
        ),
    [data, search, matchesPlace],
  );

  const filteredJobs = useMemo(
    () =>
      (data?.jobs ?? [])
        .filter(matchesPlace)
        .filter((row) =>
          matches(search, [
            row.title,
            row.discipline,
            row.location,
            row.description,
            row.company,
          ]),
        ),
    [data, search, matchesPlace],
  );

  const filteredFirms = useMemo(
    () =>
      (data?.firms ?? [])
        .filter(matchesPlace)
        .filter((row) => matches(search, [row.name, row.location, row.about])),
    [data, search, matchesPlace],
  );

  const filteredEvents = useMemo(
    () =>
      (data?.events ?? [])
        .filter(matchesPlace)
        .filter((row) =>
          matches(search, [
            row.title,
            row.provider,
            row.kind,
            row.location,
            row.description,
          ]),
        ),
    [data, search, matchesPlace],
  );

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

  // ── Derived: which pins the active search keeps in focus ──

  const matchKeys = useMemo(() => {
    if (!search.trim()) return null;
    const keys = new Set<string>();
    for (const row of filteredListings) keys.add(`listing:${row.id}`);
    for (const row of filteredProfessionals) keys.add(`professional:${row.id}`);
    for (const row of filteredJobs) keys.add(`job:${row.id}`);
    for (const row of filteredFirms) keys.add(`firm:${row.id}`);
    for (const row of filteredEvents) keys.add(`event:${row.id}`);
    return keys;
  }, [
    search,
    filteredListings,
    filteredProfessionals,
    filteredJobs,
    filteredFirms,
    filteredEvents,
  ]);

  // ── Derived: sorting (price where it exists; events lead with schedule) ──

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

  // ── Derived: rails + flat mode ──

  const flatMode = isFlatMode(search, sort, seeAll);

  const rails = useMemo(
    () => (data ? buildRails(data, listingCategory, scope) : []),
    [data, listingCategory, scope],
  );
  const visibleRails = rails.filter(
    (rail) => scope === "all" || rail.kinds.includes(scope as MarketDotKind),
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
    // Re-sort chronologically only for "newest"; price sorts keep the stable
    // per-kind group order (cross-kind price comparators are meaningless).
    return sort === "newest"
      ? merged.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      : merged;
  }, [data, seeAll, scope, sort, sortedListings, sortedProfessionals, sortedJobs, sortedFirms, sortedEvents]);

  const visibleFlatItems = flatItems.slice(0, flatLimit);

  // ── Derived: globe dots (scope + location; search stays a registry tool) ──

  const toSource = (
    row: { id: string; location: string; latitude: number | null; longitude: number | null } & {
      name?: string | null;
      title?: string | null;
    },
  ) => ({
    id: row.id,
    name: row.name ?? row.title ?? "",
    location: row.location,
    latitude: row.latitude,
    longitude: row.longitude,
  });

  const scopeGroups = useMemo(() => {
    const all = {
      listings: data?.listings ?? [],
      professionals: data?.professionals ?? [],
      jobs: data?.jobs ?? [],
      firms: data?.firms ?? [],
      events: data?.events ?? [],
    };
    const scoped = scope === "all"
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
      { rows: scoped.professionals.map(toSource), kind: "professional" as const },
      { rows: scoped.jobs.map(toSource), kind: "job" as const },
      { rows: scoped.firms.map(toSource), kind: "firm" as const },
      { rows: scoped.events.map(toSource), kind: "event" as const },
    ];
  }, [data, scope]);

  const dots = useMemo(
    () => (loading ? null : buildMarketDots(scopeGroups)),
    [loading, scopeGroups],
  );
  // Pins that exist in the current scope. buildMarketDots caps what it plots,
  // so count with an unbounded cap to keep the map's "showing X of Y" honest.
  const totalPoints = useMemo(
    () => buildMarketDots(scopeGroups, Number.POSITIVE_INFINITY).length,
    [scopeGroups],
  );

  // ── Derived: pulse stats + benchmarks ──

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

  // ── Detail selection ──

  const scrollToRegistry = () => {
    registryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSeeAll = (rail: MarketRailData) => {
    setSeeAll(rail);
    setSearch("");
    setFlatLimit(FLAT_PAGE_SIZE);
    // Multi-kind rails (e.g. Fresh) show everything in flat mode, so the scope
    // tab must reset to "Everything" too — otherwise the tab and map stay stale
    // while the list shows all kinds.
    setScope(rail.kinds.length === 1 ? rail.kinds[0] : "all");
    requestAnimationFrame(() => registryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const clearFlatMode = () => {
    setSeeAll(null);
    setSearch("");
    setSort("newest");
    setFlatLimit(FLAT_PAGE_SIZE);
  };

  const handlePinSelect = useCallback((dot: MarketDot) => {
    setSelectedId({ kind: dot.kind, id: dot.id });
    setHighlighted({ kind: dot.kind, id: dot.id });
    syncItemParam(dot.kind, dot.id);
    window.setTimeout(() => {
      document
        .querySelector(`[data-market-item="${dot.kind}:${dot.id}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 60);
    // The detail dialog opens on top of the map, so the highlight is HELD for
    // as long as the dialog is open; handleDialogClose re-arms a visible 2s
    // clear on close. The long fallback only covers the rare case the dialog
    // fails to open (e.g. the dot vanished from refreshed data), which would
    // otherwise leave the highlight stuck until the next pin click.
    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = window.setTimeout(() => setHighlighted(null), 30_000);
  }, []);

  const handleDialogClose = useCallback(() => {
    setSelectedId(null);
    syncItemParam(null);
    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = window.setTimeout(() => setHighlighted(null), 2000);
  }, []);

  const handleItemSelect = (item: RailItem) => {
    if (item.lat != null && item.lng != null) {
      globeRef.current?.panTo(item.lat, item.lng);
      globeRef.current?.flashAt(item.lat, item.lng, MARKET_DOT_COLORS[item.kind]);
    }
    setSelectedId({ kind: item.kind, id: item.id });
    syncItemParam(item.kind, item.id);
  };

  const selectedDot: MarketDot | null = useMemo(() => {
    if (!selectedId || !data) return null;
    const findIn = <
      T extends { id: string; location: string; latitude: number | null; longitude: number | null },
    >(
      rows: T[],
    ) => rows.find((row) => row.id === selectedId.id);
    const source =
      selectedId.kind === "listing"
        ? findIn(data.listings)
        : selectedId.kind === "professional"
          ? findIn(data.professionals)
          : selectedId.kind === "job"
            ? findIn(data.jobs)
            : selectedId.kind === "firm"
              ? findIn(data.firms)
              : findIn(data.events);
    if (!source || source.latitude == null || source.longitude == null) {
      return null;
    }
    return {
      kind: selectedId.kind,
      id: source.id,
      name: ("name" in source ? source.name : source.title) ?? "",
      location: source.location,
      lat: source.latitude,
      lng: source.longitude,
    };
  }, [selectedId, data]);
  const selectedListing =
    selectedId?.kind === "listing"
      ? (data?.listings ?? []).find((row) => row.id === selectedId.id) ?? null
      : null;
  const selectedProfessional =
    selectedId?.kind === "professional"
      ? (data?.professionals ?? []).find((row) => row.id === selectedId.id) ??
        null
      : null;
  const selectedJob =
    selectedId?.kind === "job"
      ? (data?.jobs ?? []).find((row) => row.id === selectedId.id) ?? null
      : null;
  const selectedFirm =
    selectedId?.kind === "firm"
      ? (data?.firms ?? []).find((row) => row.id === selectedId.id) ?? null
      : null;
  const selectedEvent =
    selectedId?.kind === "event"
      ? (data?.events ?? []).find((row) => row.id === selectedId.id) ?? null
      : null;

  const showPanel = (kind: Exclude<Scope, "all">) =>
    scope === "all" || scope === kind;

  return (
    <div className="web3-surface">
      <header className="web3-header">
        <div className="web3-header-inner">
          <span className="flex min-w-0 items-baseline gap-2">
            <Link
              to="/"
              aria-label="SiteSurveyor home"
              className="web3-brand"
            >
              <img
                src="/logo.svg"
                alt=""
                className="web3-brand-logo"
                aria-hidden="true"
              />
              <span className="web3-brand-name">SiteSurveyor</span>
            </Link>
            <span className="web3-brand-sub hidden truncate sm:inline">/ Surveyor’s Market</span>
          </span>
          {user ? (
            <DropdownMenu
              open={marketUserMenuOpen}
              onOpenChange={setMarketUserMenuOpen}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="group h-10 gap-2 rounded-full py-1.5 pl-1.5 pr-3"
                  aria-label={`Open account menu (${user.name})`}
                >
                  <Avatar className="size-8 shrink-0">
                    {avatarUrl && (
                      <AvatarImage
                        src={avatarUrl}
                        alt={user.name}
                        className="h-full w-full object-cover"
                      />
                    )}
                    <AvatarFallback className="bg-muted text-foreground text-xs font-semibold">
                      {initialsOf(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="max-w-[132px] truncate text-sm font-semibold max-sm:hidden">
                    {user.name}
                  </span>
                  <ChevronDown
                    className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
                    aria-hidden="true"
                  />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" forceMount className="w-64 web3-theme">
                <div className="mb-1.5 flex items-center gap-3 rounded-lg border bg-muted/40 p-2.5">
                  <Avatar className="size-10 shrink-0">
                    {avatarUrl && (
                      <AvatarImage
                        src={avatarUrl}
                        alt={user.name}
                        className="h-full w-full object-cover"
                      />
                    )}
                    <AvatarFallback className="bg-muted text-foreground text-base font-semibold">
                      {initialsOf(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-col items-start gap-0.5">
                    <span className="max-w-[180px] truncate text-sm font-semibold">
                      {user.name}
                    </span>
                    <span className="max-w-[180px] truncate text-xs text-muted-foreground">
                      {user.email}
                    </span>
                    <Badge
                      variant={user.accountType === "business" ? "default" : "secondary"}
                    >
                      {getWorkspaceShellAccountLabel(user)}
                    </Badge>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/">
                    <LayoutGrid /> Open your workspace
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/?view=marketplace">
                    <PackageSearch /> My marketplace requests
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={handleSignOut}
                >
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link to="/login" className="web3-btn web3-btn-primary">
              Sign in
            </Link>
          )}
        </div>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-7xl items-center gap-8 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:gap-12 lg:py-16">
          <div className="max-w-xl">
            <h1 className="market-hero-title text-balance text-[var(--web3-text)]">
              The Surveyor’s <span className="text-[var(--web3-brand)]">Market.</span>
            </h1>
            <p className="mt-5 max-w-[58ch] text-base leading-7 text-[var(--web3-text-muted)] sm:text-lg sm:leading-8">
              Instruments, professionals, jobs, firms, and training — published live by SiteSurveyor workspaces worldwide.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={scrollToRegistry}
                className="web3-btn web3-btn-primary min-h-11 px-5 text-sm"
              >
                Browse the registry
                <ChevronDown className="size-4" aria-hidden="true" />
              </button>
              <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                <span className="web3-live-dot" aria-hidden="true" />
                Live marketplace
              </span>
            </div>
            {addedThisWeek > 0 ? (
              <p className="mt-4 text-sm font-medium text-success">
                {addedThisWeek} new {addedThisWeek === 1 ? "item" : "items"} added this week
              </p>
            ) : null}
          </div>

          <div aria-label="Interactive market map" className="market-map-frame overflow-hidden rounded-2xl border border-border/80 bg-card">
            <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-border/80 px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-accent-bg text-[var(--web3-brand)]">
                  <Globe2 className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="market-map-title text-foreground">Explore the live map</h2>
                  <p className="text-micro text-muted-foreground">Select a pin to preview the opportunity</p>
                </div>
              </div>
              <span className="font-mono text-xs font-semibold tabular-nums text-muted-foreground">
                {liveTotals ? `${liveTotals.items} live items` : "Loading activity"}
              </span>
            </div>
            <Suspense fallback={<div className="h-[360px] w-full animate-pulse bg-muted/30 sm:h-[440px] lg:h-[500px]" />}>
              <PublicMarketGlobe
                ref={globeRef}
                dots={dots}
                totalPoints={totalPoints}
                matchKeys={matchKeys}
                fitKey={scope}
                failed={failed}
                onSelect={handlePinSelect}
                onRetry={retry}
                heightClassName="h-[360px] sm:h-[440px] lg:h-[500px]"
              />
            </Suspense>
            <div className="flex items-center justify-between gap-3 border-t border-border/80 px-4 py-2.5 text-micro text-muted-foreground sm:px-5">
              <span>Two-way map and registry discovery</span>
              <span className="shrink-0 font-mono tabular-nums">{totalPoints} mapped</span>
            </div>
          </div>
        </section>

        {failed ? null : loading ? (
          <MarketPulseStripSkeleton />
        ) : (
          <MarketPulseStrip data={data} addedThisWeek={addedThisWeek} />
        )}

        <section ref={registryRef} className="mt-10 scroll-mt-16 border-y border-border/70 bg-card/45 sm:mt-12">
          <div className="mx-auto w-full max-w-7xl space-y-9 px-4 py-12 sm:px-6 sm:py-16">
            <div className="flex flex-col gap-6">
              <div className="max-w-2xl">
                <h2 className="market-section-title text-balance text-foreground">
                  Browse the market
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
                  Pick a section, or search to see every match in one list.
                </p>
              </div>

              <div className="space-y-5">
                <div className="flex gap-2.5">
                  <div className="relative min-w-0 flex-1">
                    <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input
                      placeholder="Search instruments, people, places…"
                      value={search}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setFlatLimit(FLAT_PAGE_SIZE);
                      }}
                      className="h-12 rounded-xl border-border/80 bg-background pl-11 pr-11 text-sm shadow-none"
                    />
                    {search ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSearch("");
                          setFlatLimit(FLAT_PAGE_SIZE);
                        }}
                        aria-label="Clear search"
                        className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <X className="size-4" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                  <Select
                    value={sort}
                    onValueChange={(value) => {
                      setSort(value as SortKey);
                      setFlatLimit(FLAT_PAGE_SIZE);
                    }}
                  >
                    <SelectTrigger aria-label="Sort results" className="hidden h-12 w-[190px] shrink-0 rounded-xl bg-background text-sm sm:flex">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      <SelectItem value="newest">Newest first</SelectItem>
                      <SelectItem value="popular">Most saved</SelectItem>
                      <SelectItem value="price-asc">Price: low to high</SelectItem>
                      <SelectItem value="price-desc">Price: high to low</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant={savedSearch ? "default" : "outline"}
                    size="icon"
                    className="size-12 shrink-0 rounded-xl bg-background"
                    onClick={toggleSavedSearch}
                    aria-label={savedSearch ? "Remove saved search" : "Save this search"}
                    title={savedSearch ? "Saved search" : "Save this search"}
                  >
                    <Bookmark className="size-4" fill={savedSearch ? "currentColor" : "none"} aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-12 shrink-0 rounded-xl bg-background sm:hidden"
                    onClick={() => setMobileFiltersOpen(true)}
                    aria-expanded={mobileFiltersOpen}
                    aria-label="Toggle marketplace filters"
                  >
                    <SlidersHorizontal className="size-4" aria-hidden="true" />
                  </Button>
                </div>

                <div role="group" aria-label="Filter by kind" className="scrollbar-none flex items-center gap-1 overflow-x-auto border-b border-border/80">
                  {(
                    [
                      ["all", "Everything"],
                      ["listing", "Listings"],
                      ["professional", "Professionals"],
                      ["job", "Jobs"],
                      ["firm", "Firms"],
                      ["event", "Training"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={scope === value}
                      onClick={() => { setSeeAll(null); setScope(value); setFlatLimit(FLAT_PAGE_SIZE); }}
                      className={cn(
                        "relative min-h-11 shrink-0 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors sm:px-4",
                        scope === value
                          ? "border-primary text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {label}
                      {value !== "all" ? (
                        <span className="ml-1.5 font-mono text-micro tabular-nums text-muted-foreground">
                          {(value === "listing" && data?.listings.length) ||
                            (value === "professional" && data?.professionals.length) ||
                            (value === "job" && data?.jobs.length) ||
                            (value === "firm" && data?.firms.length) ||
                            (value === "event" && data?.events.length) || 0}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>

                {showPanel("listing") && !loading && benchmarks.length > 0 ? (
                  <RateBenchmarks benchmarks={benchmarks} />
                ) : null}

                {!loading ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      aria-pressed={remoteOnly}
                      onClick={() => {
                        setRemoteOnly((value) => !value);
                        setFlatLimit(FLAT_PAGE_SIZE);
                      }}
                      className={cn(
                        "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-xs font-medium transition-colors",
                        remoteOnly
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border/80 bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <Globe2 className="size-3.5" aria-hidden="true" />
                      Remote only
                    </button>
                    {countries.length > 0 ? (
                      <Select
                        value={country || "all"}
                        onValueChange={(value) => {
                          setCountry(value === "all" ? "" : value);
                          setFlatLimit(FLAT_PAGE_SIZE);
                        }}
                      >
                        <SelectTrigger
                          aria-label="Filter by country"
                          className="h-10 w-[190px] rounded-full text-xs"
                        >
                          <SelectValue placeholder="All countries" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All countries</SelectItem>
                          {countries.map((name) => (
                            <SelectItem key={name} value={name}>
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}
                    {remoteOnly || country ? (
                      <button
                        type="button"
                        onClick={() => {
                          setRemoteOnly(false);
                          setCountry("");
                        }}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Clear location filters
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {(scope === "all" || scope === "listing") && !loading ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mr-1 text-xs font-medium text-muted-foreground">Gear category</span>
                    {(
                      [
                        ["all", "Everything"],
                        ["instrument", "Instruments"],
                        ["accessory", "Accessories"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={listingCategory === value}
                        onClick={() => {
                          setListingCategory(value);
                          setFlatLimit(FLAT_PAGE_SIZE);
                        }}
                        className={cn(
                          "min-h-10 rounded-full border px-4 text-xs font-medium transition-colors",
                          listingCategory === value
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border/80 bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

          {failed ? (
            <LoadErrorPanel failure={failure} onRetry={retry} />
          ) : loading ? (
            <RailsSkeleton />
          ) : flatMode ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  {flatItems.length === 0
                    ? "No results match your filters."
                    : `Showing ${visibleFlatItems.length} of ${flatItems.length} results${seeAll ? ` in ${seeAll.title}` : ""}`}
                </p>
                <Button type="button" variant="outline" size="sm" onClick={clearFlatMode} className="min-h-10 px-4 text-xs">
                  Back to discovery
                </Button>
              </div>
              {flatItems.length === 0 ? (
                <div className="flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-14 text-center">
                  <Search className="size-8 text-muted-foreground/60" aria-hidden="true" />
                  <h3 className="mt-4 text-base font-semibold text-foreground">No matches found</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Try a different search or clear your filters.</p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-5 min-h-10"
                    onClick={() => {
                      clearFlatMode();
                      setScope("all");
                      setListingCategory("all");
                      setRemoteOnly(false);
                      setCountry("");
                    }}
                  >
                    Clear search and filters
                  </Button>
                </div>
              ) : (
                <>
                  <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border/80 bg-card shadow-[0_1px_2px_rgba(15,23,20,0.03)]">
                    {visibleFlatItems.map((item) => (
                      <FlatResultRow
                        key={`${item.kind}:${item.id}`}
                        item={item}
                        highlighted={highlighted?.kind === item.kind && highlighted.id === item.id}
                        onOpen={() => handleItemSelect(item)}
                      />
                    ))}
                  </ul>
                  {visibleFlatItems.length < flatItems.length ? (
                    <div className="flex justify-center">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => setFlatLimit((value) => value + FLAT_PAGE_SIZE)}
                      >
                        Load more ({flatItems.length - visibleFlatItems.length} remaining)
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : visibleRails.some((rail) => rail.items.length > 0) ? (
            <div className="space-y-12">
              {visibleRails.map((rail) => (
                <MarketRail
                  key={rail.id}
                  rail={rail}
                  highlightedId={highlighted?.id ?? null}
                  onSelect={handleItemSelect}
                  onSeeAll={handleSeeAll}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-14 text-center">
              <PackageSearch className="size-8 text-muted-foreground/60" aria-hidden="true" />
              <h3 className="mt-4 text-base font-semibold text-foreground">Nothing in this section yet</h3>
              <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">Try another category or reset the filters to explore the full market.</p>
              <Button
                type="button"
                variant="outline"
                className="mt-5 min-h-10"
                onClick={() => {
                  clearFlatMode();
                  setScope("all");
                  setListingCategory("all");
                  setRemoteOnly(false);
                  setCountry("");
                }}
              >
                Reset filters
              </Button>
            </div>
          )}
          </div>
        </section>

        <section aria-label="Web3 market terminal" className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
          <Web3MarketTerminal
            snapshot={market.snapshot}
            loading={market.loading}
            error={market.error}
            onRefresh={market.refresh}
          />
        </section>
      </main>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 sm:px-6">
          <p className="text-xs text-muted-foreground">
            Published by SiteSurveyor workspaces · refreshes live
          </p>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {(
              [
                ["listing", "Listings"],
                ["professional", "Pros"],
                ["job", "Jobs"],
                ["firm", "Firms"],
                ["event", "Training"],
              ] as const
            ).map(([kind, label]) => (
              <span key={kind} className="flex items-center gap-1.5">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: MARKET_DOT_COLORS[kind] }}
                  aria-hidden="true"
                />
                {label}
              </span>
            ))}
          </p>
        </div>
      </footer>

      <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
        <SheetContent side="bottom" className="web3-theme flex max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-t-3xl p-0">
          <SheetHeader className="shrink-0 border-b border-border/80 px-5 py-5 pr-14 text-left">
            <SheetTitle className="market-sheet-title">Filter the market</SheetTitle>
            <SheetDescription>Choose what to discover and how to order it.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
            <fieldset>
              <legend className="mb-3 text-sm font-semibold text-foreground">Marketplace section</legend>
              <div className="grid grid-cols-2 gap-2.5">
                {([["all", "Everything"], ["listing", "Listings"], ["professional", "Professionals"], ["job", "Jobs"], ["firm", "Firms"], ["event", "Training"]] as const).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    variant={scope === value ? "default" : "outline"}
                    className="min-h-11 justify-start px-3.5 text-sm font-medium"
                    onClick={() => { setSeeAll(null); setScope(value); setFlatLimit(FLAT_PAGE_SIZE); }}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </fieldset>

            {(scope === "all" || scope === "listing") ? (
              <fieldset>
                <legend className="mb-3 text-sm font-semibold text-foreground">Gear category</legend>
                <div className="grid grid-cols-3 gap-2">
                  {([["all", "All"], ["instrument", "Instruments"], ["accessory", "Accessories"]] as const).map(([value, label]) => (
                    <Button
                      key={value}
                      type="button"
                      variant={listingCategory === value ? "default" : "outline"}
                      className="min-h-11 px-2 text-xs"
                      onClick={() => { setListingCategory(value); setFlatLimit(FLAT_PAGE_SIZE); }}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <fieldset>
              <legend className="mb-3 text-sm font-semibold text-foreground">Location</legend>
              <div className="space-y-2.5">
                <Button
                  type="button"
                  variant={remoteOnly ? "default" : "outline"}
                  className="min-h-11 w-full justify-start px-3.5 text-sm font-medium"
                  aria-pressed={remoteOnly}
                  onClick={() => setRemoteOnly((value) => !value)}
                >
                  <Globe2 className="mr-2 size-4" aria-hidden="true" />
                  Remote only
                </Button>
                {countries.length > 0 ? (
                  <Select
                    value={country || "all"}
                    onValueChange={(value) => setCountry(value === "all" ? "" : value)}
                  >
                    <SelectTrigger aria-label="Filter by country" className="h-11 w-full text-sm">
                      <SelectValue placeholder="All countries" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All countries</SelectItem>
                      {countries.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
              </div>
            </fieldset>

            <div>
              <label className="mb-3 block text-sm font-semibold text-foreground">Sort results</label>
              <Select value={sort} onValueChange={(value) => { setSort(value as SortKey); setFlatLimit(FLAT_PAGE_SIZE); }}>
                <SelectTrigger aria-label="Mobile sort results" className="h-11 w-full text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="popular">Most saved</SelectItem>
                  <SelectItem value="price-asc">Price: low to high</SelectItem>
                  <SelectItem value="price-desc">Price: high to low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="shrink-0 border-t border-border/80 bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button className="h-12 w-full text-sm font-semibold" onClick={() => setMobileFiltersOpen(false)}>
              Show marketplace results
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <MarketDetailDialog
        dot={selectedDot}
        listing={selectedListing}
        professional={selectedProfessional}
        job={selectedJob}
        firm={selectedFirm}
        event={selectedEvent}
        onClose={handleDialogClose}
        allowRequest
        onOpenInApp={
          user
            ? (view, id) => {
                const query =
                  view === "professionals" && id
                    ? `?view=professionals&professional=${encodeURIComponent(id)}`
                    : `?view=${view}`;
                navigate(`/${query}`);
              }
            : undefined
        }
      />
    </div>
  );
}

// ── Pulse strip ─────────────────────────────────────────────────────────────

function MarketPulseStrip({
  data,
  addedThisWeek,
}: {
  data: MarketData;
  addedThisWeek: number;
}) {
  const countrySet = new Set<string>();
  for (const row of [
    ...data.listings,
    ...data.professionals,
    ...data.jobs,
    ...data.firms,
  ]) {
    countrySet.add(countryOf(row.location));
  }

  const stats: { label: string; value: number; color: string }[] = [
    { label: "Instruments & gear", value: data.listings.length, color: MARKET_DOT_COLORS.listing },
    { label: "Professionals", value: data.professionals.length, color: MARKET_DOT_COLORS.professional },
    { label: "Open jobs", value: data.jobs.length, color: MARKET_DOT_COLORS.job },
    { label: "Firms", value: data.firms.length, color: MARKET_DOT_COLORS.firm },
    { label: "Trainings", value: data.events.length, color: MARKET_DOT_COLORS.event },
    { label: "Countries", value: countrySet.size, color: "" },
    { label: "Added this week", value: addedThisWeek, color: "" },
  ];

  return (
    <section aria-label="Market pulse" className="mx-auto w-full max-w-7xl px-4 sm:px-6">
      <div className="scrollbar-none flex snap-x overflow-x-auto rounded-2xl border border-border/80 bg-card">
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-[142px] flex-1 snap-start border-r border-border/80 px-4 py-4 last:border-r-0">
            <p className="flex items-center gap-2 font-mono text-xl font-semibold leading-none tabular-nums text-foreground">
              {stat.color ? <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: stat.color }} aria-hidden="true" /> : null}
              {stat.value}
            </p>
            <p className="mt-2 whitespace-nowrap text-micro text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function MarketPulseStripSkeleton() {
  return (
    <section aria-hidden="true" className="mx-auto w-full max-w-7xl px-4 sm:px-6">
      <div className="flex overflow-hidden rounded-2xl border border-border/80 bg-card">
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={index} className="min-w-[142px] flex-1 border-r border-border/80 px-4 py-4 last:border-r-0">
            <div className="h-5 w-10 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-3 w-20 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading market pulse…</span>
    </section>
  );
}

// ── Benchmarks ──────────────────────────────────────────────────────────────

function RateBenchmarks({
  benchmarks,
}: {
  benchmarks: { type: string; median: number; count: number }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-border/70 bg-muted/25 px-3 py-2">
      <span className="text-micro font-semibold uppercase tracking-wider text-muted-foreground">
        Day-rate benchmarks
      </span>
      {benchmarks.map(({ type, median, count }) => (
        <span key={type} className="inline-flex items-baseline gap-1 text-xs">
          <span className="font-medium text-foreground">{type}</span>
          <span className="font-mono font-semibold tabular-nums text-warning">
            ${median.toLocaleString()}
          </span>
          <span className="text-muted-foreground">/day</span>
          <span className="text-micro text-muted-foreground/80">({count})</span>
        </span>
      ))}
    </div>
  );
}

// ── Shared bits ─────────────────────────────────────────────────────────────

function LoadErrorPanel({
  failure,
  onRetry,
}: {
  failure: LoadFailure;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-none border border-border bg-card px-6 py-14 text-center shadow-sm">
      <Globe2 className="mx-auto size-9 text-muted-foreground/50" aria-hidden="true" />
      <h3 className="mt-4 text-lg font-semibold">
        Couldn&rsquo;t reach the market
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {failure.reason === "timeout"
          ? "The request didn't complete in time — check your connection."
          : "The market data couldn't be loaded."}
      </p>
      {failure.missingRelation ? (
        <p className="mx-auto mt-3 max-w-md rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-left text-xs text-warning">
          public_market views not found — apply backend/sql migrations 0001–0004
          to this Supabase project (supabase db push).
        </p>
      ) : null}
      <Button size="sm" variant="outline" onClick={onRetry} className="mt-5">
        <RefreshCw className="mr-1.5 size-3.5" aria-hidden="true" />
        Try again
      </Button>
    </div>
  );
}

function RailsSkeleton() {
  return (
    <div className="space-y-10" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i}>
          <div className="mb-4 h-5 w-48 animate-pulse rounded bg-muted" />
          <div className="flex gap-4 overflow-hidden">
            {[0, 1, 2, 3].map((j) => (
              <div key={j} className="h-44 w-[240px] shrink-0 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        </div>
      ))}
      <span className="sr-only">Loading market registry…</span>
    </div>
  );
}
