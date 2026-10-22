/*
Design contract — /market public surface (REVISED after user review: light
theme pinned over the earlier mission-control dark world): THESIS: the open
market as a live directory — an edge-to-edge light basemap globe carrying the
headline over a legibility scrim, a market-pulse stat strip, then divided
registry rows instead of card grids.
OWN-WORLD: app shadcn tokens throughout (background, card, muted, border,
primary); one accent hue per directory kind carried from data — amber =
listings/instruments, cyan = professionals, violet = jobs, emerald = firms,
rose = training — echoed in pins, ticks, legend, stat cards and hover tints;
tabular numerals for prices/rates/counts; no custom display face. STORY:
visitor sees Earth and its pinned activity in seconds, reads scale from the
pulse strip and HUD pills, narrows by kind/location/sort, paginates through
registry sections (Previous / Next), opens a detail dialog with a sign-in
path. FIRST VIEWPORT: slim sticky header, then the full-width globe at ~68vh
with the display heading bottom-left over a scrim, telemetry pill top-left,
legend bottom-right, cursor coordinate pill top-right. SIGNATURE: live
lat/lng readout tracking the cursor; pins reveal once like acquired plots;
day-rate benchmark chips computed live from hire listings. FINISH:
unreviewed and undocumented is unfinished; this build ends with the finish
review, the verdict, and DESIGN.md.
*/
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  BadgeCheck,
  Briefcase,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Globe2,
  GraduationCap,
  HardHat,
  LayoutGrid,
  LayoutList,
  LogOut,
  MapPin,
  PackageSearch,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Tag,
  UserRound,
  X,
  Bookmark,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "../../lib/utils.ts";
import { portfolioMediaUrl } from "../../lib/repositories/portfolioMedia.ts";
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
import { getSavedMarketSearch, saveMarketSearch, removeMarketSearch } from "../../lib/repositories/marketPreferences.ts";
import "../../styles/web3.css";


type Scope = "all" | "listing" | "professional" | "job" | "firm" | "event";
type SortKey = "newest" | "price-asc" | "price-desc";
type ListingCategory = "all" | "instrument" | "accessory";

/** Registry items per page — keeps grid rows balanced. */
const REGISTRY_PAGE_SIZE = 6;

const NEW_WINDOW_MS = 7 * 24 * 60 * 60_000;

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

