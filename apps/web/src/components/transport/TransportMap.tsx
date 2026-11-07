import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  IconArrowsMaximize,
  IconCrosshair,
  IconMapPin,
  IconRotate,
} from "@tabler/icons-react";
import {
  BASEMAP_ATTRIBUTION,
  BASEMAP_BASE_URL,
  BASEMAP_LABELS_URL,
  BASEMAP_MAX_NATIVE_ZOOM,
} from "../map/basemap.ts";
import type { HireVehicle, LocationCoordinate, VehicleTierId } from "../../lib/transportHire.ts";
import {
  calculateRoadDistanceKm,
  estimateDriveDurationMinutes,
  formatCoordinates,
  formatDriveDuration,
  VEHICLE_TIERS,
} from "../../lib/transportHire.ts";
import { cn } from "../../lib/utils.ts";
import { VEHICLE_TIER_THEME } from "./vehicleTierTheme.ts";

export interface TransportMapHandle {
  fitRoute: () => void;
  focusVehicle: (vehicle: HireVehicle) => void;
  centerCoordinate: (lat: number, lng: number) => void;
  resetView: () => void;
}

interface TransportMapProps {
  pickup: LocationCoordinate;
  dropoff: LocationCoordinate;
  vehicles: HireVehicle[];
  selectedVehicleId: string | null;
  activePinMode: "pickup" | "dropoff" | null;
  onSelectVehicle?: (vehicle: HireVehicle) => void;
  onCoordinatesChange: (type: "pickup" | "dropoff", newCoords: LocationCoordinate) => void;
  className?: string;
}

const DEFAULT_CENTER: L.LatLngTuple = [-18.5, 29.8];
const DEFAULT_ZOOM = 6.8;

/* Pins float over basemap imagery, so their ink stays fixed — a themed
   bubble would vanish against a light basemap in dark mode. */
const PIN_INK = "oklch(0.21 0.03 260 / 0.92)";
const PICKUP_INK = "#059669";
const DROPOFF_INK = "#d92d20";
const PIN_EDGE = "oklch(1 0 0 / 0.9)";

