import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  BASEMAP_ATTRIBUTION,
  BASEMAP_BASE_URL,
  BASEMAP_LABELS_URL,
  BASEMAP_MAX_NATIVE_ZOOM,
} from "../map/basemap.ts";
import type { HireLocation, HireVehicle } from "../../lib/transportHire.ts";
import { calculateRoadDistanceKm, estimateDriveDurationMinutes, formatDriveDuration } from "../../lib/transportHire.ts";
import { Maximize2, Navigation } from "lucide-react";

export interface TransportMapHandle {
  fitRoute: () => void;
  focusVehicle: (vehicle: HireVehicle) => void;
  resetView: () => void;
}

interface TransportMapProps {
  pickup: HireLocation | null;
  dropoff: HireLocation | null;
  vehicles: HireVehicle[];
  selectedVehicleId: string | null;
  onSelectVehicle?: (vehicle: HireVehicle) => void;
  onMapClickCoordinate?: (lat: number, lng: number) => void;
  className?: string;
}

const DEFAULT_CENTER: L.LatLngTuple = [-18.5, 29.8]; // Central Zimbabwe overview
const DEFAULT_ZOOM = 6.8;

export const TransportMap = forwardRef<TransportMapHandle, TransportMapProps>(
  function TransportMap(
    {
      pickup,
      dropoff,
      vehicles,
      selectedVehicleId,
      onSelectVehicle,
      onMapClickCoordinate,
      className,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const layersRef = useRef<{
      baseLayer?: L.TileLayer;
      labelsLayer?: L.TileLayer;
      routeLayer?: L.Polyline;
      pickupMarker?: L.Marker;
      dropoffMarker?: L.Marker;
      vehicleMarkersGroup?: L.LayerGroup;
    }>({});

    const routeDistance = pickup && dropoff
      ? calculateRoadDistanceKm(pickup.latitude, pickup.longitude, dropoff.latitude, dropoff.longitude)
      : 0;
    const routeDuration = estimateDriveDurationMinutes(routeDistance);

    // Zoom & Fit bounds helper
    const fitRoute = useCallback(() => {
      const map = mapRef.current;
      if (!map) return;

      if (pickup && dropoff) {
        const bounds = L.latLngBounds([
          [pickup.latitude, pickup.longitude],
          [dropoff.latitude, dropoff.longitude],
        ]);
        map.fitBounds(bounds, {
          padding: [60, 60],
          maxZoom: 12,
          animate: true,
        });
      } else if (pickup) {
        map.setView([pickup.latitude, pickup.longitude], 12, { animate: true });
      } else if (dropoff) {
        map.setView([dropoff.latitude, dropoff.longitude], 12, { animate: true });
      } else {
        map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: true });
      }
    }, [pickup, dropoff]);

    const focusVehicle = useCallback((vehicle: HireVehicle) => {
      const map = mapRef.current;
      if (!map) return;
      map.setView([vehicle.currentLat, vehicle.currentLng], 14, { animate: true });
    }, []);

    const resetView = useCallback(() => {
      const map = mapRef.current;
      if (!map) return;
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: true });
    }, []);

    useImperativeHandle(ref, () => ({
      fitRoute,
      focusVehicle,
      resetView,
    }), [fitRoute, focusVehicle, resetView]);

    // Initialize Leaflet Map
    useEffect(() => {
      const container = containerRef.current;
      if (!container || mapRef.current) return;

      const map = L.map(container, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        zoomControl: false,
        attributionControl: false,
      });

      const base = L.tileLayer(BASEMAP_BASE_URL, {
        maxNativeZoom: BASEMAP_MAX_NATIVE_ZOOM,
        maxZoom: 19,
        attribution: BASEMAP_ATTRIBUTION,
      }).addTo(map);

      const labels = L.tileLayer(BASEMAP_LABELS_URL, {
        maxNativeZoom: BASEMAP_MAX_NATIVE_ZOOM,
        maxZoom: 19,
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);

      const vehicleGroup = L.layerGroup().addTo(map);

      layersRef.current = {
        baseLayer: base,
        labelsLayer: labels,
        vehicleMarkersGroup: vehicleGroup,
      };

      mapRef.current = map;

      // Handle map clicks for custom coordinates
      map.on("click", (e: L.LeafletMouseEvent) => {
        if (onMapClickCoordinate) {
          onMapClickCoordinate(e.latlng.lat, e.latlng.lng);
        }
      });

      const resizeObserver = new ResizeObserver(() => {
        map.invalidateSize();
      });
      resizeObserver.observe(container);

      return () => {
        resizeObserver.disconnect();
        map.remove();
        mapRef.current = null;
        layersRef.current = {};
      };
    }, [onMapClickCoordinate]);

    // Update Route & Markers
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      // Clean up previous markers & polylines
      if (layersRef.current.routeLayer) {
        map.removeLayer(layersRef.current.routeLayer);
        layersRef.current.routeLayer = undefined;
      }
      if (layersRef.current.pickupMarker) {
        map.removeLayer(layersRef.current.pickupMarker);
        layersRef.current.pickupMarker = undefined;
      }
      if (layersRef.current.dropoffMarker) {
        map.removeLayer(layersRef.current.dropoffMarker);
        layersRef.current.dropoffMarker = undefined;
      }

      // Draw Pickup Marker
      if (pickup) {
        const pickupIcon = L.divIcon({
          className: "custom-pickup-pin",
          html: `
            <div class="relative flex items-center justify-center">
              <span class="absolute w-8 h-8 rounded-full bg-emerald-500/30 animate-ping"></span>
              <div class="relative flex items-center gap-1.5 px-2.5 py-1 bg-emerald-600 text-white rounded-full shadow-lg border-2 border-white dark:border-zinc-900 text-xs font-semibold whitespace-nowrap">
                <span class="w-2 h-2 rounded-full bg-white animate-pulse"></span>
                <span>PICKUP: ${pickup.name.split(" ")[0]}</span>
              </div>
            </div>
          `,
          iconSize: [120, 36],
          iconAnchor: [60, 18],
        });

        const pMarker = L.marker([pickup.latitude, pickup.longitude], {
          icon: pickupIcon,
          zIndexOffset: 1000,
        }).addTo(map);

        pMarker.bindPopup(`
          <div class="p-2 text-xs">
            <div class="font-bold text-emerald-600">Pickup Location</div>
            <div class="font-medium text-zinc-900 dark:text-zinc-100">${pickup.name}</div>
            <div class="text-zinc-500 text-[11px]">${pickup.subtitle}</div>
          </div>
        `);

        layersRef.current.pickupMarker = pMarker;
      }

      // Draw Dropoff Marker
      if (dropoff) {
        const dropoffIcon = L.divIcon({
          className: "custom-dropoff-pin",
          html: `
            <div class="relative flex items-center justify-center">
              <div class="relative flex items-center gap-1.5 px-2.5 py-1 bg-rose-600 text-white rounded-full shadow-lg border-2 border-white dark:border-zinc-900 text-xs font-semibold whitespace-nowrap">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                <span>DROPOFF: ${dropoff.name.split(" ")[0]}</span>
              </div>
            </div>
          `,
          iconSize: [130, 36],
          iconAnchor: [65, 18],
        });

        const dMarker = L.marker([dropoff.latitude, dropoff.longitude], {
          icon: dropoffIcon,
          zIndexOffset: 1000,
        }).addTo(map);

        dMarker.bindPopup(`
          <div class="p-2 text-xs">
            <div class="font-bold text-rose-600">Destination</div>
            <div class="font-medium text-zinc-900 dark:text-zinc-100">${dropoff.name}</div>
            <div class="text-zinc-500 text-[11px]">${dropoff.subtitle}</div>
          </div>
        `);

        layersRef.current.dropoffMarker = dMarker;
      }

      // Draw Polyline Route if both pickup and dropoff exist
      if (pickup && dropoff) {
        const polylineCoords: L.LatLngTuple[] = [
          [pickup.latitude, pickup.longitude],
          [dropoff.latitude, dropoff.longitude],
        ];

        const routeLine = L.polyline(polylineCoords, {
          color: "#e11d48",
          weight: 4.5,
          opacity: 0.85,
          dashArray: "1, 10",
          lineCap: "round",
          lineJoin: "round",
        }).addTo(map);

        layersRef.current.routeLayer = routeLine;

        // Auto fit route if not already zoomed closely
        const bounds = L.latLngBounds([
          [pickup.latitude, pickup.longitude],
          [dropoff.latitude, dropoff.longitude],
        ]);
        map.fitBounds(bounds, {
          padding: [50, 50],
          maxZoom: 11,
          animate: true,
        });
      } else if (pickup) {
        map.setView([pickup.latitude, pickup.longitude], 12, { animate: true });
      }
    }, [pickup, dropoff]);

    // Update Vehicle Fleet Markers
    useEffect(() => {
      const map = mapRef.current;
      const group = layersRef.current.vehicleMarkersGroup;
      if (!map || !group) return;

      group.clearLayers();

      vehicles.forEach((vehicle) => {
        const isSelected = selectedVehicleId === vehicle.id;

        const vehicleHtml = `
          <div class="cursor-pointer transition-transform duration-200 hover:scale-110 ${isSelected ? "scale-125 z-50" : ""}">
            <div class="relative flex items-center justify-center">
              ${
                isSelected
                  ? '<span class="absolute -inset-2 rounded-full bg-rose-500/40 animate-ping"></span>'
                  : ""
              }
              <div class="flex items-center gap-1 px-2 py-0.5 rounded-md shadow-md border ${
                isSelected
                  ? "bg-rose-600 text-white border-rose-400 font-bold"
                  : "bg-background/95 text-foreground border-border font-medium hover:border-primary"
              } text-[11px] whitespace-nowrap">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C2.1 10.7 2 11 2 11.3V16c0 .6.4 1 1 1h2"/>
                  <circle cx="7" cy="17" r="2"/>
                  <path d="M9 17h6"/>
                  <circle cx="17" cy="17" r="2"/>
                </svg>
                <span>${vehicle.etaMinutes}m</span>
              </div>
            </div>
          </div>
        `;

        const vIcon = L.divIcon({
          className: `fleet-vehicle-pin-${vehicle.id}`,
          html: vehicleHtml,
          iconSize: [64, 26],
          iconAnchor: [32, 13],
        });

        const vMarker = L.marker([vehicle.currentLat, vehicle.currentLng], {
          icon: vIcon,
          zIndexOffset: isSelected ? 800 : 200,
        });

        vMarker.on("click", () => {
          if (onSelectVehicle) {
            onSelectVehicle(vehicle);
          }
        });

        vMarker.bindTooltip(
          `
          <div class="font-sans text-xs p-1">
            <div class="font-bold text-foreground">${vehicle.model}</div>
            <div class="text-muted-foreground text-[10px]">${vehicle.licensePlate} • Driver: ${vehicle.driverName} (${vehicle.driverRating}★)</div>
            <div class="text-rose-500 font-semibold text-[11px] mt-0.5">ETA to pickup: ${vehicle.etaMinutes} mins</div>
          </div>
        `,
          { direction: "top", offset: [0, -10] },
        );

        group.addLayer(vMarker);
      });
    }, [vehicles, selectedVehicleId, onSelectVehicle]);

    return (
      <div className={`relative w-full h-full min-h-[380px] overflow-hidden rounded-xl border border-border bg-muted/20 ${className ?? ""}`}>
        {/* Leaflet Canvas */}
        <div ref={containerRef} className="w-full h-full min-h-[380px] z-0" />

        {/* Floating Route Overview Bar */}
        {pickup && dropoff && routeDistance > 0 && (
          <div className="absolute top-4 left-4 right-4 sm:left-6 sm:right-auto z-[400] max-w-md bg-background/95 backdrop-blur-md border border-border/80 shadow-xl rounded-xl p-3 text-xs pointer-events-auto">
            <div className="flex items-center justify-between gap-3 pb-2 border-b border-border/60">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-semibold text-foreground truncate max-w-[140px] sm:max-w-[160px]">
                  {pickup.name}
                </span>
                <span className="text-muted-foreground font-mono">→</span>
                <span className="font-semibold text-foreground truncate max-w-[140px] sm:max-w-[160px]">
                  {dropoff.name}
                </span>
              </div>
              <button
                type="button"
                onClick={fitRoute}
                title="Fit route in view"
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-muted-foreground text-[10px] uppercase font-mono tracking-wider block">
                    Calculated Distance
                  </span>
                  <span className="font-mono text-sm font-bold text-foreground">
                    {routeDistance.toLocaleString()} km
                  </span>
                </div>
                <div className="h-6 w-px bg-border/60" />
                <div>
                  <span className="text-muted-foreground text-[10px] uppercase font-mono tracking-wider block">
                    Est. Drive Time
                  </span>
                  <span className="font-mono text-sm font-bold text-foreground">
                    {formatDriveDuration(routeDuration)}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 font-mono text-[11px] font-semibold">
                  <Navigation className="h-3 w-3" />
                  Direct Highway
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Map Click Instructions Helper */}
        <div className="absolute bottom-3 left-3 z-[400] pointer-events-none hidden sm:block">
          <div className="px-2.5 py-1 rounded-md bg-background/90 backdrop-blur-sm border border-border/70 text-[10px] text-muted-foreground font-mono shadow-sm">
            Click map to pin custom field coordinates
          </div>
        </div>
      </div>
    );
  },
);

export default TransportMap;