function isNew(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false;
  const time = Date.parse(createdAt);
  if (!Number.isFinite(time)) return false;
  const age = Date.now() - time;
  return age >= 0 && age < NEW_WINDOW_MS;
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
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
  const [listingPage, setListingPage] = useState(1);
  const [professionalPage, setProfessionalPage] = useState(1);
  const [jobPage, setJobPage] = useState(1);
  const [firmPage, setFirmPage] = useState(1);
  const [eventPage, setEventPage] = useState(1);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const registryRef = useRef<HTMLDivElement | null>(null);
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

  const resetRegistryPages = () => {
    setListingPage(1);
    setProfessionalPage(1);
    setJobPage(1);
    setFirmPage(1);
    setEventPage(1);
  };

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

  // ── Derived: pagination (clamped during render; no effects) ──

  const pageCount = (total: number) =>
    Math.max(1, Math.ceil(total / REGISTRY_PAGE_SIZE));

  const listingPageCount = pageCount(sortedListings.length);
  const professionalPageCount = pageCount(sortedProfessionals.length);
  const jobPageCount = pageCount(sortedJobs.length);
  const firmPageCount = pageCount(sortedFirms.length);
  const eventPageCount = pageCount(sortedEvents.length);

  const sliceFor = <T,>(rows: T[], rawPage: number, count: number): T[] => {
    const page = Math.min(rawPage, count);
    return rows.slice((page - 1) * REGISTRY_PAGE_SIZE, page * REGISTRY_PAGE_SIZE);
  };

  const listingSlice = sliceFor(sortedListings, listingPage, listingPageCount);
  const professionalSlice = sliceFor(
    sortedProfessionals,
    professionalPage,
    professionalPageCount,
  );
  const jobSlice = sliceFor(sortedJobs, jobPage, jobPageCount);
  const firmSlice = sliceFor(sortedFirms, firmPage, firmPageCount);
  const eventSlice = sliceFor(sortedEvents, eventPage, eventPageCount);

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

        {/* Map Section: clean, expansive viewport that fills well without any text blocking */}
        <section aria-label="Interactive market map" className="relative w-full">
          <Suspense fallback={<div className="h-[500px] sm:h-[600px] lg:h-[660px] w-full bg-muted/30 animate-pulse" />}>
            <PublicMarketGlobe
              dots={dots}
              totalPoints={totalPoints}
              failed={failed}
              onSelect={(dot) => setSelectedId({ kind: dot.kind, id: dot.id })}
              onRetry={retry}
            />
          </Suspense>
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
                    onClick={() => setScope(value)}
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
                      resetRegistryPages();
                    }}
                    className="pl-9 pr-9"
                  />
                  {search ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch("");
                        resetRegistryPages();
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
                  onValueChange={(value) => setSort(value as SortKey)}
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
                <div className="hidden sm:flex items-center rounded-lg border border-border/80 bg-card p-0.5 shadow-xs">
                  <button
                    type="button"
                    onClick={() => setViewMode("grid")}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                      viewMode === "grid"
                        ? "bg-accent-bg font-semibold text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    aria-label="Grid view"
                    title="Grid view"
                  >
                    <LayoutGrid className="size-3.5" />
                    <span className="hidden sm:inline">Cards</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                      viewMode === "table"
                        ? "bg-accent-bg font-semibold text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    aria-label="Table list view"
                    title="Table list view"
                  >
                    <LayoutList className="size-3.5" />
                    <span className="hidden sm:inline">Rows</span>
                  </button>
                </div>
                <Button type="button" variant="outline" size="icon" className="sm:hidden" onClick={() => setMobileFiltersOpen((value) => !value)} aria-expanded={mobileFiltersOpen} aria-label="Toggle marketplace filters">
                  <SlidersHorizontal className="size-4" aria-hidden="true" />
                </Button>
                </div>
              </div>
            </div>

            {showPanel("listing") && !loading && benchmarks.length > 0 ? (
              <RateBenchmarks benchmarks={benchmarks} />
            ) : null}
          </div>

          {failed ? (
            <LoadErrorPanel failure={failure} onRetry={retry} />
          ) : loading ? (
            <div className="space-y-10">
              <SkeletonPanel label="Listings" />
              <SkeletonPanel label="Professionals" />
            </div>
          ) : (
            <>
              {showPanel("listing") ? (
                <RegistryPanel
                  title="Listings"
                  count={sortedListings.length}
                  emptyLabel={
                    (data?.listings ?? []).length === 0
                      ? "No instruments published yet."
                      : "No listings match your search."
                  }
                  isEmpty={sortedListings.length === 0}
                  viewMode={viewMode}
                  filterHeader={
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
                            setListingPage(1);
                          }}
                          className={cn(
                            "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors border",
                            listingCategory === value
                              ? "bg-primary text-primary-foreground border-primary shadow-xs"
                              : "border-border/80 bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                        >
                          {label}
                          <span className="ml-1.5 font-mono tabular-nums opacity-80">
                            {value === "all"
                              ? (data?.listings ?? []).length
                              : (data?.listings ?? []).filter(
                                  (row) => row.category === value,
                                ).length}
                          </span>
                        </button>
                      ))}
                    </div>
                  }
                  pagination={
                    <Pagination
                      page={Math.min(listingPage, listingPageCount)}
                      pageCount={listingPageCount}
                      onPage={setListingPage}
                      ariaLabel="Listings pagination"
                    />
                  }
                >
                  {viewMode === "grid"
                    ? listingSlice.map((row) => (
                        <ListingCardItem
                          key={row.id}
                          row={row}
                          onOpen={() =>
                            setSelectedId({ kind: "listing", id: row.id })
                          }
                        />
                      ))
                    : listingSlice.map((row) => (
                        <ListingRowItem
                          key={row.id}
                          row={row}
                          onOpen={() =>
                            setSelectedId({ kind: "listing", id: row.id })
                          }
                        />
                      ))}
                </RegistryPanel>
              ) : null}

              {showPanel("professional") ? (
                <RegistryPanel
                  title="Professionals"
                  count={sortedProfessionals.length}
                  emptyLabel={
                    (data?.professionals ?? []).length === 0
                      ? "No professionals published yet."
                      : "No professionals match your search."
                  }
                  isEmpty={sortedProfessionals.length === 0}
                  viewMode={viewMode}
                  pagination={
                    <Pagination
                      page={Math.min(professionalPage, professionalPageCount)}
                      pageCount={professionalPageCount}
                      onPage={setProfessionalPage}
                      ariaLabel="Professionals pagination"
                    />
                  }
                >
                  {viewMode === "grid"
                    ? professionalSlice.map((row) => (
                        <ProfessionalCardItem
                          key={row.id}
                          row={row}
                          onOpen={() =>
                            setSelectedId({ kind: "professional", id: row.id })
                          }
                        />
                      ))
                    : professionalSlice.map((row) => (
                        <ProfessionalRowItem
                          key={row.id}
                          row={row}
                          onOpen={() =>
                            setSelectedId({ kind: "professional", id: row.id })
                          }
                        />
                      ))}
                </RegistryPanel>
              ) : null}

              {showPanel("job") ? (
                <RegistryPanel
                  title="Open Jobs"
                  count={sortedJobs.length}
                  emptyLabel={
                    (data?.jobs ?? []).length === 0
                      ? "No jobs published yet."
                      : "No jobs match your search."
                  }
                  isEmpty={sortedJobs.length === 0}
                  viewMode={viewMode}
                  pagination={
                    <Pagination
                      page={Math.min(jobPage, jobPageCount)}
                      pageCount={jobPageCount}
                      onPage={setJobPage}
                      ariaLabel="Jobs pagination"
                    />
                  }
                >
                  {viewMode === "grid"
                    ? jobSlice.map((row) => (
                        <JobCardItem
                          key={row.id}
                          row={row}
                          onOpen={() => setSelectedId({ kind: "job", id: row.id })}
                        />
                      ))
                    : jobSlice.map((row) => (
                        <JobRowItem
                          key={row.id}
                          row={row}
                          onOpen={() => setSelectedId({ kind: "job", id: row.id })}
                        />
                      ))}
                </RegistryPanel>
              ) : null}

              {showPanel("firm") ? (
                <RegistryPanel
                  title="Survey Firms"
                  count={sortedFirms.length}
                  emptyLabel={
                    (data?.firms ?? []).length === 0
                      ? "No firms listed yet."
                      : "No firms match your search."
                  }
                  isEmpty={sortedFirms.length === 0}
                  viewMode={viewMode}
                  pagination={
                    <Pagination
                      page={Math.min(firmPage, firmPageCount)}
                      pageCount={firmPageCount}
                      onPage={setFirmPage}
                      ariaLabel="Firms pagination"
                    />
                  }
                >
                  {viewMode === "grid"
                    ? firmSlice.map((row) => (
                        <FirmCardItem
                          key={row.id}
                          row={row}
                          onOpen={() =>
                            setSelectedId({ kind: "firm", id: row.id })
                          }
                        />
                      ))
                    : firmSlice.map((row) => (
                        <FirmRowItem
                          key={row.id}
                          row={row}
                          onOpen={() =>
                            setSelectedId({ kind: "firm", id: row.id })
                          }
                        />
                      ))}
                </RegistryPanel>
              ) : null}

              {showPanel("event") ? (
                <RegistryPanel
                  title="Training & Events"
                  count={sortedEvents.length}
                  emptyLabel={
                    (data?.events ?? []).length === 0
                      ? "No training published yet."
                      : "No training matches your search."
                  }
                  isEmpty={sortedEvents.length === 0}
                  viewMode={viewMode}
                  pagination={
                    <Pagination
                      page={Math.min(eventPage, eventPageCount)}
                      pageCount={eventPageCount}
                      onPage={setEventPage}
                      ariaLabel="Training pagination"
                    />
                  }
                >
                  {viewMode === "grid"
                    ? eventSlice.map((row) => (
                        <EventCardItem
                          key={row.id}
                          row={row}
                          onOpen={() =>
                            setSelectedId({ kind: "event", id: row.id })
                          }
                        />
                      ))
                    : eventSlice.map((row) => (
                        <EventRowItem
                          key={row.id}
                          row={row}
                          onOpen={() =>
                            setSelectedId({ kind: "event", id: row.id })
                          }
                        />
                      ))}
                </RegistryPanel>
              ) : null}
            </>
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
                <Button key={value} type="button" variant={scope === value ? "default" : "outline"} onClick={() => { setScope(value); resetRegistryPages(); }}>
                  {label}
                </Button>
              ))}
            </div>
            <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
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
        onClose={() => setSelectedId(null)}
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

function NewBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
      New
    </span>
  );
}

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

function SkeletonPanel({ label }: { label: string }) {
  return (
    <div aria-hidden="true">
      <div className="mb-4 h-5 w-36 animate-pulse rounded bg-muted" />
      <div className="overflow-hidden rounded-none border border-border">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between border-b border-border/60 px-4 py-4 last:border-b-0"
          >
            <div className="h-3.5 w-48 animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-24 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading {label.toLowerCase()}…</span>
    </div>
  );
}

function RegistryPanel({
  title,
  count,
  isEmpty,
  emptyLabel,
  pagination,
  viewMode = "grid",
  filterHeader,
  children,
}: {
  title: string;
  count: number;
  isEmpty: boolean;
  emptyLabel: string;
  pagination: ReactNode;
  viewMode?: "grid" | "table";
  filterHeader?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <span className="mr-1 size-2 rounded-full bg-primary" aria-hidden="true" />
          {title}
          <span className="ml-1 align-middle font-mono text-xs font-normal tabular-nums text-muted-foreground">
            ({count})
          </span>
        </h2>
      </div>

      {filterHeader}

      {isEmpty ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            className="mx-auto size-7 text-muted-foreground/50"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="7" />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
            <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
          </svg>
          <p className="mt-3 text-sm text-muted-foreground">{emptyLabel}</p>
        </div>
      ) : viewMode === "grid" ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {children}
          </div>
          {pagination}
        </>
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border/80 bg-card shadow-[0_1px_2px_rgba(15,23,20,0.03)]">
            {children}
          </ul>
          {pagination}
        </>
      )}
    </section>
  );
}

