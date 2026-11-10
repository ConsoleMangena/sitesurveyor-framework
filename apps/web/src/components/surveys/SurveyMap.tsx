import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap, LeafletMouseEvent } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Circle, CircleMarker, MapContainer, Marker, Polygon, Polyline, Popup, Rectangle, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { FileText, Undo2, X } from "lucide-react";
import GeoTiffOverlay from "./GeoTiffOverlay.tsx";
import PmtilesOverlay from "./PmtilesOverlay.tsx";
import { candidateIcon, targetIcon } from "./mapIcons.ts";
import type { MapTool } from "./WorkbenchBar.tsx";
import {
  basemapById,
  dmsText,
  metersPerPixel,
  scaleText,
  type LatLngTuple,
  type MapCandidate,
} from "../../lib/surveys/workbench.ts";
import {
  measureAreaText,
  measureDistanceText,
  pathDistanceM,
  polygonAreaM2,
  type MeasurePoint,
} from "../../lib/surveys/measure.ts";
import { coordText, distanceText, scoreText } from "../../lib/surveys/labels.ts";
import type { SurveyTilesSource } from "../../lib/repositories/satelliteSurveys.ts";

const BRAND = "#D14141";
const OUTSIDE = "#f59e0b";
const MEASURE = "#7c3aed";
const START_ZOOM = 13;

export interface MapViewInfo {
  zoom: number;
  scale: string;
  coords: string;
}

interface SurveyMapProps {
  target: { latitude: number; longitude: number };
  bounds: [LatLngTuple, LatLngTuple];
  candidates: MapCandidate[];
  layers: { aoi: boolean; candidates: boolean; raster?: boolean };
  classifiedImageUrl?: string | null;
  /** Georeferenced zone GeoTIFF preferred over the flattened PNG. */
  classifiedTiffUrl?: string | null;
  /** One PMTiles reader source of the same classes: real tiles, native zoom. */
  classifiedTilesSource?: SurveyTilesSource | null;
  /** Class colours used when the GeoTIFF has no embedded colour table. */
  rasterPalette?: readonly string[];
  /** Class codes the drape leaves see-through: ground the survey did not find on. */
  rasterTransparentCodes?: readonly number[];
  classifiedOpacity?: number;
  basemap: string;
  /** Outside the coverage the worker can read: the pin goes amber before the money does. */
  outside: boolean;
  crs: string | null;
  imagery: string | null;
  /** Bumped when a survey publishes or another run is opened — the map follows it. */
  fitToken: number;
  /** Bumped by the panels' collapse buttons, because Leaflet cannot measure a resized box. */
  resizeToken: number;
  focus: { latitude: number; longitude: number; token: number } | null;
  /** What a click on the canvas does. Pan is the default. */
  tool?: MapTool;
  /** Reports the live measurement so the status strip can carry it too. */
  onMeasureText?: (text: string | null) => void;
  onMoveTarget?: (latitude: number, longitude: number) => void;
  onView: (info: MapViewInfo) => void;
  onMapReady?: (map: LeafletMap) => void;
  onOpenExportView?: () => void;
  /** The page also learns when the tile archive fails, so its own consumers --
   *  the PDF export -- fall back with the same drape the map fell back to. */
  onTilesUnavailable?: () => void;
}

/** Everything that has to reach the Leaflet instance itself, in one child so the page
 *  never holds a map object in React state. */
