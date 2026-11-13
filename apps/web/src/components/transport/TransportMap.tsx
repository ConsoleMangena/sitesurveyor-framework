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
import {
  IconArrowsMaximize,
  IconArrowsMove,
  IconArrowRight,
  IconClock,
  IconCurrentLocation,
  IconMapPin,
  IconMinus,
  IconPlus,
  IconRoad,
  IconRotate,
  IconRoute,
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
 * Tabler-style vehicle glyphs, drawn at 24×24 with a consistent 1.9 stroke.
 * They match the tier icons used on the fleet cards, so a pin and a card read
 * as the same vehicle class at a glance.
 */
const VEHICLE_TIER_SVGS: Record<VehicleTierId, string> = {
  bakkie_4x4:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" class="transport-vehicle-glyph" aria-hidden="true"><path d="M5 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M15 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M5 17h-2v-11a1 1 0 0 1 1 -1h9v12m-4 0h6m4 0h2v-6h-8m0 -5h5l3 5"/></svg>',
  crew_van:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" class="transport-vehicle-glyph" aria-hidden="true"><path d="M4 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M16 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M4 17h-2v-11a1 1 0 0 1 1 -1h14a5 7 0 0 1 5 7v5h-2m-4 0h-8"/><path d="M16 5l1.5 7l4.5 0"/><path d="M2 10l15 0"/><path d="M7 5l0 5"/><path d="M12 5l0 5"/></svg>',
  heavy_truck:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" class="transport-vehicle-glyph" aria-hidden="true"><path d="M5 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M15 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M5 17h-2v-4m-1 -8h11v12m-4 0h6m4 0h2v-6h-8m0 -5h5l3 5"/><path d="M3 9l4 0"/></svg>',
  executive_suv:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" class="transport-vehicle-glyph" aria-hidden="true"><path d="M5 17a2 2 0 1 0 4 0a2 2 0 0 0 -4 0"/><path d="M16 17a2 2 0 1 0 4 0a2 2 0 0 0 -4 0"/><path d="M5 9l2 -4h7.438a2 2 0 0 1 1.94 1.515l.622 2.485h3a2 2 0 0 1 2 2v3"/><path d="M10 9v-4"/><path d="M2 7v4"/><path d="M22.001 14.001a4.992 4.992 0 0 0 -4.001 -2.001a4.992 4.992 0 0 0 -4 2h-3a4.998 4.998 0 0 0 -8.003 .003"/><path d="M5 12v-3h13"/></svg>',
  rapid_runner:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" class="transport-vehicle-glyph" aria-hidden="true"><path d="M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11"/></svg>',
};

function createWaypointHtml(type: "pickup" | "dropoff"): string {
  const isPickup = type === "pickup";
  const color = isPickup ? PICKUP_COLOR : DROPOFF_COLOR;
  const letter = isPickup ? "A" : "B";
  const title = isPickup ? "Pickup" : "Destination";

  return [
    '<div class="transport-waypoint-container" style="--waypoint-color:' + color + '; --ring-color:' + color + ';">',
    '  <div class="transport-waypoint-tag">',
    '    <span class="transport-waypoint-tag-dot"></span>',
    '    <span>' + title + '</span>',
    '  </div>',
    '  <div class="transport-waypoint-pin">',
    '    <svg width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">',
    '      <path d="M16 40.5C16 40.5 30 25.5 30 16.5C30 8.8 23.7 2.5 16 2.5C8.3 2.5 2 8.8 2 16.5C2 25.5 16 40.5 16 40.5Z" fill="' + color + '" stroke="#ffffff" stroke-width="2.4" stroke-linejoin="round"/>',
    '      <circle cx="16" cy="16.5" r="9" fill="#ffffff"/>',
    '      <text x="16" y="20.4" text-anchor="middle" font-size="11" font-weight="700" fill="' + color + '" font-family="Inter, ui-sans-serif, system-ui, sans-serif">' + letter + '</text>',
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
    '    <span class="transport-vehicle-icon">',
    '      ' + svg,
    '    </span>',
    '    <span class="transport-vehicle-eta">' + vehicle.etaMinutes + '<span class="transport-vehicle-eta-unit">m</span></span>',
    '  </div>',
    '</div>',
  ].join("");
}

function createClusterHtml(count: number, minEta: number): string {
  return [
    '<div class="transport-fleet-cluster">',
    '  <span class="transport-fleet-cluster-count">' + count + '</span>',
    '  <span class="transport-fleet-cluster-copy">',
    '    <span class="transport-fleet-cluster-title">',
    '      <span class="transport-fleet-cluster-title-full">Vehicles nearby</span>',
    '      <span class="transport-fleet-cluster-title-compact">Nearby</span>',
    '    </span>',
    '    <span class="transport-fleet-cluster-meta">from ' + minEta + ' min</span>',
    '  </span>',
    '</div>',
  ].join("");
}

function buildRoutePoints(
  pickup: LocationCoordinate,
  dropoff: LocationCoordinate,
): L.LatLngTuple[] {
  const start = L.latLng(pickup.lat, pickup.lng);
  const end = L.latLng(dropoff.lat, dropoff.lng);
  const dx = end.lng - start.lng;
  const dy = end.lat - start.lat;
  const span = Math.hypot(dx, dy);
  if (span === 0) return [[start.lat, start.lng]];

  // A gentle quadratic bow keeps the preview from reading as a ruler line.
  const bow = 0.07;
  const controlLat = (start.lat + end.lat) / 2 - dx * bow;
  const controlLng = (start.lng + end.lng) / 2 + dy * bow;
  const points: L.LatLngTuple[] = [];
  const steps = 48;

  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const inverse = 1 - t;
    points.push([
      inverse * inverse * start.lat + 2 * inverse * t * controlLat + t * t * end.lat,
      inverse * inverse * start.lng + 2 * inverse * t * controlLng + t * t * end.lng,
    ]);
  }

  return points;
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
    // The map is created once; freeze its starting centre so the init effect
    // does not need to depend on the pickup coordinate.
    const initialCenterRef = useRef<L.LatLngTuple>([pickup.lat, pickup.lng]);
    const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);
    const layersRef = useRef<{
      baseLayer?: L.TileLayer;
      labelsLayer?: L.TileLayer;
      routeCasingLayer?: L.Polyline;
      routeGlowLayer?: L.Polyline;
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

    const centerOnPickup = useCallback(() => {
      const map = mapRef.current;
      if (!map) return;
      map.setView([pickup.lat, pickup.lng], 13, { animate: true });
    }, [pickup]);

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
        center: initialCenterRef.current,
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

    // Track zoom so the fleet can collapse into one readable callout at
    // national scale, then fan out into individual vehicle pins up close.
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      const handleZoom = () => setZoomLevel(map.getZoom());
      map.on("zoomend", handleZoom);
      handleZoom();

      return () => {
        map.off("zoomend", handleZoom);
      };
    }, []);

    // Handle Map Clicks for Active Pin Placement
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      const handleMapClick = (e: L.LeafletMouseEvent) => {
        if (!activePinMode) return;
        const targetType = activePinMode;
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
      if (layersRef.current.routeGlowLayer) {
        map.removeLayer(layersRef.current.routeGlowLayer);
        layersRef.current.routeGlowLayer = undefined;
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
        iconSize: [140, 66],
        iconAnchor: [70, 66],
        popupAnchor: [0, -60],
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
        iconSize: [140, 66],
        iconAnchor: [70, 66],
        popupAnchor: [0, -60],
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

      // Draw the route as a soft bowed corridor. Three stacked strokes give
      // the line a crisp white casing, a faint brand glow, and a marching
      // dashed centre that reads well over both light and satellite tiles.
      const polylineCoords = buildRoutePoints(pickup, dropoff);

      const routeGlow = L.polyline(polylineCoords, {
        color: DROPOFF_COLOR,
        weight: 13,
        opacity: 0.14,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map);

      const routeCasing = L.polyline(polylineCoords, {
        color: "#ffffff",
        weight: 8,
        opacity: 0.95,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map);

      const routeLine = L.polyline(polylineCoords, {
        color: DROPOFF_COLOR,
        weight: 4.5,
        opacity: 0.95,
        dashArray: "9, 13",
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map);

      routeLine.getElement()?.classList.add("transport-route-line");

      layersRef.current.routeCasingLayer = routeCasing;
      layersRef.current.routeLayer = routeLine;
      layersRef.current.routeGlowLayer = routeGlow;

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

    // Update Fleet Vehicle Markers. At national zoom the vehicles all sit
    // within a few pixels of the pickup, so collapse them into one callout
    // stacked above the pickup pin; up close they fan out into individual
    // tier-glyph pins.
    useEffect(() => {
      const map = mapRef.current;
      const group = layersRef.current.vehicleMarkersGroup;
      if (!map || !group) return;

      group.clearLayers();

      if (vehicles.length === 0) return;

      if (zoomLevel < 10) {
        const minEta = Math.min(...vehicles.map((vehicle) => vehicle.etaMinutes));
        const clusterIcon = L.divIcon({
          className: "transport-pin transport-cluster-pin",
          html: createClusterHtml(vehicles.length, minEta),
          iconSize: [160, 46],
          iconAnchor: [80, 118],
        });

        const clusterMarker = L.marker([pickup.lat, pickup.lng], {
          icon: clusterIcon,
          zIndexOffset: 700,
        });

        clusterMarker.on("click", () => {
          map.setView([pickup.lat, pickup.lng], 13, { animate: true });
        });

        group.addLayer(clusterMarker);
        return;
      }

      vehicles.forEach((vehicle) => {
        const isSelected = selectedVehicleId === vehicle.id;
        const theme = VEHICLE_TIER_THEME[vehicle.tierId];
        const vehicleHtml = createVehicleHtml(vehicle, isSelected);

        const vIcon = L.divIcon({
          className: "transport-pin fleet-vehicle-pin-" + vehicle.id,
          html: vehicleHtml,
          iconSize: [84, 42],
          iconAnchor: [42, 42],
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
            <div class="mt-1 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
              <span>${escapeHtml(vehicle.licensePlate)}</span>
              <span>·</span>
              <span>${escapeHtml(vehicle.driverName)}</span>
              <span>·</span>
              <span class="text-amber-500 font-semibold">${vehicle.driverRating.toFixed(1)}★</span>
            </div>
            <div class="mt-1 text-xs font-semibold" style="color:${theme.dot}">
              ${escapeHtml(VEHICLE_TIERS[vehicle.tierId].name)}
            </div>
          </div>
        `,
          {
            direction: "top",
            offset: [0, -24],
            opacity: 0.98,
            className: "transport-tooltip-shell",
          },
        );

        group.addLayer(vMarker);
      });
    }, [vehicles, selectedVehicleId, onSelectVehicle, zoomLevel, pickup]);

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
          place them. At the national view nearby vehicles are grouped in one callout; zoom in or
          choose the callout to see each vehicle class icon and arrival time. Selecting a vehicle
          highlights it in the fleet below.
        </p>

        <div ref={containerRef} className="absolute inset-0 z-0 min-h-[360px]" />

        <div className="pointer-events-none absolute inset-0 z-10">
          <div className="pointer-events-auto absolute left-3 top-3 hidden w-[min(19rem,calc(100%-4.75rem))] sm:left-5 sm:top-5 sm:block">
            <div className="overflow-hidden rounded-2xl border border-border/80 bg-background/92 shadow-[0_10px_30px_rgba(15,23,42,0.12)] backdrop-blur-md">
              <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3.5 py-2">
                <span className="inline-flex items-center gap-1.5 text-micro font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <IconRoute className="size-3.5 text-primary" aria-hidden="true" />
                  Route preview
                </span>
                <span className="inline-flex items-center gap-1.5 text-micro font-semibold text-success">
                  <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                  Sample
                </span>
              </div>

              <div className="space-y-2 px-3.5 py-2.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-success/12 text-xs font-bold text-success ring-1 ring-success/25">
                    A
                  </span>
                  <span className="font-mono text-[11px] font-semibold tabular-nums text-foreground">
                    {pickup.lat.toFixed(3)}, {pickup.lng.toFixed(3)}
                  </span>
                  <IconArrowRight className="size-3 shrink-0 text-muted-foreground/70" aria-hidden="true" />
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-bold text-primary ring-1 ring-primary/25">
                    B
                  </span>
                  <span className="font-mono text-[11px] font-semibold tabular-nums text-foreground">
                    {dropoff.lat.toFixed(3)}, {dropoff.lng.toFixed(3)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 border-t border-border/60 pt-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <IconRoad className="size-3.5" aria-hidden="true" />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Road
                      </span>
                      <span className="truncate font-mono text-xs font-bold tabular-nums text-foreground">
                        {routeDistance.toLocaleString()} km
                      </span>
                    </span>
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <IconClock className="size-3.5" aria-hidden="true" />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Drive
                      </span>
                      <span className="truncate font-mono text-xs font-bold tabular-nums text-foreground">
                        {formatDriveDuration(routeDuration)}
                      </span>
                    </span>
                  </span>
                </div>

                {tierCounts.length === 0 ? (
                  <p className="border-t border-border/60 pt-2 text-micro font-medium text-muted-foreground">
                    No vehicles match the current filters
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="sr-only" role="status" aria-live="polite">
            {activePinMode ? `Pin mode active. Click the map to set the ${activePinMode}.` : "Pin placement is off."}
          </div>
          <div className="pointer-events-auto absolute right-3 top-3 flex flex-col items-end gap-1.5 sm:right-5 sm:top-5">
            <div className="flex flex-col overflow-hidden rounded-xl border border-border/80 bg-background/92 shadow-sm backdrop-blur-md">
              <button
                type="button"
                onClick={handleZoomIn}
                title="Zoom in"
                aria-label="Zoom in"
                className="flex size-11 items-center justify-center text-foreground transition-colors hover:bg-muted"
              >
                <IconPlus className="size-4" aria-hidden="true" />
              </button>
              <span className="h-px w-full bg-border/70" aria-hidden="true" />
              <button
                type="button"
                onClick={handleZoomOut}
                title="Zoom out"
                aria-label="Zoom out"
                className="flex size-11 items-center justify-center text-foreground transition-colors hover:bg-muted"
              >
                <IconMinus className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div
            className={cn(
              "pointer-events-auto absolute right-3 flex flex-col items-end gap-1.5 sm:right-5",
              activePinMode ? "bottom-16" : "bottom-8",
            )}
          >
            <div className="flex items-center overflow-hidden rounded-full border border-border/80 bg-background/92 shadow-sm backdrop-blur-md">
              <button
                type="button"
                onClick={centerOnPickup}
                title="Center on the pickup"
                aria-label="Center on the pickup"
                className="flex size-11 items-center justify-center text-foreground transition-colors hover:bg-muted"
              >
                <IconCurrentLocation className="size-3.5" aria-hidden="true" />
              </button>
              <span className="h-4 w-px shrink-0 bg-border/70" aria-hidden="true" />
              <button
                type="button"
                onClick={fitRoute}
                title="Fit the map to the route"
                aria-label="Fit the map to the route"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
              >
                <IconArrowsMaximize className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <span className="hidden sm:inline">Fit route</span>
              </button>
              <span className="h-4 w-px shrink-0 bg-border/70" aria-hidden="true" />
              <button
                type="button"
                onClick={resetView}
                title="Reset the map to the national view"
                aria-label="Reset the map to the national view"
                className="flex size-11 items-center justify-center text-foreground transition-colors hover:bg-muted"
              >
                <IconRotate className="size-3.5" aria-hidden="true" />
              </button>
            </div>

            {tierCounts.length > 0 ? (
              <div className="hidden rounded-xl border border-border/80 bg-background/92 px-2.5 py-2 shadow-sm backdrop-blur-md md:block">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Fleet nearby
                </p>
                <div className="mt-1.5 flex flex-col gap-1">
                  {tierCounts.map(([tierId, count]) => (
                    <span
                      key={tierId}
                      className="flex items-center gap-1.5 text-xs font-medium text-foreground"
                    >
                      <span
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: VEHICLE_TIER_THEME[tierId].dot }}
                        aria-hidden="true"
                      />
                      <span className="min-w-[72px]">{VEHICLE_TIERS[tierId].shortName}</span>
                      <span className="font-mono tabular-nums text-muted-foreground">{count}</span>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {activePinMode ? (
            <div className="pointer-events-auto absolute bottom-5 left-1/2 z-10 -translate-x-1/2">
              <div className="flex items-center gap-2 whitespace-nowrap rounded-full border border-border/80 bg-background/95 px-4 py-2 text-xs font-semibold text-foreground shadow-lg backdrop-blur-md">
                <IconMapPin
                  className={cn(
                    "size-3.5 shrink-0",
                    activePinMode === "pickup" ? "text-success" : "text-primary",
                  )}
                  aria-hidden="true"
                />
                Click the map to set your {activePinMode === "pickup" ? "pickup" : "destination"}
              </div>
            </div>
          ) : (
            <div className="absolute bottom-8 left-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/88 px-2.5 py-1 text-micro font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
                <IconArrowsMove className="size-3" aria-hidden="true" />
                Drag a marker · choose Drop pin to place
              </span>
            </div>
          )}

        </div>
      </div>
    );
  },
);

export default TransportMap;