function Pagination({
  page,
  pageCount,
  onPage,
  ariaLabel,
}: {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
  ariaLabel: string;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav
      aria-label={ariaLabel}
      className="mt-4 flex items-center justify-between gap-3"
    >
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
      >
        <ChevronLeft className="mr-1 size-3.5" aria-hidden="true" />
        Previous
      </Button>
      <p
        className="font-mono text-xs tabular-nums text-muted-foreground"
        aria-live="polite"
      >
        Page {page} of {pageCount}
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPage(page + 1)}
        disabled={page >= pageCount}
      >
        Next
        <ChevronRight className="ml-1 size-3.5" aria-hidden="true" />
      </Button>
    </nav>
  );
}

function RowShell({
  onClick,
  accent,
  icon,
  children,
  ariaLabel,
}: {
  onClick: () => void;
  accent: string;
  icon: ReactNode;
  children: ReactNode;
  ariaLabel: string;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className="group flex w-full items-center gap-3 border-l-2 border-transparent px-4 py-4 text-left transition-[background,border-color,transform] hover:-translate-y-px hover:border-l-current hover:bg-muted/60 focus-visible:bg-muted/60"
      >
        <span
          className="size-2 shrink-0 rounded-full transition-transform group-hover:scale-125"
          style={{ backgroundColor: accent }}
          aria-hidden="true"
        />
        {children}
        {icon}
      </button>
    </li>
  );
}

// ── Registry rows ───────────────────────────────────────────────────────────

function ListingRowItem({
  row,
  onOpen,
}: {
  row: ListingRow;
  onOpen: () => void;
}) {
  return (
    <RowShell
      onClick={onOpen}
      accent={MARKET_DOT_COLORS.listing}
      icon={
        <Briefcase
          className="size-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground"
          aria-hidden="true"
        />
      }
      ariaLabel={`${row.name}, ${row.type}, ${row.price.toLocaleString()} ${row.currency}${row.listing_type === "hire" ? " per day" : ""}, ${row.location}`}
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate font-medium transition-colors group-hover:text-amber-700">
          <span className="truncate">{row.name}</span>
          {isNew(row.created_at) ? <NewBadge /> : null}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {row.category === "accessory" ? "Accessory" : row.type}
          {row.condition ? ` · ${row.condition}` : ""}
          {row.listing_type === "hire" ? " · hire" : ""}
          <span className="sm:hidden"> · {row.location}</span>
        </p>
      </div>
      <div className="hidden min-w-0 shrink basis-40 items-center gap-1 text-xs text-muted-foreground sm:flex">
        <MapPin className="size-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{row.location}</span>
      </div>
      <p className="shrink-0 text-sm font-semibold tabular-nums">
        {row.price.toLocaleString()}
        <span className="ml-1 text-xs font-normal text-muted-foreground">{row.currency}</span>
        {row.listing_type === "hire" ? (
          <span className="text-xs font-normal text-muted-foreground">/day</span>
        ) : null}
      </p>
    </RowShell>
  );
}

