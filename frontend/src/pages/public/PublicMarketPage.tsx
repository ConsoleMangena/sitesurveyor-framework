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
import { lazy, Suspense, useCallback, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowDownWideNarrow,
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
  LogOut,
  MapPin,
  PackageSearch,
  RefreshCw,
  Search,
  UserRound,
} from "lucide-react";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import { useAuthStore } from "../../lib/auth/auth-store.ts";
import { useMyAvatar } from "../../lib/hooks/useMyAvatar.ts";
import { signOut } from "../../lib/auth/session.ts";
import { getWorkspaceShellAccountLabel } from "../../features/workspace/account.ts";
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

type Scope = "all" | "listing" | "professional" | "job" | "firm" | "event";
type SortKey = "newest" | "price-asc" | "price-desc";
type ListingCategory = "all" | "instrument" | "accessory";

/** Registry rows per page — keeps the list scannable instead of endless. */
const REGISTRY_PAGE_SIZE = 5;

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
  const [marketUserMenuOpen, setMarketUserMenuOpen] = useState(false);
  const [data, setData] = useState<MarketData | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [listingCategory, setListingCategory] = useState<ListingCategory>("all");
  const [listingPage, setListingPage] = useState(1);
  const [professionalPage, setProfessionalPage] = useState(1);
  const [jobPage, setJobPage] = useState(1);
  const [firmPage, setFirmPage] = useState(1);
  const [eventPage, setEventPage] = useState(1);
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
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <span className="flex items-baseline gap-2">
            <span className="flex items-center gap-2 text-base font-semibold tracking-tight">
              <img
                src="/logo.svg"
                alt=""
                className="h-7 w-auto"
                aria-hidden="true"
              />
              SiteSurveyor
            </span>
            <span className="text-sm text-muted-foreground">/ Market</span>
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
              <DropdownMenuContent align="end" forceMount className="hub-profile-dropdown">
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
            <Button size="sm" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
          )}
        </div>
      </header>

      <main>
        <Suspense fallback={<div className="h-[68vh] min-h-[480px] w-full bg-muted/40" />}>
          <PublicMarketGlobe
            dots={dots}
            totalPoints={totalPoints}
            failed={failed}
            onSelect={(dot) => setSelectedId({ kind: dot.kind, id: dot.id })}
            onRetry={retry}
          >
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 via-black/25 to-transparent pb-8 pt-20 sm:pb-10">
              <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
                <h1 className="max-w-xl text-3xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
                  The open surveying market.
                </h1>
                <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/85 sm:text-base">
                  Instruments, professionals, jobs, firms, and training —
                  published live by SiteSurveyor workspaces worldwide.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={scrollToRegistry}
              aria-label="Scroll to the registry"
              className="absolute bottom-8 right-4 hidden flex-col items-center gap-1 text-white/85 transition-colors hover:text-white md:flex lg:hidden"
            >
              <span className="text-[11px] font-medium tracking-widest drop-shadow-sm">
                REGISTRY
              </span>
              <ChevronDown className="size-4" aria-hidden="true" />
            </button>
          </PublicMarketGlobe>
        </Suspense>

        {!failed && !loading ? (
          <MarketPulseStrip data={data} addedThisWeek={addedThisWeek} />
        ) : null}

        <section ref={registryRef} className="mx-auto w-full max-w-6xl scroll-mt-16 space-y-12 px-4 py-12 sm:px-6 sm:py-16">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div role="group" aria-label="Filter by kind" className="inline-flex w-fit flex-wrap gap-1 rounded-lg bg-muted p-1">
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
                    className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                      scope === value
                        ? "bg-background font-medium text-foreground shadow-sm"
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
              <div className="flex w-full items-center gap-2 lg:w-auto">
                <div className="relative min-w-0 flex-1 lg:w-[320px]">
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
                    className="pl-9"
                  />
                </div>
                <label className="relative shrink-0">
                  <span className="sr-only">Sort results</span>
                  <ArrowDownWideNarrow
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <select
                    value={sort}
                    onChange={(event) =>
                      setSort(event.target.value as SortKey)
                    }
                    className="h-9 appearance-none rounded-md border border-input bg-transparent py-1 pl-9 pr-8 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <option value="newest">Newest first</option>
                    <option value="price-asc">Price: low to high</option>
                    <option value="price-desc">Price: high to low</option>
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                </label>
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
                  pagination={
                    <Pagination
                      page={Math.min(listingPage, listingPageCount)}
                      pageCount={listingPageCount}
                      onPage={setListingPage}
                      ariaLabel="Listings pagination"
                    />
                  }
                >
                  <div className="flex gap-2 border-b border-border/60 bg-muted/40 px-4 py-2.5">
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
                        className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                          listingCategory === value
                            ? "bg-primary font-medium text-primary-foreground"
                            : "border border-border bg-background text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {label}
                        <span className="ml-1.5 font-mono tabular-nums opacity-70">
                          {value === "all"
                            ? (data?.listings ?? []).length
                            : (data?.listings ?? []).filter(
                                (row) => row.category === value,
                              ).length}
                        </span>
                      </button>
                    ))}
                  </div>
                  {listingSlice.map((row) => (
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
                  pagination={
                    <Pagination
                      page={Math.min(professionalPage, professionalPageCount)}
                      pageCount={professionalPageCount}
                      onPage={setProfessionalPage}
                      ariaLabel="Professionals pagination"
                    />
                  }
                >
                  {professionalSlice.map((row) => (
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
                  pagination={
                    <Pagination
                      page={Math.min(jobPage, jobPageCount)}
                      pageCount={jobPageCount}
                      onPage={setJobPage}
                      ariaLabel="Jobs pagination"
                    />
                  }
                >
                  {jobSlice.map((row) => (
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
                  pagination={
                    <Pagination
                      page={Math.min(firmPage, firmPageCount)}
                      pageCount={firmPageCount}
                      onPage={setFirmPage}
                      ariaLabel="Firms pagination"
                    />
                  }
                >
                  {firmSlice.map((row) => (
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
                  pagination={
                    <Pagination
                      page={Math.min(eventPage, eventPageCount)}
                      pageCount={eventPageCount}
                      onPage={setEventPage}
                      ariaLabel="Training pagination"
                    />
                  }
                >
                  {eventSlice.map((row) => (
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
      className="mx-auto w-full max-w-6xl space-y-3 px-4 pt-10 sm:px-6"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-none border border-border bg-card px-3.5 py-3 shadow-sm"
          >
            <p className="flex items-center gap-1.5 font-mono text-xl font-semibold tabular-nums">
              {stat.color ? (
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: stat.color }}
                  aria-hidden="true"
                />
              ) : null}
              {stat.value}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {stat.label}
            </p>
          </div>
        ))}
      </div>
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
          className="rounded-full border border-amber-600/25 bg-amber-500/10 px-2.5 py-1 text-xs"
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
    <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
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
      <div className="mb-3 h-4 w-32 animate-pulse rounded bg-muted" />
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
  children,
}: {
  title: string;
  count: number;
  isEmpty: boolean;
  emptyLabel: string;
  pagination: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-4 text-xl font-semibold tracking-tight">
        {title}{" "}
        <span className="ml-1 align-middle font-mono text-xs font-normal tabular-nums text-muted-foreground">
          ({count})
        </span>
      </h2>
      {isEmpty ? (
        <div className="rounded-none border border-dashed border-border px-6 py-12 text-center">
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
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-none border border-border bg-card shadow-sm">
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
        className="group flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/60"
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
