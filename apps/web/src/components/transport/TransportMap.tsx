import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  IconArrowsMaximize,
  IconMinus,
  IconPlus,
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
  zoomIn?: () => void;
  zoomOut?: () => void;
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

const PICKUP_COLOR = "#059669";
const DROPOFF_COLOR = "#d92d20";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Crisply crafted vehicle tier SVG silhouettes designed for 24x24 viewboxes.
 */
const VEHICLE_TIER_SVGS: Record<VehicleTierId, string> = {
  bakkie_4x4: '<svg viewBox="0 0 24 24" class="size-3.5 shrink-0" fill="currentColor"><path d="M2 13v-2c0-.6.4-1 1-1h9.2l1.6-3.2c.2-.4.6-.7 1.1-.7h4.1c.6 0 1.1.4 1.3 1l1 3.4c.1.4.5.7.9.7h.8c.6 0 1 .4 1 1v2.8h-1.6c-.3-1.4-1.5-2.5-3-2.5s-2.7 1.1-3 2.5h-5.8c-.3-1.4-1.5-2.5-3-2.5s-2.7 1.1-3 2.5H2zm16 0c.8 0 1.5.7 1.5 1.5s-.7 1.5-1.5 1.5-1.5-.7-1.5-1.5.7-1.5 1.5-1.5zm-12 0c.8 0 1.5.7 1.5 1.5s-.7 1.5-1.5 1.5-1.5-.7-1.5-1.5.7-1.5 1.5-1.5zm8.5-4h-3.2l-1.2 2.5h4.4V9zm1.5 0v2.5h3.2l-.7-2.5H16z"/></svg>',
  crew_van: '<svg viewBox="0 0 24 24" class="size-3.5 shrink-0" fill="currentColor"><path d="M3.5 14v-6c0-1.1.9-2 2-2h11.5c1.1 0 2 .9 2 2l1.5 3.5c.3.7.5 1.5.5 2.3v2.2h-1.6c-.3-1.4-1.5-2.5-3-2.5s-2.7 1.1-3 2.5h-4.8c-.3-1.4-1.5-2.5-3-2.5s-2.7 1.1-3 2.5H3.5zm14 0c.8 0 1.5.7 1.5 1.5s-.7 1.5-1.5 1.5-1.5-.7-1.5-1.5.7-1.5 1.5-1.5zm-11 0c.8 0 1.5.7 1.5 1.5s-.7 1.5-1.5 1.5-1.5-.7-1.5-1.5.7-1.5 1.5-1.5zM5.5 8v3H9V8H5.5zm5 0v3h3.5V8h-3.5zm5 0v3h2.3l-1.3-3H15.5z"/></svg>',
  heavy_truck: '<svg viewBox="0 0 24 24" class="size-3.5 shrink-0" fill="currentColor"><path d="M1.5 13.5v-2.2c0-.7.6-1.3 1.3-1.3H13V6.5c0-.8.7-1.5 1.5-1.5H18c.8 0 1.5.7 1.5 1.5v2.8l2.2 2.6c.5.6.8 1.3.8 2.1v2.5h-1.7c-.3-1.4-1.5-2.5-3-2.5s-2.7 1.1-3 2.5h-4.6c-.3-1.4-1.5-2.5-3-2.5s-2.7 1.1-3 2.5H1.5zm16.3 0c.8 0 1.5.7 1.5 1.5s-.7 1.5-1.5 1.5-1.5-.7-1.5-1.5.7-1.5 1.5-1.5zm-11.5 0c.8 0 1.5.7 1.5 1.5s-.7 1.5-1.5 1.5-1.5-.7-1.5-1.5.7-1.5 1.5-1.5zM14.5 7.5v4h4.2l-1.8-4h-2.4z"/></svg>',
  executive_suv: '<svg viewBox="0 0 24 24" class="size-3.5 shrink-0" fill="currentColor"><path d="M2.5 13.2v-1.8c0-.6.4-1.1 1-1.2l4.8-.8 3.5-3.2c.4-.4.9-.6 1.4-.6h4.6c.7 0 1.3.4 1.6 1l1.6 3.8h1c.6 0 1.1.5 1.1 1.1v2.7h-1.7c-.3-1.3-1.5-2.2-2.9-2.2s-2.6.9-2.9 2.2H8.3c-.3-1.3-1.5-2.2-2.9-2.2s-2.6.9-2.9 2.2H2.5zm16.4 0c.7 0 1.3.6 1.3 1.3s-.6 1.3-1.3 1.3-1.3-.6-1.3-1.3.6-1.3 1.3-1.3zm-12.2 0c.7 0 1.3.6 1.3 1.3s-.6 1.3-1.3 1.3-1.3-.6-1.3-1.3.6-1.3 1.3-1.3zm6.6-4.9l-2.6 2.5 4.8-.3V8.3h-2.2zm3.7 0v2.4l3.1-.2-1-2.2h-2.1z"/></svg>',
  rapid_runner: '<svg viewBox="0 0 24 24" class="size-3.5 shrink-0" fill="currentColor"><path d="M3 13v-1.5c0-.6.4-1.1 1-1.2l5.5-.8 3-3.2c.3-.3.8-.5 1.2-.5h3.6c.6 0 1.2.3 1.5.9l1.8 3.6h1.4c.6 0 1 .4 1 1v2.7h-1.6c-.3-1.3-1.4-2.2-2.8-2.2s-2.5.9-2.8 2.2h-5.8c-.3-1.3-1.4-2.2-2.8-2.2s-2.5.9-2.8 2.2H3zm15.1 0c.7 0 1.2.5 1.2 1.2s-.5 1.2-1.2 1.2-1.2-.5-1.2-1.2.5-1.2 1.2-1.2zm-11.4 0c.7 0 1.2.5 1.2 1.2s-.5 1.2-1.2 1.2-1.2-.5-1.2-1.2.5-1.2 1.2-1.2zm6.2-4.8l-2.2 2.4 4-.2V8.2h-1.8zm3.2 0v2.3l2.2-.2-.8-2.1h-1.4z"/></svg>',
};

