import { useEffect, useRef, useState, type ReactNode } from "react";
import * as maplibregl from "maplibre-gl";
import { Crosshair, Globe2 } from "lucide-react";
import { Button } from "../ui/button.tsx";
import { Map as MapcnMap, useMap, type MapRef } from "../ui/map.tsx";
import {
  MARKET_DOT_COLORS,
  toFeatureCollection,
  type MarketDot,
  type MarketDotKind,
} from "./marketDots";

// Generous: slow connections beat a false error (bizintel uses the same value).
const LOAD_FAILURE_TIMEOUT_MS = 10_000;

interface PublicMarketGlobeProps {
  /** null while the parent is fetching. Already filtered by scope/location. */
  dots: MarketDot[] | null;
  /** Pins that exist in total (before scope/location filtering). */
  totalPoints: number;
  failed: boolean;
  onSelect: (dot: MarketDot) => void;
  onRetry: () => void;
  /** Rendered inside the map container (heading overlay etc.). */
  children?: ReactNode;
  /** Overrides the default full-bleed hero height (e.g. embedded cards). */
  heightClassName?: string;
}

function formatCoord(lngLat: maplibregl.LngLat): string {
  const lat = lngLat.lat;
  const lng = lngLat.lng;
  return `${lat >= 0 ? "+" : ""}${lat.toFixed(2)}° ${lng >= 0 ? "+" : ""}${lng.toFixed(2)}°`;
}

const SOURCE_ID = "market-points";
const HALO_LAYER_ID = "market-dots-halo";
const CORE_LAYER_ID = "market-dots";

const KIND_COLOR_EXPR =
  [
    "match",
    ["get", "kind"],
    "professional",
    MARKET_DOT_COLORS.professional,
    "job",
    MARKET_DOT_COLORS.job,
    "firm",
    MARKET_DOT_COLORS.firm,
    "event",
    MARKET_DOT_COLORS.event,
    MARKET_DOT_COLORS.listing,
  ] as unknown as maplibregl.DataDrivenPropertyValueSpecification<string>;

/** Adds the market pin source + halo/core circle layers once the mapcn map
 *  is loaded, wires click/hover handlers, and runs the one-shot reveal
 *  animation. */