function ProfessionalRowItem({
  row,
  onOpen,
}: {
  row: ProfessionalRow;
  onOpen: () => void;
}) {
  return (
    <RowShell
      onClick={onOpen}
      accent={MARKET_DOT_COLORS.professional}
      icon={
        <UserRound
          className="size-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground"
          aria-hidden="true"
        />
      }
      ariaLabel={`${row.name}, ${row.title}, ${row.rate.toLocaleString()} ${row.currency} per ${row.rate_per}, ${row.location}`}
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate font-medium transition-colors group-hover:text-cyan-700">
          <span className="truncate">{row.name}</span>
          {row.is_verified ? (
            <BadgeCheck
              className="size-3.5 shrink-0 text-cyan-600"
              aria-label="Verified"
            />
          ) : null}
          {isNew(row.created_at) ? <NewBadge /> : null}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {row.title} · {row.discipline} · {row.experience}
          <span className="sm:hidden"> · {row.location}</span>
        </p>
      </div>
      <div className="hidden min-w-0 shrink basis-40 items-center gap-1 text-xs text-muted-foreground sm:flex">
        <MapPin className="size-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{row.location}</span>
      </div>
      <p className="shrink-0 text-sm font-semibold tabular-nums">
        {row.rating != null && row.rating > 0 ? `${row.rating.toFixed(1)}★ ` : ""}
        {row.rate.toLocaleString()}
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          {row.currency}/{row.rate_per}
        </span>
      </p>
    </RowShell>
  );
}

function JobRowItem({ row, onOpen }: { row: JobRow; onOpen: () => void }) {
  return (
    <RowShell
      onClick={onOpen}
      accent={MARKET_DOT_COLORS.job}
      icon={
        <HardHat
          className="size-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground"
          aria-hidden="true"
        />
      }
      ariaLabel={`${row.title}, ${row.discipline}, ${row.location}`}
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate font-medium transition-colors group-hover:text-violet-700">
          <span className="truncate">{row.title}</span>
          {isNew(row.created_at) ? <NewBadge /> : null}
        </p>
        <p className="mt-0.5 truncate text-xs capitalize text-muted-foreground">
          {row.discipline} · {row.employment_type}
          <span className="sm:hidden"> · {row.location}</span>
        </p>
      </div>
      <div className="hidden min-w-0 shrink basis-40 items-center gap-1 text-xs text-muted-foreground sm:flex">
        <MapPin className="size-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{row.location}</span>
      </div>
      <p className="shrink-0 text-sm font-semibold tabular-nums">
        {row.rate != null ? (
          <>
            {row.rate.toLocaleString()}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {row.currency}/{row.rate_per ?? "day"}
            </span>
          </>
        ) : (
          <span className="text-xs font-normal text-muted-foreground">
            Negotiable
          </span>
        )}
      </p>
    </RowShell>
  );
}

function FirmRowItem({ row, onOpen }: { row: FirmRow; onOpen: () => void }) {
  return (
    <RowShell
      onClick={onOpen}
      accent={MARKET_DOT_COLORS.firm}
      icon={
        <Building2
          className="size-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground"
          aria-hidden="true"
        />
      }
      ariaLabel={`${row.name}, ${(row.services ?? []).slice(0, 3).join(", ")}, ${row.location}`}
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate font-medium transition-colors group-hover:text-emerald-700">
          <span className="truncate">{row.name}</span>
          {row.verified ? (
            <BadgeCheck
              className="size-3.5 shrink-0 text-emerald-600"
              aria-label="Verified"
            />
          ) : null}
          {isNew(row.created_at) ? <NewBadge /> : null}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {(row.services ?? []).slice(0, 3).join(" · ")}
          <span className="sm:hidden"> · {row.location}</span>
        </p>
      </div>
      <div className="hidden min-w-0 shrink basis-40 items-center gap-1 text-xs text-muted-foreground sm:flex">
        <MapPin className="size-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{row.location}</span>
      </div>
      <p className="shrink-0 hidden text-xs tabular-nums text-muted-foreground md:block">
        {row.staff_count != null ? `${row.staff_count} staff` : ""}
        {row.staff_count != null && row.founded_year != null ? " · " : ""}
        {row.founded_year != null ? `est. ${row.founded_year}` : ""}
      </p>
    </RowShell>
  );
}