export const TransportMap = forwardRef<TransportMapHandle, TransportMapProps>(
  function TransportMap(
    {
      pickup,
      dropoff,
      vehicles,
      selectedVehicleId,
      activePinMode,
      onSelectVehicle,
      onCoordinatesChange,
      className,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const didFitRef = useRef(false);
    const layersRef = useRef<{
      baseLayer?: L.TileLayer;
      labelsLayer?: L.TileLayer;
      routeLayer?: L.Polyline;
      pickupMarker?: L.Marker;
      dropoffMarker?: L.Marker;
      vehicleMarkersGroup?: L.LayerGroup;
    }>({});

    const routeDistance = calculateRoadDistanceKm(
      pickup.lat,
      pickup.lng,
      dropoff.lat,
      dropoff.lng,
    );
    const routeDuration = estimateDriveDurationMinutes(routeDistance);

    const tierCounts = useMemo(() => {
      const counts = new Map<VehicleTierId, number>();
      for (const vehicle of vehicles) {
        counts.set(vehicle.tierId, (counts.get(vehicle.tierId) ?? 0) + 1);
      }
      return [...counts.entries()].sort((a, b) => b[1] - a[1]);
    }, [vehicles]);

    // Zoom & Fit bounds helper. Padding keeps the pins clear of the route HUD
    // (top-left) and the helper chip / zoom control (bottom).
    const fitRoute = useCallback(() => {
      const map = mapRef.current;
      if (!map) return;

      if (pickup && dropoff) {
        const bounds = L.latLngBounds([
          [pickup.lat, pickup.lng],
          [dropoff.lat, dropoff.lng],
        ]);
        map.fitBounds(bounds, {
          paddingTopLeft: [20, 120],
          paddingBottomRight: [20, 56],
          maxZoom: 12,
          animate: true,
        });
      }
    }, [pickup, dropoff]);

    const focusVehicle = useCallback((vehicle: HireVehicle) => {
      const map = mapRef.current;
      if (!map) return;
      map.setView([vehicle.currentLat, vehicle.currentLng], 14, { animate: true });
    }, []);

    const centerCoordinate = useCallback((lat: number, lng: number) => {
      const map = mapRef.current;
      if (!map) return;
      map.setView([lat, lng], 13, { animate: true });
    }, []);

    const resetView = useCallback(() => {
      const map = mapRef.current;
      if (!map) return;
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: true });
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        fitRoute,
        focusVehicle,
        centerCoordinate,
        resetView,
      }),
      [fitRoute, focusVehicle, centerCoordinate, resetView],
    );

    // Initialize Map
    useEffect(() => {
      const container = containerRef.current;
      if (!container || mapRef.current) return;

      const map = L.map(container, {
        center: [pickup.lat, pickup.lng],
        zoom: 7,
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
    }, []);

    // Handle Map Clicks for Active Pin Placement
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      const handleMapClick = (e: L.LeafletMouseEvent) => {
        const targetType = activePinMode || "dropoff";
        const newCoords: LocationCoordinate = {
          lat: Math.round(e.latlng.lat * 100000) / 100000,
          lng: Math.round(e.latlng.lng * 100000) / 100000,
          label: targetType === "pickup" ? "Pinned Pickup GPS" : "Pinned Destination GPS",
          isCustom: true,
        };
        onCoordinatesChange(targetType, newCoords);
      };

      map.on("click", handleMapClick);
      return () => {
        map.off("click", handleMapClick);
      };
    }, [activePinMode, onCoordinatesChange]);

    // Update Draggable Markers & Route Polyline
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      // Clear old layers
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

      // Pickup Draggable Marker
      const pickupHtml = `
        <div class="relative flex cursor-grab flex-col items-center active:cursor-grabbing">
          <span class="absolute size-8 rounded-full" style="background:${PICKUP_INK};opacity:0.28"></span>
          <div class="relative flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold" style="background:${PICKUP_INK};color:#fff;border:2px solid ${PIN_EDGE};box-shadow:0 4px 14px rgb(15 23 42 / 0.24)">
            <span class="size-1.5 rounded-full" style="background:#fff"></span>
            <span>Pickup</span>
          </div>
          <div class="mt-1 rounded px-1.5 py-0.5 font-mono text-[10px] tabular-nums" style="background:${PIN_INK};color:oklch(0.99 0 0);box-shadow:0 2px 8px rgb(15 23 42 / 0.2)">
            ${pickup.lat.toFixed(4)}, ${pickup.lng.toFixed(4)}
          </div>
        </div>
      `;

      const pIcon = L.divIcon({
        className: "custom-pickup-pin",
        html: pickupHtml,
        iconSize: [120, 52],
        iconAnchor: [60, 20],
      });

      const pMarker = L.marker([pickup.lat, pickup.lng], {
        icon: pIcon,
        draggable: true,
        zIndexOffset: 1000,
      }).addTo(map);

      pMarker.on("dragend", () => {
        const ll = pMarker.getLatLng();
        onCoordinatesChange("pickup", {
          lat: Math.round(ll.lat * 100000) / 100000,
          lng: Math.round(ll.lng * 100000) / 100000,
          label: "Dragged Pickup GPS",
          isCustom: true,
        });
      });

      pMarker.bindPopup(`
        <div class="p-1 font-sans text-xs">
          <div class="font-semibold text-success">Pickup location</div>
          <div class="font-mono tabular-nums text-foreground">${formatCoordinates(pickup.lat, pickup.lng)}</div>
          <div class="mt-1 text-micro text-muted-foreground">Drag the marker to move your pickup</div>
        </div>
      `);

      layersRef.current.pickupMarker = pMarker;

      // Dropoff Draggable Marker
      const dropoffHtml = `
        <div class="relative flex cursor-grab flex-col items-center active:cursor-grabbing">
          <div class="relative flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold" style="background:${DROPOFF_INK};color:#fff;border:2px solid ${PIN_EDGE};box-shadow:0 4px 14px rgb(15 23 42 / 0.24)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg>
            <span>Destination</span>
          </div>
          <div class="mt-1 rounded px-1.5 py-0.5 font-mono text-[10px] tabular-nums" style="background:${PIN_INK};color:oklch(0.99 0 0);box-shadow:0 2px 8px rgb(15 23 42 / 0.2)">
            ${dropoff.lat.toFixed(4)}, ${dropoff.lng.toFixed(4)}
          </div>
        </div>
      `;

      const dIcon = L.divIcon({
        className: "custom-dropoff-pin",
        html: dropoffHtml,
        iconSize: [120, 52],
        iconAnchor: [60, 20],
      });

      const dMarker = L.marker([dropoff.lat, dropoff.lng], {
        icon: dIcon,
        draggable: true,
        zIndexOffset: 1000,
      }).addTo(map);

      dMarker.on("dragend", () => {
        const ll = dMarker.getLatLng();
        onCoordinatesChange("dropoff", {
          lat: Math.round(ll.lat * 100000) / 100000,
          lng: Math.round(ll.lng * 100000) / 100000,
          label: "Dragged Destination GPS",
          isCustom: true,
        });
      });

      dMarker.bindPopup(`
        <div class="p-1 font-sans text-xs">
          <div class="font-semibold text-primary">Destination location</div>
          <div class="font-mono tabular-nums text-foreground">${formatCoordinates(dropoff.lat, dropoff.lng)}</div>
          <div class="mt-1 text-micro text-muted-foreground">Drag the marker to move your destination</div>
        </div>
      `);

      layersRef.current.dropoffMarker = dMarker;

      // Draw Route Polyline
      const polylineCoords: L.LatLngTuple[] = [
        [pickup.lat, pickup.lng],
        [dropoff.lat, dropoff.lng],
      ];

      const routeLine = L.polyline(polylineCoords, {
        color: DROPOFF_INK,
        weight: 4,
        opacity: 0.9,
        dashArray: "1, 9",
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map);

      layersRef.current.routeLayer = routeLine;

      if (!didFitRef.current) {
        didFitRef.current = true;
        map.fitBounds(routeLine.getBounds(), {
          paddingTopLeft: [20, 120],
          paddingBottomRight: [20, 56],
          maxZoom: 12,
          animate: false,
        });
      }
    }, [pickup, dropoff, onCoordinatesChange]);

    // Update Fleet Vehicle Markers
    useEffect(() => {
      const map = mapRef.current;
      const group = layersRef.current.vehicleMarkersGroup;
      if (!map || !group) return;

      group.clearLayers();

      vehicles.forEach((vehicle) => {
        const isSelected = selectedVehicleId === vehicle.id;
        const theme = VEHICLE_TIER_THEME[vehicle.tierId];
        const bubbleInk = isSelected ? DROPOFF_INK : PIN_INK;

        const vehicleHtml = `
          <div class="relative flex cursor-pointer items-center justify-center transition-transform duration-150 hover:scale-110 ${
            isSelected ? "scale-110" : ""
          }">
            <div class="flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 font-mono text-xs font-semibold tabular-nums" style="background:${bubbleInk};color:oklch(0.99 0 0);border:2px solid ${PIN_EDGE};box-shadow:0 4px 14px rgb(15 23 42 / 0.24)">
              <span class="size-2 shrink-0 rounded-full" style="background:${theme.dot}"></span>
              <span>${vehicle.etaMinutes}m</span>
            </div>
          </div>
        `;

        const vIcon = L.divIcon({
          className: `fleet-vehicle-pin-${vehicle.id}`,
          html: vehicleHtml,
          iconSize: [68, 30],
          iconAnchor: [34, 15],
        });

        const vMarker = L.marker([vehicle.currentLat, vehicle.currentLng], {
          icon: vIcon,
          zIndexOffset: isSelected ? 800 : 200,
        });

        vMarker.on("click", () => {
          onSelectVehicle?.(vehicle);
        });

        vMarker.bindTooltip(
          `
          <div class="p-1 font-sans text-xs">
            <div class="font-semibold text-foreground">${vehicle.model}</div>
            <div class="font-mono text-micro tabular-nums text-muted-foreground">${vehicle.licensePlate} · ${vehicle.driverName} · ${vehicle.driverRating.toFixed(2)}★</div>
            <div class="mt-0.5 font-mono text-micro font-semibold tabular-nums text-primary">${vehicle.etaMinutes} min to pickup · ${VEHICLE_TIERS[vehicle.tierId].shortName}</div>
          </div>
        `,
          { direction: "top", offset: [0, -10] },
        );

        group.addLayer(vMarker);
      });
    }, [vehicles, selectedVehicleId, onSelectVehicle]);

    return (
      <div
        className={cn(
          "relative h-full w-full overflow-hidden bg-muted/20",
          activePinMode && "cursor-crosshair",
          className,
        )}
      >
        <p className="sr-only">
          Interactive dispatch map. Drag the pickup and destination markers, or click the map to
          place them. Nearby vehicles appear as numbered bubbles showing their arrival time; choose
          one to highlight it in the fleet below.
        </p>

        <div ref={containerRef} className="absolute inset-0 z-0 min-h-[360px]" />

        <div className="pointer-events-none absolute inset-0 z-10">
          <div className="pointer-events-auto absolute left-3 top-3 max-w-[calc(100%-7.5rem)] sm:left-6 sm:top-6">
            <div className="rounded-xl border border-border/80 bg-background/92 px-3 py-2 shadow-sm backdrop-blur-md">
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-micro tabular-nums text-muted-foreground">
                <span className="inline-flex items-center gap-1 text-success">
                  <IconMapPin className="size-3" aria-hidden="true" />
                  {pickup.lat.toFixed(3)}, {pickup.lng.toFixed(3)}
                </span>
                <span aria-hidden="true">→</span>
                <span className="inline-flex items-center gap-1 text-primary">
                  <IconCrosshair className="size-3" aria-hidden="true" />
                  {dropoff.lat.toFixed(3)}, {dropoff.lng.toFixed(3)}
                </span>
              </p>

              <div className="mt-1.5 flex items-center gap-3 border-t border-border/60 pt-1.5">
                <span className="flex flex-col">
                  <span className="text-micro text-muted-foreground">Road distance</span>
                  <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                    {routeDistance.toLocaleString()} km
                  </span>
                </span>
                <span className="h-6 w-px shrink-0 bg-border/70" aria-hidden="true" />
                <span className="flex flex-col">
                  <span className="text-micro text-muted-foreground">Drive time</span>
                  <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                    {formatDriveDuration(routeDuration)}
                  </span>
                </span>
              </div>

              {tierCounts.length > 0 ? (
                <div className="mt-1.5 hidden flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 pt-1.5 sm:flex">
                  {tierCounts.map(([tierId, count]) => (
                    <span
                      key={tierId}
                      className="inline-flex items-center gap-1.5 text-micro font-medium text-foreground"
                    >
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: VEHICLE_TIER_THEME[tierId].dot }}
                        aria-hidden="true"
                      />
                      {count} {VEHICLE_TIERS[tierId].shortName}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-1.5 border-t border-border/60 pt-1.5 font-mono text-micro text-muted-foreground">
                  No vehicles match the current filters
                </p>
              )}
            </div>
          </div>

          <div className="pointer-events-auto absolute right-3 top-3 flex flex-col items-end gap-1.5 sm:right-6 sm:top-6">
            <button
              type="button"
              onClick={fitRoute}
              title="Fit the map to the route"
              className="flex items-center gap-1.5 rounded-full border border-border/80 bg-background/92 px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm backdrop-blur-md transition-all hover:bg-background hover:shadow"
            >
              <IconArrowsMaximize className="size-3 text-muted-foreground" aria-hidden="true" />
              Fit route
            </button>
            <button
              type="button"
              onClick={resetView}
              title="Reset the map to the national view"
              className="flex items-center gap-1.5 rounded-full border border-border/80 bg-background/92 px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm backdrop-blur-md transition-all hover:bg-background hover:shadow"
            >
              <IconRotate className="size-3 text-muted-foreground" aria-hidden="true" />
              Reset
            </button>
          </div>

          {activePinMode ? (
            <div className="pointer-events-auto absolute bottom-5 left-1/2 z-10 -translate-x-1/2">
              <div className="flex items-center gap-2 whitespace-nowrap rounded-full border border-border/80 bg-background/95 px-4 py-2 text-xs font-semibold text-foreground shadow-lg backdrop-blur-md">
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    activePinMode === "pickup" ? "bg-success" : "bg-primary",
                  )}
                  aria-hidden="true"
                />
                Click the map to set your {activePinMode === "pickup" ? "pickup" : "destination"}
              </div>
            </div>
          ) : (
            <div className="absolute bottom-3 left-3 hidden sm:block">
              <span className="rounded-none border border-border/60 bg-background/85 px-2.5 py-1 text-micro font-medium tracking-wide text-muted-foreground shadow-sm backdrop-blur-sm">
                Drag a marker or click the map to move the route
              </span>
            </div>
          )}
        </div>
      </div>
    );
  },
);

export default TransportMap;