function MapPins({
  dots,
  onSelect,
  onReady,
  onBasemapFailure,
}: {
  dots: MarketDot[] | null;
  onSelect: (dot: MarketDot) => void;
  onReady: () => void;
  onBasemapFailure: () => void;
}) {
  const { map, isLoaded } = useMap();
  // Latest values for handlers bound once at layer creation.
  const dotsRef = useRef(dots);
  const selectRef = useRef(onSelect);
  useEffect(() => {
    dotsRef.current = dots;
  }, [dots]);
  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);
  const readyRef = useRef(false);

  // Basemap style fetch failures surface before "load" — report them so the
  // parent can fall back to the tile-free blank mode.
  useEffect(() => {
    if (!map) return;
    const handleError = (event: maplibregl.ErrorEvent) => {
      if (isLoaded) return;
      const status = (
        event.error as unknown as { status?: number } | undefined
      )?.status;
      const message = String(event.error?.message ?? "");
      if (
        /style|fetch|network/i.test(message) ||
        status === 0 ||
        status === 403 ||
        status === 404
      ) {
        onBasemapFailure();
      }
    };
    map.on("error", handleError);
    return () => {
      map.off("error", handleError);
    };
    // isLoaded intentionally excluded: only pre-load errors matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, onBasemapFailure]);

  useEffect(() => {
    if (!map || !isLoaded) return;

    if (!map.getSource(SOURCE_ID)) {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: toFeatureCollection(dotsRef.current ?? []),
      });
    }
    if (!map.getLayer(HALO_LAYER_ID)) {
      // Soft halo under each pin so pins read as light sources, not stickers.
      map.addLayer({
        id: HALO_LAYER_ID,
        type: "circle",
        source: SOURCE_ID,
        paint: {
          "circle-radius": 14,
          "circle-color": KIND_COLOR_EXPR,
          "circle-blur": 0.9,
          "circle-opacity": 0,
        },
      });
    }
    if (!map.getLayer(CORE_LAYER_ID)) {
      map.addLayer({
        id: CORE_LAYER_ID,
        type: "circle",
        source: SOURCE_ID,
        paint: {
          "circle-radius": 5.5,
          "circle-color": KIND_COLOR_EXPR,
          "circle-stroke-width": 1.25,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0,
          "circle-stroke-opacity": 0,
        },
      });
    }

    const handleClick = (
      event: maplibregl.MapMouseEvent & {
        features?: (maplibregl.MapGeoJSONFeature & {
          properties: Record<string, unknown>;
        })[];
      },
    ) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const props = feature.properties as
        | { kind?: string; id?: string }
        | null;
      const dot = dotsRef.current?.find(
        (candidate) =>
          candidate.kind === props?.kind && candidate.id === props?.id,
      );
      if (dot) selectRef.current(dot);
    };
    const handleEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const handleLeave = () => {
      map.getCanvas().style.cursor = "";
    };
    map.on("click", CORE_LAYER_ID, handleClick);
    map.on("mouseenter", CORE_LAYER_ID, handleEnter);
    map.on("mouseleave", CORE_LAYER_ID, handleLeave);

    // The one authored moment: pins surface like instrument plots after
    // acquisition — exponential ease-out, then hands control back.
    let entranceRaf = 0;
    const startedAt = performance.now();
    const DURATION_MS = 900;
    const easeOut = (t: number) => 1 - Math.pow(2, -10 * t);
    const revealPins = (now: number) => {
      const progress = Math.min((now - startedAt) / DURATION_MS, 1);
      const eased = progress === 0 ? 0 : easeOut(progress);
      if (dotsRef.current === null || dotsRef.current.length > 0) {
        map.setPaintProperty(HALO_LAYER_ID, "circle-opacity", 0.3 * eased);
        map.setPaintProperty(CORE_LAYER_ID, "circle-opacity", eased);
        map.setPaintProperty(CORE_LAYER_ID, "circle-stroke-opacity", eased);
      }
      if (progress < 1) {
        entranceRaf = requestAnimationFrame(revealPins);
      }
    };
    entranceRaf = requestAnimationFrame(revealPins);

    if (!readyRef.current) {
      readyRef.current = true;
      onReady();
    }

    return () => {
      cancelAnimationFrame(entranceRaf);
      map.off("click", CORE_LAYER_ID, handleClick);
      map.off("mouseenter", CORE_LAYER_ID, handleEnter);
      map.off("mouseleave", CORE_LAYER_ID, handleLeave);
      if (map.getLayer(CORE_LAYER_ID)) map.removeLayer(CORE_LAYER_ID);
      if (map.getLayer(HALO_LAYER_ID)) map.removeLayer(HALO_LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  }, [map, isLoaded, onReady]);

  // Keep the data fresh when the parent refetches.
  useEffect(() => {
    if (!map || !isLoaded) return;
    const source = map.getSource(SOURCE_ID);
    if (source && "setData" in source) {
      (source as maplibregl.GeoJSONSource).setData(
        toFeatureCollection(dots ?? []),
      );
    }
  }, [map, isLoaded, dots]);

  return null;
}

/** Live cursor coordinate readout — the page's signature interaction. */
function CoordReadout() {
  const { map } = useMap();
  const coordRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!map) return;
    const handleMove = (event: maplibregl.MapMouseEvent) => {
      if (coordRef.current) {
        coordRef.current.textContent = formatCoord(event.lngLat);
      }
    };
    map.on("mousemove", handleMove);
    return () => {
      map.off("mousemove", handleMove);
    };
  }, [map]);
  return (
    <div className="pointer-events-none absolute right-4 top-4 sm:right-6 sm:top-6">
      <p className="flex items-center gap-1.5 rounded-none border border-border/60 bg-background/85 px-2.5 py-1.5 font-mono text-xs tabular-nums text-muted-foreground shadow-sm backdrop-blur-sm">
        <Crosshair className="size-3" aria-hidden="true" />
        <span ref={coordRef}>——.——° ———.——°</span>
      </p>
    </div>
  );
}

/** Full-bleed globe of the public market: one pin colour per directory kind,
 *  live cursor coordinates, tap any pin to open its detail dialog. Built on
 *  the mapcn <Map> primitive in light theme. */
