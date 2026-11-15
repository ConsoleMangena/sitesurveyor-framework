import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Minus, Move, Plus, RotateCcw, X } from "lucide-react";
import { Button } from "../ui/button.tsx";
import {
  BASEMAP_ATTRIBUTION,
  BASEMAP_BASE_URL,
  BASEMAP_LABELS_URL,
  BASEMAP_MAX_NATIVE_ZOOM,
} from "../map/basemap.ts";
import {
  MARKET_DOT_COLORS,
  type MarketDot,
  type MarketDotKind,
} from "./marketDots";

const DEFAULT_VIEW: L.LatLngTuple = [20, 10];
const DEFAULT_ZOOM = 2.2;
/** Screen-space grid used to group overlapping pins into one bubble. */
const CLUSTER_CELL_PX = 58;
const MAX_CLUSTER_ZOOM = 12;

interface LeafletGlobeProps {
  dots: MarketDot[] | null;
  /** Coordinate-bearing rows in the current scope; may exceed the plotted cap. */
  totalPoints: number;
  failed: boolean;
  onSelect: (dot: MarketDot) => void;
  onRetry: () => void;
  /** "kind:id" keys matching the active registry search; null when not searching. */
  matchKeys?: Set<string> | null;
  /** Refit the map to the pins whenever this token changes (e.g. scope tabs). */
  fitKey?: string;
  /** The visitor's own GPS fix; drawn as a "you are here" puck when present. */
  userLocation?: { lat: number; lng: number } | null;
  children?: React.ReactNode;
  heightClassName?: string;
}

export interface MarketGlobeHandle {
  /** Smoothly recenter/zoom the map (e.g. when a list item is activated). */
  panTo: (lat: number, lng: number, zoom?: number) => void;
  /** Brief highlight ring at a coordinate; auto-removes after 1.5s. */
  flashAt: (lat: number, lng: number, color: string) => void;
  /** Recenter on a coordinate at street scale (the "Find my location" button). */
  showMe: (lat: number, lng: number) => void;
}

interface DotCluster {
  lat: number;
  lng: number;
  dots: MarketDot[];
}

// Fix default marker icon paths in Leaflet
const defaultIcon = L.Icon.Default.prototype as {
  _getIconUrl?: unknown;
};
delete defaultIcon._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function dotKey(dot: MarketDot): string {
  return `${dot.kind}:${dot.id}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** True when the cluster's pins are not all stacked on one coordinate. */
function hasSpread(dots: MarketDot[]): boolean {
  const [first] = dots;
  return dots.some((dot) => dot.lat !== first.lat || dot.lng !== first.lng);
}

/** Group pins into cell-sized buckets in the map's projected pixel space. */
function clusterDots(map: L.Map, dots: MarketDot[]): DotCluster[] {
  const zoom = map.getZoom();
  const buckets = new Map<string, MarketDot[]>();
  for (const dot of dots) {
    const point = map.project([dot.lat, dot.lng], zoom);
    const key = `${Math.floor(point.x / CLUSTER_CELL_PX)}:${Math.floor(point.y / CLUSTER_CELL_PX)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(dot);
    else buckets.set(key, [dot]);
  }
  return [...buckets.values()].map((members) => ({
    lat: members[0].lat,
    lng: members[0].lng,
    dots: members,
  }));
}

