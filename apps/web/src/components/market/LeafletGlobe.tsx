import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "../ui/button.tsx";
import {
  MARKET_DOT_COLORS,
  type MarketDot,
  type MarketDotKind,
} from "./marketDots";

const GLASS_PILL =
  "rounded-none border border-border/60 bg-background/85 shadow-sm backdrop-blur-sm";

interface LeafletGlobeProps {
  dots: MarketDot[] | null;
  totalPoints: number;
  failed: boolean;
  onSelect: (dot: MarketDot) => void;
  onRetry: () => void;
  children?: React.ReactNode;
  heightClassName?: string;
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

export default function LeafletGlobe({
  dots,
  failed,
  onSelect,
  onRetry,
  children,
  heightClassName = "h-[48vh] min-h-[320px] sm:h-[68vh] sm:min-h-[480px]",
}: LeafletGlobeProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lng: number } | null>(null);

  const plottedCount = dots?.length ?? 0;

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [15, 15],
      zoom: 2,
      minZoom: 2,
      maxZoom: 10,
      worldCopyJump: true,
      zoomControl: true,
    });

    // Add tile layer - CARTO dark basemap (free, CORS enabled) so the globe
    // matches the dark web3 terminal.
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
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

    return () => {
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
        radius: 6,
        fillColor: color,
        color: "#ffffff",
        weight: 1.5,
        opacity: 1,
        fillOpacity: 0.8,
      });

      marker.on("click", () => {
        onSelect(dot);
      });

      marker.addTo(mapRef.current!);
      markersRef.current.push(marker);
    });
  }, [dots, onSelect]);

  return (
    <section className="relative">
      <div
        className={`relative w-full overflow-hidden border-y border-border/60 bg-muted/40 ${heightClassName}`}
      >
        <p className="sr-only">
          Interactive map of published listings, professionals, jobs, firms, and
          training events. The same items are listed below the map.
        </p>

        <div ref={mapContainerRef} className="absolute inset-0 z-0" />

        {/* Overlay UI */}
        <div className="pointer-events-none absolute inset-0 z-10">
          {/* Telemetry pill */}
          <div className="absolute left-3 top-3 max-w-[calc(100%-1.5rem)] min-[480px]:max-w-[calc(100%-5rem)] sm:left-6 sm:top-6">
            <div
              className={`px-3 py-1.5 ${GLASS_PILL}`}
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
                          dots?.filter((dot) => dot.kind === kind).length ?? 0;
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

          {/* Coordinate readout */}
          {cursorCoords && (
            <div className="absolute bottom-3 left-3 sm:bottom-6 sm:left-6">
              <div className={`px-3 py-1.5 ${GLASS_PILL}`}>
                <p className="font-mono text-xs tabular-nums text-muted-foreground">
                  {cursorCoords.lat >= 0 ? "+" : ""}
                  {cursorCoords.lat.toFixed(2)}°{" "}
                  {cursorCoords.lng >= 0 ? "+" : ""}
                  {cursorCoords.lng.toFixed(2)}°
                </p>
              </div>
            </div>
          )}

          {/* Custom children overlay */}
          {children}
        </div>

        {/* Error state */}
        {failed && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="text-center">
              <p className="mb-4 text-sm text-muted-foreground">
                Failed to load market data
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
}