function Controller({
  bounds,
  fitToken,
  resizeToken,
  focus,
  onView,
  onMapReady,
}: Pick<
  SurveyMapProps,
  "bounds" | "fitToken" | "resizeToken" | "focus" | "onView" | "onMapReady"
>) {
  const map = useMap();
  useEffect(() => {
    onMapReady?.(map);
  }, [map, onMapReady]);
  // `bounds` moves with every keystroke in the form, so the effect reads it through a ref
  // and only an explicit fit token can put the camera somewhere.
  const boundsRef = useRef(bounds);

  useEffect(() => {
    boundsRef.current = bounds;
  }, [bounds]);

  useMapEvents({
    mousemove: (event: LeafletMouseEvent) => reportView(map, event.latlng.lat, event.latlng.lng, onView),
    mouseout: () => reportView(map, null, null, onView),
    zoomend: () => reportView(map, null, null, onView),
    moveend: () => reportView(map, null, null, onView),
  });

  useEffect(() => {
    if (fitToken > 0) map.fitBounds(boundsRef.current, { padding: [34, 34] });
  }, [fitToken, map]);

  useEffect(() => {
    if (!focus) return;
    map.flyTo([focus.latitude, focus.longitude], 15, { duration: 0.6 });
  }, [focus, map]);

  useEffect(() => {
    if (resizeToken === 0) return;
    // The panels animate their grid columns over 220 ms; Leaflet has to be told again
    // after the animation, or the canvas keeps the width it was created with.
    const timers = [0, 60, 150, 260].map((delay) =>
      window.setTimeout(() => map.invalidateSize(), delay),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [resizeToken, map]);

  return null;
}

function reportView(
  map: LeafletMap,
  latitude: number | null,
  longitude: number | null,
  onView: (info: MapViewInfo) => void,
) {
  const center = map.getCenter();
  const point =
    latitude !== null && longitude !== null
      ? { latitude, longitude }
      : { latitude: center.lat, longitude: center.lng };
  const zoom = map.getZoom();
  onView({
    zoom,
    scale: scaleText(metersPerPixel(point.latitude, zoom)),
    coords: dmsText(point.latitude, point.longitude),
  });
}

/** The canvas tool: what a click means while one is armed. Panning keeps Leaflet's own
 *  behaviour, so nothing is bound until the operator asks for a measurement or a pin. */
function CanvasTool({
  tool,
  onPoint,
}: {
  tool: MapTool;
  onPoint: (point: MeasurePoint) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    container.style.cursor = tool === "pan" ? "" : "crosshair";
    return () => {
      container.style.cursor = "";
    };
  }, [map, tool]);

  useMapEvents({
    click: (event: LeafletMouseEvent) => {
      if (tool === "pan") return;
      onPoint({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    },
  });

  return null;
}

export default function SurveyMap({
  target,
  bounds,
  candidates,
  layers,
  classifiedImageUrl,
  classifiedTiffUrl,
  classifiedTilesSource,
  rasterPalette,
  rasterTransparentCodes,
  classifiedOpacity = 0.65,
  basemap,
  outside,
  crs,
  imagery,
  fitToken,
  resizeToken,
  focus,
  tool = "pan",
  onMeasureText,
  onMoveTarget,
  onView,
  onMapReady,
  onOpenExportView,
  onTilesUnavailable,
}: SurveyMapProps) {
  const tile = useMemo(() => basemapById(basemap), [basemap]);
  const pin = useMemo(() => targetIcon(outside ? OUTSIDE : BRAND), [outside]);
  // A tile archive that will not load must not blank the raster drape: the
  // single-image overlay picks the work up from the same classes.
  const [tilesUnavailable, setTilesUnavailable] = useState(false);
  useEffect(() => {
    setTilesUnavailable(false);
  }, [classifiedTilesSource]);
  // Stable callback: PmtilesOverlay keys its build effect on this prop's
  // identity, and a fresh arrow here would tear the tile layer down on every
  // map-move re-render.
  const handleTilesUnavailable = useCallback(() => {
    setTilesUnavailable(true);
    onTilesUnavailable?.();
  }, [onTilesUnavailable]);
  const useTiles = layers.raster !== false && Boolean(classifiedTilesSource) && !tilesUnavailable;

  const [vertices, setVertices] = useState<MeasurePoint[]>([]);
  // A measurement belongs to the tool, not the session: leaving Measure puts the canvas
  // back to a clean slate rather than stranding a half-drawn polygon over the next job.
  useEffect(() => {
    if (tool !== "measure") setVertices([]);
  }, [tool]);

  const handlePoint = useCallback(
    (point: MeasurePoint) => {
      if (tool === "target") onMoveTarget?.(point.latitude, point.longitude);
      else setVertices((current) => [...current, point]);
    },
    [tool, onMoveTarget],
  );

  const measureText = useMemo(() => {
    if (vertices.length < 2) return null;
    const length = measureDistanceText(pathDistanceM(vertices));
    if (vertices.length < 3) return length;
    return `${length} · ${measureAreaText(polygonAreaM2(vertices))}`;
  }, [vertices]);

  useEffect(() => {
    onMeasureText?.(measureText);
  }, [measureText, onMeasureText]);

  const measurePath = useMemo(
    () => vertices.map((point) => [point.latitude, point.longitude] as LatLngTuple),
    [vertices],
  );

  return (
    <>
      <MapContainer
        center={[target.latitude, target.longitude]}
        zoom={START_ZOOM}
        maxZoom={20}
        className="h-full w-full"
      >
        <TileLayer
          url={tile.url}
          attribution={tile.attribution}
          maxZoom={20}
          maxNativeZoom={tile.maxNativeZoom ?? 19}
          crossOrigin="anonymous"
        />

        {layers.aoi ? (
          <Rectangle
            bounds={bounds}
            pathOptions={{
              color: BRAND,
              weight: 1.6,
              dashArray: "7 5",
              fillColor: BRAND,
              fillOpacity: 0.05,
            }}
          />
        ) : null}

        {useTiles ? (
          <PmtilesOverlay
            source={classifiedTilesSource ?? null}
            opacity={classifiedOpacity}
            onUnavailable={handleTilesUnavailable}
          />
        ) : layers.raster !== false && (classifiedTiffUrl || classifiedImageUrl) ? (
          <GeoTiffOverlay
            url={classifiedTiffUrl}
            fallbackUrl={classifiedImageUrl}
            bounds={bounds}
            opacity={classifiedOpacity}
            palette={rasterPalette}
            transparentCodes={rasterTransparentCodes}
            zIndex={200}
          />
        ) : null}

        <Marker
          position={[target.latitude, target.longitude]}
          icon={pin}
        >
          <Popup>
            <div className="sw-popup__title">Target site</div>
            <div className="sw-popup__line">
              {coordText(target.latitude)}, {coordText(target.longitude)}
            </div>
            {outside ? <div className="sw-popup__line">Outside satellite coverage.</div> : null}
          </Popup>
        </Marker>

        {layers.candidates
          ? candidates.map((candidate) => (
              <span key={`layer_${candidate.key}`}>
                <Circle
                  center={[candidate.latitude, candidate.longitude]}
                  radius={50}
                  pathOptions={{
                    color: candidate.color,
                    weight: 1.5,
                    fillColor: candidate.color,
                    fillOpacity: 0.18,
                  }}
                />
                <Circle
                  center={[candidate.latitude, candidate.longitude]}
                  radius={150}
                  pathOptions={{
                    color: candidate.color,
                    weight: 1,
                    dashArray: "4 4",
                    fillColor: candidate.color,
                    fillOpacity: 0.04,
                  }}
                />
                <Marker
                  position={[candidate.latitude, candidate.longitude]}
                  icon={candidateIcon(candidate.color, candidate.letter)}
                >
                  <Popup>
                    <div className="sw-popup__title" style={{ color: candidate.color }}>
                      {candidate.kind} {candidate.rank}
                    </div>
                    <div className="sw-popup__line">
                      Score {scoreText(candidate.score)} / 100
                    </div>
                    <div className="sw-popup__line">
                      {candidate.distanceKm === null
                        ? "Distance not recorded"
                        : `${distanceText(candidate.distanceKm)} from target`}
                    </div>
                    {candidate.readout ? (
                      <div className="sw-popup__line">{candidate.readout}</div>
                    ) : null}
                    <div className="sw-popup__line">
                      GPS {coordText(candidate.latitude)}, {coordText(candidate.longitude)}
                    </div>
                  </Popup>
                </Marker>
              </span>
            ))
          : null}

        {measurePath.length >= 3 ? (
          <Polygon
            positions={measurePath}
            pathOptions={{
              color: MEASURE,
              weight: 2,
              fillColor: MEASURE,
              fillOpacity: 0.12,
            }}
          />
        ) : measurePath.length === 2 ? (
          <Polyline
            positions={measurePath}
            pathOptions={{ color: MEASURE, weight: 2, dashArray: "6 4" }}
          />
        ) : null}
        {measurePath.map((position, index) => (
          <CircleMarker
            key={`vertex_${index}_${position[0]}_${position[1]}`}
            center={position}
            radius={4}
            pathOptions={{ color: "#fff", weight: 1.5, fillColor: MEASURE, fillOpacity: 1 }}
          />
        ))}

        <CanvasTool tool={tool} onPoint={handlePoint} />

        <Controller
          bounds={bounds}
          fitToken={fitToken}
          resizeToken={resizeToken}
          focus={focus}
          onView={onView}
          onMapReady={onMapReady}
        />
      </MapContainer>

      {/* Outside the Leaflet container on purpose: a click on map furniture must not also
          reach the canvas, where it would drop a measuring vertex or move the target. */}
      <div className="sw-chips">
        <span className="sw-chip sw-chip--accent">
          AOI <b>{dmsText(target.latitude, target.longitude)}</b>
        </span>
        <span className="sw-chip hidden sm:inline-flex">
          CRS <b>{crs ?? "WGS 84"}</b>
        </span>
        <span className="sw-chip hidden md:inline-flex">
          Imagery <b>{imagery ?? "Not yet surveyed"}</b>
        </span>
        {onOpenExportView ? (
          <button
            type="button"
            onClick={onOpenExportView}
            className="sw-chip sw-chip--accent hover:brightness-110 cursor-pointer flex items-center gap-1.5 transition-all text-white bg-primary/80 hover:bg-primary font-medium"
            title="Export official cartographic map sheet as high-res PDF"
          >
            <FileText className="size-3" aria-hidden="true" />
            <span className="hidden sm:inline">Export PDF Sheet</span>
            <span className="sm:hidden">PDF Sheet</span>
          </button>
        ) : null}
      </div>

      {tool === "measure" ? (
        <div className="sw-measure">
          <span className="sw-measure__value" aria-live="polite">
            {measureText ?? "Click the map to measure"}
          </span>
          <button
            type="button"
            onClick={() => setVertices((current) => current.slice(0, -1))}
            disabled={vertices.length === 0}
            title="Remove the last point"
          >
            <Undo2 className="size-3.5" aria-hidden="true" />
            <span className="sr-only">Remove the last point</span>
          </button>
          <button
            type="button"
            onClick={() => setVertices([])}
            disabled={vertices.length === 0}
            title="Clear the measurement"
          >
            <X className="size-3.5" aria-hidden="true" />
            <span className="sr-only">Clear the measurement</span>
          </button>
        </div>
      ) : null}
    </>
  );
}