function EventRowItem({ row, onOpen }: { row: EventRow; onOpen: () => void }) {
  return (
    <RowShell
      onClick={onOpen}
      accent={MARKET_DOT_COLORS.event}
      icon={
        <GraduationCap
          className="size-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground"
          aria-hidden="true"
        />
      }
      ariaLabel={`${row.title}, ${row.provider}, ${formatDate(row.starts_at)}, ${row.location}`}
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate font-medium transition-colors group-hover:text-rose-700">
          <span className="truncate">{row.title}</span>
          {isNew(row.created_at) ? <NewBadge /> : null}
        </p>
        <p className="mt-0.5 truncate text-xs capitalize text-muted-foreground">
          {row.kind} · {row.provider}
          <span className="sm:hidden"> · {row.location}</span>
        </p>
      </div>
      <div className="hidden min-w-0 shrink basis-52 items-center gap-1 text-xs text-muted-foreground sm:flex">
        <CalendarDays className="size-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{formatDate(row.starts_at)}</span>
      </div>
      <p className="shrink-0 text-sm font-semibold tabular-nums">
        {row.price > 0 ? (
          <>
            {row.price.toLocaleString()}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {row.currency}
            </span>
          </>
        ) : (
          <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Free
          </span>
        )}
        {row.seats_left != null ? (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {row.seats_left} seats
          </span>
        ) : null}
      </p>
    </RowShell>
  );
}

// ── Registry Cards ──────────────────────────────────────────────────────────

