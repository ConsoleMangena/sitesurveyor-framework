import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Circle,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  Rectangle,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import {
  Check,
  ChevronRight,
  Code2,
  Compass,
  Copy,
  Crosshair,
  Download,
  Eye,
  Layers,
  MapPin,
  Maximize2,
  Minimize2,
  RotateCcw,
  SlidersHorizontal,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import {
  BASEMAPS,
  CATEGORY_COLORS,
  CATEGORY_MARKS,
  aoiBounds,
  dmsText,
  metersPerPixel,
  scaleText,
  type LatLngTuple,
  type MapCandidate,
} from "../../lib/surveys/workbench.ts";
import {
  CATEGORY_LABELS,
  coordText,
  distanceText,
  scoreText,
  type DossierCategory,
} from "../../lib/surveys/labels.ts";
import { candidateIcon, targetIcon } from "./mapIcons.ts";
import {
  buildClassifiedVectorCollection,
  compassDirection,
  downloadGeoJsonFile,
  haversineDistanceMeters,
  initialBearingDegrees,
  type ClassifiedVectorFeatureCollection,
} from "../../lib/surveys/vectorGeoJson.ts";

interface ClassifiedVectorViewerProps {
  isOpen: boolean;
  onClose: () => void;
  target: { latitude: number; longitude: number };
  halfDeg: number;
  candidates: MapCandidate[];
  activeDossierCategory: DossierCategory;
  clientName?: string;
  crs?: string | null;
  onDownloadKmz?: () => void;
}

/** Controller to manipulate Leaflet camera smoothly */
function VectorCameraController({
  bounds,
  flyToCoord,
  zoomLevel,
  token,
  onViewChange,
}: {
  bounds: [LatLngTuple, LatLngTuple];
  flyToCoord: { lat: number; lon: number } | null;
  zoomLevel: number;
  token: number;
  onViewChange: (zoom: number, scale: string, centerCoords: string) => void;
}) {
  const map = useMap();

  useEffect(() => {
    function handleUpdate() {
      const zoom = map.getZoom();
      const center = map.getCenter();
      onViewChange(
        zoom,
        scaleText(metersPerPixel(center.lat, zoom)),
        dmsText(center.lat, center.lng),
      );
    }

    map.on("zoomend", handleUpdate);
    map.on("moveend", handleUpdate);
    handleUpdate();

    return () => {
      map.off("zoomend", handleUpdate);
      map.off("moveend", handleUpdate);
    };
  }, [map, onViewChange]);

  useEffect(() => {
    if (flyToCoord) {
      map.flyTo([flyToCoord.lat, flyToCoord.lon], zoomLevel, {
        duration: 0.8,
        easeLinearity: 0.25,
      });
    }
  }, [flyToCoord, zoomLevel, token, map]);

  useEffect(() => {
    if (token === -1) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }, [token, bounds, map]);

  return null;
}

export default function ClassifiedVectorViewer({
  isOpen,
  onClose,
  target,
  halfDeg,
  candidates,
  activeDossierCategory,
  clientName = "Site Survey",
  crs = "WGS 84 / EPSG:4326",
  onDownloadKmz,
}: ClassifiedVectorViewerProps) {
  const [selectedCandidate, setSelectedCandidate] = useState<MapCandidate | null>(
    candidates[0] ?? null,
  );
  const [cameraTarget, setCameraTarget] = useState<{
    lat: number;
    lon: number;
  } | null>(null);
  const [cameraZoom, setCameraZoom] = useState(15);
  const [cameraToken, setCameraToken] = useState(0);

  const [basemapId, setBasemapId] = useState<"satellite" | "street">(
    "satellite",
  );
  const [layers, setLayers] = useState({
    candidates: true,
    coreZones: true,
    verificationZones: true,
    bearingLines: true,
    rangeRings: true,
    aoiEnvelope: true,
  });

  const [showGeoJsonModal, setShowGeoJsonModal] = useState(false);
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [copiedGeoJson, setCopiedGeoJson] = useState(false);
  const [telemetry, setTelemetry] = useState({
    zoom: 15,
    scale: "—",
    coords: "—",
  });

  const bounds = useMemo(
    () => aoiBounds(target.latitude, target.longitude, halfDeg),
    [target.latitude, target.longitude, halfDeg],
  );

  const categoryColor = CATEGORY_COLORS[activeDossierCategory] ?? "#38bdf8";
  const categoryInfo = CATEGORY_LABELS[activeDossierCategory];
  const activeBasemap = useMemo(
    () => BASEMAPS.find((b) => b.id === basemapId) ?? BASEMAPS[0],
    [basemapId],
  );

  // Build the complete RFC 7946 GeoJSON FeatureCollection
  const geoJsonData: ClassifiedVectorFeatureCollection = useMemo(() => {
    return buildClassifiedVectorCollection({
      target,
      halfDeg,
      candidates,
      category: activeDossierCategory,
      clientName,
      crsName: crs ?? "WGS 84",
    });
  }, [target, halfDeg, candidates, activeDossierCategory, clientName, crs]);

  // Handle escape key to close
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (showGeoJsonModal) {
          setShowGeoJsonModal(false);
        } else {
          onClose();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, showGeoJsonModal, onClose]);

  // Focus a specific candidate with deep zoom
  function focusSite(candidate: MapCandidate, deepZoom = 18.5) {
    setSelectedCandidate(candidate);
    setCameraTarget({ lat: candidate.latitude, lon: candidate.longitude });
    setCameraZoom(deepZoom);
    setCameraToken((t) => t + 1);
  }

  function focusTargetSite() {
    setSelectedCandidate(null);
    setCameraTarget({ lat: target.latitude, lon: target.longitude });
    setCameraZoom(17);
    setCameraToken((t) => t + 1);
  }

  function fitAll() {
    setSelectedCandidate(null);
    setCameraToken(-1);
  }

  function copyCoordinates(lat: number, lon: number) {
    const text = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    void navigator.clipboard.writeText(text);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  }

  function copyGeoJson() {
    void navigator.clipboard.writeText(JSON.stringify(geoJsonData, null, 2));
    setCopiedGeoJson(true);
    setTimeout(() => setCopiedGeoJson(false), 2000);
  }

  function handleDownloadGeoJson() {
    const sanitizedTitle = clientName.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    downloadGeoJsonFile(
      `${sanitizedTitle}_${activeDossierCategory}_classified_vector.geojson`,
      geoJsonData,
    );
  }

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Classified Digital Vector File Viewer"
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 backdrop-blur-md text-slate-100 animate-in fade-in duration-200"
    >
      {/* TOP HEADER & TELEMETRY BAR */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950/90 px-4">
        {/* Left: Category info & Title */}
        <div className="flex items-center gap-3">
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border shadow-sm"
            style={{
              backgroundColor: `${categoryColor}18`,
              borderColor: `${categoryColor}50`,
              color: categoryColor,
            }}
          >
            <Compass className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold tracking-tight text-slate-100 truncate">
                Classified Digital Vector Viewer
              </h2>
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
                style={{
                  backgroundColor: `${categoryColor}25`,
                  color: categoryColor,
                  border: `1px solid ${categoryColor}40`,
                }}
              >
                {categoryInfo.name}
              </span>
              <span className="hidden sm:inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-medium text-emerald-400 border border-emerald-500/20">
                Lossless Vector (1:1)
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate">
              {clientName || "Survey Target"} · {candidates.length} Scored Vector Targets · CRS: {crs}
            </p>
          </div>
        </div>

        {/* Center: Quick Site Jump Pills */}
        <div className="hidden lg:flex items-center gap-1.5 overflow-x-auto px-2">
          <button
            type="button"
            onClick={focusTargetSite}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              selectedCandidate === null
                ? "bg-red-500/20 text-red-300 border border-red-500/40"
                : "bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800"
            }`}
          >
            <Crosshair className="size-3 text-red-400" />
            Target Site
          </button>
          {candidates.map((cand) => (
            <button
              key={cand.key}
              type="button"
              onClick={() => focusSite(cand, 18.5)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                selectedCandidate?.key === cand.key
                  ? "border shadow-sm"
                  : "bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800"
              }`}
              style={
                selectedCandidate?.key === cand.key
                  ? {
                      backgroundColor: `${cand.color}25`,
                      color: cand.color,
                      borderColor: `${cand.color}60`,
                    }
                  : undefined
              }
            >
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: cand.color }}
              />
              #{cand.rank} ({scoreText(cand.score)})
            </button>
          ))}
        </div>

        {/* Right: Actions, Basemap & Close */}
        <div className="flex items-center gap-2">
          {/* Basemap switch */}
          <div className="hidden md:flex rounded-lg border border-slate-800 bg-slate-900/80 p-0.5">
            {BASEMAPS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBasemapId(b.id)}
                className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                  basemapId === b.id
                    ? "bg-slate-800 text-slate-100 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {b.label.split(" ")[0]}
              </button>
            ))}
          </div>

          {/* GeoJSON code view */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowGeoJsonModal(true)}
            className="h-8 gap-1.5 border-slate-800 bg-slate-900/80 text-xs text-slate-200 hover:bg-slate-800"
            title="Inspect Raw RFC 7946 GeoJSON"
          >
            <Code2 className="size-3.5 text-sky-400" />
            <span className="hidden sm:inline">GeoJSON</span>
          </Button>

          {/* Download GeoJSON */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownloadGeoJson}
            className="h-8 gap-1.5 border-slate-800 bg-slate-900/80 text-xs text-slate-200 hover:bg-slate-800"
            title="Download Classified Vector File (.geojson)"
          >
            <Download className="size-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Export</span>
          </Button>

          {onDownloadKmz ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onDownloadKmz}
              className="h-8 gap-1.5 border-slate-800 bg-slate-900/80 text-xs text-slate-200 hover:bg-slate-800"
              title="Download Google Earth KMZ"
            >
              <span>KMZ</span>
            </Button>
          ) : null}

          {/* Close viewer */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="size-8 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            title="Close Vector Viewer (Esc)"
          >
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </Button>
        </div>
      </header>

      {/* MAIN VIEWPORT: MAP & VECTOR OVERLAY */}
      <div className="relative flex-1 overflow-hidden">
        <MapContainer
          center={[target.latitude, target.longitude]}
          zoom={15}
          maxZoom={20}
          className="h-full w-full"
        >
          <TileLayer
            key={activeBasemap.id}
            url={activeBasemap.url}
            attribution={activeBasemap.attribution}
            maxZoom={20}
            maxNativeZoom={activeBasemap.maxNativeZoom ?? 19}
          />

          {/* AOI Bounding Envelope */}
          {layers.aoiEnvelope ? (
            <Rectangle
              bounds={bounds}
              pathOptions={{
                color: "#f43f5e",
                weight: 1.8,
                dashArray: "8 6",
                fillColor: "#f43f5e",
                fillOpacity: 0.03,
              }}
            />
          ) : null}

          {/* Concentric Range Rings from Target Site */}
          {layers.rangeRings
            ? [500, 1000, 2000].map((radiusM) => (
                <Circle
                  key={`ring_${radiusM}`}
                  center={[target.latitude, target.longitude]}
                  radius={radiusM}
                  pathOptions={{
                    color: "#94a3b8",
                    weight: 1,
                    dashArray: "4 8",
                    fillOpacity: 0,
                  }}
                >
                  <Tooltip direction="top" opacity={0.8} permanent={false}>
                    Range ring: {radiusM >= 1000 ? `${radiusM / 1000} km` : `${radiusM} m`}
                  </Tooltip>
                </Circle>
              ))
            : null}

          {/* Bearing & Distance Vector Lines */}
          {layers.bearingLines
            ? candidates.map((cand) => {
                const bearing = initialBearingDegrees(
                  target.latitude,
                  target.longitude,
                  cand.latitude,
                  cand.longitude,
                );
                const compass = compassDirection(bearing);
                const distM = Math.round(
                  cand.distanceKm !== null
                    ? cand.distanceKm * 1000
                    : haversineDistanceMeters(
                        target.latitude,
                        target.longitude,
                        cand.latitude,
                        cand.longitude,
                      ),
                );

                return (
                  <Polyline
                    key={`line_${cand.key}`}
                    positions={[
                      [target.latitude, target.longitude],
                      [cand.latitude, cand.longitude],
                    ]}
                    pathOptions={{
                      color: cand.color,
                      weight: selectedCandidate?.key === cand.key ? 2.5 : 1.2,
                      dashArray: selectedCandidate?.key === cand.key ? undefined : "6 4",
                      opacity: selectedCandidate?.key === cand.key ? 0.9 : 0.5,
                    }}
                    eventHandlers={{
                      click: () => focusSite(cand, 18.5),
                    }}
                  >
                    <Tooltip direction="center" opacity={0.9}>
                      Target #{cand.rank} · {distM >= 1000 ? `${(distM / 1000).toFixed(2)} km` : `${distM} m`} · {Math.round(bearing)}° {compass}
                    </Tooltip>
                  </Polyline>
                );
              })
            : null}

          {/* 150m Verification Envelope Polygons */}
          {layers.verificationZones
            ? candidates.map((cand) => (
                <Circle
                  key={`verif_${cand.key}`}
                  center={[cand.latitude, cand.longitude]}
                  radius={150}
                  pathOptions={{
                    color: cand.color,
                    weight: 1.2,
                    dashArray: "5 5",
                    fillColor: cand.color,
                    fillOpacity: selectedCandidate?.key === cand.key ? 0.08 : 0.04,
                  }}
                  eventHandlers={{
                    click: () => focusSite(cand, 18.5),
                  }}
                >
                  <Tooltip direction="bottom" opacity={0.85}>
                    150m verification zone (Site #{cand.rank})
                  </Tooltip>
                </Circle>
              ))
            : null}

          {/* 50m Core High-Potential Buffer Polygons */}
          {layers.coreZones
            ? candidates.map((cand) => (
                <Circle
                  key={`core_${cand.key}`}
                  center={[cand.latitude, cand.longitude]}
                  radius={50}
                  pathOptions={{
                    color: cand.color,
                    weight: selectedCandidate?.key === cand.key ? 2.4 : 1.6,
                    fillColor: cand.color,
                    fillOpacity: selectedCandidate?.key === cand.key ? 0.35 : 0.2,
                  }}
                  eventHandlers={{
                    click: () => focusSite(cand, 19),
                  }}
                >
                  <Tooltip direction="top" opacity={0.9}>
                    50m Core Footprint · #{cand.rank} (Score: {scoreText(cand.score)})
                  </Tooltip>
                </Circle>
              ))
            : null}

          {/* Client Target Property Marker */}
          <Marker
            position={[target.latitude, target.longitude]}
            icon={targetIcon("#ef4444")}
            eventHandlers={{
              click: focusTargetSite,
            }}
          >
            <Popup>
              <div className="font-semibold text-slate-900">Target Site</div>
              <div className="text-xs text-slate-600">
                {coordText(target.latitude)}, {coordText(target.longitude)}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Client: {clientName}
              </div>
            </Popup>
          </Marker>

          {/* Candidate Vector Markers */}
          {layers.candidates
            ? candidates.map((cand) => (
                <Marker
                  key={cand.key}
                  position={[cand.latitude, cand.longitude]}
                  icon={candidateIcon(cand.color, cand.letter)}
                  eventHandlers={{
                    click: () => focusSite(cand, 18.5),
                  }}
                >
                  <Popup>
                    <div
                      className="font-semibold text-sm"
                      style={{ color: cand.color }}
                    >
                      {cand.kind} #{cand.rank}
                    </div>
                    <div className="text-xs font-medium text-slate-800">
                      Score: {scoreText(cand.score)} / 100
                    </div>
                    <div className="text-xs text-slate-600">
                      Distance: {cand.distanceKm !== null ? distanceText(cand.distanceKm) : "—"}
                    </div>
                    {cand.readout ? (
                      <div className="mt-1 text-[11px] text-slate-700 bg-slate-100 p-1 rounded">
                        {cand.readout}
                      </div>
                    ) : null}
                    <div className="mt-1 text-[10.5px] font-mono text-slate-500">
                      {coordText(cand.latitude)}, {coordText(cand.longitude)}
                    </div>
                  </Popup>
                </Marker>
              ))
            : null}

          {/* Camera controller */}
          <VectorCameraController
            bounds={bounds}
            flyToCoord={cameraTarget}
            zoomLevel={cameraZoom}
            token={cameraToken}
            onViewChange={(zoom, scale, coords) => {
              setTelemetry({ zoom, scale, coords });
            }}
          />
        </MapContainer>

        {/* FLOATING TOP-LEFT: LAYER VISIBILITY POPOVER & DEEP ZOOM PILLS */}
        <div className="absolute left-4 top-4 z-[400] flex flex-col gap-2">
          {/* Quick Deep Zoom preset button */}
          {candidates[0] ? (
            <Button
              type="button"
              size="sm"
              onClick={() => focusSite(candidates[0], 19)}
              className="h-8 gap-1.5 rounded-lg bg-slate-900/90 text-xs font-medium text-slate-100 shadow-xl backdrop-blur-md border border-slate-700 hover:bg-slate-800"
            >
              <ZoomIn className="size-3.5 text-amber-400" />
              <span>Deep Zoom Site #1 (19x)</span>
            </Button>
          ) : null}

          {/* Layer toggles card */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/85 p-3 shadow-2xl backdrop-blur-md text-xs text-slate-300">
            <div className="mb-2 flex items-center gap-1.5 font-semibold text-slate-100 uppercase tracking-wider text-[10px]">
              <Layers className="size-3.5 text-slate-400" />
              Vector Layers
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 cursor-pointer hover:text-slate-100">
                <input
                  type="checkbox"
                  checked={layers.candidates}
                  onChange={(e) =>
                    setLayers((l) => ({ ...l, candidates: e.target.checked }))
                  }
                  className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-sky-500"
                />
                <span>Candidate Vectors ({candidates.length})</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer hover:text-slate-100">
                <input
                  type="checkbox"
                  checked={layers.coreZones}
                  onChange={(e) =>
                    setLayers((l) => ({ ...l, coreZones: e.target.checked }))
                  }
                  className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-sky-500"
                />
                <span>50m Core Footprint</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer hover:text-slate-100">
                <input
                  type="checkbox"
                  checked={layers.verificationZones}
                  onChange={(e) =>
                    setLayers((l) => ({
                      ...l,
                      verificationZones: e.target.checked,
                    }))
                  }
                  className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-sky-500"
                />
                <span>150m Verification Perimeter</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer hover:text-slate-100">
                <input
                  type="checkbox"
                  checked={layers.bearingLines}
                  onChange={(e) =>
                    setLayers((l) => ({
                      ...l,
                      bearingLines: e.target.checked,
                    }))
                  }
                  className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-sky-500"
                />
                <span>Bearing & Distance Lines</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer hover:text-slate-100">
                <input
                  type="checkbox"
                  checked={layers.rangeRings}
                  onChange={(e) =>
                    setLayers((l) => ({ ...l, rangeRings: e.target.checked }))
                  }
                  className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-sky-500"
                />
                <span>Concentric Range Rings</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer hover:text-slate-100">
                <input
                  type="checkbox"
                  checked={layers.aoiEnvelope}
                  onChange={(e) =>
                    setLayers((l) => ({ ...l, aoiEnvelope: e.target.checked }))
                  }
                  className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-sky-500"
                />
                <span>AOI Survey Boundary</span>
              </label>
            </div>
          </div>
        </div>

        {/* FLOATING BOTTOM-LEFT: CAMERA CONTROLS & SCALE HUD */}
        <div className="absolute bottom-4 left-4 z-[400] flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/85 p-2 shadow-2xl backdrop-blur-md text-xs text-slate-300">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={fitAll}
            className="size-7 rounded-md text-slate-300 hover:bg-slate-800 hover:text-slate-100"
            title="Reset to AOI Extent"
          >
            <RotateCcw className="size-3.5" />
          </Button>
          <div className="h-4 w-px bg-slate-800" />
          <div className="flex items-center gap-2 px-1 text-[11px] font-mono">
            <span>Zoom {telemetry.zoom}</span>
            <span className="text-slate-600">·</span>
            <span>{telemetry.scale}</span>
            <span className="text-slate-600">·</span>
            <span className="truncate max-w-[140px] sm:max-w-[220px]">
              {telemetry.coords}
            </span>
          </div>
        </div>

        {/* FLOATING RIGHT: FEATURE DOSSIER INSPECTOR */}
        {selectedCandidate ? (
          <aside
            aria-label="Vector Feature Dossier"
            className="absolute right-4 top-4 z-[400] w-80 sm:w-96 rounded-2xl border border-slate-800 bg-slate-950/90 p-4 shadow-2xl backdrop-blur-md text-slate-200 animate-in slide-in-from-right-4 duration-200"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="size-2 rounded-full animate-ping"
                    style={{ backgroundColor: selectedCandidate.color }}
                  />
                  <h3
                    className="text-base font-bold tracking-tight"
                    style={{ color: selectedCandidate.color }}
                  >
                    {selectedCandidate.kind} #{selectedCandidate.rank}
                  </h3>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{
                      backgroundColor: `${selectedCandidate.color}20`,
                      color: selectedCandidate.color,
                      border: `1px solid ${selectedCandidate.color}40`,
                    }}
                  >
                    Score {scoreText(selectedCandidate.score)}/100
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  {selectedCandidate.distanceKm !== null
                    ? `${distanceText(selectedCandidate.distanceKm)} from client target`
                    : "Target Proximity"}
                </p>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setSelectedCandidate(null)}
                className="size-7 rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                <X className="size-3.5" />
                <span className="sr-only">Close Inspector</span>
              </Button>
            </div>

            {/* Metrics Grid */}
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-slate-800/80 bg-slate-900/60 p-2.5">
                <span className="text-[10px] uppercase tracking-wider text-slate-400">
                  Bearing & Distance
                </span>
                <p className="mt-0.5 font-semibold text-slate-200">
                  {Math.round(
                    initialBearingDegrees(
                      target.latitude,
                      target.longitude,
                      selectedCandidate.latitude,
                      selectedCandidate.longitude,
                    ),
                  )}
                  °{" "}
                  {compassDirection(
                    initialBearingDegrees(
                      target.latitude,
                      target.longitude,
                      selectedCandidate.latitude,
                      selectedCandidate.longitude,
                    ),
                  )}{" "}
                  · {selectedCandidate.distanceKm !== null ? distanceText(selectedCandidate.distanceKm) : "—"}
                </p>
              </div>
              <div className="rounded-lg border border-slate-800/80 bg-slate-900/60 p-2.5">
                <span className="text-[10px] uppercase tracking-wider text-slate-400">
                  Core Footprint
                </span>
                <p className="mt-0.5 font-semibold text-emerald-400">
                  7,854 m² (50m r)
                </p>
              </div>
            </div>

            {/* Coordinates Box */}
            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/80 p-2.5">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
                <span>Vector Coordinates</span>
                <button
                  type="button"
                  onClick={() =>
                    copyCoordinates(
                      selectedCandidate.latitude,
                      selectedCandidate.longitude,
                    )
                  }
                  className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 font-medium"
                >
                  {copiedCoords ? (
                    <>
                      <Check className="size-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="size-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <div className="mt-1 font-mono text-xs text-slate-200">
                {selectedCandidate.latitude.toFixed(6)},{" "}
                {selectedCandidate.longitude.toFixed(6)}
              </div>
              <div className="text-[11px] text-slate-400">
                {dmsText(
                  selectedCandidate.latitude,
                  selectedCandidate.longitude,
                )}
              </div>
            </div>

            {/* Siting / Geotechnical Readout */}
            {selectedCandidate.readout ? (
              <div className="mt-3 rounded-lg border border-slate-800/80 bg-slate-900/50 p-2.5">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                  Operational Directive
                </span>
                <p className="mt-1 text-xs text-slate-200 leading-relaxed">
                  {selectedCandidate.readout}
                </p>
              </div>
            ) : null}

            {/* Field Notes List */}
            {Array.isArray(selectedCandidate.payload?.field_notes) &&
            (selectedCandidate.payload.field_notes as string[]).length > 0 ? (
              <div className="mt-3">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                  Field Classification Notes
                </span>
                <ul className="mt-1.5 space-y-1 text-xs text-slate-300">
                  {(selectedCandidate.payload.field_notes as string[]).map(
                    (note, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <ChevronRight className="size-3.5 shrink-0 text-sky-400 mt-0.5" />
                        <span>{note}</span>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            ) : null}

            {/* Quick Actions */}
            <div className="mt-4 flex items-center gap-2 pt-2 border-t border-slate-800">
              <Button
                type="button"
                size="sm"
                onClick={() => focusSite(selectedCandidate, 19)}
                className="flex-1 h-8 gap-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-xs font-semibold text-slate-950"
              >
                <ZoomIn className="size-3.5" />
                Deep Zoom (19x)
              </Button>
            </div>
          </aside>
        ) : null}
      </div>

      {/* RAW GEOJSON CODE MODAL */}
      {showGeoJsonModal ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[600] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
        >
          <div className="flex h-[80vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
            <div className="flex h-12 items-center justify-between border-b border-slate-800 px-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <Code2 className="size-4 text-sky-400" />
                Classified Digital Vector GeoJSON (RFC 7946)
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copyGeoJson}
                  className="h-7 gap-1 border-slate-800 bg-slate-900 text-xs text-slate-200"
                >
                  {copiedGeoJson ? (
                    <>
                      <Check className="size-3 text-emerald-400" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="size-3" />
                      <span>Copy</span>
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadGeoJson}
                  className="h-7 gap-1 border-slate-800 bg-slate-900 text-xs text-slate-200"
                >
                  <Download className="size-3" />
                  <span>Download .geojson</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowGeoJsonModal(false)}
                  className="size-7 text-slate-400 hover:text-slate-100"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 font-mono text-[11px] leading-relaxed text-slate-300">
              <pre>{JSON.stringify(geoJsonData, null, 2)}</pre>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
