import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Bookmark,
  ChevronDown,
  Globe2,
  Info,
  LayoutGrid,
  List,
  LocateFixed,
  Map as MapIcon,
  MapPinned,
  PackageSearch,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { PublicHeader } from "../../components/shared/PublicHeader.tsx";
import { cn } from "../../lib/utils.ts";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import { usePublicMeta } from "../../hooks/usePublicMeta.ts";
import { breadcrumbJsonLd } from "../../lib/seo/meta.ts";
import { useAuthStore } from "../../lib/auth/auth-store.ts";
import { signOut } from "../../lib/auth/session.ts";
import {
  AccountMenu,
  AccountMenuAvatar,
  AccountMenuItem,
} from "../../components/account-menu.tsx";
import { Web3MarketTerminal } from "../../features/web3/components/Web3MarketTerminal.tsx";
import { useSolanaMarketFeed } from "../../features/web3/hooks/useSolanaMarketFeed.ts";
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
  useSampleMarketItemKeys,
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
import { MarketCartSheet } from "../../components/market/MarketCartSheet.tsx";
import { useCartCount } from "../../features/market/cart.ts";
import type { MarketGlobeHandle } from "../../components/market/LeafletGlobe.tsx";
import MarketResultGrid, { MarketResultsSkeleton } from "../../components/market/MarketResultGrid.tsx";
import {
  isNew,
  toItem,
  type RailItem,
} from "../../components/market/marketItems.ts";
import { getSavedMarketSearch, saveMarketSearch, removeMarketSearch } from "../../lib/repositories/marketPreferences.ts";
import { NearbyPrompt } from "../../components/shared/NearbyPrompt.tsx";
import { PublicFooter } from "../../components/shared/PublicFooter.tsx";
import { useDeviceLocation } from "../../lib/geo/useDeviceLocation.ts";
import { groupByDistance, formatDistanceKm, haversineKm, type DistanceGroup } from "../../lib/geo/distance.ts";


type Scope = "all" | "listing" | "professional" | "job" | "firm" | "event";
type SortKey = "newest" | "popular" | "price-asc" | "price-desc" | "nearby";
type ListingCategory = "all" | "instrument" | "accessory";
type ListingType = "all" | "sale" | "hire";
type MarketView = "list" | "split" | "map";
type PriceRange = "all" | "under-100" | "100-500" | "over-500";
type ExperienceRange = "all" | "0-2" | "3-5" | "6-plus";

/** Flat results batch size — "Load more" appends this many rows at a time. */
const FLAT_PAGE_SIZE = 12;

const SCOPE_TABS = [
  { value: "all", label: "All" },
  { value: "listing", label: "Equipment" },
  { value: "professional", label: "Professionals" },
  { value: "job", label: "Jobs" },
  { value: "firm", label: "Firms" },
  { value: "event", label: "Training" },
] as const;

const GEAR_OPTIONS = [
  { value: "all", label: "Everything" },
  { value: "instrument", label: "Instruments" },
  { value: "accessory", label: "Accessories" },
] as const;

const LISTING_TYPE_OPTIONS = [
  { value: "all", label: "Sale & hire" },
  { value: "sale", label: "For sale" },
  { value: "hire", label: "For hire" },
] as const;

const PRICE_OPTIONS = [
  { value: "all", label: "Any price" },
  { value: "under-100", label: "Under 100" },
  { value: "100-500", label: "100-500" },
  { value: "over-500", label: "Over 500" },
] as const;

const EXPERIENCE_OPTIONS = [
  { value: "all", label: "Any experience" },
  { value: "0-2", label: "Up to 2 years" },
  { value: "3-5", label: "3-5 years" },
  { value: "6-plus", label: "6+ years" },
] as const;

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "popular", label: "Most saved" },
  { value: "nearby", label: "Nearest first" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
] as const;

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

