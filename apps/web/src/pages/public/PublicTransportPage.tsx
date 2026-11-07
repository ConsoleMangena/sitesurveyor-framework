import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LayoutGrid, Search, Store, Truck, X } from "lucide-react";
import { getPageNumbers } from "../../lib/utils.ts";
import { Button } from "../../components/ui/button.tsx";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "../../components/ui/pagination.tsx";
import { AccountMenu, AccountMenuAvatar, AccountMenuItem } from "../../components/account-menu.tsx";
import { ThemeToggle } from "../../components/theme/ThemeToggle.tsx";
import TransportMap, { type TransportMapHandle } from "../../components/transport/TransportMap.tsx";
import { RunManifest } from "../../components/transport/RunManifest.tsx";
import { RunReadout } from "../../components/transport/RunReadout.tsx";
import { BookingSlip } from "../../components/transport/BookingSlip.tsx";
import { ShippingControl, type ShippingChoice } from "../../components/transport/ShippingControl.tsx";
import {
  cityIdFromStops,
  fetchOffersForCity,
  fetchTransportNetwork,
  isOnTheRoad,
  type TransportBooking,
  type TransportCheckpoint,
  type TransportCorridor,
  type TransportNetwork,
  type TransportOffer,
  type TransportRun,
  type TransportStop,
} from "../../lib/repositories/transportNetwork.ts";
import { useAuthStore } from "../../lib/auth/auth-store.ts";
import { loadWords, money } from "../../lib/transportQuote.ts";

/**
 * DIRECTION CONTRACT
 *
 * THESIS — A freight manifest, not a feature page. The visitor is a surveyor who
 * needs an instrument or a tonne of gravel moved between two named towns, and the
 * only question the surface answers is: which vehicle is going that way, how full
 * is it, and will it actually roll?
 *
 * OWN-WORLD — The sheet grammar the auth plates already established: hairline
 * rules instead of card shadows, IBM Plex Mono for anything that measures or
 * numbers, ruled cartouches for facts, and brand red reserved for one meaning —
 * this run will roll. The Esri keyless grey ground is the same map the market
 * already sits on, so the corridors read as the same country.
 *
 * STORY — Top to bottom: say what you are shipping (the one variable) → see the
 * corridors that can carry it → type the town you need it in → read the matching
 * runs as manifest rows, page by page, each with its load meter and its own
 * longitudinal section → hold a space. Live runs report where they were seen,
 * never where they are guessed to be.
 *
 * FIRST VIEWPORT — The shipping control and the corridor map, side by side, with
 * the soonest bookable roll named in the ruled band under the control (while
 * every departure is a specimen the band says so rather than quoting a date). No
 * hero and no marketing metrics: the instrument the page sells is a load meter,
 * and it is on screen immediately.
 *
 * FORM — Concept seed 4f05ef01, assignment 6: a consolidation table. Two columns
 * at desktop, one stack at 390px. Rows are ruled blocks, the load meter is
 * discrete cells below 24 slots so a bakkie and a tipper are not the same
 * picture, and the spine places stations at their real offset.
 *
 * FINISH — Every run and corridor on the surface is specimen data and stamped as
 * such; the page refuses a specimen booking in its own words. Nothing claims a
 * vehicle is on a road unless a checkpoint was reported.
 */

/** An instant, shortened to fit a facts cell. */
function stamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Rows on one page of the manifest. A run row is tall — it carries its own
 * load meter — so five is what a reader can compare at once. */
const PAGE_SIZE = 5;

/**
 * A trip is found by the town it must reach — the search asks "where must it go",
 * so the answer stays honest to that question — or by the code on its plate. The
 * corridor's published name is deliberately not searched: it reads
 * "Bulawayo – Harare", so matching it would list a run leaving the town the visitor
 * asked to reach, going the other way.
 */
function matchesQuery(run: TransportRun, query: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return [run.destination_city, run.route_code].some((field) =>
    field.toLowerCase().includes(needle),
  );
}

