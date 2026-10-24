/*
Design contract — /market public surface (REVISED 2026-10-23: contained map +
Discovery Rails replacing the card grid): THESIS: the open market as a live
directory — a contained, bordered basemap card carrying the pins, a market-pulse
stat strip, then horizontal Discovery Rails (Fresh on the market, gear,
professionals, jobs, firms, training) with snap-scroll tiles; searching or
sorting flips the registry into a flat editorial-row results list with
Load more. OWN-WORLD: app shadcn tokens throughout; one accent hue per
directory kind carried from data — amber = listings, cyan = professionals,
violet = jobs, emerald = firms, rose = training — echoed in pins, rail
accents, legend and hover tints; tabular numerals for prices; no custom
display face. STORY: visitor sees the bordered map and its pinned activity in
seconds, browses rails, searches to flatten results, opens a detail dialog;
rail items pan the map and pins scroll the list (two-way sync). FINISH:
unreviewed and undocumented is unfinished; this build ends with the finish
review, the verdict, and DESIGN.md.
*/
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
import { MarketTicker } from "../../features/web3/components/MarketTicker.tsx";
import { SolanaMarketChart } from "../../features/web3/components/SolanaMarketChart.tsx";
import { MarketStatTiles } from "../../features/web3/components/MarketStatTiles.tsx";
import { SolanaLogoMark } from "../../features/web3/components/SolanaLogos.tsx";
import { useSolanaMarketFeed } from "../../features/web3/hooks/useSolanaMarketFeed.ts";
import { formatUsd } from "../../features/web3/lib/format.ts";
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
type SortKey = "newest" | "price-asc" | "price-desc";
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
  const [seeAll, setSeeAll] = useState<MarketRailData | null>(null);
  const [flatLimit, setFlatLimit] = useState(FLAT_PAGE_SIZE);
  const [highlighted, setHighlighted] = useState<{ kind: MarketDotKind; id: string } | null>(null);
  const registryRef = useRef<HTMLDivElement | null>(null);
  const globeRef = useRef<MarketGlobeHandle>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const [selectedId, setSelectedId] = useState<{
    kind: MarketDotKind;
    id: string;
  } | null>(null);

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

  const filteredListings = useMemo(
    () =>
      (data?.listings ?? [])
        .filter((row) => listingCategory === "all" || row.category === listingCategory)
        .filter((row) =>
          matches(search, [
            row.name,
            row.type,
            row.seller,
            row.location,
            row.description,
          ]),
        ),
    [data, search, listingCategory],
  );

  const filteredProfessionals = useMemo(
    () =>
      (data?.professionals ?? [])
        .filter((row) =>
          matches(search, [
            row.name,
            row.title,
            row.discipline,
            row.location,
            row.bio,
          ]),
        ),
    [data, search],
  );

  const filteredJobs = useMemo(
    () =>
      (data?.jobs ?? [])
        .filter((row) =>
          matches(search, [
            row.title,
            row.discipline,
            row.location,
            row.description,
          ]),
        ),
    [data, search],
  );

  const filteredFirms = useMemo(
    () =>
      (data?.firms ?? [])
        .filter((row) => matches(search, [row.name, row.location, row.about])),
    [data, search],
  );

  const filteredEvents = useMemo(
    () =>
      (data?.events ?? [])
        .filter((row) =>
          matches(search, [
            row.title,
            row.provider,
            row.kind,
            row.location,
            row.description,
          ]),
        ),
    [data, search],
  );

  // ── Derived: sorting (price where it exists; events lead with schedule) ──

  const priceDir = sort === "price-asc" ? 1 : -1;

  const sortedListings = useMemo(() => {
    const rows = [...filteredListings];
    if (sort === "newest") {
      rows.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    } else {
      rows.sort((a, b) => (a.price - b.price) * priceDir);
    }
    return rows;
  }, [filteredListings, sort, priceDir]);

  const sortedProfessionals = useMemo(() => {
    const rows = [...filteredProfessionals];
    if (sort === "newest") {
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
    if (sort === "newest") {
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
    if (sort === "newest") {
      rows.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    } else {
      rows.sort((a, b) => a.name.localeCompare(b.name));
    }
    return rows;
  }, [filteredFirms, sort]);

  const sortedEvents = useMemo(() => {
    const rows = [...filteredEvents];
    if (sort === "newest") {
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
  const totalPoints = useMemo(() => {
    if (!data) return 0;
    return buildMarketDots([
      { rows: data.listings.map(toSource), kind: "listing" },
      { rows: data.professionals.map(toSource), kind: "professional" },
      { rows: data.jobs.map(toSource), kind: "job" },
      { rows: data.firms.map(toSource), kind: "firm" },
      { rows: data.events.map(toSource), kind: "event" },
    ]).length;
  }, [data]);

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
          <span className="flex items-baseline gap-2">
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
            <span className="web3-brand-sub">/ Surveyor’s Market</span>
          </span>
          {user ? (
            <DropdownMenu
              open={marketUserMenuOpen}
              onOpenChange={setMarketUserMenuOpen}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={`hub-avatar-btn ${marketUserMenuOpen ? "open" : ""}`}
                  aria-label={`Open account menu (${user.name})`}
                >
                  <Avatar className="hub-avatar-btn-avatar">
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
                  <span className="hub-avatar-name">{user.name}</span>
                  <ChevronDown className="hub-avatar-chevron" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                forceMount
                className="hub-profile-dropdown web3-theme"
              >
                <div className="hub-profile-menu-header">
                  <Avatar className="hub-profile-menu-avatar">
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
                  <div className="hub-profile-menu-identity">
                    <span className="hub-profile-menu-name">{user.name}</span>
                    <span className="hub-profile-menu-email">{user.email}</span>
                    <Badge
                      variant={user.accountType === "business" ? "default" : "secondary"}
                      className="hub-profile-menu-badge"
                    >
                      {getWorkspaceShellAccountLabel(user)}
                    </Badge>
                  </div>
                </div>
                <DropdownMenuSeparator className="hub-profile-menu-divider" />
                <DropdownMenuItem className="hub-profile-menu-item" asChild>
                  <Link to="/">
                    <LayoutGrid /> Open your workspace
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="hub-profile-menu-divider" />
                <DropdownMenuItem className="hub-profile-menu-item" asChild>
                  <Link to="/?view=marketplace">
                    <PackageSearch /> My marketplace requests
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="hub-profile-menu-divider" />
                <DropdownMenuItem
                  className="hub-profile-menu-item hub-profile-menu-item-danger"
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
        {/* Dedicated Hero Header Banner - positioned cleanly above the map so text does not obscure map pins */}
        <section className="mx-auto w-full max-w-7xl px-4 pt-10 pb-6 sm:px-6">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div className="max-w-3xl">
              <div className="mb-3 flex flex-wrap items-center gap-2.5">
                <span className="web3-status-inline" style={{ fontSize: 12, color: "var(--web3-text-muted)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <SolanaLogoMark size={14} />
                  <span className="web3-live-dot" aria-hidden="true" />
                  Solana Mainnet Live
                </span>
                <span className="web3-mono font-semibold" style={{ fontSize: 13, color: "var(--web3-text)" }}>
                  {formatUsd(market.snapshot.price)}
                </span>
                <span
                  className={`web3-mono text-xs font-semibold ${market.snapshot.change24h !== null && market.snapshot.change24h < 0 ? "web3-delta-down" : "web3-delta-up"}`}
                >
                  {market.snapshot.change24h === null
                    ? "—"
                    : `${market.snapshot.change24h > 0 ? "+" : ""}${market.snapshot.change24h.toFixed(2)}%`}
                </span>
                <span className="text-xs text-muted-foreground">· Global Marketplace</span>
              </div>
              <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-5xl" style={{ color: "var(--web3-text)" }}>
                The Surveyor’s Market.
              </h1>
              <p className="mt-2.5 max-w-2xl text-sm leading-relaxed sm:text-base" style={{ color: "var(--web3-text-muted)" }}>
                Instruments, professionals, jobs, firms, and training —
                published live by SiteSurveyor workspaces worldwide.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={scrollToRegistry}
                className="web3-btn web3-btn-primary"
              >
                Browse the registry
                <ChevronDown className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>

        {/* Map Section: contained, bordered card inside the page container */}
        <section aria-label="Interactive market map" className="mx-auto w-full max-w-7xl px-4 sm:px-6">
          <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs">
            <Suspense
              fallback={
                <div className="h-[500px] w-full animate-pulse bg-muted/30 sm:h-[600px] lg:h-[660px]" />
              }
            >
              <PublicMarketGlobe
                ref={globeRef}
                dots={dots}
                totalPoints={totalPoints}
                failed={failed}
                onSelect={handlePinSelect}
                onRetry={retry}
              />
            </Suspense>
          </div>
        </section>

        <section
          aria-label="Web3 market terminal"
          className="mx-auto w-full max-w-7xl space-y-4 px-4 pt-8 sm:px-6"
        >
          <MarketTicker
            snapshot={market.snapshot}
            loading={market.loading}
            error={market.error}
            onRefresh={market.refresh}
          />
          <SolanaMarketChart snapshot={market.snapshot} />
          <MarketStatTiles
            snapshot={market.snapshot}
          />
        </section>

        {failed ? null : loading ? (
          <MarketPulseStripSkeleton />
        ) : (
          <MarketPulseStrip data={data} addedThisWeek={addedThisWeek} />
        )}

        <section ref={registryRef} className="mx-auto w-full max-w-7xl scroll-mt-16 space-y-10 px-4 py-10 sm:px-6 sm:py-14">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div role="group" aria-label="Filter by kind" className="flex w-full flex-wrap gap-1 rounded-lg border border-border/70 bg-card p-1 shadow-sm sm:w-fit">
                {(
                  [
                    ["all", "Everything", true],
                    ["listing", "Listings", true],
                    ["professional", "Professionals", true],
                    ["job", "Jobs", true],
                    ["firm", "Firms", true],
                    ["event", "Training", true],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={scope === value}
                    onClick={() => { setSeeAll(null); setScope(value); setFlatLimit(FLAT_PAGE_SIZE); }}
                    className={`shrink-0 whitespace-nowrap rounded-none px-3 py-1.5 text-sm transition-colors ${
                      scope === value
                        ? "bg-accent-bg font-medium text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                    {value !== "all" ? (
                      <span className="ml-2 font-mono text-xs tabular-nums text-muted-foreground">
                        {(value === "listing" && data?.listings.length) ||
                          (value === "professional" &&
                            data?.professionals.length) ||
                          (value === "job" && data?.jobs.length) ||
                          (value === "firm" && data?.firms.length) ||
                          (value === "event" && data?.events.length) || 0}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row w-full sm:items-center gap-2 lg:w-auto">
                <div className="relative min-w-0 w-full sm:flex-1 lg:w-[320px]">
                  <Search
                    className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    placeholder="Search instruments, people, places…"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setFlatLimit(FLAT_PAGE_SIZE);
                    }}
                    className="pl-9 pr-9"
                  />
                  {search ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch("");
                        setFlatLimit(FLAT_PAGE_SIZE);
                      }}
                      aria-label="Clear search"
                      className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Select
                  value={sort}
                  onValueChange={(value) => {
                    setSort(value as SortKey);
                    setFlatLimit(FLAT_PAGE_SIZE);
                  }}
                >
                  <SelectTrigger
                    aria-label="Sort results"
                    className="w-full shrink-0 sm:w-[190px]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="price-asc">Price: low to high</SelectItem>
                    <SelectItem value="price-desc">Price: high to low</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="button" variant={savedSearch ? "default" : "outline"} size="icon" onClick={toggleSavedSearch} aria-label={savedSearch ? "Remove saved search" : "Save this search"} title={savedSearch ? "Saved search" : "Save this search"}>
                  <Bookmark className="size-4" fill={savedSearch ? "currentColor" : "none"} aria-hidden="true" />
                </Button>
                <Button type="button" variant="outline" size="icon" className="sm:hidden" onClick={() => setMobileFiltersOpen((value) => !value)} aria-expanded={mobileFiltersOpen} aria-label="Toggle marketplace filters">
                  <SlidersHorizontal className="size-4" aria-hidden="true" />
                </Button>
                </div>
              </div>
            </div>

            {showPanel("listing") && !loading && benchmarks.length > 0 ? (
              <RateBenchmarks benchmarks={benchmarks} />
            ) : null}

            {(scope === "all" || scope === "listing") && !loading ? (
              <div className="mb-4 flex flex-wrap gap-2">
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
                      "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                      listingCategory === value
                        ? "border-primary bg-primary text-primary-foreground shadow-xs"
                        : "border-border/80 bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
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
                <Button type="button" variant="outline" size="sm" onClick={clearFlatMode}>
                  ← Back to rails
                </Button>
              </div>
              {flatItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    Nothing matches — try a different search or clear filters.
                  </p>
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
                        onClick={() => setFlatLimit((value) => value + FLAT_PAGE_SIZE)}
                      >
                        Load more ({flatItems.length - visibleFlatItems.length} remaining)
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : (
            <div className="space-y-10">
              {rails
                .filter((rail) => scope === "all" || rail.kinds.includes(scope as MarketDotKind))
                .map((rail) => (
                  <MarketRail
                    key={rail.id}
                    rail={rail}
                    highlightedId={highlighted?.id ?? null}
                    onSelect={handleItemSelect}
                    onSeeAll={handleSeeAll}
                  />
                ))}
            </div>
          )}
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
          <SheetContent side="bottom" className="web3-theme max-h-[85vh] rounded-t-2xl">

          <SheetHeader className="px-0">
            <SheetTitle>Filter Surveyor’s Market</SheetTitle>
            <SheetDescription>Choose a section and sorting option.</SheetDescription>
          </SheetHeader>
          <div className="space-y-5 py-4">
            <div className="grid grid-cols-2 gap-2">
              {([['all','Everything'],['listing','Listings'],['professional','Professionals'],['job','Jobs'],['firm','Firms'],['event','Training']] as const).map(([value,label]) => (
                <Button key={value} type="button" variant={scope === value ? "default" : "outline"} onClick={() => { setSeeAll(null); setScope(value); setFlatLimit(FLAT_PAGE_SIZE); }}>
                  {label}
                </Button>
              ))}
            </div>
            <Select value={sort} onValueChange={(value) => { setSort(value as SortKey); setFlatLimit(FLAT_PAGE_SIZE); }}>
              <SelectTrigger aria-label="Mobile sort results"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="newest">Newest first</SelectItem><SelectItem value="price-asc">Price: low to high</SelectItem><SelectItem value="price-desc">Price: high to low</SelectItem></SelectContent>
            </Select>
            <Button className="w-full" onClick={() => setMobileFiltersOpen(false)}>Show results</Button>
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
    <section
      aria-label="Market pulse"
      className="mx-auto w-full max-w-7xl space-y-3 px-4 pt-8 sm:px-6"
    >
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3 lg:grid-cols-7">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="group rounded-md border border-border/80 bg-card px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,20,0.03)] transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-border hover:shadow-[0_10px_24px_rgba(15,23,20,0.06)]"
          >
            <p className="flex items-center gap-1.5 font-mono text-2xl font-semibold leading-none tracking-tight tabular-nums">
              {stat.color ? (
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: stat.color }}
                  aria-hidden="true"
                />
              ) : null}
              {stat.value}
            </p>
            <p className="mt-1.5 truncate text-xs text-muted-foreground">
              {stat.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function MarketPulseStripSkeleton() {
  return (
    <section
      aria-hidden="true"
      className="mx-auto w-full max-w-6xl space-y-3 px-4 pt-10 sm:px-6"
    >
      <div className="grid grid-cols-2 min-[480px]:grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 sm:gap-3">
        {Array.from({ length: 7 }).map((_, index) => (
          <div
            key={index}
            className="rounded-none border border-border bg-card px-4 py-3.5"
          >
            <div className="h-6 w-10 animate-pulse rounded bg-muted" />
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
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Day-rate benchmarks
      </span>
      {benchmarks.map(({ type, median, count }) => (
        <span
          key={type}
          className="rounded-none border border-amber-600/25 bg-amber-500/10 px-2.5 py-1 text-xs"
        >
          <span className="font-medium">{type}</span>{" "}
          <span className="font-mono tabular-nums text-amber-800">
            ${median.toLocaleString()}
          </span>
          <span className="text-muted-foreground">/day · n={count}</span>
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
        <p className="mx-auto mt-3 max-w-md rounded-md border border-amber-600/30 bg-amber-500/10 px-3 py-2 text-left text-xs text-amber-800">
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
