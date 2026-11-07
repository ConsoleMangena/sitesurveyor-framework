import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  BASEMAP_ATTRIBUTION,
  BASEMAP_BASE_URL,
  BASEMAP_LABELS_URL,
  BASEMAP_MAX_NATIVE_ZOOM,
} from "../map/basemap.ts";
import type { HireVehicle, LocationCoordinate } from "../../lib/transportHire.ts";
import {
  calculateRoadDistanceKm,
  estimateDriveDurationMinutes,
  formatCoordinates,
  formatDriveDuration,
} from "../../lib/transportHire.ts";

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

    // Zoom & Fit bounds helper
    const fitRoute = useCallback(() => {
      const map = mapRef.current;
      if (!map) return;

      if (pickup && dropoff) {
        const bounds = L.latLngBounds([
          [pickup.lat, pickup.lng],
          [dropoff.lat, dropoff.lng],
        ]);
        map.fitBounds(bounds, {
          padding: [70, 70],
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
        <div class="relative flex flex-col items-center group cursor-grab active:cursor-grabbing">
          <span class="absolute w-8 h-8 rounded-full bg-emerald-500/30 animate-ping"></span>
          <div class="relative flex items-center gap-1.5 px-2.5 py-1 bg-emerald-600 text-white rounded-full shadow-xl border-2 border-white dark:border-zinc-900 text-xs font-semibold whitespace-nowrap">
            <span class="w-2 h-2 rounded-full bg-white animate-pulse"></span>
            <span>PICKUP</span>
          </div>
          <div class="mt-1 px-1.5 py-0.5 rounded bg-zinc-950/80 text-[10px] text-zinc-100 font-mono shadow">
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
        <div class="p-2 text-xs font-sans">
          <div class="font-bold text-emerald-600">Pickup Location</div>
          <div class="font-mono text-zinc-800 dark:text-zinc-200">${formatCoordinates(pickup.lat, pickup.lng)}</div>
          <div class="text-[11px] text-zinc-500 mt-1">Drag marker anywhere to adjust pickup</div>
        </div>
      `);

      layersRef.current.pickupMarker = pMarker;

      // Dropoff Draggable Marker
      const dropoffHtml = `
        <div class="relative flex flex-col items-center group cursor-grab active:cursor-grabbing">
          <div class="relative flex items-center gap-1.5 px-2.5 py-1 bg-rose-600 text-white rounded-full shadow-xl border-2 border-white dark:border-zinc-900 text-xs font-semibold whitespace-nowrap">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>
            <span>DROPOFF</span>
          </div>
          <div class="mt-1 px-1.5 py-0.5 rounded bg-zinc-950/80 text-[10px] text-zinc-100 font-mono shadow">
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
        <div class="p-2 text-xs font-sans">
          <div class="font-bold text-rose-600">Destination Location</div>
          <div class="font-mono text-zinc-800 dark:text-zinc-200">${formatCoordinates(dropoff.lat, dropoff.lng)}</div>
          <div class="text-[11px] text-zinc-500 mt-1">Drag marker anywhere to adjust destination</div>
        </div>
      `);

      layersRef.current.dropoffMarker = dMarker;

      // Draw Route Polyline
      const polylineCoords: L.LatLngTuple[] = [
        [pickup.lat, pickup.lng],
        [dropoff.lat, dropoff.lng],
      ];

      const routeLine = L.polyline(polylineCoords, {
        color: "#e11d48",
        weight: 4,
        opacity: 0.9,
        dashArray: "1, 9",
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map);

      layersRef.current.routeLayer = routeLine;
    }, [pickup, dropoff, onCoordinatesChange]);

    // Update Fleet Vehicle Markers
    useEffect(() => {
      const map = mapRef.current;
      const group = layersRef.current.vehicleMarkersGroup;
      if (!map || !group) return;

      group.clearLayers();

      vehicles.forEach((vehicle) => {
        const isSelected = selectedVehicleId === vehicle.id;

        const vehicleHtml = `
          <div class="cursor-pointer transition-all duration-200 hover:scale-110 ${
            isSelected ? "scale-125 z-50" : ""
          }">
            <div class="relative flex items-center justify-center">
              ${
                isSelected
                  ? '<span class="absolute -inset-2 rounded-full bg-rose-500/40 animate-ping"></span>'
                  : ""
              }
              <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full shadow-lg border ${
                isSelected
                  ? "bg-rose-600 text-white border-rose-400 font-bold"
                  : "bg-background/95 text-foreground border-border font-medium hover:border-primary"
              } text-[11px] whitespace-nowrap">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C2.1 10.7 2 11 2 11.3V16c0 .6.4 1 1 1h2"/>
                  <circle cx="7" cy="17" r="2"/>
                  <path d="M9 17h6"/>
                  <circle cx="17" cy="17" r="2"/>
                </svg>
                <span class="font-mono">${vehicle.etaMinutes}m</span>
              </div>
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
          if (onSelectVehicle) {
            onSelectVehicle(vehicle);
          }
        });

        vMarker.bindTooltip(
          `
          <div class="font-sans text-xs p-1.5">
            <div class="font-bold text-foreground">${vehicle.model}</div>
            <div class="text-muted-foreground text-[10px] font-mono">${vehicle.licensePlate} • Driver: ${vehicle.driverName} (${vehicle.driverRating}★)</div>
            <div class="text-rose-500 font-semibold text-[11px] mt-0.5 font-mono">ETA to pickup: ${vehicle.etaMinutes} mins</div>
          </div>
        `,
          { direction: "top", offset: [0, -10] },
        );

        group.addLayer(vMarker);
      });
    }, [vehicles, selectedVehicleId, onSelectVehicle]);

    return (
      <div
        className={`relative w-full h-full overflow-hidden ${
          activePinMode ? "cursor-crosshair" : ""
        } ${className ?? ""}`}
      >
        {/* Leaflet Canvas */}
        <div ref={containerRef} className="w-full h-full min-h-[360px] z-0" />

        {/* Floating Route Overview HUD (Top Center) */}
        {routeDistance > 0 && (
          <div className="absolute top-4 left-4 right-4 sm:left-6 sm:right-auto z-[400] max-w-sm bg-background/95 backdrop-blur-md border border-border/80 shadow-2xl rounded-2xl p-3 text-xs pointer-events-auto">
            <div className="flex items-center justify-between gap-3 pb-2 border-b border-border/60">
              <div className="flex items-center gap-1.5">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-mono text-muted-foreground text-[11px]">
                  {pickup.lat.toFixed(3)}, {pickup.lng.toFixed(3)}
                </span>
                <span className="text-muted-foreground font-mono">→</span>
                <span className="font-mono text-muted-foreground text-[11px]">
                  {dropoff.lat.toFixed(3)}, {dropoff.lng.toFixed(3)}
                </span>
              </div>
              <button
                type="button"
                onClick={fitRoute}
                title="Fit route in view"
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
              </button>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-3">
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
                    Estimated Time
                  </span>
                  <span className="font-mono text-sm font-bold text-foreground">
                    {formatDriveDuration(routeDuration)}
                  </span>
                </div>
              </div>

              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 font-mono text-[10px] font-semibold">
                Direct Route
              </span>
            </div>
          </div>
        )}

        {/* Active Pin Placement Banner */}
        {activePinMode && (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-[400] px-4 py-2 rounded-full bg-zinc-950 text-white font-medium text-xs shadow-2xl border border-zinc-700 flex items-center gap-2 animate-bounce">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                activePinMode === "pickup" ? "bg-emerald-400" : "bg-rose-400"
              }`}
            />
            <span>
              Click map to set {activePinMode === "pickup" ? "Pickup" : "Destination"} GPS coordinates
            </span>
          </div>
        )}

        {/* Drag Helper Tooltip */}
        <div className="absolute bottom-3 left-3 z-[400] pointer-events-none hidden sm:block">
          <div className="px-3 py-1 rounded-lg bg-background/90 backdrop-blur-sm border border-border/70 text-[10px] text-muted-foreground font-mono shadow-sm">
            Drag markers or click anywhere on the map to place GPS pins
          </div>
        </div>
      </div>
    );
  },
);

export default TransportMap;