const bySoonestRoll = (a: TransportRun, b: TransportRun) =>
  a.planned_departure_at.localeCompare(b.planned_departure_at);

/**
 * Turning to the page that holds a row and scrolling to it are one act, but the
 * row is not in the document until that page has rendered, so this waits a few
 * frames instead of pretending it already is.
 */
function scrollToRow(id: string, frame = 0) {
  const row = document.getElementById(`tp-run-${id}`);
  if (row) {
    row.scrollIntoView({ block: "center", behavior: "smooth" });
    return;
  }
  if (frame < 30) requestAnimationFrame(() => scrollToRow(id, frame + 1));
}

export default function PublicTransportPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [params, setParams] = useSearchParams();
  const mapRef = useRef<TransportMapHandle>(null);
  const mapCardRef = useRef<HTMLDivElement>(null);
  const runsRef = useRef<HTMLElement>(null);

  const [network, setNetwork] = useState<TransportNetwork | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  /** The trip search, mirrored into `?to=` so a found list is a shareable link. */
  const [search, setSearch] = useState(() => params.get("to") ?? "");
  const [page, setPage] = useState(1);
  const [choice, setChoice] = useState<ShippingChoice>({ slots: 1, weightKg: 0, finalMile: false });
  const [bookingRunId, setBookingRunId] = useState<string | null>(null);
  /** The run the plot is pointing at and the readout is describing. */
  const [focusedRunId, setFocusedRunId] = useState<string | null>(null);
  const [held, setHeld] = useState<TransportBooking | null>(null);
  /** Keyed by city so a changed destination reads as "not checked yet" without an effect. */
  const [offerState, setOfferState] = useState<{
    cityId: string;
    rows: TransportOffer[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTransportNetwork()
      .then((next) => {
        if (!cancelled) setNetwork(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  function retry() {
    setNetwork(null);
    setFailed(false);
    setReload((n) => n + 1);
  }

  const query = search.trim();

  const stopsByRoute = useMemo(() => {
    const map = new Map<string, TransportStop[]>();
    for (const stop of network?.stops ?? []) {
      const list = map.get(stop.route_id);
      if (list) list.push(stop);
      else map.set(stop.route_id, [stop]);
    }
    for (const list of map.values()) list.sort((a, b) => a.sequence - b.sequence);
    return map;
  }, [network]);

  const corridorByRoute = useMemo(() => {
    const map = new Map<string, TransportCorridor>();
    for (const corridor of network?.corridors ?? []) map.set(corridor.route_id, corridor);
    return map;
  }, [network]);

  const trailByRun = useMemo(() => {
    const map = new Map<string, TransportCheckpoint[]>();
    for (const checkpoint of network?.checkpoints ?? []) {
      const list = map.get(checkpoint.departure_id);
      if (list) list.push(checkpoint);
      else map.set(checkpoint.departure_id, [checkpoint]);
    }
    return map;
  }, [network]);

  /** The towns runs actually end in, most served first, so the search box only
   * offers answers this network can give. */
  const destinations = useMemo(() => {
    const counts = new Map<string, number>();
    for (const run of network?.runs ?? []) {
      counts.set(run.destination_city, (counts.get(run.destination_city) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [network]);

  /** Every run the search can still answer for, soonest roll first. The pager cuts
   * this one list, so searching and turning pages are the same act. */
  const matchedRuns = useMemo(
    () => (network?.runs ?? []).filter((run) => matchesQuery(run, query)).sort(bySoonestRoll),
    [network, query],
  );

  const pageCount = Math.max(1, Math.ceil(matchedRuns.length / PAGE_SIZE));
  /** The list can shorten under a held page — a narrower match, a reload — so the
   * page the reader stands on is clamped to the pages that exist. */
  const currentPage = Math.min(Math.max(page, 1), pageCount);
  const pageNumbers = getPageNumbers(currentPage, pageCount);
  const pageRuns = matchedRuns.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const firstShown = matchedRuns.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const lastShown = Math.min(currentPage * PAGE_SIZE, matchedRuns.length);

  const destinationId = useMemo(
    () => (query && network ? cityIdFromStops(network.stops, query) : null),
    [query, network],
  );

  useEffect(() => {
    if (destinationId === null) return;
    let cancelled = false;
    fetchOffersForCity(destinationId)
      .then((rows) => {
        if (!cancelled) setOfferState({ cityId: destinationId, rows });
      })
      .catch(() => {
        // A city with no answer and a city with no room are different claims,
        // but both mean "we could not confirm space", so say nothing rather
        // than imply an offer count the database did not return.
        if (!cancelled) setOfferState({ cityId: destinationId, rows: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [destinationId]);

  const offers =
    destinationId !== null && offerState?.cityId === destinationId ? offerState.rows : null;

  // The receipt outlives the row it came from, so it names its own corridor.
  const heldRun = held ? (network?.runs ?? []).find((run) => run.departure_id === held.departure_id) : undefined;

  const focusedRun = (network?.runs ?? []).find(
    (run) => run.departure_id === focusedRunId,
  ) ?? null;

  /**
   * Vehicles the plot can place: they have left the origin and somebody has
   * reported where. A status alone is not a position, so this is the same claim
   * the map draws, not a wider one.
   */
  const liveRuns = useMemo(() => {
    const reported = new Set((network?.checkpoints ?? []).map((cp) => cp.departure_id));
    return (network?.runs ?? []).filter(
      (run) => isOnTheRoad(run.status) && reported.has(run.departure_id),
    );
  }, [network]);

  /** The soonest vehicle a visitor could actually put load on. */
  const nextRoll = useMemo(() => {
    const open = (network?.runs ?? []).filter(
      (run) => (run.status === "open" || run.status === "quorum_met") && !run.is_sample,
    );
    return open.length
      ? open.reduce((a, b) => (a.planned_departure_at <= b.planned_departure_at ? a : b))
      : null;
  }, [network]);

  const focusRun = useCallback((run: TransportRun) => {
    setFocusedRunId(run.departure_id);
    setBookingRunId(null);
    mapRef.current?.fit(run.route_id);
  }, []);

  /**
   * Bring the plot and its readout onto the screen as one thing. The card is
   * never taller than the viewport once the dock is capped, so `nearest` moves
   * the page only when the map is genuinely out of view — a plate clicked on a
   * map you are already looking at does not jump.
   */
  useEffect(() => {
    if (!focusedRunId) return;
    mapCardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusedRunId, network]);

  /** Typing re-filters from page one. The town stays in the URL so a found list is
   * a link somebody else can open. */
  const runSearch = useCallback(
    (value: string) => {
      setSearch(value);
      setPage(1);
      setBookingRunId(null);
      const next = new URLSearchParams(params);
      if (value.trim()) next.set("to", value);
      else next.delete("to");
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  /** Turning a page is a fresh read of the table, not a continuation of the last
   * scroll position, so the list head comes back into view with it. */
  const gotoPage = useCallback((next: number) => {
    setPage(next);
    setBookingRunId(null);
    runsRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);

  /**
   * A plate can point at a run the search has hidden, so this works out which page
   * holds that row — clearing the search first when the row is not in it — turns to
   * the page, and brings the row to the middle of the screen. The focused row
   * carries a heavier rule, so it can be found there.
   */
  const openRow = useCallback(
    (run: TransportRun) => {
      const inList = matchedRuns.some((row) => row.departure_id === run.departure_id);
      const list = inList ? matchedRuns : (network?.runs ?? []).slice().sort(bySoonestRoll);
      if (!inList) runSearch("");
      const index = list.findIndex((row) => row.departure_id === run.departure_id);
      if (index >= 0) setPage(Math.floor(index / PAGE_SIZE) + 1);
      scrollToRow(run.departure_id);
    },
    [matchedRuns, network, runSearch],
  );

  const startBooking = useCallback(
    (run: TransportRun) => {
      if (!user) {
        navigate("/login");
        return;
      }
      setHeld(null);
      setBookingRunId((current) => (current === run.departure_id ? null : run.departure_id));
    },
    [navigate, user],
  );

  return (
    <div className="web3-surface">
      <header className="web3-header">
        <div className="web3-header-inner">
          <span className="flex min-w-0 items-baseline gap-2">
            <Link to="/" aria-label="SiteSurveyor home" className="web3-brand">
              <img src="/logo.svg" alt="" className="web3-brand-logo" aria-hidden="true" />
              <span className="web3-brand-name">SiteSurveyor</span>
            </Link>
            <span className="web3-brand-sub hidden truncate sm:inline">/ Platform Transport</span>
          </span>
          <div className="flex items-center gap-2">
            <Link
              to="/market"
              className="web3-btn gap-1.5"
              title="Tools, hires, materials and people for hire"
            >
              <Store className="size-4" aria-hidden="true" />
              <span className="max-sm:hidden">Public Market</span>
              <span className="sm:hidden">Hire</span>
            </Link>
            <ThemeToggle />
            {user ? (
              <AccountMenu
                user={user}
                trigger={
                  <Button
                    variant="outline"
                    className="group h-10 gap-2 rounded-full py-1.5 pl-1.5 pr-3"
                    aria-label={`Open account menu (${user.name})`}
                  >
                    <AccountMenuAvatar user={user} />
                    <span className="max-w-[132px] truncate text-sm font-semibold max-sm:hidden">
                      {user.name}
                    </span>
                  </Button>
                }
              >
                <AccountMenuItem icon={LayoutGrid} label="Open your workspace" to="/" />
              </AccountMenu>
            ) : (
              <Link to="/login" className="web3-btn web3-btn-primary shrink-0 whitespace-nowrap text-xs sm:text-sm px-3 sm:px-4">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-8 sm:px-6 sm:py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:gap-10">
          <div className="flex min-w-0 flex-col gap-5">
            <div className="max-w-xl">
              <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
                Book space on a run that is already going your way
              </h1>
            </div>

            <ShippingControl value={choice} onChange={setChoice} />

            {network && (
              <dl className="tp-run__facts w-full">
                <div>
                  <dt>Corridors</dt>
                  <dd>{network.corridors.length}</dd>
                </div>
                <div>
                  <dt>Next roll</dt>
                  <dd>{nextRoll ? stamp(nextRoll.planned_departure_at) : "none scheduled"}</dd>
                </div>
                <div>
                  <dt>On the road</dt>
                  <dd>{liveRuns.length}</dd>
                </div>
              </dl>
            )}

            <div className="tp-field w-full sm:max-w-[380px]">
              <label className="tp-label" htmlFor="tp-search">
                Where must it go
              </label>
              <span className="tp-search">
                <Search className="tp-search__icon" aria-hidden="true" />
                <input
                  id="tp-search"
                  value={search}
                  list="tp-destinations"
                  autoComplete="off"
                  enterKeyHint="search"
                  placeholder="Town it must reach, or a route code"
                  onChange={(event) => runSearch(event.target.value)}
                />
                {search ? (
                  <button
                    type="button"
                    className="tp-search__clear"
                    onClick={() => runSearch("")}
                    aria-label="Clear the trip search"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </span>
              <datalist id="tp-destinations">
                {destinations.map(([city, count]) => (
                  <option key={city} value={city}>
                    {count} run{count === 1 ? "" : "s"}
                  </option>
                ))}
              </datalist>
            </div>

            {destinationId !== null && (
              <p className="text-sm text-muted-foreground">
                {offers === null
                  ? "Checking which runs can still take your load…"
                  : `${offers.length} run${
                      offers.length === 1 ? "" : "s"
                    } to ${query} can still take ${loadWords(
                      choice.slots,
                      choice.weightKg,
                    )}.`}
              </p>
            )}
          </div>

          <div
            ref={mapCardRef}
            className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border/80 bg-card"
          >
            <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/80 px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-accent-bg text-[var(--web3-brand)]">
                  <Truck className="size-4" aria-hidden="true" />
                </span>
                <h2 className="market-map-title text-foreground">Corridor network</h2>
              </div>
              <button
                type="button"
                className="tp-ghost"
                onClick={() => {
                  setFocusedRunId(null);
                  mapRef.current?.fit();
                }}
              >
                Fit network
              </button>
            </div>
            <div className="min-h-0 flex-1">
              {failed ? (
                <div className="flex h-[320px] flex-col items-center justify-center gap-3 px-6 text-center">
                  <p className="text-sm font-medium text-muted-foreground">
                    The corridor network could not be read.
                  </p>
                  <Button variant="outline" size="sm" onClick={retry}>
                    Retry
                  </Button>
                </div>
              ) : network ? (
                <TransportMap
                  ref={mapRef}
                  corridors={network.corridors}
                  runs={network.runs}
                  stops={network.stops}
                  checkpoints={network.checkpoints}
                  destinationCityId={destinationId}
                  focusedRunId={focusedRunId}
                  onSelectRun={(run) => {
                    setFocusedRunId(run.departure_id);
                    setBookingRunId(null);
                    mapRef.current?.fit(run.route_id);
                  }}
                />
              ) : (
                <div className="h-[320px] animate-pulse bg-muted/30 sm:h-[420px]" />
              )}
            </div>
            {network && (
              <div className="tp-dock" aria-live="polite">
                {focusedRun ? (
                  <RunReadout
                    run={focusedRun}
                    corridor={corridorByRoute.get(focusedRun.route_id)}
                    stops={stopsByRoute.get(focusedRun.route_id) ?? []}
                    trail={trailByRun.get(focusedRun.departure_id) ?? []}
                    choice={choice}
                    signedIn={user !== null}
                    onClose={() => setFocusedRunId(null)}
                    onOpenRow={openRow}
                    onBook={(run) => {
                      startBooking(run);
                      openRow(run);
                    }}
                  />
                ) : (
                  <div className="tp-legend">
                    <span className="tp-legend__item">
                      <span className="tp-legend__swatch is-live" aria-hidden="true" />
                      will roll
                    </span>
                    <span className="tp-legend__item">
                      <span className="tp-legend__swatch is-arrived" aria-hidden="true" />
                      arrived
                    </span>
                    <span className="tp-legend__item">
                      <span className="tp-legend__swatch" aria-hidden="true" />
                      gathering load
                    </span>
                    <span className="tp-legend__item">
                      <span className="tp-legend__swatch is-specimen" aria-hidden="true" />
                      specimen
                    </span>
                    <span className="tp-legend__hint">Press a plate to read the trip</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section ref={runsRef} className="border-y border-border/70 bg-card/45">
          <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-12">
            <h2 className="market-section-title text-balance text-foreground">
              {query ? `Runs for “${query}”` : "Every open run, soonest roll first"}
            </h2>

            {!failed && (
              <p className="tp-list-count" aria-live="polite">
                {network === null
                  ? "Reading the network…"
                  : matchedRuns.length === 0
                    ? query
                      ? `Nothing matches “${query}”`
                      : "Nothing is open to load"
                    : `Viewing ${firstShown}–${lastShown} of ${matchedRuns.length} run${
                        matchedRuns.length === 1 ? "" : "s"
                      }`}
              </p>
            )}

            {failed && (
              <p className="tp-error mt-6" role="alert">
                The network could not be read. Check the connection and retry.
              </p>
            )}

            {network === null && !failed && (
              <div className="mt-8 flex flex-col gap-4">
                <span className="sr-only">Loading the corridor network</span>
                {[0, 1, 2].map((index) => (
                  <div key={index} className="tp-run">
                    <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                    <div className="h-16 animate-pulse rounded bg-muted/60" />
                  </div>
                ))}
              </div>
            )}

            {network !== null && matchedRuns.length === 0 && (
              <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-border pt-6">
                <p className="text-sm font-medium">
                  {query
                    ? "No run reaches that town or code on the network yet."
                    : "No run is open on the network right now."}
                </p>
                {query && (
                  <button type="button" className="tp-ghost" onClick={() => runSearch("")}>
                    Show every destination
                  </button>
                )}
              </div>
            )}

            {network !== null && pageRuns.length > 0 && (
              <div className="mt-8 flex flex-col gap-4">
                {pageRuns.map((run) => {
                  const isOpen = bookingRunId === run.departure_id;
                  return (
                    <div key={run.departure_id} id={`tp-run-${run.departure_id}`}>
                      <RunManifest
                        run={run}
                        corridor={corridorByRoute.get(run.route_id)}
                        stops={stopsByRoute.get(run.route_id) ?? []}
                        trail={trailByRun.get(run.departure_id) ?? []}
                        choice={choice}
                        isOpen={isOpen}
                        focused={focusedRunId === run.departure_id}
                        signedIn={user !== null}
                        onFocus={focusRun}
                        onBook={startBooking}
                      />
                      {isOpen && user && (
                        <div className="mt-3">
                          <BookingSlip
                            run={run}
                            corridor={corridorByRoute.get(run.route_id)}
                            stops={network.stops}
                            choice={choice}
                            workspaceId={user.workspaceId}
                            recipientName={user.name}
                            onBooked={(booking) => {
                              setHeld(booking);
                              setBookingRunId(null);
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {network !== null && pageCount > 1 && (
              <div className="tp-pager">
                <Pagination className="mx-0 w-auto justify-start sm:justify-end">
                  <PaginationContent className="flex-wrap gap-1">
                    <PaginationItem>
                      <PaginationPrevious
                        className={
                          currentPage === 1 ? "pointer-events-none opacity-50" : undefined
                        }
                        href="#"
                        onClick={(event) => {
                          event.preventDefault();
                          gotoPage(currentPage - 1);
                        }}
                      />
                    </PaginationItem>
                    {pageNumbers.map((pageNumber, index) =>
                      pageNumber === "..." ? (
                        <PaginationItem key={`gap-${index}`}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      ) : (
                        <PaginationItem key={`page-${pageNumber}`}>
                          <PaginationLink
                            href="#"
                            isActive={pageNumber === currentPage}
                            onClick={(event) => {
                              event.preventDefault();
                              gotoPage(pageNumber);
                            }}
                          >
                            {pageNumber}
                          </PaginationLink>
                        </PaginationItem>
                      ),
                    )}
                    <PaginationItem>
                      <PaginationNext
                        className={
                          currentPage === pageCount ? "pointer-events-none opacity-50" : undefined
                        }
                        href="#"
                        onClick={(event) => {
                          event.preventDefault();
                          gotoPage(currentPage + 1);
                        }}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}

            {held && (
              <div className="tp-slip mt-10" role="status" aria-live="polite">
                <div className="tp-slip__receipt">
                  <span className="tp-slip__code">{held.tracking_code}</span>
                  <span>
                    {loadWords(held.slots, held.weight_kg)} held on{" "}
                    {heldRun ? `${heldRun.origin_city} → ${heldRun.destination_city}` : "that run"}{" "}
                    — {money(held.fee, held.currency)} outstanding.
                  </span>
                </div>
                <p className="tp-slip__note">
                  Nothing charged yet — the run will not roll until the fee is settled.
                </p>
                <div className="tp-run__actions">
                  <button type="button" className="tp-ghost" onClick={() => setHeld(null)}>
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