export default function PublicMarketGlobe({
  dots,
  totalPoints,
  failed,
  onSelect,
  onRetry,
  children,
  heightClassName = "h-[68vh] min-h-[480px]",
}: PublicMarketGlobeProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [ready, setReady] = useState(false);
  const [tilesFailed, setTilesFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Acquisition watchdog: if the basemap never loads, fall back to the
  // self-contained tile-free canvas rather than pulsing forever.
  useEffect(() => {
    if (failed || ready || tilesFailed) return;
    const timeoutId = window.setTimeout(() => {
      window.setTimeout(() => setTilesFailed(true), 0);
    }, LOAD_FAILURE_TIMEOUT_MS);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [failed, ready, tilesFailed, attempt]);

  const plottedCount = dots?.length ?? 0;

  const handleRetry = () => {
    // Event-handler context: synchronous updates are fine here.
    setReady(false);
    setTilesFailed(false);
    setAttempt((value) => value + 1);
    onRetry();
  };

  return (
    <section className="relative">
      <div
        className={`relative w-full overflow-hidden border-y border-border/60 bg-muted/40 ${heightClassName}`}
      >
        {/* Canvas-only content; the searchable registry rows below carry the
            same information for keyboard and screen-reader users. */}
        <p className="sr-only">
          Interactive globe of published listings, professionals, jobs, firms,
          and training events. The same items are listed below the globe.
        </p>
        {!failed ? (
          <MapcnMap
            key={attempt}
            ref={mapRef}
            theme="light"
            blank={tilesFailed}
            projection={{ type: "globe" }}
            center={[15, 15]}
            zoom={1.4}
            className="absolute inset-0"
          >
            <MapPins
              dots={dots}
              onSelect={onSelect}
              onReady={() => setReady(true)}
              onBasemapFailure={() => setTilesFailed(true)}
            />
            <CoordReadout />
            {/* Telemetry pill */}
            <div className="pointer-events-none absolute left-4 top-4 max-w-[calc(100%-5rem)] sm:left-6 sm:top-6">
              <div
                className="rounded-none border border-border/60 bg-background/85 px-3 py-1.5 shadow-sm backdrop-blur-sm"
                role="status"
                aria-live="polite"
              >
                <p className="font-mono text-xs tabular-nums text-muted-foreground">
                  {dots === null ? (
                    <span>ACQUIRING FEED…</span>
                  ) : plottedCount === 0 ? (
                    <span>NO PINS IN VIEW</span>
                  ) : (
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {(Object.keys(MARKET_DOT_COLORS) as MarketDotKind[]).map(
                        (kind) => {
                          const count =
                            dots?.filter((dot) => dot.kind === kind).length ??
                            0;
                          if (count === 0) return null;
                          return (
                            <span key={kind} className="flex items-center gap-1.5">
                              <span
                                className="size-2 shrink-0 rounded-full"
                                style={{
                                  backgroundColor: MARKET_DOT_COLORS[kind],
                                }}
                                aria-hidden="true"
                              />
                              {count}
                            </span>
                          );
                        },
                      )}
                    </span>
                  )}
                </p>
                {dots !== null && plottedCount < totalPoints ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    showing {plottedCount} of {totalPoints} pins · filters
                    applied
                  </p>
                ) : null}
              </div>
            </div>
            {/* Legend */}
            <div className="pointer-events-none absolute bottom-4 right-4 hidden flex-col items-end gap-1.5 sm:bottom-6 sm:right-6 md:flex">
              {(Object.keys(MARKET_DOT_COLORS) as MarketDotKind[]).map(
                (kind) => (
                  <span
                    key={kind}
                    className="flex items-center gap-1.5 rounded-none border border-border/60 bg-background/85 px-2.5 py-1 text-xs capitalize shadow-sm backdrop-blur-sm"
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: MARKET_DOT_COLORS[kind] }}
                      aria-hidden="true"
                    />
                    {kind === "event" ? "Training" : `${kind}s`}
                  </span>
                ),
              )}
            </div>
            {children}
          </MapcnMap>
        ) : (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <Globe2 className="size-9 text-muted-foreground/50" aria-hidden="true" />
            <p className="text-lg font-semibold">Couldn&rsquo;t acquire the feed</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Map tiles didn&rsquo;t arrive in time — your network may be
              blocking them. Retry switches to a self-contained globe that
              needs no tiles. The registry below always works.
            </p>
            <Button size="sm" variant="outline" onClick={handleRetry}>
              Retry without map tiles
            </Button>
          </div>
        )}
        {!failed && !ready && dots === null ? (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2">
            <div className="mx-auto flex w-fit flex-col items-center gap-3 rounded-none border border-border/60 bg-background/85 px-5 py-4 shadow-sm backdrop-blur-sm">
              <div
                className="flex gap-1.5"
                role="status"
                aria-label="Loading the market"
              >
                <span className="size-1.5 animate-pulse rounded-full bg-amber-500" />
                <span className="size-1.5 animate-pulse rounded-full bg-cyan-600 [animation-delay:150ms]" />
                <span className="size-1.5 animate-pulse rounded-full bg-violet-500 [animation-delay:300ms]" />
              </div>
              <p className="text-[11px] font-medium tracking-widest text-muted-foreground">
                ACQUIRING FEED…
              </p>
            </div>
          </div>
        ) : null}
        {!failed && ready && dots !== null && dots.length === 0 ? (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 px-6">
            <p className="mx-auto max-w-md rounded-none border border-border/60 bg-background/90 px-6 py-4 text-center shadow-sm backdrop-blur-sm">
              <span className="block text-base font-semibold">
                Nothing published yet
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                When workspaces list instruments, jobs, or services, they
                appear here.
              </span>
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