function ListingCardItem({
  row,
  onOpen,
}: {
  row: ListingRow;
  onOpen: () => void;
}) {
  const photo = row.photos && row.photos.length > 0 ? row.photos[0] : null;
  const photoUrl = photo ? portfolioMediaUrl(photo) : null;

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/80 bg-card p-0 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-amber-500/30 hover:shadow-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {photoUrl ? (
        <div className="relative h-44 w-full overflow-hidden bg-muted">
          <img
            src={photoUrl}
            alt={row.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80" />
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-background/90 px-2.5 py-0.5 text-[11px] font-semibold text-foreground backdrop-blur-xs shadow-xs">
              {row.category === "accessory" ? "Accessory" : row.type}
            </span>
            {row.listing_type === "hire" ? (
              <span className="rounded-full bg-amber-500/90 px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-xs">
                For Hire
              </span>
            ) : null}
          </div>
          {isNew(row.created_at) ? (
            <div className="absolute top-3 right-3">
              <NewBadge />
            </div>
          ) : null}
          <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-white">
            <span className="flex items-center gap-1 text-xs drop-shadow-xs font-medium">
              <MapPin className="size-3" />
              <span className="truncate">{row.location}</span>
            </span>
          </div>
        </div>
      ) : (
        <div className="relative border-b border-border/60 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent px-5 pt-5 pb-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                <Briefcase className="size-4" />
              </span>
              <span className="rounded-full border border-border/80 bg-background px-2.5 py-0.5 text-[11px] font-semibold text-foreground">
                {row.category === "accessory" ? "Accessory" : row.type}
              </span>
              {row.listing_type === "hire" ? (
                <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                  Hire
                </span>
              ) : null}
            </div>
            {isNew(row.created_at) ? <NewBadge /> : null}
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col justify-between p-5">
        <div>
          {!photoUrl && (
            <div className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{row.location}</span>
            </div>
          )}
          <h3 className="line-clamp-2 text-base font-bold tracking-tight text-foreground transition-colors group-hover:text-amber-700">
            {row.name}
          </h3>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {row.condition ? (
              <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                Condition: {row.condition}
              </span>
            ) : null}
            {row.seller ? (
              <span className="rounded-md bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground truncate max-w-[180px]">
                By {row.seller}
              </span>
            ) : null}
          </div>

          {row.specs && row.specs.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1">
              {row.specs.slice(0, 2).map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1 rounded bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground"
                >
                  <Tag className="size-2.5 text-muted-foreground/60" />
                  <span className="truncate max-w-[140px]">{s}</span>
                </span>
              ))}
              {row.specs.length > 2 ? (
                <span className="text-[10px] text-muted-foreground self-center">
                  +{row.specs.length - 2} more
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex items-end justify-between border-t border-border/60 pt-3">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {row.listing_type === "hire" ? "Daily Rate" : "Price"}
            </span>
            <p className="font-mono text-lg font-bold tabular-nums text-foreground">
              {row.price.toLocaleString()}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                {row.currency}
                {row.listing_type === "hire" ? "/day" : ""}
              </span>
            </p>
          </div>
          <span className="flex items-center gap-1 text-xs font-semibold text-primary transition-transform group-hover:translate-x-0.5">
            View
            <ArrowUpRight className="size-3.5" />
          </span>
        </div>
      </div>
    </div>
  );
}

function ProfessionalCardItem({
  row,
  onOpen,
}: {
  row: ProfessionalRow;
  onOpen: () => void;
}) {
  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/80 bg-card p-5 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-cyan-500/30 hover:shadow-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 font-mono text-sm font-bold text-cyan-700 ring-2 ring-cyan-500/20">
              {initialsOf(row.name)}
            </div>
            <div className="min-w-0">
              <h3 className="flex items-center gap-1.5 text-base font-bold tracking-tight text-foreground transition-colors group-hover:text-cyan-700">
                <span className="truncate">{row.name}</span>
                {row.is_verified ? (
                  <BadgeCheck className="size-4 shrink-0 text-cyan-600" aria-label="Verified" />
                ) : null}
              </h3>
              <p className="truncate text-xs font-medium text-muted-foreground">
                {row.title}
              </p>
            </div>
          </div>
          {isNew(row.created_at) ? <NewBadge /> : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">{row.location}</span>
          </span>
          {row.rating != null && row.rating > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
              <Star className="size-3 fill-amber-500 text-amber-500" />
              {row.rating.toFixed(1)}
            </span>
          ) : null}
          {row.availability ? (
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              {row.availability}
            </span>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
            {row.discipline}
          </span>
          <span className="rounded-md bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground">
            {row.experience}
          </span>
        </div>

        {row.skills && row.skills.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1">
            {row.skills.slice(0, 3).map((skill) => (
              <span
                key={skill}
                className="rounded-md bg-cyan-500/5 border border-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-800 dark:text-cyan-300"
              >
                {skill}
              </span>
            ))}
            {row.skills.length > 3 ? (
              <span className="text-[10px] text-muted-foreground self-center">
                +{row.skills.length - 3} more
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex items-end justify-between border-t border-border/60 pt-3">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Rate
          </span>
          <p className="font-mono text-lg font-bold tabular-nums text-foreground">
            {row.rate.toLocaleString()}{" "}
            <span className="text-xs font-normal text-muted-foreground">
              {row.currency}/{row.rate_per}
            </span>
          </p>
        </div>
        <span className="flex items-center gap-1 text-xs font-semibold text-primary transition-transform group-hover:translate-x-0.5">
          Profile
          <ArrowUpRight className="size-3.5" />
        </span>
      </div>
    </div>
  );
}

function JobCardItem({
  row,
  onOpen,
}: {
  row: JobRow;
  onOpen: () => void;
}) {
  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/80 bg-card p-5 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-violet-500/30 hover:shadow-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600">
              <HardHat className="size-4" />
            </span>
            <span className="rounded-full bg-violet-500/10 border border-violet-500/20 px-2.5 py-0.5 text-[11px] font-semibold capitalize text-violet-700">
              {row.employment_type}
            </span>
          </div>
          {isNew(row.created_at) ? <NewBadge /> : null}
        </div>

        <h3 className="mt-3 line-clamp-2 text-base font-bold tracking-tight text-foreground transition-colors group-hover:text-violet-700">
          {row.title}
        </h3>
        <p className="mt-1 text-xs font-medium text-muted-foreground">
          {row.discipline}
        </p>

        <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3 shrink-0" />
          <span className="truncate">{row.location}</span>
        </div>

        {row.description ? (
          <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {row.description}
          </p>
        ) : null}
      </div>

      <div className="mt-5 flex items-end justify-between border-t border-border/60 pt-3">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Compensation
          </span>
          <p className="font-mono text-lg font-bold tabular-nums text-foreground">
            {row.rate != null ? (
              <>
                {row.rate.toLocaleString()}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  {row.currency}/{row.rate_per ?? "day"}
                </span>
              </>
            ) : (
              <span className="text-sm font-medium text-muted-foreground">Negotiable</span>
            )}
          </p>
        </div>
        <span className="flex items-center gap-1 text-xs font-semibold text-primary transition-transform group-hover:translate-x-0.5">
          Opening
          <ArrowUpRight className="size-3.5" />
        </span>
      </div>
    </div>
  );
}

function FirmCardItem({
  row,
  onOpen,
}: {
  row: FirmRow;
  onOpen: () => void;
}) {
  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/80 bg-card p-5 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-emerald-500/30 hover:shadow-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 ring-2 ring-emerald-500/20">
              <Building2 className="size-5" />
            </div>
            <div className="min-w-0">
              <h3 className="flex items-center gap-1.5 text-base font-bold tracking-tight text-foreground transition-colors group-hover:text-emerald-700">
                <span className="truncate">{row.name}</span>
                {row.verified ? (
                  <BadgeCheck className="size-4 shrink-0 text-emerald-600" aria-label="Verified" />
                ) : null}
              </h3>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3 shrink-0" />
                <span className="truncate">{row.location}</span>
              </div>
            </div>
          </div>
          {isNew(row.created_at) ? <NewBadge /> : null}
        </div>

        <div className="mt-3.5 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {row.staff_count != null ? (
            <span className="rounded-md bg-muted px-2 py-0.5 font-medium text-foreground">
              {row.staff_count} Staff
            </span>
          ) : null}
          {row.founded_year != null ? (
            <span className="rounded-md bg-muted/60 px-2 py-0.5">
              Est. {row.founded_year}
            </span>
          ) : null}
        </div>

        {row.about ? (
          <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {row.about}
          </p>
        ) : null}

        {row.services && row.services.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1">
            {row.services.slice(0, 3).map((service) => (
              <span
                key={service}
                className="rounded-md bg-emerald-500/5 border border-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:text-emerald-300"
              >
                {service}
              </span>
            ))}
            {row.services.length > 3 ? (
              <span className="text-[10px] text-muted-foreground self-center">
                +{row.services.length - 3} more
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex items-end justify-between border-t border-border/60 pt-3">
        <span className="text-xs font-medium text-muted-foreground">
          {row.services?.length ?? 0} Services listed
        </span>
        <span className="flex items-center gap-1 text-xs font-semibold text-primary transition-transform group-hover:translate-x-0.5">
          View Firm
          <ArrowUpRight className="size-3.5" />
        </span>
      </div>
    </div>
  );
}

function EventCardItem({
  row,
  onOpen,
}: {
  row: EventRow;
  onOpen: () => void;
}) {
  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/80 bg-card p-5 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-rose-500/30 hover:shadow-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600">
              <GraduationCap className="size-4" />
            </span>
            <span className="rounded-full bg-rose-500/10 border border-rose-500/20 px-2.5 py-0.5 text-[11px] font-semibold capitalize text-rose-700">
              {row.kind}
            </span>
          </div>
          {isNew(row.created_at) ? <NewBadge /> : null}
        </div>

        <h3 className="mt-3 line-clamp-2 text-base font-bold tracking-tight text-foreground transition-colors group-hover:text-rose-700">
          {row.title}
        </h3>
        <p className="mt-1 text-xs font-medium text-muted-foreground">
          By {row.provider}
        </p>

        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            <CalendarDays className="size-3.5 text-rose-600" />
            <span>{formatDate(row.starts_at)}</span>
          </div>
          <div className="flex items-center gap-1">
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">{row.location}</span>
          </div>
        </div>

        {row.seats_left != null ? (
          <div className="mt-3">
            <span className="inline-flex rounded-full bg-rose-500/10 border border-rose-500/20 px-2.5 py-0.5 text-[11px] font-medium text-rose-700">
              {row.seats_left} seats remaining
            </span>
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex items-end justify-between border-t border-border/60 pt-3">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Fee
          </span>
          <p className="font-mono text-lg font-bold tabular-nums text-foreground">
            {row.price > 0 ? (
              <>
                {row.price.toLocaleString()}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  {row.currency}
                </span>
              </>
            ) : (
              <span className="text-sm font-semibold uppercase text-emerald-700">
                Free
              </span>
            )}
          </p>
        </div>
        <span className="flex items-center gap-1 text-xs font-semibold text-primary transition-transform group-hover:translate-x-0.5">
          Register
          <ArrowUpRight className="size-3.5" />
        </span>
      </div>
    </div>
  );
}