function experienceYears(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

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

export default function PublicMarketPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const market = useSolanaMarketFeed();
  usePublicMeta("/market", {
    title: "Surveyor's Market: instruments, surveyors, jobs and training | SiteSurveyor",
    jsonLd: (origin) =>
      breadcrumbJsonLd(origin, [
        { name: "Home", path: "/" },
        { name: "Market", path: "/market" },
      ]),
  });
  // Demo rows seeded by the sample workspace look exactly like real supply;
  // they are badged here so a visitor never waits on a demo seller.
  const sampleKeys = useSampleMarketItemKeys();
  const markSample = useCallback(
    (items: RailItem[]) =>
      sampleKeys.size === 0
        ? items
        : items.map((item) =>
            sampleKeys.has(`${item.kind}:${item.id}`)
              ? { ...item, isSample: true }
              : item,
          ),
    [sampleKeys],
  );
  const [data, setData] = useState<MarketData | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [savedSearch, setSavedSearch] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const cartCount = useCartCount();
  const [scope, setScope] = useState<Scope>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [listingCategory, setListingCategory] = useState<ListingCategory>("all");
  const [listingType, setListingType] = useState<ListingType>("all");
  const [priceRange, setPriceRange] = useState<PriceRange>("all");
  const [availability, setAvailability] = useState("");
  const [experience, setExperience] = useState<ExperienceRange>("all");
  const [employmentType, setEmploymentType] = useState("");
  const [trainingFormat, setTrainingFormat] = useState<"all" | "online" | "in-person">("all");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [country, setCountry] = useState("");
  const [marketView, setMarketView] = useState<MarketView>("split");
  const [flatLimit, setFlatLimit] = useState(FLAT_PAGE_SIZE);

  // Device GPS: when the visitor shares their location the registry ranges
  // every row by distance and can group the results into nearby bands.
  const geo = useDeviceLocation();
  const geoLocation = geo.location;
  const origin = useMemo(
    () => (geoLocation ? { lat: geoLocation.lat, lng: geoLocation.lng } : null),
    [geoLocation],
  );
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
        .filter((row) => listingType === "all" || (row.listing_type ?? "sale") === listingType)
        .filter((row) => priceRange === "all" ||
          (priceRange === "under-100" && row.price < 100) ||
          (priceRange === "100-500" && row.price >= 100 && row.price <= 500) ||
          (priceRange === "over-500" && row.price > 500))
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
    [data, search, listingCategory, listingType, priceRange, matchesPlace],
  );

  const filteredProfessionals = useMemo(
    () =>
      (data?.professionals ?? [])
        .filter(matchesPlace)
        .filter((row) => !availability || row.availability === availability)
        .filter((row) => {
          if (experience === "all") return true;
          const years = experienceYears(row.experience);
          if (years === null) return false;
          if (experience === "0-2") return years <= 2;
          return experience === "3-5" ? years >= 3 && years <= 5 : years >= 6;
        })
        .filter((row) =>
          matches(search, [
            row.name,
            row.title,
            row.discipline,
            row.location,
            row.bio,
          ]),
        ),
    [data, search, matchesPlace, availability, experience],
  );

  const filteredJobs = useMemo(
    () =>
      (data?.jobs ?? [])
        .filter(matchesPlace)
        .filter((row) => !employmentType || row.employment_type === employmentType)
        .filter((row) =>
          matches(search, [
            row.title,
            row.discipline,
            row.location,
            row.description,
            row.company,
          ]),
        ),
    [data, search, matchesPlace, employmentType],
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
        .filter((row) => trainingFormat === "all" ||
          (trainingFormat === "online" ? Boolean(row.is_remote) : !row.is_remote))
        .filter((row) =>
          matches(search, [
            row.title,
            row.provider,
            row.kind,
            row.location,
            row.description,
          ]),
        ),
    [data, search, matchesPlace, trainingFormat],
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

  // Every category uses the same comparison grid. "All" is grouped by kind;
  // scoped results use their category's sort and paginate in place.
  const groupedItems = useMemo(() => {
    if (scope !== "all") return [];
    return [
      { scope: "listing" as const, title: "Equipment", description: "Instruments and accessories for sale or hire.", items: markSample(sortedListings.map((row) => toItem("listing", row))).slice(0, 6) },
      { scope: "professional" as const, title: "Professionals", description: "Independent expertise for field and office work.", items: markSample(sortedProfessionals.map((row) => toItem("professional", row))).slice(0, 6) },
      { scope: "firm" as const, title: "Survey firms", description: "Companies and the services they provide.", items: markSample(sortedFirms.map((row) => toItem("firm", row))).slice(0, 6) },
      { scope: "job" as const, title: "Open jobs", description: "Roles and contracts from surveying teams.", items: markSample(sortedJobs.map((row) => toItem("job", row))).slice(0, 6) },
      { scope: "event" as const, title: "Training & events", description: "Courses and professional development, soonest first.", items: markSample(sortedEvents.map((row) => toItem("event", row))).slice(0, 6) },
    ].filter((group) => group.items.length > 0);
  }, [scope, sortedListings, sortedProfessionals, sortedFirms, sortedJobs, sortedEvents, markSample]);

  const flatItems: RailItem[] = useMemo(() => {
    if (!data) return [];
    const allowed = scope === "all" ? null : new Set<string>([scope]);
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
      ? markSample(merged.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)))
      : markSample(merged);
  }, [data, scope, sort, sortedListings, sortedProfessionals, sortedJobs, sortedFirms, sortedEvents, markSample]);

  const sampleInView = scope === "all"
    ? groupedItems.flatMap((group) => group.items).filter((item) => item.isSample).length
    : flatItems.filter((item) => item.isSample).length;

  // Distance range: a `kind:id` lookup for chips and a band grouping for the
  // "grouped by how near it is" flat view. Both are empty without a GPS fix.
  const itemDistances = useMemo(() => {
    const lookup = new Map<string, number>();
    if (!origin) return lookup;
    for (const item of flatItems) {
      if (item.lat !== null && item.lng !== null) {
        lookup.set(`${item.kind}:${item.id}`, haversineKm(origin.lat, origin.lng, item.lat, item.lng));
      }
    }
    return lookup;
  }, [flatItems, origin]);

  // "Nearest first" orders by the measured distance; rows without coordinates
  // keep their other sort order and land last.
  const sortedByNearby = useMemo(() => {
    if (sort !== "nearby" || !origin) return flatItems;
    return [...flatItems].sort((a, b) => {
      const da = itemDistances.get(`${a.kind}:${a.id}`);
      const db = itemDistances.get(`${b.kind}:${b.id}`);
      return (da ?? Number.POSITIVE_INFINITY) - (db ?? Number.POSITIVE_INFINITY);
    });
  }, [flatItems, sort, origin, itemDistances]);

  const orderedFlatItems = sort === "nearby" ? sortedByNearby : flatItems;
  const visibleFlatItems = orderedFlatItems.slice(0, flatLimit);

  // With a GPS fix the flat results are grouped into distance bands (nearest
  // first). Without one they stay a single chronological list.
  const visibleGroups: DistanceGroup<RailItem>[] = useMemo(() => {
    if (!origin) return [];
    return groupByDistance(visibleFlatItems, origin);
  }, [visibleFlatItems, origin]);

  const availabilityOptions = useMemo(() => [...new Set(
    (data?.professionals ?? []).map((row) => row.availability).filter((value): value is string => Boolean(value)),
  )].sort(), [data]);

  const employmentOptions = useMemo(() => [...new Set(
    (data?.jobs ?? []).map((row) => row.employment_type).filter((value): value is string => Boolean(value)),
  )].sort(), [data]);

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
      listings: filteredListings,
      professionals: filteredProfessionals,
      jobs: filteredJobs,
      firms: filteredFirms,
      events: filteredEvents,
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
  }, [scope, filteredListings, filteredProfessionals, filteredJobs, filteredFirms, filteredEvents]);

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

  const handleScopeChange = (nextScope: Scope) => {
    setScope(nextScope);
    setFlatLimit(FLAT_PAGE_SIZE);
  };

  const handleSeeAll = (nextScope: Scope) => {
    handleScopeChange(nextScope);
    requestAnimationFrame(() => registryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
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

  // "Find my location": take a GPS fix and fly the map to it. The fix also
  // switches the registry into distance-grouped mode via the shared hook.
  const handleFindMyLocation = useCallback(async () => {
    const fix = await geo.locate();
    if (fix) globeRef.current?.showMe(fix.lat, fix.lng);
  }, [geo]);

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

  const kindCounts: Record<Scope, number> = {
    all:
      filteredListings.length +
      filteredProfessionals.length +
      filteredJobs.length +
      filteredFirms.length +
      filteredEvents.length,
    listing: filteredListings.length,
    professional: filteredProfessionals.length,
    job: filteredJobs.length,
    firm: filteredFirms.length,
    event: filteredEvents.length,
  };

  /** Applied refinement, shown as removable chips so the state is readable
      without opening the filter sheet. */
  const activeFilters: { key: string; label: string; value: string; clear: () => void }[] = [];
  if (search.trim()) {
    activeFilters.push({
      key: "search",
      label: "Search",
      value: search.trim(),
      clear: () => {
        setSearch("");
        setFlatLimit(FLAT_PAGE_SIZE);
      },
    });
  }
  if (listingType !== "all" && showPanel("listing")) {
    activeFilters.push({ key: "listing-type", label: "Offer", value: LISTING_TYPE_OPTIONS.find((option) => option.value === listingType)?.label ?? "", clear: () => setListingType("all") });
  }
  if (priceRange !== "all" && showPanel("listing")) {
    activeFilters.push({ key: "price", label: "Price", value: PRICE_OPTIONS.find((option) => option.value === priceRange)?.label ?? "", clear: () => setPriceRange("all") });
  }
  if (availability && scope === "professional") {
    activeFilters.push({ key: "availability", label: "Availability", value: availability, clear: () => setAvailability("") });
  }
  if (experience !== "all" && scope === "professional") {
    activeFilters.push({ key: "experience", label: "Experience", value: EXPERIENCE_OPTIONS.find((option) => option.value === experience)?.label ?? "", clear: () => setExperience("all") });
  }
  if (employmentType && scope === "job") {
    activeFilters.push({ key: "employment", label: "Job type", value: employmentType, clear: () => setEmploymentType("") });
  }
  if (trainingFormat !== "all" && scope === "event") {
    activeFilters.push({ key: "training", label: "Format", value: trainingFormat === "online" ? "Online" : "In person", clear: () => setTrainingFormat("all") });
  }
  if (listingCategory !== "all" && showPanel("listing")) {
    activeFilters.push({
      key: "gear",
      label: "Gear",
      value: GEAR_OPTIONS.find((option) => option.value === listingCategory)?.label ?? "",
      clear: () => {
        setListingCategory("all");
        setFlatLimit(FLAT_PAGE_SIZE);
      },
    });
  }
  if (remoteOnly) {
    activeFilters.push({
      key: "remote",
      label: "Location",
      value: "Remote only",
      clear: () => {
        setRemoteOnly(false);
        setFlatLimit(FLAT_PAGE_SIZE);
      },
    });
  }
  if (country) {
    activeFilters.push({
      key: "country",
      label: "Country",
      value: country,
      clear: () => {
        setCountry("");
        setFlatLimit(FLAT_PAGE_SIZE);
      },
    });
  }
  if (sort !== "newest") {
    activeFilters.push({
      key: "sort",
      label: "Sort",
      value: SORT_OPTIONS.find((option) => option.value === sort)?.label ?? sort,
      clear: () => {
        setSort("newest");
        setFlatLimit(FLAT_PAGE_SIZE);
      },
    });
  }

  const resetFilters = () => {
    setSearch("");
    setSort("newest");
    setScope("all");
    setListingCategory("all");
    setListingType("all");
    setPriceRange("all");
    setAvailability("");
    setExperience("all");
    setEmploymentType("");
    setTrainingFormat("all");
    setRemoteOnly(false);
    setCountry("");
    setFlatLimit(FLAT_PAGE_SIZE);
  };

  return (
    <div className="web3-surface">
      <PublicHeader
        section="Surveyor's Market"
        actions={
          <button
            type="button"
            onClick={() => user ? setCartOpen(true) : navigate("/login", { state: { from: "/market" } })}
            className="public-site-tool"
            aria-label={`Open cart, ${cartCount} ${cartCount === 1 ? "item" : "items"}`}
          >
            <ShoppingCart className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">Cart</span>
            {cartCount > 0 ? (
              <span className="flex size-4 items-center justify-center rounded-full bg-primary font-mono text-[10px] font-semibold tabular-nums text-primary-foreground">
                {cartCount}
              </span>
            ) : null}
          </button>
        }
        account={user ? (
          <AccountMenu
            user={user}
            onLogout={handleSignOut}
            trigger={
              <Button
                variant="outline"
                className="group h-8 gap-1.5 rounded-full py-1 pl-1 pr-2.5"
                aria-label={`Open account menu (${user.name})`}
              >
                <AccountMenuAvatar user={user} className="size-6" />
                <span className="max-w-[132px] truncate text-xs font-semibold max-sm:hidden">{user.name}</span>
                <ChevronDown className="size-3 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
              </Button>
            }
          >
            <AccountMenuItem icon={LayoutGrid} label="Open your workspace" to="/workspace" />
            <AccountMenuItem icon={PackageSearch} label="My marketplace requests" to="/workspace?view=marketplace" />
          </AccountMenu>
        ) : undefined}
      />

      <main>
        <section aria-labelledby="market-heading" className="border-b border-border/70 bg-card">
          <div className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 sm:py-9">
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div className="max-w-3xl">
                <h1 id="market-heading" className="market-hero-title text-balance text-foreground">Find survey equipment, expertise and opportunities</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">Buy or hire instruments, connect with surveyors and firms, find work, or discover training.</p>
              </div>
              {user ? (
                <Button asChild variant="outline" className="h-9 gap-1.5 px-3 text-xs"><Link to="/workspace?view=marketplace"><Plus className="size-3.5" />Manage marketplace listings</Link></Button>
              ) : (
                <Button asChild variant="outline" className="h-9 gap-1.5 px-3 text-xs"><Link to="/login" state={{ from: "/?view=marketplace" }}><Plus className="size-3.5" />List equipment or services</Link></Button>
              )}
            </div>

            <div className="mt-5 flex max-w-4xl gap-2">
              <div className="relative min-w-0 flex-1">
                <label htmlFor="market-search-hero" className="sr-only">Search the marketplace</label>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="market-search-hero" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setFlatLimit(FLAT_PAGE_SIZE); }} placeholder="Search equipment, surveyors, firms, jobs, or training" className="h-10 rounded-lg border-border bg-background pl-9 pr-9 text-sm shadow-none" />
                {search ? <button type="button" onClick={() => setSearch("")} className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Clear search"><X className="size-3.5" /></button> : null}
              </div>
              <Button type="button" className="h-10 gap-1.5 rounded-lg px-3.5 text-sm" onClick={scrollToRegistry}>Search<ArrowRight className="size-3.5" /></Button>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-live="polite">
                <span>{liveTotals ? `${liveTotals.items} published items` : "Loading marketplace"}</span>
                {liveTotals ? <span>{liveTotals.countries} {liveTotals.countries === 1 ? "country" : "countries"}</span> : null}
                {addedThisWeek > 0 ? <span className="font-medium text-success">{addedThisWeek} added this week</span> : null}
              </div>
            </div>
          </div>
        </section>

        <section aria-label="Marketplace search and results" ref={registryRef} className="market-registry scroll-mt-[calc(var(--public-header-h)+3.5rem)]">

          <div role="group" aria-label="Marketplace categories" className="sticky top-[var(--public-header-h)] z-20 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
            <div className="scrollbar-none mx-auto flex w-full max-w-7xl items-center gap-1 overflow-x-auto px-3 sm:px-5">
              {SCOPE_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  aria-pressed={scope === tab.value}
                  onClick={() => handleScopeChange(tab.value)}
                  className={cn(
                    "min-h-12 shrink-0 whitespace-nowrap border-b-2 px-3.5 text-sm font-medium transition-colors sm:px-4",
                    scope === tab.value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                  {!loading ? <span className="ml-1.5 font-mono text-micro tabular-nums text-muted-foreground">{kindCounts[tab.value]}</span> : null}
                </button>
              ))}
            </div>
          </div>

          <div className="mx-auto w-full max-w-7xl space-y-7 px-4 py-7 sm:px-6 sm:py-9">
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div className="max-w-2xl">
                <h2 className="market-section-title text-balance text-foreground">
                  Browse the market
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
                  Compare available supply and opportunities. Use the map when location matters.
                </p>
              </div>
              <div role="group" aria-label="Results view" className="inline-flex rounded-lg border border-border bg-card p-1">
                {([
                  { value: "list", label: "List", icon: List },
                  { value: "split", label: "Split", icon: LayoutGrid },
                  { value: "map", label: "Map", icon: MapIcon },
                ] as const).map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={marketView === value}
                    onClick={() => setMarketView(value)}
                    className={cn(
                      "inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                      marketView === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border/80 bg-background shadow-[0_1px_2px_rgba(15,23,20,0.05)]">
              <div className="space-y-2.5 p-2.5 sm:p-3">
                <div className="flex gap-2.5">
                  <div className="relative min-w-0 flex-1">
                    <label htmlFor="market-search" className="sr-only">
                      Search the market
                    </label>
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input
                      id="market-search"
                      placeholder="Search instruments, people, places…"
                      value={search}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setFlatLimit(FLAT_PAGE_SIZE);
                      }}
                      className="h-9 rounded-lg border-border/80 bg-background pl-9 pr-9 text-sm shadow-none"
                    />
                    {search ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSearch("");
                          setFlatLimit(FLAT_PAGE_SIZE);
                        }}
                        aria-label="Clear search"
                        className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <X className="size-3.5" aria-hidden="true" />
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
                    <SelectTrigger aria-label="Sort results" className="hidden h-9 w-[180px] shrink-0 rounded-lg bg-background text-sm sm:flex">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      {SORT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant={savedSearch ? "default" : "outline"}
                    size="icon"
                    className="size-9 shrink-0 rounded-lg"
                    onClick={toggleSavedSearch}
                    aria-label={savedSearch ? "Remove saved search" : "Save this search"}
                    title={savedSearch ? "Saved search" : "Save this search"}
                  >
                    <Bookmark className="size-4" fill={savedSearch ? "currentColor" : "none"} aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant={activeFilters.length > 0 ? "default" : "outline"}
                    size="icon"
                    className="size-9 shrink-0 rounded-lg sm:hidden"
                    onClick={() => setMobileFiltersOpen(true)}
                    aria-expanded={mobileFiltersOpen}
                    aria-label={
                      activeFilters.length > 0
                        ? `Filters, ${activeFilters.length} applied`
                        : "Filters"
                    }
                  >
                    <SlidersHorizontal className="size-4" aria-hidden="true" />
                  </Button>
                </div>

                {!loading ? (
                  <div className="hidden flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/70 pt-2.5 sm:flex">
                    {showPanel("listing") ? (
                      <div role="group" aria-label="Filter by gear category" className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">Gear</span>
                        <span className="inline-flex items-center gap-1 rounded-xl bg-muted/70 p-1">
                          {GEAR_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              aria-pressed={listingCategory === option.value}
                              onClick={() => {
                                setListingCategory(option.value);
                                setFlatLimit(FLAT_PAGE_SIZE);
                              }}
                              className={cn(
                                "min-h-9 rounded-lg px-3 text-xs font-medium transition-colors",
                                listingCategory === option.value
                                  ? "bg-background text-foreground shadow-[0_1px_2px_rgba(15,23,20,0.10)]"
                                  : "text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {option.label}
                            </button>
                          ))}
                        </span>
                      </div>
                    ) : null}
                    <span className="h-6 w-px shrink-0 bg-border" aria-hidden="true" />
                    <div role="group" aria-label="Filter by location" className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">Location</span>
                      <span className="inline-flex items-center rounded-xl bg-muted/70 p-1">
                        <button
                          type="button"
                          aria-pressed={remoteOnly}
                          onClick={() => {
                            setRemoteOnly((value) => !value);
                            setFlatLimit(FLAT_PAGE_SIZE);
                          }}
                          className={cn(
                            "inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors",
                            remoteOnly
                              ? "bg-background text-foreground shadow-[0_1px_2px_rgba(15,23,20,0.10)]"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <Globe2 className="size-3.5" aria-hidden="true" />
                          Remote only
                        </button>
                      </span>
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
                            className="h-9 w-[180px] rounded-lg border-border/80 bg-background text-xs"
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
                    </div>
                    {showPanel("listing") ? (
                      <>
                        <Select value={listingType} onValueChange={(value) => { setListingType(value as ListingType); setFlatLimit(FLAT_PAGE_SIZE); }}>
                          <SelectTrigger aria-label="Filter by offer type" className="h-9 w-[135px] rounded-lg bg-background text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{LISTING_TYPE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={priceRange} onValueChange={(value) => { setPriceRange(value as PriceRange); setFlatLimit(FLAT_PAGE_SIZE); }}>
                          <SelectTrigger aria-label="Filter by price" className="h-9 w-[125px] rounded-lg bg-background text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{PRICE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </>
                    ) : null}
                    {scope === "professional" ? (
                      <>
                        <Select value={availability || "all"} onValueChange={(value) => { setAvailability(value === "all" ? "" : value); setFlatLimit(FLAT_PAGE_SIZE); }}>
                          <SelectTrigger aria-label="Filter by availability" className="h-9 w-[155px] rounded-lg bg-background text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="all">Any availability</SelectItem>{availabilityOptions.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={experience} onValueChange={(value) => { setExperience(value as ExperienceRange); setFlatLimit(FLAT_PAGE_SIZE); }}>
                          <SelectTrigger aria-label="Filter by experience" className="h-9 w-[145px] rounded-lg bg-background text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{EXPERIENCE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </>
                    ) : null}
                    {scope === "job" && employmentOptions.length > 0 ? (
                      <Select value={employmentType || "all"} onValueChange={(value) => { setEmploymentType(value === "all" ? "" : value); setFlatLimit(FLAT_PAGE_SIZE); }}>
                        <SelectTrigger aria-label="Filter by job type" className="h-9 w-[155px] rounded-lg bg-background text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="all">Any job type</SelectItem>{employmentOptions.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : null}
                    {scope === "event" ? (
                      <Select value={trainingFormat} onValueChange={(value) => { setTrainingFormat(value as "all" | "online" | "in-person"); setFlatLimit(FLAT_PAGE_SIZE); }}>
                        <SelectTrigger aria-label="Filter by training format" className="h-9 w-[145px] rounded-lg bg-background text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="all">Any format</SelectItem><SelectItem value="online">Online</SelectItem><SelectItem value="in-person">In person</SelectItem></SelectContent>
                      </Select>
                    ) : null}
                  </div>
                ) : null}

                {activeFilters.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 pt-2.5">
                    <span className="text-xs font-medium text-muted-foreground">Filtered by</span>
                    {activeFilters.map((filter) => (
                      <button
                        key={filter.key}
                        type="button"
                        onClick={filter.clear}
                        aria-label={`Clear ${filter.label.toLowerCase()} filter: ${filter.value}`}
                        className="inline-flex min-h-9 max-w-[16rem] items-center gap-1.5 rounded-lg bg-muted px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted/70"
                      >
                        <span className="shrink-0 text-muted-foreground">{filter.label}:</span>
                        <span className="truncate">{filter.value}</span>
                        <X className="size-3.5 shrink-0" aria-hidden="true" />
                      </button>
                    ))}
                    {activeFilters.length > 1 ? (
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="ml-auto min-h-9 text-xs font-semibold text-primary underline-offset-4 hover:underline"
                      >
                        Clear all
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>

            </div>

            <div
              className={cn(
                "items-start gap-6",
                marketView === "list"
                  ? "block"
                  : cn("grid grid-cols-1", marketView === "split" && "xl:grid-cols-[minmax(0,1fr)_340px]"),
              )}
            >
              <div className="min-w-0 space-y-7">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground" aria-live="polite">
                    {loading ? "Loading results…" : failed ? "Marketplace unavailable" : `${kindCounts[scope]} ${kindCounts[scope] === 1 ? "result" : "results"}${search.trim() ? ` for “${search.trim()}”` : ""}`}
                  </p>
                  {!loading && !failed && scope === "all" && groupedItems.length > 0 ? <span className="text-xs text-muted-foreground">Browse by category</span> : null}
                </div>

                {!loading && !failed ? (
                  <NearbyPrompt
                    geo={geo}
                    count={origin ? flatItems.filter((item) => itemDistances.has(`${item.kind}:${item.id}`)).length : undefined}
                    noun="results"
                  />
                ) : null}

                {sampleInView > 0 ? (
                  <div role="note" className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 px-3.5 py-2.5 text-xs leading-5 text-warning">
                    <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    <span>{sampleInView === 1 ? "1 item here is sample content" : `${sampleInView} items here are sample content`} published by a demo workspace to show how the market works. It cannot accept requests or orders.</span>
                  </div>
                ) : null}

                {failed ? (
                  <LoadErrorPanel failure={failure} onRetry={retry} />
                ) : loading ? (
                  <MarketResultsSkeleton />
                ) : kindCounts[scope] === 0 ? (
                  <div className="flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-14 text-center">
                    <PackageSearch className="size-8 text-muted-foreground/60" aria-hidden="true" />
                    <h3 className="mt-4 text-base font-semibold text-foreground">No matches found</h3>
                    <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">Try another category, a broader search, or reset your filters.</p>
                    <Button type="button" variant="outline" className="mt-5 h-9 px-4 text-sm" onClick={resetFilters}>Clear search and filters</Button>
                  </div>
                ) : scope === "all" ? (
                  <div className="space-y-12">
                    {groupedItems.map((group) => (
                      <section key={group.scope} aria-labelledby={`market-group-${group.scope}`}>
                        <div className="mb-5 flex items-end justify-between gap-4">
                          <div>
                            <h3 id={`market-group-${group.scope}`} className="text-xl font-semibold tracking-tight text-foreground">{group.title}</h3>
                            <p className="mt-1 text-sm text-muted-foreground">{group.description}</p>
                          </div>
                          <Button type="button" variant="ghost" className="shrink-0 gap-1.5" onClick={() => handleSeeAll(group.scope)}>View all {kindCounts[group.scope]}<ArrowRight className="size-4" /></Button>
                        </div>
                        <MarketResultGrid items={group.items} highlighted={highlighted} distances={itemDistances} onSelect={handleItemSelect} />
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-8">
                    {origin && visibleGroups.length > 0 ? (
                      visibleGroups.map((group) => {
                        const nearest = group.items[0]?.distanceKm;
                        return (
                          <section key={group.key} aria-label={`${group.label} results`}>
                            <div className="mb-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                              <h3 className="text-sm font-semibold text-foreground">{group.label}</h3>
                              <span className="text-xs text-muted-foreground">
                                {group.items.length} {group.items.length === 1 ? "result" : "results"}
                                {nearest != null ? ` · nearest ${formatDistanceKm(nearest)} away` : ""}
                              </span>
                            </div>
                            <MarketResultGrid
                              items={group.items.map((row) => row.item)}
                              highlighted={highlighted}
                              distances={itemDistances}
                              onSelect={handleItemSelect}
                            />
                          </section>
                        );
                      })
                    ) : (
                      <MarketResultGrid items={visibleFlatItems} highlighted={highlighted} distances={itemDistances} onSelect={handleItemSelect} />
                    )}
                    {visibleFlatItems.length < flatItems.length ? (
                      <div className="flex justify-center">
                        <Button type="button" variant="outline" className="h-9 px-4 text-sm" onClick={() => setFlatLimit((value) => value + FLAT_PAGE_SIZE)}>Load more ({flatItems.length - visibleFlatItems.length} remaining)</Button>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              {marketView !== "list" ? (
                <aside aria-label="Synchronized marketplace map" className={cn("overflow-hidden rounded-2xl border border-border bg-card", marketView === "split" ? "order-first xl:order-none xl:sticky xl:top-[calc(var(--public-header-h)+4rem)]" : "order-first w-full")}>
                  <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                    <div className="flex items-center gap-2">
                      <MapPinned className="size-4 text-primary" aria-hidden="true" />
                      <h3 className="text-sm font-semibold text-foreground">Results map</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleFindMyLocation()}
                        disabled={geo.status === "locating"}
                        aria-label="Find my location"
                        className="h-8 gap-1.5 rounded-lg px-2.5 text-xs"
                      >
                        <LocateFixed className="size-3.5" aria-hidden="true" />
                        {geo.status === "locating" ? "Locating…" : "Find my location"}
                      </Button>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">{totalPoints} mapped</span>
                    </div>
                  </div>
                  <Suspense fallback={<div className={cn("animate-pulse bg-muted/40", marketView === "map" ? "h-[65dvh] min-h-[440px]" : "h-[42svh] min-h-[300px] xl:h-[440px]")} />}>
                    <PublicMarketGlobe
                      ref={globeRef}
                      dots={dots}
                      totalPoints={totalPoints}
                      matchKeys={matchKeys}
                      fitKey={`${scope}:${marketView}`}
                      userLocation={geo.location}
                      failed={failed}
                      onSelect={handlePinSelect}
                      onRetry={retry}
                      heightClassName={marketView === "map" ? "h-[65dvh] min-h-[440px]" : "h-[42svh] min-h-[300px] xl:h-[440px]"}
                    />
                  </Suspense>
                  <div className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">Select a pin to view its listing. Selecting a card centers its location.</div>
                </aside>
              ) : null}
            </div>

            {!loading && !failed ? (
              <div className="space-y-4 border-t border-border/70 pt-7">
                {showPanel("listing") && benchmarks.length > 0 ? <RateBenchmarks benchmarks={benchmarks} /> : null}
              </div>
            ) : null}
          </div>
        </section>

        <section aria-label="Web3 market terminal" className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
          <Web3MarketTerminal
            snapshot={market.snapshot}
            loading={market.loading}
            error={market.error}
            onRefresh={market.refresh}
            defaultExpanded={false}
          />
        </section>
      </main>

      <PublicFooter />

      <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
        <SheetContent side="bottom" className="web3-theme flex max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-t-3xl p-0">
          <SheetHeader className="shrink-0 border-b border-border/80 px-5 py-5 pr-14 text-left">
            <SheetTitle className="market-sheet-title">Filter the market</SheetTitle>
            <SheetDescription>Narrow results by category, location and order.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
            {(scope === "all" || scope === "listing") ? (
              <fieldset>
                <legend className="mb-3 text-sm font-semibold text-foreground">Gear category</legend>
                <div className="grid grid-cols-3 gap-2">
                  {GEAR_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      variant={listingCategory === option.value ? "default" : "outline"}
                      className="min-h-11 px-2 text-xs"
                      onClick={() => { setListingCategory(option.value); setFlatLimit(FLAT_PAGE_SIZE); }}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </fieldset>
            ) : null}

            {scope === "all" || scope === "listing" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-foreground">Offer type</label>
                  <Select value={listingType} onValueChange={(value) => { setListingType(value as ListingType); setFlatLimit(FLAT_PAGE_SIZE); }}>
                    <SelectTrigger aria-label="Mobile offer type" className="h-11 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{LISTING_TYPE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-foreground">Price</label>
                  <Select value={priceRange} onValueChange={(value) => { setPriceRange(value as PriceRange); setFlatLimit(FLAT_PAGE_SIZE); }}>
                    <SelectTrigger aria-label="Mobile price" className="h-11 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{PRICE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}

            {scope === "professional" ? (
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-foreground">Availability</label>
                  <Select value={availability || "all"} onValueChange={(value) => { setAvailability(value === "all" ? "" : value); setFlatLimit(FLAT_PAGE_SIZE); }}>
                    <SelectTrigger aria-label="Mobile availability" className="h-11 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="all">Any availability</SelectItem>{availabilityOptions.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-foreground">Experience</label>
                  <Select value={experience} onValueChange={(value) => { setExperience(value as ExperienceRange); setFlatLimit(FLAT_PAGE_SIZE); }}>
                    <SelectTrigger aria-label="Mobile experience" className="h-11 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{EXPERIENCE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}

            {scope === "job" && employmentOptions.length > 0 ? (
              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">Job type</label>
                <Select value={employmentType || "all"} onValueChange={(value) => { setEmploymentType(value === "all" ? "" : value); setFlatLimit(FLAT_PAGE_SIZE); }}>
                  <SelectTrigger aria-label="Mobile job type" className="h-11 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Any job type</SelectItem>{employmentOptions.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ) : null}

            {scope === "event" ? (
              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">Training format</label>
                <Select value={trainingFormat} onValueChange={(value) => { setTrainingFormat(value as "all" | "online" | "in-person"); setFlatLimit(FLAT_PAGE_SIZE); }}>
                  <SelectTrigger aria-label="Mobile training format" className="h-11 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Any format</SelectItem><SelectItem value="online">Online</SelectItem><SelectItem value="in-person">In person</SelectItem></SelectContent>
                </Select>
              </div>
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
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="shrink-0 border-t border-border/80 bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button className="h-12 w-full text-sm font-semibold" onClick={() => setMobileFiltersOpen(false)}>
              Show results
            </Button>
          </div>
        </SheetContent>
      </Sheet>


      <MarketCartSheet
        open={cartOpen}
        onOpenChange={setCartOpen}
        buyer={user ? { workspaceId: user.workspaceId, name: user.name } : null}
      />

      <MarketDetailDialog
        dot={selectedDot}
        listing={selectedListing}
        professional={selectedProfessional}
        job={selectedJob}
        firm={selectedFirm}
        event={selectedEvent}
        onClose={handleDialogClose}
        allowRequest
        isSample={
          selectedDot ? sampleKeys.has(`${selectedDot.kind}:${selectedDot.id}`) : false
        }
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

// ── Benchmarks ──────────────────────────────────────────────────────────────

function RateBenchmarks({
  benchmarks,
}: {
  benchmarks: { type: string; median: number; count: number }[];
}) {
  return (
    <p className="scrollbar-none -mx-4 flex items-baseline gap-x-2 gap-y-1 overflow-x-auto whitespace-nowrap px-4 text-xs leading-5 sm:mx-0 sm:flex-wrap sm:px-0">
      <span className="font-semibold text-foreground">Day-rate benchmarks</span>
      {benchmarks.map(({ type, median, count }) => (
        <span key={type} className="inline-flex items-baseline gap-1">
          <span className="text-muted-foreground">{type}</span>
          <span className="font-mono font-semibold tabular-nums text-foreground">
            ${median.toLocaleString()}
          </span>
          <span className="text-muted-foreground">
            /day from {count} {count === 1 ? "listing" : "listings"}
          </span>
        </span>
      ))}
    </p>
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
    <div className="rounded-2xl border border-border bg-background px-6 py-14 text-center shadow-[0_1px_2px_rgba(15,23,20,0.05)]">
      <Globe2 className="mx-auto size-9 text-muted-foreground/50" aria-hidden="true" />
      <h3 className="mt-4 text-lg font-semibold">
        Couldn&rsquo;t reach the market
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {failure.reason === "timeout"
          ? "The request didn't complete in time. Check your connection."
          : "The market data couldn't be loaded."}
      </p>
      {failure.missingRelation ? (
        <p className="mx-auto mt-3 max-w-md rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-left text-xs text-warning">
          public_market views not found. Apply backend/sql migrations 0001-0004
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