function createWaypointHtml(type: "pickup" | "dropoff"): string {
  const isPickup = type === "pickup";
  const color = isPickup ? PICKUP_COLOR : DROPOFF_COLOR;
  const dotClass = isPickup ? "bg-emerald-500" : "bg-red-500";
  const title = isPickup ? "Pickup" : "Destination";

  const innerIcon = isPickup
    ? '<circle cx="15" cy="15" r="4.5" fill="' + color + '"/>'
    : '<path d="M11 11h8v8h-8z" fill="' + color + '" rx="1.5"/><circle cx="15" cy="15" r="2.2" fill="#fff"/>';

  return [
    '<div class="transport-waypoint-container" style="--ring-color:' + color + ';">',
    '  <div class="transport-waypoint-tag">',
    '    <span class="size-1.5 rounded-full ' + dotClass + '"></span>',
    '    <span>' + title + '</span>',
    '  </div>',
    '  <div class="transport-waypoint-pin">',
    '    <svg width="30" height="38" viewBox="0 0 30 38" fill="none" xmlns="http://www.w3.org/2000/svg">',
    '      <path d="M15 37.5C15 37.5 28 23.5 28 15C28 7.8203 22.1797 2 15 2C7.8203 2 2 7.8203 2 15C2 23.5 15 37.5 15 37.5Z" fill="' + color + '" stroke="#ffffff" stroke-width="2.2" stroke-linejoin="round"/>',
    '      <circle cx="15" cy="15" r="7.5" fill="#ffffff"/>',
    '      ' + innerIcon,
    '    </svg>',
    '  </div>',
    isPickup ? '  <span class="transport-radar-ring"></span>' : '',
    '</div>',
  ].join("");
}