const LeafletGlobe = forwardRef<MarketGlobeHandle, LeafletGlobeProps>(
  function LeafletGlobe(
    {
      dots,
      totalPoints,
      failed,
      onSelect,
      onRetry,
      matchKeys = null,
      fitKey,
      userLocation = null,
      children,
      heightClassName = "h-[500px] sm:h-[600px] lg:h-[660px]",
    },
    ref,
  ) {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const markerLayerRef = useRef<L.LayerGroup | null>(null);
    const flashLayerRef = useRef<L.LayerGroup | null>(null);
    const userLayerRef = useRef<L.LayerGroup | null>(null);
    const lastFitTokenRef = useRef<string | null>(null);
    const onSelectRef = useRef(onSelect);
    onSelectRef.current = onSelect;

    const [hiddenKinds, setHiddenKinds] = useState<Set<MarketDotKind>>(
      () => new Set(),
    );
    const [openCluster, setOpenCluster] = useState<DotCluster | null>(null);

    // Latest render inputs, readable from Leaflet event handlers.
    const stateRef = useRef<{
      dots: MarketDot[] | null;
      matchKeys: Set<string> | null;
      hiddenKinds: Set<MarketDotKind>;
    }>({ dots: null, matchKeys: null, hiddenKinds: new Set() });

    const drawMarkers = useCallback(() => {
      const map = mapRef.current;
      const layer = markerLayerRef.current;
      if (!map || !layer) return;
      layer.clearLayers();

      const current = stateRef.current;
      if (!current.dots) return;
      const visible = current.dots.filter(
        (dot) => !current.hiddenKinds.has(dot.kind),
      );

      for (const cluster of clusterDots(map, visible)) {
        if (cluster.dots.length === 1) {
          const dot = cluster.dots[0];
          const matched =
            !current.matchKeys || current.matchKeys.has(dotKey(dot));
          const base = matched
            ? { radius: 6.5, weight: 1.8, opacity: 1, fillOpacity: 0.85 }
            : { radius: 5, weight: 1.2, opacity: 0.35, fillOpacity: 0.2 };
          const halo = L.circleMarker([dot.lat, dot.lng], {
            radius: base.radius * 2.2,
            color: MARKET_DOT_COLORS[dot.kind],
            weight: 0,
            fillColor: MARKET_DOT_COLORS[dot.kind],
            fillOpacity: 0.16,
          });
          halo.addTo(layer);

          const marker = L.circleMarker([dot.lat, dot.lng], {
            ...base,
            fillColor: MARKET_DOT_COLORS[dot.kind],
            color: "#ffffff",
          });

          const name = escapeHtml(dot.name);
          const location = escapeHtml(dot.location);
          marker.bindTooltip(
            `<div style="font-family: inherit; font-size: 12px; line-height: 1.35; padding: 2px;">
              <div style="font-weight: 650; color: var(--foreground);">${name}</div>
              <div style="font-size: 11px; color: var(--muted-foreground); text-transform: capitalize; margin-top: 2px;">
                ${dot.kind}${location ? ` · ${location}` : ""}
              </div>
            </div>`,
            {
              direction: "top",
              offset: [0, -7],
              opacity: 0.96,
              className: "market-tooltip-shell",
            },
          );

          const hover = matched
            ? { radius: 9, weight: 2.5, fillOpacity: 1 }
            : { radius: 7, weight: 1.8, fillOpacity: 0.45 };
          marker.on("mouseover", () => marker.setStyle(hover));
          marker.on("mouseout", () => marker.setStyle(base));
          marker.on("click", () => onSelectRef.current(dot));

          marker.addTo(layer);
          continue;
        }

        const members = cluster.dots;
        const matchedCount = current.matchKeys
          ? members.filter((dot) => current.matchKeys?.has(dotKey(dot)))
              .length
          : members.length;
        const dim = current.matchKeys !== null && matchedCount === 0;
        const hit = current.matchKeys !== null && matchedCount > 0;
        const size = Math.round(
          Math.min(54, 24 + Math.sqrt(members.length) * 4),
        );
        const icon = L.divIcon({
          className: "market-cluster",
          html: `<div class="market-cluster-bubble${hit ? " is-match" : ""}${
            dim ? " is-dim" : ""
          }" style="width:${size}px;height:${size}px">${members.length}</div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });
        const marker = L.marker([cluster.lat, cluster.lng], {
          icon,
          keyboard: true,
          title: `${members.length} market pins here`,
          alt: `${members.length} market pins here, press Enter to open`,
        });
        marker.bindTooltip(
          `${members.length} pins here, click to ${
            hasSpread(members) && map.getZoom() < MAX_CLUSTER_ZOOM
              ? "zoom in"
              : "list them"
          }`,
          { direction: "top", offset: [0, -size / 2], opacity: 0.96 },
        );
        marker.on("click", () => {
          const liveMap = mapRef.current;
          if (!liveMap) return;
          if (
            hasSpread(members) &&
            liveMap.getZoom() < MAX_CLUSTER_ZOOM
          ) {
            liveMap.fitBounds(
              L.latLngBounds(
                members.map(
                  (dot) => [dot.lat, dot.lng] as L.LatLngTuple,
                ),
              ),
              {
                padding: [56, 56],
                maxZoom: Math.min(liveMap.getZoom() + 4, MAX_CLUSTER_ZOOM),
              },
            );
          } else {
            setOpenCluster(cluster);
          }
        });

        marker.addTo(layer);
      }
    }, []);

    const fitToDots = useCallback(() => {
      const map = mapRef.current;
      if (!map) return;
      const rows = stateRef.current.dots ?? [];
      if (rows.length === 0) {
        map.setView(DEFAULT_VIEW, DEFAULT_ZOOM, { animate: false });
        return;
      }
      map.fitBounds(
        L.latLngBounds(
          rows.map((dot) => [dot.lat, dot.lng] as L.LatLngTuple),
        ),
        { padding: [48, 48], maxZoom: 8, animate: false },
      );
    }, []);

    // Initialize map
    useEffect(() => {
      if (!mapContainerRef.current || mapRef.current) return;

      const map = L.map(mapContainerRef.current, {
        center: DEFAULT_VIEW,
        zoom: DEFAULT_ZOOM,
        minZoom: 2,
        maxZoom: 14,
        worldCopyJump: true,
        zoomControl: false,
      });

      // Keyless light basemap so the kind-coded pins stay the loudest thing.
      L.tileLayer(BASEMAP_BASE_URL, {
        attribution: BASEMAP_ATTRIBUTION,
        maxNativeZoom: BASEMAP_MAX_NATIVE_ZOOM,
        maxZoom: 19,
        noWrap: false,
      }).addTo(map);

      L.tileLayer(BASEMAP_LABELS_URL, {
        maxNativeZoom: BASEMAP_MAX_NATIVE_ZOOM,
        maxZoom: 19,
        noWrap: false,
      }).addTo(map);

      markerLayerRef.current = L.layerGroup().addTo(map);
      userLayerRef.current = L.layerGroup().addTo(map);
      map.on("zoomend", drawMarkers);
      map.on("movestart", () => setOpenCluster(null));

      mapRef.current = map;

      // Invalidate size to ensure tiles fill container completely
      const timer = setTimeout(() => {
        map.invalidateSize();
      }, 120);

      const resizeObserver = new ResizeObserver(() => {
        map.invalidateSize();
      });
      resizeObserver.observe(mapContainerRef.current);

      return () => {
        clearTimeout(timer);
        resizeObserver.disconnect();
        map.off("zoomend", drawMarkers);
        map.remove();
        mapRef.current = null;
        markerLayerRef.current = null;
        flashLayerRef.current = null;
        userLayerRef.current = null;
      };
    }, [drawMarkers]);

    // Keep the redraw handler's inputs current, then repaint the pins.
    useEffect(() => {
      stateRef.current = { dots, matchKeys, hiddenKinds };
      drawMarkers();
      setOpenCluster(null);
    }, [dots, matchKeys, hiddenKinds, drawMarkers]);

    // "You are here" puck: a soft blue halo with a solid core so the visitor
    // can always spot themselves among the kind-coded market pins.
    useEffect(() => {
      const layer = userLayerRef.current;
      if (!layer) return;
      layer.clearLayers();
      if (!userLocation) return;
      const point: L.LatLngTuple = [userLocation.lat, userLocation.lng];
      L.circleMarker(point, {
        radius: 18,
        color: "#3b82f6",
        weight: 2,
        opacity: 0.9,
        fillColor: "#3b82f6",
        fillOpacity: 0.18,
      }).addTo(layer);
      L.circleMarker(point, {
        radius: 7,
        color: "#ffffff",
        weight: 2,
        opacity: 1,
        fillColor: "#2563eb",
        fillOpacity: 1,
      })
        .bindTooltip("You are here", { direction: "top", offset: [0, -10] })
        .addTo(layer);
    }, [userLocation]);

    // Frame the pins on first load and whenever the scope token changes.
    useEffect(() => {
      if (!dots || dots.length === 0) return;
      const token = fitKey ?? "default";
      if (lastFitTokenRef.current === token) return;
      lastFitTokenRef.current = token;
      const frame = requestAnimationFrame(fitToDots);
      return () => cancelAnimationFrame(frame);
    }, [dots, fitKey, fitToDots]);

    // A new scope starts with every kind visible again.
    useEffect(() => {
      setHiddenKinds((previous) => (previous.size === 0 ? previous : new Set()));
    }, [fitKey]);

    useImperativeHandle(
      ref,
      () => ({
        panTo(lat: number, lng: number, zoom = 10) {
          mapRef.current?.setView([lat, lng], zoom, { animate: true });
        },
        showMe(lat: number, lng: number) {
          mapRef.current?.setView([lat, lng], 13, { animate: true });
        },
        flashAt(lat: number, lng: number, color: string) {
          const map = mapRef.current;
          if (!map) return;
          if (!flashLayerRef.current) {
            flashLayerRef.current = L.layerGroup().addTo(map);
          }
          const layer = flashLayerRef.current;
          layer.clearLayers();
          const ring = L.circleMarker([lat, lng], {
            radius: 14,
            color,
            weight: 3,
            opacity: 1,
            fillColor: color,
            fillOpacity: 0.12,
          });
          ring.addTo(layer);
          window.setTimeout(() => ring.remove(), 1500);
        },
      }),
      [],
    );

    const zoomBy = useCallback((delta: number) => {
      const map = mapRef.current;
      if (!map) return;
      map.setZoom(map.getZoom() + delta);
    }, []);

    const toggleKind = (kind: MarketDotKind) => {
      setHiddenKinds((previous) => {
        const next = new Set(previous);
        if (next.has(kind)) next.delete(kind);
        else next.add(kind);
        return next;
      });
      setOpenCluster(null);
    };

    const counts = useMemo(() => {
      const next = Object.fromEntries(
        (Object.keys(MARKET_DOT_COLORS) as MarketDotKind[]).map((kind) => [
          kind,
          0,
        ]),
      ) as Record<MarketDotKind, number>;
      for (const dot of dots ?? []) next[dot.kind] += 1;
      return next;
    }, [dots]);

    const plottedCount = useMemo(
      () =>
        (dots ?? []).filter((dot) => !hiddenKinds.has(dot.kind)).length,
      [dots, hiddenKinds],
    );

    const plotTotal = dots?.length ?? 0;

    return (
      <section className="relative w-full">
        <div
          className={`relative w-full overflow-hidden bg-muted/20 ${heightClassName}`}
        >
          <p className="sr-only">
            Interactive map of published listings, professionals, jobs, firms,
            and training events. Nearby pins group into numbered bubbles;
            choose a bubble to zoom in or open its list. The same items are
            listed below the map.
          </p>

          <div ref={mapContainerRef} className="absolute inset-0 z-0" />

          {/* Overlay UI */}
          <div className="pointer-events-none absolute inset-0 z-10">
            {/* Pin legend + counts (top-left) */}
            <div className="pointer-events-auto absolute left-3 top-3 max-w-[calc(100%-8rem)] sm:left-6 sm:top-6">
              <div className="rounded-xl border border-border/80 bg-background/92 px-3 py-2 shadow-sm backdrop-blur-md">
                <p
                  role="status"
                  aria-live="polite"
                  className="font-mono text-micro tabular-nums text-muted-foreground"
                >
                  {dots === null ? (
                    "ACQUIRING FEED…"
                  ) : plottedCount === 0 ? (
                    "NO PINS IN VIEW"
                  ) : totalPoints > plotTotal ? (
                    `SHOWING ${plotTotal} OF ${totalPoints} PINS`
                  ) : (
                    `${plottedCount} PINS`
                  )}
                </p>
                {dots !== null && dots.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {(Object.keys(MARKET_DOT_COLORS) as MarketDotKind[]).map(
                      (kind) => {
                        if (counts[kind] === 0) return null;
                        const hidden = hiddenKinds.has(kind);
                        return (
                          <button
                            key={kind}
                            type="button"
                            aria-pressed={!hidden}
                            aria-label={`${hidden ? "Show" : "Hide"} ${kind} pins`}
                            onClick={() => toggleKind(kind)}
                            className={`-my-1 flex min-h-8 items-center gap-1.5 py-1 text-micro font-medium transition-opacity ${
                              hidden
                                ? "opacity-40 line-through"
                                : "text-foreground"
                            }`}
                          >
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{
                                backgroundColor: MARKET_DOT_COLORS[kind],
                              }}
                              aria-hidden="true"
                            />
                            {counts[kind]} {kind}
                          </button>
                        );
                      },
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Map Controls (top-right) */}
            <div className="pointer-events-auto absolute right-3 top-3 flex flex-col items-end gap-1.5 sm:right-6 sm:top-6">
              <div className="flex flex-col overflow-hidden rounded-xl border border-border/80 bg-background/92 shadow-sm backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => zoomBy(1)}
                  title="Zoom in"
                  aria-label="Zoom in"
                  className="flex size-10 items-center justify-center text-foreground transition-colors hover:bg-muted"
                >
                  <Plus className="size-4" aria-hidden="true" />
                </button>
                <span className="h-px w-full bg-border/70" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => zoomBy(-1)}
                  title="Zoom out"
                  aria-label="Zoom out"
                  className="flex size-10 items-center justify-center text-foreground transition-colors hover:bg-muted"
                >
                  <Minus className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Map Controls (bottom-right) */}
            <div className="pointer-events-auto absolute bottom-8 right-3 z-10 sm:bottom-6 sm:right-6">
              <button
                type="button"
                onClick={() => {
                  setOpenCluster(null);
                  fitToDots();
                }}
                className="flex items-center gap-1.5 rounded-full border border-border/80 bg-background/92 px-3.5 py-2 text-xs font-semibold text-foreground shadow-sm backdrop-blur-md transition-all hover:bg-background hover:shadow"
                title="Fit map to the pins"
              >
                <RotateCcw className="size-3 text-muted-foreground" />
                Fit pins
              </button>
            </div>

            {/* Drag hint (mobile) */}
            <div className="pointer-events-auto absolute bottom-8 left-3 z-10 sm:hidden">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/88 px-2.5 py-1 text-micro font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
                <Move className="size-3" aria-hidden="true" />
                Drag to pan · scroll to zoom
              </span>
            </div>

            {/* Cluster contents, for pins stacked on the same coordinate */}
            {openCluster ? (
              <div className="pointer-events-auto absolute bottom-20 left-3 right-3 sm:bottom-6 sm:left-6 sm:right-auto sm:w-80">
                <div className="overflow-hidden rounded-xl border border-border/80 bg-background/95 shadow-lg backdrop-blur-md">
                  <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
                    <p className="text-xs font-semibold text-foreground">
                      {openCluster.dots.length} pins in this area
                    </p>
                    <button
                      type="button"
                      onClick={() => setOpenCluster(null)}
                      aria-label="Close pin list"
                      className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                  <ul className="max-h-56 overflow-y-auto">
                    {openCluster.dots.map((dot) => {
                      const matched =
                        !matchKeys || matchKeys.has(dotKey(dot));
                      return (
                        <li
                          key={dotKey(dot)}
                          className="border-b border-border/50 last:border-b-0"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              onSelectRef.current(dot);
                              setOpenCluster(null);
                            }}
                            className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/60 ${
                              matched ? "" : "opacity-45"
                            }`}
                          >
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{
                                backgroundColor: MARKET_DOT_COLORS[dot.kind],
                              }}
                              aria-hidden="true"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-medium text-foreground">
                                {dot.name || "Untitled"}
                              </span>
                              <span className="block truncate text-micro capitalize text-muted-foreground">
                                {dot.kind}
                                {dot.location ? ` · ${dot.location}` : ""}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            ) : null}

            {/* Optional custom children overlay */}
            {children}
          </div>

          {/* Error state */}
          {failed && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/85 backdrop-blur-sm">
              <div className="text-center rounded-xl border border-border bg-card p-6 shadow-lg">
                <p className="mb-4 text-sm font-medium text-muted-foreground">
                  Failed to load market pins
                </p>
                <Button onClick={onRetry} variant="outline" size="sm">
                  Retry
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>
    );
  },
);

export default LeafletGlobe;
