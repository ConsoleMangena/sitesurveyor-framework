import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { PackageSearch, Truck } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import { AccountMenu, AccountMenuAvatar, AccountMenuItem } from "../../components/account-menu.tsx";
import { ThemeToggle } from "../../components/theme/ThemeToggle.tsx";
import TransportMap, { type TransportMapHandle } from "../../components/transport/TransportMap.tsx";
import { RunManifest } from "../../components/transport/RunManifest.tsx";
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
 * corridors that can carry it → pick the town you need it in → read the runs as
 * manifest rows, each with its load meter and its own longitudinal section →
 * hold a space. Live runs report where they were seen, never where they are
 * guessed to be.
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

function clock(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** The same instant, shortened to fit a facts cell. */
function stamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PublicTransportPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [params, setParams] = useSearchParams();
  const mapRef = useRef<TransportMapHandle>(null);

  const [network, setNetwork] = useState<TransportNetwork | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [choice, setChoice] = useState<ShippingChoice>({ slots: 1, weightKg: 0, finalMile: false });
  const [bookingRunId, setBookingRunId] = useState<string | null>(null);
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

  const destination = params.get("to");

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

  /** Runs grouped by the town they end in, groups ordered by their soonest roll. */
  const groups = useMemo(() => {
    const byCity = new Map<string, TransportRun[]>();
    for (const run of network?.runs ?? []) {
      const list = byCity.get(run.destination_city);
      if (list) list.push(run);
      else byCity.set(run.destination_city, [run]);
    }
    return [...byCity.entries()]
      .map(([city, runs]) => ({
        city,
        runs: runs.sort((a, b) => a.planned_departure_at.localeCompare(b.planned_departure_at)),
        soonest: runs[0].planned_departure_at,
        allSample: runs.every((run) => run.is_sample),
      }))
      .sort((a, b) => a.city.localeCompare(b.city));
  }, [network]);

  const destinationId = useMemo(
    () => (destination && network ? cityIdFromStops(network.stops, destination) : null),
    [destination, network],
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

  const visibleGroups = destination ? groups.filter((group) => group.city === destination) : groups;

  // The receipt outlives the row it came from, so it names its own corridor.
  const heldRun = held ? (network?.runs ?? []).find((run) => run.departure_id === held.departure_id) : undefined;

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
    mapRef.current?.fit(run.route_id);
    setBookingRunId(null);
  }, []);

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

  const shownRuns = visibleGroups.reduce((total, group) => total + group.runs.length, 0);

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
                <AccountMenuItem icon={PackageSearch} label="Browse the market" to="/market" />
              </AccountMenu>
            ) : (
              <Link to="/login" className="web3-btn web3-btn-primary">
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
              <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
                Verified platform vehicles move between hub towns and leave when a run has
                gathered the load its size class needs. You pay for the space, not the whole
                truck — and the run does not roll until what it carries is settled.
              </p>
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

            {destination && (
              <p className="text-sm text-muted-foreground">
                {offers === null
                  ? "Checking which runs can still take your load…"
                  : `${offers.length} run${
                      offers.length === 1 ? "" : "s"
                    } to ${destination} can still take ${loadWords(
                      choice.slots,
                      choice.weightKg,
                    )}.`}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <label className="tp-label" htmlFor="tp-destination">
                I need it in
              </label>
              <div className="tp-field min-w-0 grow sm:grow-0">
                <select
                  id="tp-destination"
                  value={destination ?? ""}
                  onChange={(event) => {
                    const next = new URLSearchParams(params);
                    if (event.target.value) next.set("to", event.target.value);
                    else next.delete("to");
                    setParams(next, { replace: true });
                    setBookingRunId(null);
                  }}
                >
                  <option value="">Every destination</option>
                  {groups.map((group) => (
                    <option key={group.city} value={group.city}>
                      {group.city} ({group.runs.length})
                    </option>
                  ))}
                </select>
              </div>
              {destination && (
                <button
                  type="button"
                  className="tp-ghost"
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.delete("to");
                    setParams(next, { replace: true });
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border/80 bg-card">
            <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/80 px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-accent-bg text-[var(--web3-brand)]">
                  <Truck className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <h2 className="market-map-title text-foreground">Corridor network</h2>
                  <p className="text-micro text-muted-foreground">
                    Solid to the last reported checkpoint, dashed beyond it
                  </p>
                </span>
              </div>
              <button
                type="button"
                className="tp-ghost"
                onClick={() => mapRef.current?.fit()}
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
                  onSelectRun={(run) => {
                    setBookingRunId(null);
                    mapRef.current?.fit(run.route_id);
                    document
                      .getElementById(`tp-run-${run.departure_id}`)
                      ?.scrollIntoView({ block: "center", behavior: "smooth" });
                  }}
                />
              ) : (
                <div className="h-[320px] animate-pulse bg-muted/30 sm:h-[420px]" />
              )}
            </div>
          </div>
        </section>

        <section className="border-y border-border/70 bg-card/45">
          <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-12">
            <h2 className="market-section-title text-balance text-foreground">
              {destination ? `Runs into ${destination}` : "Every open run, by destination"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Each row is one vehicle on one corridor. The meter carries two dimensions because
              a run is booked against both — the one that reaches its target first is what the
              departure waits on.
            </p>

            {failed && (
              <p className="tp-error mt-6" role="alert">
                The network could not be read. Check the connection and retry.
              </p>
            )}

            {network === null && !failed && (
              <div className="mt-8 flex flex-col gap-4" aria-live="polite">
                <span className="sr-only">Loading the corridor network</span>
                {[0, 1, 2].map((index) => (
                  <div key={index} className="tp-run">
                    <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                    <div className="h-16 animate-pulse rounded bg-muted/60" />
                  </div>
                ))}
              </div>
            )}

            {network !== null && shownRuns === 0 && (
              <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6">
                <p className="text-sm font-medium">No run is open to that town right now.</p>
                <p className="max-w-xl text-sm text-muted-foreground">
                  Runs open when a vehicle is assigned and close after they arrive. Try
                  another destination, or clear the filter to see the whole network.
                </p>
              </div>
            )}

            {network !== null &&
              visibleGroups.map((group) => (
                <div key={group.city} className="mt-10">
                  <h3 className="auth-rule">
                    {group.city}
                    <span className="ml-2 font-mono text-micro tabular-nums normal-case tracking-normal text-muted-foreground">
                      {group.allSample ? "soonest specimen " : "soonest "}
                      {clock(group.soonest)}
                    </span>
                  </h3>
                  <div className="mt-4 flex flex-col gap-4">
                    {group.runs.map((run) => {
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
                </div>
              ))}

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
                <p className="text-sm text-muted-foreground">
                  The space is reserved now. Nothing has been charged: a coordinator settles the
                  fee and checks the load before the vehicle rolls, and the run will not depart
                  while anything on it is unpaid.
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