function createVehicleHtml(vehicle: HireVehicle, isSelected: boolean): string {
  const theme = VEHICLE_TIER_THEME[vehicle.tierId];
  const svg = VEHICLE_TIER_SVGS[vehicle.tierId] || VEHICLE_TIER_SVGS.bakkie_4x4;

  return [
    '<div class="transport-vehicle-pin ' + (isSelected ? "is-selected" : "") + '" style="--tier-dot:' + theme.dot + ';">',
    '  <div class="transport-vehicle-bubble">',
    '    <div class="transport-vehicle-icon">',
    '      ' + svg,
    '    </div>',
    '    <span class="transport-vehicle-eta">' + vehicle.etaMinutes + 'm</span>',
    '  </div>',
    isSelected ? '  <span class="transport-pulse-ring"></span>' : '',
    '</div>',
  ].join("");
}

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
      routeCasingLayer?: L.Polyline;
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

    const fitRoute = useCallback(() => {
      const map = mapRef.current;
      if (!map) return;

      if (pickup && dropoff) {
        const bounds = L.latLngBounds([
          [pickup.lat, pickup.lng],
          [dropoff.lat, dropoff.lng],
        ]);
        map.fitBounds(bounds, {
          paddingTopLeft: [24, 120],
          paddingBottomRight: [24, 56],
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

    const handleZoomIn = useCallback(() => {
      mapRef.current?.zoomIn();
    }, []);

    const handleZoomOut = useCallback(() => {
      mapRef.current?.zoomOut();
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        fitRoute,
        focusVehicle,
        centerCoordinate,
        resetView,
        zoomIn: handleZoomIn,
        zoomOut: handleZoomOut,
      }),
      [fitRoute, focusVehicle, centerCoordinate, resetView, handleZoomIn, handleZoomOut],
    );

    // Initialize Map with clean settings (no default 90s zoom box)
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

    // Update Draggable Waypoint Markers & Dual-Layer Route Polyline
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      // Clear old polyline and marker layers
      if (layersRef.current.routeCasingLayer) {
        map.removeLayer(layersRef.current.routeCasingLayer);
        layersRef.current.routeCasingLayer = undefined;
      }
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

      // Pickup Draggable Waypoint Marker
      const pickupHtml = createWaypointHtml("pickup");
      const pIcon = L.divIcon({
        className: "transport-pin custom-pickup-pin",
        html: pickupHtml,
        iconSize: [80, 58],
        iconAnchor: [40, 58],
        popupAnchor: [0, -56],
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
          <div class="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
            <span class="size-2 rounded-full bg-emerald-500"></span>
            Pickup Location
          </div>
          <div class="mt-0.5 font-mono text-[11px] tabular-nums text-foreground">${formatCoordinates(pickup.lat, pickup.lng)}</div>
          <div class="mt-1 text-micro text-muted-foreground">Drag the pin to adjust your pickup point</div>
        </div>
      `);

      layersRef.current.pickupMarker = pMarker;

      // Dropoff Draggable Waypoint Marker
      const dropoffHtml = createWaypointHtml("dropoff");
      const dIcon = L.divIcon({
        className: "transport-pin custom-dropoff-pin",
        html: dropoffHtml,
        iconSize: [80, 58],
        iconAnchor: [40, 58],
        popupAnchor: [0, -56],
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
          <div class="flex items-center gap-1.5 font-semibold text-primary">
            <span class="size-2 rounded-full bg-primary"></span>
            Destination Location
          </div>
          <div class="mt-0.5 font-mono text-[11px] tabular-nums text-foreground">${formatCoordinates(dropoff.lat, dropoff.lng)}</div>
          <div class="mt-1 text-micro text-muted-foreground">Drag the pin to adjust your destination</div>
        </div>
      `);

      layersRef.current.dropoffMarker = dMarker;

      // Draw Dual-Layer Route Polyline Corridor
      const polylineCoords: L.LatLngTuple[] = [
        [pickup.lat, pickup.lng],
        [dropoff.lat, dropoff.lng],
      ];

      // 1. Outer casing halo for sharp terrain contrast
      const routeCasing = L.polyline(polylineCoords, {
        color: "#ffffff",
        weight: 8,
        opacity: 0.9,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map);

      // 2. High-contrast inner navigation route path
      const routeLine = L.polyline(polylineCoords, {
        color: DROPOFF_COLOR,
        weight: 4,
        opacity: 0.95,
        dashArray: "8, 12",
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map);

      layersRef.current.routeCasingLayer = routeCasing;
      layersRef.current.routeLayer = routeLine;

      if (!didFitRef.current) {
        didFitRef.current = true;
        map.fitBounds(routeLine.getBounds(), {
          paddingTopLeft: [24, 120],
          paddingBottomRight: [24, 56],
          maxZoom: 12,
          animate: false,
        });
      }
    }, [pickup, dropoff, onCoordinatesChange]);

    // Update Fleet Vehicle Markers with Tier Glyphs & Modern Cards
    useEffect(() => {
      const map = mapRef.current;
      const group = layersRef.current.vehicleMarkersGroup;
      if (!map || !group) return;

      group.clearLayers();

      vehicles.forEach((vehicle) => {
        const isSelected = selectedVehicleId === vehicle.id;
        const theme = VEHICLE_TIER_THEME[vehicle.tierId];
        const vehicleHtml = createVehicleHtml(vehicle, isSelected);

        const vIcon = L.divIcon({
          className: "transport-pin fleet-vehicle-pin-" + vehicle.id,
          html: vehicleHtml,
          iconSize: [72, 34],
          iconAnchor: [36, 17],
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
          <div class="transport-tooltip font-sans">
            <div class="flex items-center gap-1.5">
              <span class="size-2 shrink-0 rounded-full" style="background:${theme.dot}"></span>
              <span class="font-semibold text-foreground">${escapeHtml(vehicle.model)}</span>
              <span class="ml-auto font-mono text-[11px] font-bold text-primary">${vehicle.etaMinutes}m ETA</span>
            </div>
            <div class="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
              <span>${escapeHtml(vehicle.licensePlate)}</span>
              <span>·</span>
              <span>${escapeHtml(vehicle.driverName)}</span>
              <span>·</span>
              <span class="text-amber-500 font-semibold">${vehicle.driverRating.toFixed(1)}★</span>
            </div>
            <div class="mt-1 text-[10px] font-semibold" style="color:${theme.dot}">
              ${escapeHtml(VEHICLE_TIERS[vehicle.tierId].name)}
            </div>
          </div>
        `,
          { direction: "top", offset: [0, -20], opacity: 0.98 },
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
          place them. Nearby vehicles appear with their vehicle class icon and arrival time; choose
          one to highlight it in the fleet below.
        </p>

        <div ref={containerRef} className="absolute inset-0 z-0 min-h-[360px]" />

        <div className="pointer-events-none absolute inset-0 z-10">
          <div className="pointer-events-auto absolute left-3 top-3 max-w-[calc(100%-7.5rem)] sm:left-6 sm:top-6">
            <div className="rounded-xl border border-border/80 bg-background/92 px-3.5 py-2.5 shadow-sm backdrop-blur-md">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-micro tabular-nums text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
                  {pickup.lat.toFixed(3)}, {pickup.lng.toFixed(3)}
                </span>
                <span aria-hidden="true" className="text-muted-foreground/60">→</span>
                <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
                  <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
                  {dropoff.lat.toFixed(3)}, {dropoff.lng.toFixed(3)}
                </span>
              </p>

              <div className="mt-2 flex items-center gap-3 border-t border-border/60 pt-2">
                <span className="flex flex-col">
                  <span className="text-micro text-muted-foreground">Road distance</span>
                  <span className="font-mono text-xs font-bold tabular-nums text-foreground">
                    {routeDistance.toLocaleString()} km
                  </span>
                </span>
                <span className="h-6 w-px shrink-0 bg-border/70" aria-hidden="true" />
                <span className="flex flex-col">
                  <span className="text-micro text-muted-foreground">Drive time</span>
                  <span className="font-mono text-xs font-bold tabular-nums text-foreground">
                    {formatDriveDuration(routeDuration)}
                  </span>
                </span>
              </div>

              {tierCounts.length > 0 ? (
                <div className="mt-2 hidden flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 pt-2 sm:flex">
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
                <p className="mt-2 border-t border-border/60 pt-2 font-mono text-micro text-muted-foreground">
                  No vehicles match the current filters
                </p>
              )}
            </div>
          </div>

          <div className="pointer-events-auto absolute right-3 top-3 flex flex-col items-end gap-2 sm:right-6 sm:top-6">
            <div className="flex flex-col overflow-hidden rounded-xl border border-border/80 bg-background/92 shadow-sm backdrop-blur-md">
              <button
                type="button"
                onClick={handleZoomIn}
                title="Zoom in"
                aria-label="Zoom in"
                className="flex size-8 items-center justify-center text-foreground transition-colors hover:bg-muted"
              >
                <IconPlus className="size-4" aria-hidden="true" />
              </button>
              <span className="h-px w-full bg-border/70" aria-hidden="true" />
              <button
                type="button"
                onClick={handleZoomOut}
                title="Zoom out"
                aria-label="Zoom out"
                className="flex size-8 items-center justify-center text-foreground transition-colors hover:bg-muted"
              >
                <IconMinus className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="flex flex-col items-end gap-1.5">
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
          </div>

          {activePinMode ? (
            <div className="pointer-events-auto absolute bottom-5 left-1/2 z-10 -translate-x-1/2">
              <div className="flex items-center gap-2 whitespace-nowrap rounded-full border border-border/80 bg-background/95 px-4 py-2 text-xs font-semibold text-foreground shadow-lg backdrop-blur-md">
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    activePinMode === "pickup" ? "bg-emerald-500" : "bg-primary",
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
