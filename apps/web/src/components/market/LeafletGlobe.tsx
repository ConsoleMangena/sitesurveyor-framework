import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { RotateCcw } from "lucide-react";
import { Button } from "../ui/button.tsx";
import {
  MARKET_DOT_COLORS,
  type MarketDot,
  type MarketDotKind,
} from "./marketDots";

const GLASS_PILL =
  "rounded-full border border-border/80 bg-background/92 px-3 py-1.5 shadow-sm backdrop-blur-md";

interface LeafletGlobeProps {
  dots: MarketDot[] | null;
  totalPoints: number;
  failed: boolean;
  onSelect: (dot: MarketDot) => void;
  onRetry: () => void;
  children?: React.ReactNode;
  heightClassName?: string;
}

export interface MarketGlobeHandle {
  /** Smoothly recenter/zoom the map (e.g. when a list item is activated). */
  panTo: (lat: number, lng: number, zoom?: number) => void;
  /** Brief highlight ring at a coordinate; auto-removes after 1.5s. */
  flashAt: (lat: number, lng: number, color: string) => void;
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

const LeafletGlobe = forwardRef<MarketGlobeHandle, LeafletGlobeProps>(
  function LeafletGlobe(
    { dots, failed, onSelect, onRetry, children, heightClassName = "h-[500px] sm:h-[600px] lg:h-[660px]" },
    ref,
  ) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);
  const flashLayerRef = useRef<L.LayerGroup | null>(null);
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lng: number } | null>(null);

  const plottedCount = dots?.length ?? 0;

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [20, 10],
      zoom: 2.2,
      minZoom: 2,
      maxZoom: 14,
      worldCopyJump: true,
      zoomControl: true,
    });

    // Add tile layer - OpenStreetMap standard basemap for the light theme.
    L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
        noWrap: false,
      },
    ).addTo(map);

    // Track mouse movement
    map.on("mousemove", (e) => {
      setCursorCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    map.on("mouseout", () => {
      setCursorCoords(null);
    });

    mapRef.current = map;

    // Invalidate size to ensure tiles fill container completely
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 120);

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      clearTimeout(timer);
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers when dots change
  useEffect(() => {
    if (!mapRef.current || !dots) return;

    // Clear existing markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    // Add new markers
    dots.forEach((dot) => {
      const color = MARKET_DOT_COLORS[dot.kind];
      const marker = L.circleMarker([dot.lat, dot.lng], {
        radius: 6.5,
        fillColor: color,
        color: "#ffffff",
        weight: 1.8,
        opacity: 1,
        fillOpacity: 0.85,
      });

      // Hover tooltip with name, kind, and location
      const escapedName = dot.name.replace(/</g, "&lt;");
      const escapedLocation = dot.location ? dot.location.replace(/</g, "&lt;") : "";
      marker.bindTooltip(
        `<div style="font-family: inherit; font-size: 12px; line-height: 1.35; padding: 2px;">
          <div style="font-weight: 650; color: #111827;">${escapedName}</div>
          <div style="font-size: 11px; color: #6b7280; text-transform: capitalize; margin-top: 2px;">
            ${dot.kind}${escapedLocation ? ` · ${escapedLocation}` : ""}
          </div>
        </div>`,
        { direction: "top", offset: [0, -7], opacity: 0.96 }
      );

      marker.on("mouseover", () => {
        marker.setStyle({ radius: 9, weight: 2.5, fillOpacity: 1 });
      });

      marker.on("mouseout", () => {
        marker.setStyle({ radius: 6.5, weight: 1.8, fillOpacity: 0.85 });
      });

      marker.on("click", () => {
        onSelect(dot);
      });

      marker.addTo(mapRef.current!);
      markersRef.current.push(marker);
    });
  }, [dots, onSelect]);

  useImperativeHandle(
    ref,
    () => ({
      panTo(lat: number, lng: number, zoom = 10) {
        mapRef.current?.setView([lat, lng], zoom, { animate: true });
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

  const handleResetView = () => {
    mapRef.current?.setView([20, 10], 2.2);
  };

  return (
    <section className="relative w-full">
      <div
        className={`relative w-full overflow-hidden bg-muted/20 ${heightClassName}`}
      >
        <p className="sr-only">
          Interactive map of published listings, professionals, jobs, firms, and
          training events. The same items are listed below the map.
        </p>

        <div ref={mapContainerRef} className="absolute inset-0 z-0" />

        {/* Overlay UI */}
        <div className="pointer-events-none absolute inset-0 z-10">
          {/* Telemetry pill (top-left) */}
          <div className="absolute left-3 top-3 max-w-[calc(100%-8rem)] sm:left-6 sm:top-6">
            <div
              className={GLASS_PILL}
              role="status"
              aria-live="polite"
            >
              <p className="font-mono text-xs tabular-nums text-foreground/80">
                {dots === null ? (
                  <span className="text-muted-foreground">ACQUIRING FEED…</span>
                ) : plottedCount === 0 ? (
                  <span className="text-muted-foreground">NO PINS IN VIEW</span>
                ) : (
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {(Object.keys(MARKET_DOT_COLORS) as MarketDotKind[]).map(
                      (kind) => {
                        const count =
                          dots?.filter((dot) => dot.kind === kind).length ?? 0;
                        if (count === 0) return null;
                        return (
                          <span key={kind} className="flex items-center gap-1.5 font-sans font-medium text-xs text-foreground">
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{
                                backgroundColor: MARKET_DOT_COLORS[kind],
                              }}
                              aria-hidden="true"
                            />
                            <span>
                              {count} {kind}
                            </span>
                          </span>
                        );
                      }
                    )}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Map Controls (top-right) */}
          <div className="absolute right-3 top-3 pointer-events-auto sm:right-6 sm:top-6">
            <button
              type="button"
              onClick={handleResetView}
              className="flex items-center gap-1.5 rounded-full border border-border/80 bg-background/92 px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm backdrop-blur-md transition-all hover:bg-background hover:shadow"
              title="Reset map view"
            >
              <RotateCcw className="size-3 text-muted-foreground" />
              Reset view
            </button>
          </div>

          {/* Coordinate readout (bottom-left) */}
          {cursorCoords && (
            <div className="absolute bottom-3 left-3 sm:bottom-6 sm:left-6">
              <div className={GLASS_PILL}>
                <p className="font-mono text-xs tabular-nums text-muted-foreground">
                  {cursorCoords.lat >= 0 ? "+" : ""}
                  {cursorCoords.lat.toFixed(2)}°{" "}
                  {cursorCoords.lng >= 0 ? "+" : ""}
                  {cursorCoords.lng.toFixed(2)}°
                </p>
              </div>
            </div>
          )}

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
});

export default LeafletGlobe;
