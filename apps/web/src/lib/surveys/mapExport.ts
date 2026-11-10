import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { ImageOverlay as LeafletImageOverlay, type Map as LeafletMap } from "leaflet";

import { metersPerPixel, type SheetSummaryRow } from "./workbench.ts";

/**
 * A4 landscape sheet geometry in PDF points (72 pt = 1 inch).
 * The sheet is a map frame on the left and a title/legend panel on the right.
 */
export const SHEET = {
  widthPt: 842,
  heightPt: 595,
  marginPt: 18,
  panelWidthPt: 216,
  panelGapPt: 10,
} as const;

export interface SheetMapRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function sheetMapRect(panelSide: "right" | "left" = "right"): SheetMapRect {
  return {
    x:
      panelSide === "right"
        ? SHEET.marginPt
        : SHEET.marginPt + SHEET.panelWidthPt + SHEET.panelGapPt,
    y: SHEET.marginPt,
    w: SHEET.widthPt - SHEET.marginPt * 2 - SHEET.panelWidthPt - SHEET.panelGapPt,
    h: SHEET.heightPt - SHEET.marginPt * 2,
  };
}

export function sheetPanelRect(panelSide: "right" | "left" = "right"): SheetMapRect {
  return {
    x:
      panelSide === "right"
        ? SHEET.marginPt + sheetMapRect().w + SHEET.panelGapPt
        : SHEET.marginPt,
    y: SHEET.marginPt,
    w: SHEET.panelWidthPt,
    h: SHEET.heightPt - SHEET.marginPt * 2,
  };
}

export type LegendItemKind = "zone" | "station" | "target" | "aoi" | "imagery";

export interface SheetLegendItem {
  /** Swatch colour; required for zone/station/imagery kinds. */
  color?: string;
  label: string;
  /** Defaults to "zone" (a coloured circle). */
  kind?: LegendItemKind;
}

/** One headline figure the sheet states about the survey it belongs to. */
export type { SheetSummaryRow } from "./workbench.ts";

/** One column of a sheet table: its heading, its width and where the cell sits. */
export interface SheetTableColumn {
  label: string;
  width: number;
  align?: "left" | "right";
}

/**
 * A table of the survey's own numbers, printed in the title block.
 *
 * The mineral sheet needs to say which system owns how much ground, and a figure
 * beside a swatch is not a table a reader can compare down a column.
 */
export interface SheetTable {
  title: string;
  columns: SheetTableColumn[];
  rows: string[][];
  /** Rows printed in the strong ink; the rest in the soft ink. */
  emphasis?: boolean[];
  /** The map colour of each row, drawn as the key symbol beside its name. */
  swatches?: (string | null)[];
}

export interface MapExportOptions {
  title?: string;
  client?: string;
  categoryName?: string;
  coords?: string;
  /** Print resolution of the sheet; defaults to what detectOptimalQuality() picks. */
  dpi?: number;
  includeLegend?: boolean;
  includeHeader?: boolean;
  includeNorthArrow?: boolean;
  includeScaleBar?: boolean;
  includeNeatline?: boolean;
  target?: { latitude: number; longitude: number };
  /** Dashed AOI rectangle, [[south, west], [north, east]]. The sheet's export extent is
   *  this area grown by a context margin — the full survey ground, not the screen view. */
  aoiBounds?: [[number, number], [number, number]];
  candidates?: {
    latitude: number;
    longitude: number;
    color?: string;
    /** Short depth line printed in a chip beside the station dot. */
    label?: string;
    /** What the station is, e.g. "Mineral target". */
    kind?: string;
    /** Its rank inside the category, which is how the sheet names it. */
    rank?: number;
    /** The worker's own line for the station, e.g. "Auger · overburden 4-12 m". */
    readout?: string;
    /** How far the station sits from the survey centre. */
    distanceKm?: number | null;
    /** The engine's score for the station. */
    score?: number | null;
  }[];
  /** Depth line printed beside the survey centre reticle, e.g. "Water table ~24-31 m". */
  targetDepthLabel?: string;
  /** The one line a crew acts on for this category, e.g. "overburden 4-12 m" or
   *  "Low hazard". Printed in the title block as the sheet's field target. */
  fieldTargetLabel?: string;
  /** The survey's own headline figures, drawn in the title block above the reference
   *  rows. One per category: score, band, and whatever that category measures. */
  summaryRows?: SheetSummaryRow[];
  /** A table of the survey's own numbers, printed in the title block. */
  table?: SheetTable;
  /** Legend entries; the legend only prints when non-empty. */
  legendItems?: SheetLegendItem[];
  legendTitle?: string;
  /** Imagery credit, e.g. "Imagery © Esri, Earthstar Geographics". */
  attribution?: string;
  /** Slippy-map tile template, e.g. from BASEMAPS[].url. */
  tileUrlTemplate?: string;
  maxNativeZoom?: number;
  /** Context around the AOI as a fraction of its size: 0 crops the AOI at the frame,
   *  1 doubles the covered ground. Default 0.25. */
  contextFraction?: number;
  /** Which side of the sheet the title/legend panel sits on. Default "right". */
  panelSide?: "right" | "left";
  /** North arrow in the title panel or pinned to the map's top-right corner. */
  northArrowPlacement?: "panel" | "map";
  /** Scale bar in the title panel or on a cartouche at the map's bottom-left. */
  scaleBarPlacement?: "panel" | "map";
  /** Approximate number of grid divisions per axis on the sheet. Default 7. */
  gridLineCount?: number;
  /** Sheet grid labels: geographic degrees or UTM easting/northing (X/Y). Default "degrees". */
  coordMode?: "degrees" | "utm";
  /** Optical sensor the analysis was computed from, e.g. "Copernicus Sentinel-2". */
  opticalSource?: string;
  /** "view" frames the sheet to the live map's current point of view -- the extent
   *  and zoom level exactly as the workbench shows them (default). "survey" keeps
   *  the whole-ground product: the AOI grown by the context margin. */
  frame?: "view" | "survey";
  /** The survey's classified zone tiles, painted over the basemap like the live
   *  raster layer. Omit (or null) to ship the sheet without the classification. */
  classifiedTiles?: ClassifiedTilesOption | null;
  /** PNG logo drawn in the title panel. Empty string disables; defaults to /logo.png. */
  logoUrl?: string;
}

/** Classified-tiles input for the sheet: one whole-archive loader and the live
 *  layer's opacity. The loader returns the raw PMTiles bytes -- the sheet reads
 *  every tile from that single fetched copy instead of spanning a fresh ranged
 *  session through the delivery proxy for each slice. */
export interface ClassifiedTilesOption {
  loadArchive: () => Promise<ArrayBuffer>;
  opacity: number;
}

export interface OptimalQuality {
  dpr: number;
  dpi: number;
  label: string;
}

/**
 * Picks a print DPI from the machine's capabilities. With the off-screen renderer
 * the number is real: the canvas is sized from the paper, not from the screen.
 */
export function detectOptimalQuality(requestedDpr?: number): OptimalQuality {
  if (requestedDpr && requestedDpr > 0) {
    const dpi = Math.round(requestedDpr * 96);
    return { dpr: requestedDpr, dpi, label: `${dpi} DPI (Custom)` };
  }

  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const cores =
    typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;

  if (cores >= 6 || dpr >= 2) {
    return { dpr: 3.125, dpi: 300, label: "300 DPI (Ultra High-Res Print Quality)" };
  }
  if (cores >= 4 || dpr >= 1.5) {
    return { dpr: 2.5, dpi: 240, label: "240 DPI (High-Res Executive Quality)" };
  }
  return { dpr: 2.0, dpi: 192, label: "192 DPI (Standard Crisp Quality)" };
}

/** Trigger browser download for a Blob */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    try {
      if (anchor.parentNode) {
        anchor.parentNode.removeChild(anchor);
      }
      URL.revokeObjectURL(url);
    } catch {
      // Ignored
    }
  }, 1000);
}

// ---------------------------------------------------------------------------
// Pure sheet math (unit-tested)
// ---------------------------------------------------------------------------

/** Smallest tile zoom whose ground resolution is at least as fine as `neededMpp`. */
export function chooseTileZoom(
  centerLat: number,
  neededMpp: number,
  maxNativeZoom: number,
): number {
  const cap = Math.max(0, Math.min(22, Math.floor(maxNativeZoom)));
  for (let z = 0; z <= cap; z += 1) {
    if (metersPerPixel(centerLat, z) <= neededMpp) return z;
  }
  return cap;
}

export interface ProjectedPoint {
  x: number;
  y: number;
}

export interface ProjectedRect {
  topLeft: ProjectedPoint;
  bottomRight: ProjectedPoint;
}

/**
 * Grow a projected rectangle symmetrically until it matches `aspect` (w/h),
 * clamped to the tile world (0..worldPx). Used so the map area is filled with
 * imagery instead of letterboxed.
 */
export function expandBoundsToAspect(
  topLeft: ProjectedPoint,
  bottomRight: ProjectedPoint,
  aspect: number,
  worldPx: number,
): ProjectedRect {
  const w = Math.max(1, bottomRight.x - topLeft.x);
  const h = Math.max(1, bottomRight.y - topLeft.y);
  const cx = (topLeft.x + bottomRight.x) / 2;
  const cy = (topLeft.y + bottomRight.y) / 2;

  const targetW = Math.max(w, h * aspect);
  const targetH = Math.max(h, w / aspect);

  let x0 = cx - targetW / 2;
  let x1 = cx + targetW / 2;
  let y0 = cy - targetH / 2;
  let y1 = cy + targetH / 2;

  if (x0 < 0) {
    x1 -= x0;
    x0 = 0;
  }
  if (x1 > worldPx) {
    x0 -= x1 - worldPx;
    x1 = worldPx;
  }
  if (y0 < 0) {
    y1 -= y0;
    y0 = 0;
  }
  if (y1 > worldPx) {
    y0 -= y1 - worldPx;
    y1 = worldPx;
  }

  // A continent-scale view can want more world than exists at this zoom; clamp
  // rather than push the origin negative, where there are no tiles to draw.
  x0 = Math.max(0, Math.min(x0, worldPx - 1));
  y0 = Math.max(0, Math.min(y0, worldPx - 1));
  x1 = Math.min(worldPx, Math.max(x1, x0 + 1));
  y1 = Math.min(worldPx, Math.max(y1, y0 + 1));

  return {
    topLeft: { x: x0, y: y0 },
    bottomRight: { x: Math.max(x0 + 1, x1), y: Math.max(y0 + 1, y1) },
  };
}

const GRATICULE_STEPS = [
  0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5,
  1, 2, 5, 10, 20, 50, 100, 200,
];

function decimalsForStep(step: number): number {
  if (step >= 1) return 0;
  if (step >= 0.1) return 1;
  if (step >= 0.01) return 2;
  if (step >= 0.002) return 3;
  return 4;
}

/** Graticule interval that yields roughly 4-7 labelled ticks across `spanDeg`. */
export function niceGraticuleStep(
  spanDeg: number,
  maxTicks = 7,
): { step: number; decimals: number } {
  const span = Math.max(1e-6, Math.abs(spanDeg));
  for (const step of GRATICULE_STEPS) {
    if (span / step <= maxTicks) return { step, decimals: decimalsForStep(step) };
  }
  return { step: 10, decimals: 0 };
}

export function formatDeg(
  value: number,
  axis: "lat" | "lon",
  decimals: number,
): string {
  const magnitude = Math.abs(value).toFixed(decimals);
  const hemisphere =
    axis === "lat" ? (value < 0 ? "S" : "N") : value < 0 ? "W" : "E";
  return `${magnitude}°${hemisphere}`;
}

// ---------------------------------------------------------------------------
// UTM (WGS 84) — the X/Y easting-northing grid surveyors read in the field
// ---------------------------------------------------------------------------

const WGS84_A = 6378137;
const WGS84_F = 1 / 298.257223563;
const UTM_K0 = 0.9996;

export interface UtmCoord {
  easting: number;
  northing: number;
}

export function utmZoneFor(longitude: number): number {
  return Math.min(60, Math.max(1, Math.floor((longitude + 180) / 6) + 1));
}

function utmCentralMeridian(zone: number): number {
  return (zone - 1) * 6 - 180 + 3;
}

/** Transverse Mercator forward projection, WGS 84 ellipsoid, k0 = 0.9996. */
export function forwardUTM(
  latitude: number,
  longitude: number,
  zone: number,
): UtmCoord {
  const a = WGS84_A;
  const e2 = WGS84_F * (2 - WGS84_F);
  const ep2 = e2 / (1 - e2);
  const phi = (latitude * Math.PI) / 180;
  const dLng = ((longitude - utmCentralMeridian(zone)) * Math.PI) / 180;
  const sin = Math.sin(phi);
  const cos = Math.cos(phi);
  const tan = Math.tan(phi);
  const n = a / Math.sqrt(1 - e2 * sin * sin);
  const t = tan * tan;
  const c = ep2 * cos * cos;
  const A = cos * dLng;
  const m =
    a *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * phi -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) *
        Math.sin(2 * phi) +
      ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * phi) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * phi));
  const easting =
    UTM_K0 *
      n *
      (A +
        ((1 - t + c) * A ** 3) / 6 +
        ((5 - 18 * t + t * t + 72 * c - 58 * ep2) * A ** 5) / 120) +
    500000;
  let northing =
    UTM_K0 *
    (m +
      n *
        tan *
        ((A * A) / 2 +
          ((5 - t + 9 * c + 4 * c * c) * A ** 4) / 24 +
          ((61 - 58 * t + t * t + 600 * c - 330 * ep2) * A ** 6) / 720));
  if (latitude < 0) northing += 10000000;
  return { easting, northing };
}

/** Nice meter interval (1/2/5 × 10^k) giving at most maxTicks divisions. */
export function utmGridStep(spanMeters: number, maxTicks: number): number {
  const span = Math.max(1, Math.abs(spanMeters));
  for (let exp = 0; exp <= 6; exp += 1) {
    for (const mantissa of [1, 2, 5]) {
      const step = mantissa * 10 ** exp;
      if (span / step <= maxTicks) return step;
    }
  }
  return 1000000;
}

export interface UtmGridLine {
  /** "x" lines run north-south at a constant easting; "y" lines east-west. */
  axis: "x" | "y";
  value: number;
  label: string;
  path: { lat: number; lng: number }[];
}

export interface UtmGrid {
  zone: number;
  step: number;
  lines: UtmGridLine[];
}

const UTM_LINE_SAMPLES = 24;

function lngForEasting(
  lat: number,
  easting: number,
  zone: number,
  guessLng: number,
): number {
  const h = 1e-5;
  let lng = guessLng;
  for (let i = 0; i < 5; i += 1) {
    const f = forwardUTM(lat, lng, zone).easting - easting;
    const d =
      (forwardUTM(lat, lng + h, zone).easting -
        forwardUTM(lat, lng - h, zone).easting) /
      (2 * h);
    if (!Number.isFinite(d) || d === 0) break;
    lng -= f / d;
  }
  return lng;
}

function latForNorthing(
  lng: number,
  northing: number,
  zone: number,
  guessLat: number,
): number {
  const h = 1e-5;
  let lat = guessLat;
  for (let i = 0; i < 5; i += 1) {
    const f = forwardUTM(lat, lng, zone).northing - northing;
    const d =
      (forwardUTM(lat + h, lng, zone).northing -
        forwardUTM(lat - h, lng, zone).northing) /
      (2 * h);
    if (!Number.isFinite(d) || d === 0) break;
    lat -= f / d;
  }
  return lat;
}

/**
 * The sheet's UTM grid: lines of constant easting/northing (curved in lat/lng
 * space) at a shared meter interval, labeled with their full meter value.
 */
export function utmGridLines(
  extent: { south: number; west: number; north: number; east: number },
  maxTicks: number,
): UtmGrid {
  const centerLng = (extent.west + extent.east) / 2;
  const centerLat = (extent.south + extent.north) / 2;
  const zone = utmZoneFor(centerLng);
  const corners = [
    forwardUTM(extent.south, extent.west, zone),
    forwardUTM(extent.south, extent.east, zone),
    forwardUTM(extent.north, extent.west, zone),
    forwardUTM(extent.north, extent.east, zone),
  ];
  const minE = Math.min(...corners.map((c) => c.easting));
  const maxE = Math.max(...corners.map((c) => c.easting));
  const minN = Math.min(...corners.map((c) => c.northing));
  const maxN = Math.max(...corners.map((c) => c.northing));
  const step = utmGridStep(Math.max(maxE - minE, maxN - minN), maxTicks);

  const lines: UtmGridLine[] = [];
  const easting0 = forwardUTM(centerLat, centerLng, zone).easting;
  for (let e = Math.ceil(minE / step) * step; e <= maxE; e += step) {
    const path: { lat: number; lng: number }[] = [];
    for (let i = 0; i <= UTM_LINE_SAMPLES; i += 1) {
      const lat = extent.south + ((extent.north - extent.south) * i) / UTM_LINE_SAMPLES;
      path.push({
        lat,
        lng: lngForEasting(lat, e, zone, centerLng + (e - easting0) / 100000),
      });
    }
    lines.push({ axis: "x", value: e, label: String(Math.round(e)), path });
  }
  const northing0 = forwardUTM(centerLat, centerLng, zone).northing;
  for (let n = Math.ceil(minN / step) * step; n <= maxN; n += step) {
    const path: { lat: number; lng: number }[] = [];
    for (let i = 0; i <= UTM_LINE_SAMPLES; i += 1) {
      const lng = extent.west + ((extent.east - extent.west) * i) / UTM_LINE_SAMPLES;
      path.push({
        lat: latForNorthing(lng, n, zone, centerLat + (n - northing0) / 110000),
        lng,
      });
    }
    lines.push({ axis: "y", value: n, label: String(Math.round(n)), path });
  }
  return { zone, step, lines };
}

const SCALE_STEPS: number[] = (() => {
  const steps: number[] = [];
  for (let exp = 0; exp <= 7; exp += 1) {
    for (const mantissa of [1, 2, 2.5, 5]) {
      steps.push(mantissa * 10 ** exp);
    }
  }
  return steps;
})();

/**
 * Pick a round ground distance for the scale bar and return its exact printed
 * length. The bar is never stretched: widthPt always corresponds to `meters`
 * at the sheet's ground resolution.
 */
export function scaleBarLayout(
  groundPerPt: number,
  targetPt = 84,
): { meters: number; widthPt: number } {
  const ground = Math.max(1e-6, groundPerPt);
  const raw = targetPt * ground;
  let best = SCALE_STEPS[0];
  let bestErr = Infinity;
  for (const step of SCALE_STEPS) {
    const err = Math.abs(Math.log(step / raw));
    if (err < bestErr) {
      bestErr = err;
      best = step;
    }
  }
  return { meters: best, widthPt: best / ground };
}

/** Representative-fraction denominator for ground metres per printed point. */
export function representativeFraction(groundPerPt: number): number {
  return Math.max(1, Math.round((groundPerPt * 72) / 0.0254));
}

export function formatMeters(meters: number): string {
  if (meters >= 1000) {
    const km = meters / 1000;
    const digits = km >= 100 ? 0 : km >= 10 ? 1 : 2;
    return `${km.toFixed(digits)} km`;
  }
  return `${meters % 1 === 0 ? meters.toFixed(0) : meters.toFixed(1)} m`;
}

/**
 * Grow a lat/lon rectangle by `frac` of its size on every side, clamped to the Web
 * Mercator world. Used to give the exported sheet context around the survey area the
 * way a GIS layout does, instead of cropping the AOI at the frame edge.
 */
export function padBounds(
  south: number,
  west: number,
  north: number,
  east: number,
  frac: number,
): { south: number; west: number; north: number; east: number } {
  const latPad = (north - south) * frac;
  const lngPad = (east - west) * frac;
  return {
    south: Math.max(-85, south - latPad),
    west: Math.max(-180, west - lngPad),
    north: Math.min(85, north + latPad),
    east: Math.min(180, east + lngPad),
  };
}

// ---------------------------------------------------------------------------
// Tile fetching and composition
// ---------------------------------------------------------------------------

type Drawable = ImageBitmap | HTMLImageElement;

const TILE_SIZE = 256;
const MAX_TILES = 512;
const TILE_FETCH_CONCURRENCY = 8;
const TILE_FETCH_TIMEOUT_MS = 15000;

// The classified archive's usable zoom band, kept in step with the live
// PMTiles overlay: below the floor nothing paints, above the cap the parent
// tile is over-zoomed with the right quadrant scaled up.
const CLASS_TILES_MIN_ZOOM = 7;
const CLASS_TILES_MAX_NATIVE_ZOOM = 16;

export interface OverzoomQuadrant {
  /** nativeZoom = sheetZoom - shift */
  shift: number;
  /** The quadrant of the parent tile the sheet tile occupies. */
  qx: number;
  qy: number;
}

/** Which quadrant of which native tile a sheet tile over-zooms from. */
export function overzoomQuadrant(
  z: number,
  x: number,
  y: number,
  maxNativeZoom: number,
): OverzoomQuadrant {
  const shift = Math.max(0, z - maxNativeZoom);
  const mask = (1 << shift) - 1;
  return { shift, qx: x & mask, qy: y & mask };
}

function tileUrlFor(template: string, x: number, y: number, z: number): string {
  const subdomain = "abc"[Math.abs(x + y) % 3] ?? "a";
  return template
    .replace("{s}", subdomain)
    .replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
}

async function loadTileImage(url: string): Promise<Drawable | null> {
  try {
    const response = await fetch(url, {
      mode: "cors",
      credentials: "omit",
      signal:
        typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(TILE_FETCH_TIMEOUT_MS)
          : undefined,
    });
    if (!response.ok) return null;
    return await loadImageFromBlob(await response.blob());
  } catch {
    return null;
  }
}

/** Decode a fetched blob to something drawable, without tainting the sheet canvas. */
async function loadImageFromBlob(blob: Blob): Promise<Drawable | null> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob);
    } catch {
      // Fall through to the <img> path.
    }
  }
  const objectUrl = URL.createObjectURL(blob);
  return await new Promise<HTMLImageElement | null>((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    img.src = objectUrl;
  });
}

/**
 * Tile providers serve a flat, near-white (or fully transparent) "no imagery
 * at this zoom" placeholder beyond their real coverage. Sample the tile and
 * treat those as missing so the parent fallback can back-fill real imagery.
 */
async function isBlankTile(drawable: Drawable): Promise<boolean> {
  try {
    const size = 12;
    const sample = document.createElement("canvas");
    sample.width = size;
    sample.height = size;
    const sctx = sample.getContext("2d");
    if (!sctx) return false;
    sctx.drawImage(drawable, 0, 0, size, size);
    const data = sctx.getImageData(0, 0, size, size).data;
    let blankish = 0;
    for (let i = 0; i < size * size; i += 1) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const a = data[i * 4 + 3];
      if (a < 8 || (r >= 230 && g >= 230 && b >= 230)) blankish += 1;
    }
    return blankish / (size * size) >= 0.99;
  } catch {
    return false;
  }
}

async function mapInChunks<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await worker(items[index]);
      }
    },
  );
  await Promise.all(runners);
  return results;
}

async function loadImageSmart(src: string): Promise<Drawable | null> {
  if (src.startsWith("data:")) {
    return await new Promise<HTMLImageElement | null>((resolve) => {
      const img = new window.Image();
      img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
  return await loadTileImage(src);
}

interface RasterOverlaySpec {
  src: string;
  south: number;
  west: number;
  north: number;
  east: number;
  opacity: number;
}

function collectRasterOverlays(map: LeafletMap): RasterOverlaySpec[] {
  const overlays: RasterOverlaySpec[] = [];
  map.eachLayer((layer) => {
    if (!(layer instanceof LeafletImageOverlay)) return;
    const element = layer.getElement() as HTMLImageElement | undefined;
    const bounds = layer.getBounds();
    if (!element?.src || !bounds) return;
    overlays.push({
      src: element.src,
      south: bounds.getSouth(),
      west: bounds.getWest(),
      north: bounds.getNorth(),
      east: bounds.getEast(),
      opacity: layer.options.opacity ?? 1,
    });
  });
  return overlays;
}

/** The classified tiles layer for the sheet, read from one in-memory copy of the
 *  same archive the live overlay paints. */
interface SheetTilesLayer {
  opacity: number;
  minZoom: number;
  maxNativeZoom: number;
  getTile: (z: number, x: number, y: number) => Promise<Drawable | null>;
}

async function buildSheetTilesLayer(
  option: ClassifiedTilesOption,
): Promise<SheetTilesLayer | null> {
  try {
    // Same lazy reader the live overlay imports; the export never pulls it
    // into the map bundle.
    const { PMTiles } = await import("pmtiles");
    // One whole-file read for the entire sheet. Reading tiles as ranges would
    // span a fresh authenticated session through the delivery proxy for every
    // slice -- an auth check, an ownership query and a storage fetch each --
    // and a sheet spans dozens of slices. The archive itself is small, so it
    // arrives once and every tile is then read from memory.
    const bytes = await option.loadArchive();
    if (bytes.byteLength === 0) return null;
    const memorySource = {
      getKey: () => "sheet://classified-archive",
      getBytes: async (offset: number, length: number) => ({
        data: bytes.slice(offset, offset + length),
      }),
    };
    const archive = new PMTiles(memorySource);
    // The header parse is the sanity check the live overlay uses too: without
    // it a corrupt archive would leave the sheet believing it drew zones.
    await archive.getHeader();
    let warned = false;
    return {
      opacity: Math.max(0, Math.min(1, option.opacity)),
      minZoom: CLASS_TILES_MIN_ZOOM,
      maxNativeZoom: CLASS_TILES_MAX_NATIVE_ZOOM,
      getTile: async (z, x, y) => {
        try {
          const tile = await archive.getZxy(z, x, y);
          if (!tile || tile.data.byteLength === 0) return null;
          return await loadImageFromBlob(new Blob([tile.data], { type: "image/png" }));
        } catch (error: unknown) {
          // One unread tile prints without its zones; the sheet itself still
          // gets out. Warn once rather than once per tile.
          if (!warned) {
            warned = true;
            console.warn(
              "Some classified tiles failed to read; the sheet ships without those zones.",
              error,
            );
          }
          return null;
        }
      },
    };
  } catch (error: unknown) {
    console.warn("Sheet classified tiles unavailable; exporting without them.", error);
    return null;
  }
}

interface ComposeResult {
  canvas: HTMLCanvasElement;
  totalTiles: number;
  missingTiles: number;
  tileZoom: number;
  sourceMpp: number;
  canvasMpp: number;
  groundWidthM: number;
  groundHeightM: number;
  north: number;
  south: number;
  west: number;
  east: number;
  upscale: number;
  center: { latitude: number; longitude: number };
  mapRef: LeafletMap;
  originRef: ProjectedPoint;
}

interface ComposeInput {
  map: LeafletMap;
  mapWPx: number;
  mapHPx: number;
  tileUrlTemplate?: string;
  maxNativeZoom: number;
  overlays: RasterOverlaySpec[];
  /** Classified zone tiles drawn over the basemap, like the live raster layer. */
  tilesLayer?: SheetTilesLayer | null;
  /** Ground the sheet must cover. When absent, the map's current view is used. */
  extent?: { south: number; west: number; north: number; east: number };
}

async function composeImagery(input: ComposeInput): Promise<ComposeResult> {
  const { map, mapWPx, mapHPx, maxNativeZoom } = input;

  const viewZoom = map.getZoom();
  const extent = input.extent;
  const centerLat = extent
    ? (extent.north + extent.south) / 2
    : map.getCenter().lat;
  const centerLng = extent ? (extent.west + extent.east) / 2 : map.getCenter().lng;
  const north = extent ? extent.north : map.getBounds().getNorth();
  const south = extent ? extent.south : map.getBounds().getSouth();
  const west = extent ? extent.west : map.getBounds().getWest();
  const east = extent ? extent.east : map.getBounds().getEast();

  const nwView = map.project([north, west], viewZoom);
  const seView = map.project([south, east], viewZoom);
  const viewGroundWidthM = Math.max(
    1,
    (seView.x - nwView.x) * metersPerPixel(centerLat, viewZoom),
  );
  const neededMpp = viewGroundWidthM / mapWPx;

  const tileZoom = chooseTileZoom(centerLat, neededMpp, maxNativeZoom);
  const sourceMpp = metersPerPixel(centerLat, tileZoom);

  const worldPx = TILE_SIZE * 2 ** tileZoom;
  const aspect = mapWPx / mapHPx;
  const expanded = expandBoundsToAspect(
    map.project([north, west], tileZoom),
    map.project([south, east], tileZoom),
    aspect,
    worldPx,
  );

  const origin = expanded.topLeft;
  const projW = expanded.bottomRight.x - origin.x;
  const projH = expanded.bottomRight.y - origin.y;
  // Above 1 means the source imagery is coarser than the sheet and is being
  // interpolated; the sheet reports this instead of hiding it.
  const scale = mapWPx / projW;
  const canvasMpp = (projW * sourceMpp) / mapWPx;
  const groundWidthM = projW * sourceMpp;
  const groundHeightM = projH * sourceMpp;

  const nwLatLng = map.unproject([origin.x, origin.y], tileZoom);
  const seLatLng = map.unproject(
    [expanded.bottomRight.x, expanded.bottomRight.y],
    tileZoom,
  );

  const canvas = document.createElement("canvas");
  canvas.width = mapWPx;
  canvas.height = mapHPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create the map render canvas.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#0a0e14";
  ctx.fillRect(0, 0, mapWPx, mapHPx);

  const tileMinX = Math.max(0, Math.floor(origin.x / TILE_SIZE));
  const tileMaxX = Math.min(
    2 ** tileZoom - 1,
    Math.floor((origin.x + projW) / TILE_SIZE),
  );
  const tileMinY = Math.max(0, Math.floor(origin.y / TILE_SIZE));
  const tileMaxY = Math.min(
    2 ** tileZoom - 1,
    Math.floor((origin.y + projH) / TILE_SIZE),
  );

  const tiles: { x: number; y: number }[] = [];
  for (let ty = tileMinY; ty <= tileMaxY; ty += 1) {
    for (let tx = tileMinX; tx <= tileMaxX; tx += 1) {
      tiles.push({ x: tx, y: ty });
    }
  }
  if (!input.tileUrlTemplate) {
    throw new Error("No basemap tile source is configured for the map sheet.");
  }
  if (tiles.length > MAX_TILES) {
    throw new Error(
      `The current view needs ${tiles.length} map tiles, which is too many for one ` +
        "sheet. Zoom in a little, then export again.",
    );
  }

  const template = input.tileUrlTemplate;
  let missingTiles = 0;

  await mapInChunks(tiles, TILE_FETCH_CONCURRENCY, async (tile) => {
    // Direct tile first; on failure (including blank provider placeholders)
    // walk up to parent tiles and crop the quadrant, so one failed request
    // never leaves a hole in the sheet.
    const drawable = await loadTileImage(
      tileUrlFor(template, tile.x, tile.y, tileZoom),
    );
    if (drawable && !(await isBlankTile(drawable))) {
      drawTile(ctx, drawable, tile.x, tile.y, origin, scale, mapWPx, mapHPx);
      return;
    }
    let drew = false;
    for (let p = 1; p <= 3 && tileZoom - p >= 0; p += 1) {
      const q = 2 ** p;
      const parent = await loadTileImage(
        tileUrlFor(template, tile.x >> p, tile.y >> p, tileZoom - p),
      );
      if (!parent || (await isBlankTile(parent))) continue;
      const qx = tile.x & (q - 1);
      const qy = tile.y & (q - 1);
      const srcSize = TILE_SIZE / q;
      ctx.drawImage(
        parent,
        qx * srcSize,
        qy * srcSize,
        srcSize,
        srcSize,
        (tile.x * TILE_SIZE - origin.x) * scale - 0.5,
        (tile.y * TILE_SIZE - origin.y) * scale - 0.5,
        TILE_SIZE * scale + 1,
        TILE_SIZE * scale + 1,
      );
      drew = true;
      break;
    }
    if (!drew) {
      missingTiles += 1;
      ctx.fillStyle = "#131a24";
      ctx.fillRect(
        (tile.x * TILE_SIZE - origin.x) * scale,
        (tile.y * TILE_SIZE - origin.y) * scale,
        TILE_SIZE * scale + 1,
        TILE_SIZE * scale + 1,
      );
    }
  });

  if (tiles.length > 0 && missingTiles === tiles.length) {
    throw new Error(
      "No imagery could be loaded for the sheet. Check the connection and try again.",
    );
  }

  // Classified zone tiles over the basemap: the same archive the live raster
  // layer paints, over-zoomed the same way, at the layer's own opacity. Below
  // the archive's floor the live layer paints nothing either, so the sheet
  // stays honest about that instead of improvising a drape.
  // Tile rects are concatted, not overlapped: unlike the basemap's opaque
  // half-pixel trick, a blend-mode overlap would print a doubled seam under a
  // translucent raster.
  if (input.tilesLayer && tileZoom >= input.tilesLayer.minZoom) {
    const layer = input.tilesLayer;
    const nativeZoom = Math.min(tileZoom, layer.maxNativeZoom);
    await mapInChunks(tiles, TILE_FETCH_CONCURRENCY, async (tile) => {
      const x0 = Math.round((tile.x * TILE_SIZE - origin.x) * scale);
      const y0 = Math.round((tile.y * TILE_SIZE - origin.y) * scale);
      const x1 = Math.round(((tile.x + 1) * TILE_SIZE - origin.x) * scale);
      const y1 = Math.round(((tile.y + 1) * TILE_SIZE - origin.y) * scale);
      if (x1 <= 0 || y1 <= 0 || x0 >= mapWPx || y0 >= mapHPx) return;
      const { shift, qx, qy } = overzoomQuadrant(tileZoom, tile.x, tile.y, nativeZoom);
      const srcSize = TILE_SIZE >> shift;
      const parent = await layer.getTile(nativeZoom, tile.x >> shift, tile.y >> shift);
      if (!parent) return;
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      ctx.drawImage(parent, qx * srcSize, qy * srcSize, srcSize, srcSize, x0, y0, x1 - x0, y1 - y0);
      ctx.restore();
    });
  }

  // Classified raster overlays from the live map, projected into the sheet.
  for (const overlay of input.overlays) {
    const drawable = await loadImageSmart(overlay.src);
    if (!drawable) continue;
    const nwP = projectToCanvas(map, overlay.north, overlay.west, tileZoom, origin, scale);
    const seP = projectToCanvas(map, overlay.south, overlay.east, tileZoom, origin, scale);
    const w = seP.x - nwP.x;
    const h = seP.y - nwP.y;
    if (w <= 0 || h <= 0) continue;
    if (nwP.x >= mapWPx || nwP.y >= mapHPx || seP.x <= 0 || seP.y <= 0) continue;
    ctx.save();
    ctx.globalAlpha = overlay.opacity;
    ctx.drawImage(drawable, nwP.x, nwP.y, w, h);
    ctx.restore();
  }

  return {
    canvas,
    totalTiles: tiles.length,
    missingTiles,
    tileZoom,
    sourceMpp,
    canvasMpp,
    groundWidthM,
    groundHeightM,
    north: nwLatLng.lat,
    south: seLatLng.lat,
    west: nwLatLng.lng,
    east: seLatLng.lng,
    upscale: scale,
    center: { latitude: centerLat, longitude: centerLng },
    mapRef: map,
    originRef: origin,
  };
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  drawable: Drawable,
  tx: number,
  ty: number,
  origin: ProjectedPoint,
  scale: number,
  mapWPx: number,
  mapHPx: number,
): void {
  const dx = (tx * TILE_SIZE - origin.x) * scale;
  const dy = (ty * TILE_SIZE - origin.y) * scale;
  const dw = TILE_SIZE * scale;
  if (dx >= mapWPx || dy >= mapHPx || dx + dw <= 0 || dy + dw <= 0) return;
  // Half-pixel overlap so antialiasing cannot open seams between tiles.
  ctx.drawImage(drawable, dx - 0.5, dy - 0.5, dw + 1, dw + 1);
}

function projectToCanvas(
  map: LeafletMap,
  lat: number,
  lng: number,
  tileZoom: number,
  origin: ProjectedPoint,
  scale: number,
): ProjectedPoint {
  const p = map.project([lat, lng], tileZoom);
  return { x: (p.x - origin.x) * scale, y: (p.y - origin.y) * scale };
}

// ---------------------------------------------------------------------------
// PDF sheet
// ---------------------------------------------------------------------------

const INK = rgb(0.09, 0.12, 0.17);
const INK_SOFT = rgb(0.42, 0.47, 0.54);
const PAPER = rgb(0.976, 0.98, 0.988);
const PAPER_LINE = rgb(0.78, 0.81, 0.85);
const ACCENT = rgb(0.82, 0.25, 0.25);
const CHIP_BG = rgb(0.04, 0.055, 0.08);
// Grid strokes: a dark halo under a white line so the grid reads on any cover.
const GRID_STROKES = [
  { thickness: 1.6, color: rgb(0.04, 0.06, 0.09), opacity: 0.55 },
  { thickness: 0.8, color: rgb(1, 1, 1), opacity: 0.95 },
] as const;

function yFlip(yTop: number): number {
  return SHEET.heightPt - yTop;
}

/** Standard fonts cannot encode characters outside WinAnsi; drop the rest. */
function safeText(value: string): string {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7E\u00B0\u2022\u2122\u00B7]/g, "");
}

export interface SheetCtx {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
}

function drawTextLine(
  ctx: SheetCtx,
  text: string,
  x: number,
  yTop: number,
  size: number,
  options: { font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
): number {
  const font = options.font ?? ctx.font;
  const clean = safeText(text);
  ctx.page.drawText(clean, {
    x,
    y: yFlip(yTop + size * 0.78),
    size,
    font,
    color: options.color ?? INK,
  });
  return font.widthOfTextAtSize(clean, size);
}

/** A line whose right edge, not its left, sits on the given x. */
function drawTextRight(
  ctx: SheetCtx,
  text: string,
  rightX: number,
  yTop: number,
  size: number,
  options: { font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
): void {
  const font = options.font ?? ctx.font;
  const width = font.widthOfTextAtSize(safeText(text), size);
  drawTextLine(ctx, text, rightX - width, yTop, size, options);
}

/** One line that never overflows: shrink with an ellipsis when it would. */
function fitText(
  ctx: SheetCtx,
  text: string,
  size: number,
  maxWidth: number,
  font: PDFFont = ctx.font,
): string {
  const clean = safeText(text);
  if (font.widthOfTextAtSize(clean, size) <= maxWidth) return clean;
  let out = clean;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}...`;
}

/**
 * One line that never overflows, and is never cut.
 *
 * A truncated mineral name reads as a different mineral, so a cell that is too wide
 * loses size instead of letters. Below the floor it gives up and truncates.
 */
function shrinkText(
  ctx: SheetCtx,
  text: string,
  size: number,
  maxWidth: number,
  font: PDFFont = ctx.font,
  floor = 5.4,
): string {
  const clean = safeText(text);
  if (font.widthOfTextAtSize(clean, size) <= maxWidth) return clean;
  let fitted = size;
  while (fitted > floor && font.widthOfTextAtSize(clean, fitted) > maxWidth) {
    fitted -= 0.2;
  }
  if (font.widthOfTextAtSize(clean, fitted) <= maxWidth) return clean;
  return fitText(ctx, text, floor, maxWidth, font);
}

/**
 * A title-block value that must not be cut short.
 *
 * A survey sheet that says "Gold · Lithium · Rare earth…" is more useful than one that
 * says "Gold · Lithium · Rare…", so a long value wraps onto a second line instead of
 * being truncated. Only a value too long for every line is shortened, and a single word
 * too wide to fit is shrunk rather than allowed to run past the panel.
 */
function wrapValue(
  ctx: SheetCtx,
  text: string,
  size: number,
  maxWidth: number,
  font: PDFFont,
  maxLines = 2,
): string[] {
  const lines = wrapText(ctx, text, size, maxWidth, font, maxLines);
  return lines.map((line) =>
    font.widthOfTextAtSize(line, size) > maxWidth
      ? fitText(ctx, line, size, maxWidth, font)
      : line,
  );
}

function wrapText(
  ctx: SheetCtx,
  text: string,
  size: number,
  maxWidth: number,
  font: PDFFont,
  maxLines = 3,
): string[] {
  const words = safeText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.length) {
    const consumed = lines.join(" ").split(/\s+/).length;
    if (consumed < words.length) {
      let last = lines[maxLines - 1];
      while (
        font.widthOfTextAtSize(`${last}...`, size) > maxWidth &&
        last.length > 1
      ) {
        last = last.slice(0, -1);
      }
      lines[maxLines - 1] = `${last}...`;
    }
  }
  return lines;
}

export interface PanelData {
  includeHeader: boolean;
  title: string;
  client: string;
  categoryName: string;
  coords: string;
  coverageText: string;
  gridText: string;
  opticalSource: string;
  imageryText: string;
  scaleText: string;
  scaleRatioText: string;
  sheetNo: string;
  generatedText: string;
  waterTableText: string;
  fieldTargetText: string;
  summaryRows: SheetSummaryRow[];
  table: SheetTable | null;
  includeLegend: boolean;
  legendTitle: string;
  legendItems: SheetLegendItem[];
  candidates: MapExportOptions["candidates"];
  /** True when the map sheet already printed the schedule of stations. */
  scheduleOnPanel: boolean;
  /** True when the map sheet already printed the classification key. */
  keyOnPanel: boolean;
  includeScaleBar: boolean;
  scaleBarMeters: number;
  scaleBarWidthPt: number;
  includeNorthArrow: boolean;
  footerText: string;
  logo: PDFImage | null;
}

function drawPanelDivider(ctx: SheetCtx, innerX: number, innerW: number, y: number): void {
  ctx.page.drawLine({
    start: { x: innerX, y: yFlip(y) },
    end: { x: innerX + innerW, y: yFlip(y) },
    thickness: 0.5,
    color: PAPER_LINE,
  });
}

function hexToPdfRgb(hex: string): ReturnType<typeof rgb> | null {
  const clean = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) return null;
  const value = Number.parseInt(clean, 16);
  return rgb(
    ((value >> 16) & 0xff) / 255,
    ((value >> 8) & 0xff) / 255,
    (value & 0xff) / 255,
  );
}

/** The swatch a legend entry carries, shaped like what the map actually draws. */
function drawLegendSwatch(
  ctx: SheetCtx,
  item: SheetLegendItem,
  x: number,
  y: number,
  scale = 1,
): void {
  const { page } = ctx;
  const kind = item.kind ?? "zone";

  if (kind === "aoi") {
    page.drawRectangle({
      x: x + 0.5 * scale,
      y: yFlip(y + 5.8 * scale),
      width: 6 * scale,
      height: 4.4 * scale,
      borderColor: ACCENT,
      borderWidth: 0.8,
      borderDashArray: [2.4, 1.8],
    });
    return;
  }

  if (kind === "target") {
    const cx = x + 3.4 * scale;
    const cy = y + 3.2 * scale;
    page.drawCircle({
      x: cx,
      y: yFlip(cy),
      size: 1.5 * scale,
      color: ACCENT,
      borderColor: rgb(1, 1, 1),
      borderWidth: 0.5,
    });
    const arms: [number, number, number, number][] = [
      [-4.4, 0, -2, 0],
      [2, 0, 4.4, 0],
      [0, -4.4, 0, -2],
      [0, 2, 0, 4.4],
    ];
    for (const [dx0, dy0, dx1, dy1] of arms) {
      page.drawLine({
        start: { x: cx + dx0 * scale, y: yFlip(cy + dy0 * scale) },
        end: { x: cx + dx1 * scale, y: yFlip(cy + dy1 * scale) },
        thickness: 0.7,
        color: ACCENT,
      });
    }
    return;
  }

  if (kind === "imagery") {
    page.drawRectangle({
      x,
      y: yFlip(y + 6.4 * scale),
      width: 6.8 * scale,
      height: 6.8 * scale,
      color: rgb(0.16, 0.2, 0.26),
      borderColor: rgb(0.15, 0.18, 0.22),
      borderWidth: 0.4,
    });
    return;
  }

  const color = item.color ? hexToPdfRgb(item.color) : null;
  if (color) {
    page.drawCircle({
      x: x + 3.4 * scale,
      y: yFlip(y + 3.2 * scale),
      size: 2.9 * scale,
      color,
      borderColor: rgb(0.15, 0.18, 0.22),
      borderWidth: 0.4,
    });
  }
}

const LEGEND_TITLE_H = 13;
const LEGEND_ROW_H = 12;
/** How far the key's rows spread when the panel has room to spare. */
const LEGEND_ROW_MAX = 17;
/** The tightest the key's rows may get before the key moves to the sheet behind. */
const LEGEND_ROW_FLOOR = 10;
/** Height the scale bar and north needle take together, side by side. */
const FURNITURE_BLOCK_H = 46;
const TABLE_TITLE_H = 12;
const TABLE_HEAD_H = 9;
const TABLE_ROW_H = 11;
const TABLE_CELL_SIZE = 7.4;
const TABLE_CELL_FLOOR = 5.2;
/** Room the key symbol takes beside a row's name. */
const TABLE_SWATCH_W = 10;
/** How many stations the schedule prints before it counts the rest. */
const SCHEDULE_MAX_ROWS = 12;
/** Height of the line that points at the key on the next sheet. */
const POINTER_H = 15;
/** Rule and gap a table leaves under itself before the next block starts. */
const TABLE_GAP_H = 12;
/** Gap between two blocks of the title block. */
const BLOCK_GAP_H = 8;
/** Height of the heading above the list of stations. */
const STATION_LIST_TITLE_H = 12;
/** Height of one station in the list. */
const STATION_LIST_ROW_H = 9.5;
/** The tightest a station row may get before the stations move to the sheet behind. */
const STATION_LIST_ROW_FLOOR = 8.5;
/** Room left between the last block of the title block and the scale bar. */
const CONTENT_GAP = 6;
/** Gap and rule that close the key before the next block starts. */
const KEY_TAIL_H = 12;
/** Height of a heading on the sheet behind the map. */
const SHEET2_TITLE_H = 18;
/** Pitch of one entry of the key on the sheet behind the map. */
const SHEET2_KEY_ROW_H = 15;
/** The most the key's rows may spread on the sheet behind the map. */
const SHEET2_KEY_ROW_MAX = 22;
/** Pitch of one label and value row on the sheet behind the map. */
const SHEET2_ROW_PITCH = 13;
/** The most the label and value rows may spread on the sheet behind the map. */
const SHEET2_ROW_PITCH_MAX = 18;
/** Gap between two bands on the sheet behind the map. */
const SHEET2_BAND_GAP = 14;
/** Size the schedule of stations prints at on the sheet behind the map. */
const SHEET2_TARGET_SCALE = 1.4;
/** The most the schedule of stations may grow on the sheet behind the map. */
const SHEET2_TARGET_SCALE_MAX = 2;

/**
 * The survey's domain as the sheet names it.
 *
 * The platform spells the domain one way in the queue and another in the result, so
 * the sheet takes whichever name it is given and prints it in words: a reader must
 * not meet an underscore on a printed sheet.
 */
export const DOMAIN_LABELS: Record<string, string> = {
  water: "WATER",
  minerals: "MINERAL PROSPECTIVITY",
  prospectivity: "MINERAL PROSPECTIVITY",
  "mineral prospectivity": "MINERAL PROSPECTIVITY",
  "mineral exploration": "MINERAL PROSPECTIVITY",
  soil: "SOIL & LAND",
  soil_land: "SOIL & LAND",
  hazard: "HAZARD",
  hazard_safety: "HAZARD & SAFETY",
};

export function domainLabel(name: string | undefined): string {
  if (!name) return "EARTH OBSERVATION";
  const clean = name.trim();
  return DOMAIN_LABELS[clean.toLowerCase()] ?? clean.replace(/_/g, " ").toUpperCase();
}

/**
 * Normalizes title block headings to professional domain nomenclature.
 * Prevents standalone or prefixed "MINERALS" from appearing as the domain name on exported sheets.
 */
export function normalizePdfTitle(title: string | undefined): string {
  if (!title) return "MINERAL PROSPECTIVITY — SITE AREA";
  let clean = title.trim();
  if (/^minerals\b/i.test(clean)) {
    clean = clean.replace(/^minerals\b/i, "MINERAL PROSPECTIVITY");
  }
  return clean;
}

/**
 * A table of the survey's own figures, drawn in the title block.
 *
 * Numbers line up in columns so a reader can compare them down the page; the system
 * that owns the most ground is printed in the strong ink and the rest in the soft ink.
 * The scale lets the same table print small in the title block and large on the sheet
 * behind it.
 */
function drawSheetTable(
  ctx: SheetCtx,
  table: SheetTable,
  innerX: number,
  innerW: number,
  y: number,
  scale = 1,
): number {
  drawTextLine(ctx, table.title.toUpperCase(), innerX, y, 6.6 * scale, { font: ctx.bold });
  y += TABLE_TITLE_H * scale;

  // The key symbol takes a column of its own, so every name starts on the same line
  // and a reader can match a row to the colour on the map without the key beside it.
  const gutter = table.swatches?.some((color) => Boolean(color)) ? TABLE_SWATCH_W * scale : 0;
  const declared = table.columns.reduce((sum, column) => sum + column.width, 0);
  const fit = declared > 0 ? Math.min(1, (innerW - gutter) / declared) : 1;
  const widths = table.columns.map((column) => column.width * fit);
  const textX = innerX + gutter;

  // One size for the whole table: a column whose type shrinks row by row reads as a
  // mistake, so the longest name sets the size for every row.
  const size = fittedTableSize(ctx, table, widths, scale);

  let x = textX;
  table.columns.forEach((column, index) => {
    if (column.align === "right") {
      drawTextRight(ctx, column.label, x + widths[index], y, 5.4 * scale, { color: INK_SOFT });
    } else {
      drawTextLine(ctx, column.label, x, y, 5.4 * scale, { color: INK_SOFT });
    }
    x += widths[index];
  });
  y += TABLE_HEAD_H * scale;
  drawPanelDivider(ctx, innerX, innerW, y);
  y += 5 * scale;

  table.rows.forEach((row, rowIndex) => {
    const strong = table.emphasis?.[rowIndex] ?? true;
    const ink = strong ? INK : INK_SOFT;
    const swatch = table.swatches?.[rowIndex];
    if (swatch) {
      const color = hexToPdfRgb(swatch);
      if (color) {
        ctx.page.drawCircle({
          x: innerX + 2.6 * scale,
          y: yFlip(y + 3.4 * scale),
          size: 2.2 * scale,
          color,
          borderColor: rgb(0.15, 0.18, 0.22),
          borderWidth: 0.3,
        });
      }
    }
    let cellX = textX;
    row.forEach((cell, columnIndex) => {
      const column = table.columns[columnIndex];
      if (!column) return;
      const width = widths[columnIndex];
      const text = shrinkText(ctx, cell, size, width, ctx.bold);
      if (column.align === "right") {
        drawTextRight(ctx, text, cellX + width, y, size, {
          font: ctx.bold,
          color: ink,
        });
      } else {
        drawTextLine(ctx, text, cellX, y, size, { font: ctx.bold, color: ink });
      }
      cellX += width;
    });
    y += TABLE_ROW_H * scale;
  });

  return y;
}

/** The largest size at which every cell of the table still fits its column. */
function fittedTableSize(
  ctx: SheetCtx,
  table: SheetTable,
  widths: number[],
  scale = 1,
): number {
  let size = TABLE_CELL_SIZE * scale;
  while (size > TABLE_CELL_FLOOR) {
    const fits = table.rows.every((row) =>
      row.every((cell, index) => {
        const width = widths[index];
        if (width === undefined) return true;
        return ctx.bold.widthOfTextAtSize(safeText(cell), size) <= width;
      }),
    );
    if (fits) return size;
    size -= 0.2;
  }
  return TABLE_CELL_FLOOR;
}

/**
 * One title-block row: a small label on the left and the value aligned straight in a column.
 *
 * Each row is laid out on a consistent column rhythm with vertical spacing between rows:
 * label starts at innerX, value starts at a straight vertical alignment (innerX + labelColW + gap),
 * followed by a clean row gap before the next row.
 */
function drawValueRow(
  ctx: SheetCtx,
  label: string,
  value: string,
  innerX: number,
  innerW: number,
  y: number,
  size: number,
  maxLines = 2,
  labelSize = 5.8,
  labelColW = 68,
): number {
  const valueX = innerX + labelColW + 5;
  const valueW = Math.max(40, innerW - labelColW - 5);
  const lines = wrapValue(ctx, value, size, valueW, ctx.bold, maxLines);
  drawTextLine(ctx, label, innerX, y, labelSize, { color: INK_SOFT });
  const baselineShift = (labelSize - size) * 0.78;
  const linePitch = size + 1.2;
  lines.forEach((line, index) => {
    drawTextLine(ctx, line, valueX, y + baselineShift + index * linePitch, size, {
      font: ctx.bold,
    });
  });
  return y + Math.max(11.2, (lines.length - 1) * linePitch + 11.2);
}

/**
 * A block of label and value rows set on one rhythm.
 *
 * The sheet's rows share a pitch so the columns read as a grid; a value that needs
 * two lines takes the room it needs and pushes nothing below it out of place.
 */
function drawPacedRows(
  ctx: SheetCtx,
  rows: SheetSummaryRow[],
  x: number,
  w: number,
  y: number,
  pitch: number,
  size: number,
  labelSize = 6.6,
): number {
  for (const row of rows) {
    const before = y;
    y = drawValueRow(ctx, row.label, row.value, x, w, y, size, 3, labelSize, 76);
    y += Math.max(0, pitch - (y - before));
  }
  return y;
}

function drawPanel(
  ctx: SheetCtx,
  rect: SheetMapRect,
  data: PanelData,
): { legendDrawn: boolean; schedulePrinted: boolean } {
  const { page } = ctx;
  const px = rect.x;
  const pw = rect.w;
  const ph = rect.h;
  const innerX = px + 14;
  const innerW = pw - 28;

  const footerLines = wrapText(ctx, data.footerText, 5.6, innerW, ctx.font, 4);
  const footerTop = rect.y + ph - 12 - (footerLines.length - 1) * 7.5;
  // Nothing may print below the footer, and the last rule needs a gap above it.
  const bottomLimit = footerTop - 12;
  // The scale bar and north needle hold the foot of the panel.
  const furnitureTop = bottomLimit - FURNITURE_BLOCK_H;

  page.drawRectangle({
    x: px,
    y: yFlip(rect.y + ph),
    width: pw,
    height: ph,
    color: PAPER,
    borderColor: PAPER_LINE,
    borderWidth: 0.8,
  });

  let y = rect.y + 18;

  // The brand bar stands beside the wordmark, not above the frame it belongs to.
  page.drawRectangle({
    x: px + 0.8,
    y: yFlip(y + 18),
    width: 2.6,
    height: 25,
    color: ACCENT,
  });
  let brandX = innerX;
  if (data.logo) {
    const logoH = 20;
    const logoW = (logoH * data.logo.width) / data.logo.height;
    page.drawImage(data.logo, {
      x: innerX,
      y: yFlip(y + logoH + 1),
      width: logoW,
      height: logoH,
    });
    brandX = innerX + logoW + 7;
  }
  drawTextLine(ctx, "SITESURVEYOR™", brandX, y, 9.5, { font: ctx.bold });
  drawTextLine(ctx, "EARTH OBSERVATION MAP SHEET", brandX, y + 12.5, 5.6, {
    color: INK_SOFT,
  });
  y += 31;
  drawPanelDivider(ctx, innerX, innerW, y);
  y += 11;

  if (data.includeHeader) {
    const cleanTitle = normalizePdfTitle(data.title);
    const titleLines = wrapText(ctx, cleanTitle, 12, innerW, ctx.bold, 3);
    for (const line of titleLines) {
      drawTextLine(ctx, line, innerX, y, 12, { font: ctx.bold });
      y += 14;
    }
    y += 4;
    drawPanelDivider(ctx, innerX, innerW, y);
    y += 9;

    // The survey's own figures, stated before the reference rows.
    for (const row of data.summaryRows) {
      y = drawValueRow(ctx, row.label, row.value, innerX, innerW, y, 8.2, 3, 5.8, 68);
    }
    if (data.summaryRows.length > 0) {
      y += 3;
      drawPanelDivider(ctx, innerX, innerW, y);
      y += 9;
    }

    const metaRows = [
      { label: "CLIENT", value: data.client },
      { label: "SURVEY DOMAIN", value: domainLabel(data.categoryName) },
      { label: "WATER TABLE", value: data.waterTableText },
      { label: "FIELD TARGET", value: data.fieldTargetText },
      { label: "CENTRE", value: data.coords },
      { label: "SHEET COVERAGE", value: data.coverageText },
      { label: "GRID", value: data.gridText },
      { label: "OPTICAL SOURCE", value: data.opticalSource },
      { label: "IMAGERY", value: data.imageryText },
      { label: "PRINT SCALE", value: data.scaleText },
      { label: "SHEET NO.", value: data.sheetNo },
      { label: "GENERATED", value: data.generatedText },
    ].filter((row) => row.value);
    for (const row of metaRows) {
      y = drawValueRow(ctx, row.label, row.value, innerX, innerW, y, 7.8, 3, 5.8, 68);
    }
    y += 3;
    drawPanelDivider(ctx, innerX, innerW, y);
    y += 9;

    // The survey's own table of figures, under the reference rows.
    if (data.table && data.table.rows.length > 0) {
      const room = furnitureTop - y - POINTER_H;
      const cap = Math.floor((room - TABLE_TITLE_H - TABLE_HEAD_H - 5) / TABLE_ROW_H);
      if (cap >= 1) {
        const shown = data.table.rows.slice(0, cap);
        const hidden = data.table.rows.length - shown.length;
        const table: SheetTable = {
          ...data.table,
          rows: hidden > 0 ? [...shown, ["+ " + hidden + " more", "", ""]] : shown,
          emphasis: data.table.emphasis ? data.table.emphasis.slice(0, shown.length) : undefined,
          swatches: data.table.swatches
            ? hidden > 0
              ? [...data.table.swatches.slice(0, shown.length), null]
              : data.table.swatches.slice(0, shown.length)
            : undefined,
        };
        y = drawSheetTable(ctx, table, innerX, innerW, y);
        y += 3;
        drawPanelDivider(ctx, innerX, innerW, y);
        y += TABLE_GAP_H - 3;
      }
    }
  }

  // The key and the list of stations share what the header left of the title block.
  // Both print whole or not at all, so their rows give up height in steps until the
  // pair fits; whatever still does not fit moves to the sheet behind.
  const keyRows = data.legendItems.length;
  const stations = stationLines(data.candidates ?? []);
  const listRows = stations.length;
  const wantKey = data.includeLegend && keyRows > 0;
  const wantList = listRows > 0;
  const space = furnitureTop - y;

  let keyRowH = LEGEND_ROW_H;
  let listRowH = STATION_LIST_ROW_H;
  const keyHeight = () => LEGEND_TITLE_H + keyRows * keyRowH + KEY_TAIL_H;
  const listHeight = () => STATION_LIST_TITLE_H + listRows * listRowH;
  const pairHeight = () =>
    (wantKey ? keyHeight() : 0) +
    (wantList ? listHeight() : 0) +
    (wantKey && wantList ? BLOCK_GAP_H : 0);

  while (pairHeight() + CONTENT_GAP > space) {
    if (keyRowH <= LEGEND_ROW_FLOOR && listRowH <= STATION_LIST_ROW_FLOOR) break;
    if (listRowH > STATION_LIST_ROW_FLOOR && (keyRowH <= LEGEND_ROW_FLOOR || listRowH >= keyRowH)) {
      listRowH -= 0.5;
    } else {
      keyRowH -= 0.5;
    }
  }

  const keyFits = !wantKey || keyHeight() + CONTENT_GAP <= space;
  const listFits = !wantList || listHeight() + CONTENT_GAP <= space;
  const pairFits = pairHeight() + CONTENT_GAP <= space;
  // The key decodes the colours on the map, so it keeps the panel when the two
  // cannot both fit; the stations move to the sheet behind with the summary.
  const printKey = wantKey && (pairFits || keyFits);
  const printList = wantList && (pairFits || (!keyFits && listFits));

  let legendDrawn = false;
  let schedulePrinted = false;

  if (printKey) {
    // The rows spread into whatever the stations did not claim, so the key fills
    // the space it has instead of trailing off above the scale bar.
    const spare =
      space -
      CONTENT_GAP -
      keyHeight() -
      (pairFits ? listHeight() + BLOCK_GAP_H : 0);
    const rowH = Math.min(LEGEND_ROW_MAX, keyRowH + Math.max(0, spare) / keyRows);
    drawTextLine(ctx, data.legendTitle.toUpperCase(), innerX, y, 7, {
      font: ctx.bold,
    });
    y += LEGEND_TITLE_H;
    for (const item of data.legendItems) {
      drawLegendSwatch(ctx, item, innerX, y);
      drawTextLine(ctx, item.label, innerX + 11, y, 8, { font: ctx.bold });
      y += rowH;
    }
    y += 4;
    drawPanelDivider(ctx, innerX, innerW, y);
    y += KEY_TAIL_H - 4;
    legendDrawn = true;
  }

  if (printList) {
    // The stations the survey picked, so a crew has the list and not only the map.
    y = drawStationList(ctx, stations, innerX, innerW, y, listRowH);
    schedulePrinted = true;
  }

  if (wantKey !== legendDrawn || wantList !== schedulePrinted) {
    // The pointer names what the sheet behind carries, so a reader knows to look.
    const missing = [
      legendDrawn ? "" : "CLASSIFICATION LEGEND",
      schedulePrinted ? "" : "TARGETS",
    ]
      .filter(Boolean)
      .join(" & ");
    const pointerY = Math.min(y, furnitureTop - POINTER_H);
    drawTextLine(ctx, `${missing} — SHEET 2`, innerX, pointerY, 6.5, { color: INK_SOFT });
    y = pointerY + POINTER_H;
  }

  if (data.includeScaleBar || data.includeNorthArrow) {
    // The furniture sits at the foot of the title block, so the panel reads as one
    // block from the brand mark down to the scale bar rather than trailing off.
    // Anchored at furnitureTop so scale bar and north needle are unconditionally drawn on the map sheet.
    const furnitureY = furnitureTop;
    drawPanelDivider(ctx, innerX, innerW, furnitureY - 6);
    if (data.includeScaleBar) {
      drawTextLine(ctx, "SCALE BAR", innerX, furnitureY, 7, { font: ctx.bold });
      const barY = furnitureY + 10;
      const barH = drawScaleBarCore(ctx, innerX, barY, {
        meters: data.scaleBarMeters,
        widthPt: data.scaleBarWidthPt,
      });
      drawTextLine(ctx, data.scaleRatioText, innerX, barY + barH - 2, 5.8, {
        color: INK_SOFT,
      });
    }
    if (data.includeNorthArrow) {
      // The needle sits at the panel's right edge with its letter clear of the frame.
      drawNorthNeedle(ctx, innerX + innerW - 32, furnitureY + 16, false);
      drawTextLine(ctx, "GRID NORTH", innerX + innerW - 32, furnitureY + 36, 5, {
        color: INK_SOFT,
      });
    }
    drawPanelDivider(ctx, innerX, innerW, furnitureY + FURNITURE_BLOCK_H);
  }

  let footerY = footerTop;
  for (const line of footerLines) {
    drawTextLine(ctx, line, innerX, footerY, 5.6, { color: INK_SOFT });
    footerY += 7.5;
  }

  return { legendDrawn, schedulePrinted };
}

/**
 * The sheet behind the map.
 *
 * A mineral survey carries a sixteen-entry classification key, and beside a map it
 * would shrink the type past legibility or push the scale bar off the page. Rather
 * than cut the key short, the sheet that cannot hold it prints it here, with the
 * survey's own figures, its provenance and the schedule of stations, so the pair
 * stands on its own.
 *
 * The page is laid out in bands — the key across the top, the figures and the
 * schedule of stations side by side, the provenance across the foot — and the rows
 * spread into whatever room is left, so the sheet reads as a composed page instead
 * of a list with a blank half under it.
 */
function drawLegendSheet(
  pdf: PDFDocument,
  ctx: SheetCtx,
  data: PanelData,
): void {
  const page = pdf.addPage([SHEET.widthPt, SHEET.heightPt]);
  const sheet: SheetCtx = { ...ctx, page };
  const margin = 18;
  const leftX = margin;
  const contentW = SHEET.widthPt - margin * 2;
  const columnGap = 20;
  const columnW = (contentW - columnGap) / 2;
  const rightX = leftX + columnW + columnGap;
  const keyOnPanel = data.keyOnPanel;
  const schedule = data.scheduleOnPanel ? null : targetSchedule(data.candidates ?? []);

  page.drawRectangle({
    x: margin - 6,
    y: yFlip(SHEET.heightPt - margin + 6),
    width: SHEET.widthPt - (margin - 6) * 2,
    height: SHEET.heightPt - (margin - 6) * 2,
    borderColor: PAPER_LINE,
    borderWidth: 0.8,
  });

  let y = margin + 6;
  page.drawRectangle({
    x: leftX - 6,
    y: yFlip(y + 18),
    width: 2.6,
    height: 25,
    color: ACCENT,
  });
  let brandX = leftX;
  if (data.logo) {
    const logoH = 20;
    const logoW = (logoH * data.logo.width) / data.logo.height;
    page.drawImage(data.logo, {
      x: leftX,
      y: yFlip(y + logoH + 1),
      width: logoW,
      height: logoH,
    });
    brandX = leftX + logoW + 7;
  }
  drawTextLine(sheet, "SITESURVEYOR™", brandX, y, 9.5, { font: ctx.bold });
  drawTextLine(
    sheet,
    keyOnPanel
      ? "RECOMMENDED TARGETS & SURVEY RECORD"
      : "CLASSIFICATION LEGEND & SURVEY RECORD",
    brandX,
    y + 12.5,
    5.6,
    { color: INK_SOFT },
  );
  drawTextRight(sheet, `SHEET NO. ${data.sheetNo}`, SHEET.widthPt - margin, y, 7, {
    font: ctx.bold,
  });
  drawTextRight(sheet, data.generatedText, SHEET.widthPt - margin, y + 11, 6.5, {
    color: INK_SOFT,
  });

  y += 34;
  const cleanTitle = normalizePdfTitle(data.title);
  const titleLines = wrapText(sheet, cleanTitle, 16, SHEET.widthPt - margin * 2, ctx.bold, 2);
  for (const line of titleLines) {
    drawTextLine(sheet, line, leftX, y, 16, { font: ctx.bold });
    y += 19;
  }
  const client = data.client ? ` · ${data.client}` : "";
  drawTextLine(sheet, `${domainLabel(data.categoryName)}${client}`, leftX, y + 1, 9.5, {
    color: INK_SOFT,
  });
  y += 14;
  sheet.page.drawLine({
    start: { x: leftX, y: yFlip(y) },
    end: { x: SHEET.widthPt - margin, y: yFlip(y) },
    thickness: 0.9,
    color: INK,
  });
  y += 18;

  const bodyTop = y;
  const bodyBottom = SHEET.heightPt - margin - 18;

  // What the sheet carries.
  const keyItems = keyOnPanel ? [] : data.legendItems;
  const summary: SheetSummaryRow[] = [...data.summaryRows];
  if (data.waterTableText) {
    summary.push({ label: "WATER TABLE", value: data.waterTableText });
  }
  if (data.fieldTargetText) {
    summary.push({ label: "FIELD TARGET", value: data.fieldTargetText });
  }
  const reference: SheetSummaryRow[] = [
    { label: "CLIENT", value: data.client },
    { label: "SURVEY DOMAIN", value: domainLabel(data.categoryName) },
    { label: "CENTRE", value: data.coords },
    { label: "SHEET COVERAGE", value: data.coverageText },
    { label: "GRID", value: data.gridText },
    { label: "OPTICAL SOURCE", value: data.opticalSource },
    { label: "IMAGERY", value: data.imageryText },
    { label: "PRINT SCALE", value: data.scaleText },
    { label: "SHEET NO.", value: data.sheetNo },
    { label: "GENERATED", value: data.generatedText },
  ].filter((row) => row.value);

  // A long key reads across the page in two columns, so the mineral names have room
  // and the sheet keeps its proportions.
  const keyColumns = keyItems.length > 10 ? 2 : 1;
  const keyPerColumn = Math.ceil(keyItems.length / keyColumns);
  let keyRowH = SHEET2_KEY_ROW_H;
  let rowPitch = SHEET2_ROW_PITCH;
  let targetScale = SHEET2_TARGET_SCALE;

  const keyHeight = () =>
    keyItems.length > 0 ? SHEET2_TITLE_H + keyPerColumn * keyRowH : 0;
  const summaryHeight = () =>
    summary.length > 0 ? SHEET2_TITLE_H + summary.length * rowPitch : 0;
  const referenceHeight = () =>
    reference.length > 0 ? SHEET2_TITLE_H + reference.length * rowPitch : 0;
  const middleHeight = () =>
    schedule
      ? Math.max(summaryHeight(), sheetTableHeight(schedule, targetScale))
      : Math.max(summaryHeight(), referenceHeight());
  const footHeight = () =>
    schedule && reference.length > 0
      ? SHEET2_TITLE_H + Math.ceil(reference.length / 2) * rowPitch
      : 0;

  const hasFoot = schedule !== null && reference.length > 0;
  const bands =
    (keyItems.length > 0 ? 1 : 0) + (middleHeight() > 0 ? 1 : 0) + (hasFoot ? 1 : 0);
  const bandGaps = Math.max(0, bands - 1);
  let slack =
    bodyBottom -
    bodyTop -
    (keyHeight() + middleHeight() + footHeight() + bandGaps * SHEET2_BAND_GAP);

  // The rows spread into what is left, nearest to their natural rhythm first.
  if (keyItems.length > 0 && slack > 0) {
    const extra = Math.min(slack, keyPerColumn * (SHEET2_KEY_ROW_MAX - keyRowH));
    keyRowH += extra / keyPerColumn;
    slack -= extra;
  }
  const pacedRows = summary.length + (schedule ? 0 : reference.length);
  if (slack > 0 && pacedRows > 0) {
    const extra = Math.min(slack, pacedRows * (SHEET2_ROW_PITCH_MAX - rowPitch));
    rowPitch += extra / pacedRows;
    slack -= extra;
  }
  if (slack > 0 && schedule) {
    const grow = Math.min(
      slack / Math.max(1, sheetTableHeight(schedule, targetScale)),
      SHEET2_TARGET_SCALE_MAX - targetScale,
    );
    targetScale += grow;
    slack -= grow * sheetTableHeight(schedule, targetScale);
  }

  let by = bodyTop;

  // The key, across the top of the sheet.
  if (keyItems.length > 0) {
    drawTextLine(sheet, data.legendTitle.toUpperCase(), leftX, by, 9.5, { font: ctx.bold });
    by += SHEET2_TITLE_H;
    const keyColumnW = (contentW - (keyColumns - 1) * columnGap) / keyColumns;
    const split = Math.ceil(keyItems.length / keyColumns);
    for (let column = 0; column < keyColumns; column += 1) {
      const x = leftX + column * (keyColumnW + columnGap);
      let ly = by;
      for (const item of keyItems.slice(column * split, (column + 1) * split)) {
        drawLegendSwatch(sheet, item, x, ly, 1.4);
        drawTextLine(sheet, item.label, x + 16, ly, 10.5, { font: ctx.bold });
        ly += keyRowH;
      }
    }
    by += keyPerColumn * keyRowH;
    by += SHEET2_BAND_GAP;
  }

  // The survey's own figures, and the stations the map sheet had no room for.
  const sy = by;
  if (summary.length > 0) {
    drawTextLine(sheet, "SURVEY SUMMARY", leftX, sy, 9.5, { font: ctx.bold });
    drawPacedRows(sheet, summary, leftX, columnW, sy + SHEET2_TITLE_H, rowPitch, 10);
  }
  if (schedule) {
    drawSheetTable(sheet, schedule, rightX, columnW, by, targetScale);
  } else if (reference.length > 0) {
    drawTextLine(sheet, "SURVEY REFERENCE", rightX, sy, 9.5, { font: ctx.bold });
    drawPacedRows(sheet, reference, rightX, columnW, sy + SHEET2_TITLE_H, rowPitch, 10);
  }
  by += middleHeight();
  by += SHEET2_BAND_GAP;

  // The provenance, across the foot of the sheet.
  if (schedule && reference.length > 0) {
    drawTextLine(sheet, "SURVEY REFERENCE", leftX, by, 9.5, { font: ctx.bold });
    const half = Math.ceil(reference.length / 2);
    drawPacedRows(sheet, reference.slice(0, half), leftX, columnW, by + SHEET2_TITLE_H, rowPitch, 10);
    drawPacedRows(
      sheet,
      reference.slice(half),
      rightX,
      columnW,
      by + SHEET2_TITLE_H,
      rowPitch,
      10,
    );
    by += footHeight();
  }

  drawTextLine(
    sheet,
    keyOnPanel
      ? "Sheet 2 of 2 · recommended targets and survey record"
      : "Sheet 2 of 2 · classification legend, targets and survey record",
    leftX,
    SHEET.heightPt - margin - 4,
    6.5,
    { color: INK_SOFT },
  );
}

/** Height a table takes, so the sheet can budget the room before it draws it. */
function sheetTableHeight(table: SheetTable, scale = 1): number {
  return (
    TABLE_TITLE_H * scale +
    TABLE_HEAD_H * scale +
    5 * scale +
    table.rows.length * TABLE_ROW_H * scale
  );
}

/**
 * The map sheet, and the sheet behind it when something did not fit.
 *
 * The key and the schedule of stations both have to print whole, so whichever of
 * them the map sheet could not hold is carried by the sheet behind it.
 */
export function drawSurveySheets(
  pdf: PDFDocument,
  ctx: SheetCtx,
  panelRect: SheetMapRect,
  data: PanelData,
): void {
  const panel = drawPanel(ctx, panelRect, data);
  data.keyOnPanel = panel.legendDrawn;
  data.scheduleOnPanel = panel.schedulePrinted;
  const keyMoved = data.includeLegend && data.legendItems.length > 0 && !panel.legendDrawn;
  const scheduleMoved = stationLines(data.candidates ?? []).length > 0 && !panel.schedulePrinted;
  if (!keyMoved && !scheduleMoved) return;

  drawLegendSheet(pdf, ctx, data);
}

/**
 * The schedule of stations the survey picked.
 *
 * The map shows where each station is and what the ground reads there; the schedule
 * says what the station is, what it reads and how far it sits from the centre, which
 * is what a crew works from before it goes out.
 */
function targetSchedule(
  candidates: NonNullable<MapExportOptions["candidates"]>,
): SheetTable | null {
  const stations = candidates.filter((candidate) => candidate.kind || candidate.readout);
  if (stations.length === 0) return null;

  const rows = stations.slice(0, SCHEDULE_MAX_ROWS).map((candidate) => [
    `${candidate.kind ?? "Target"} ${candidate.rank ?? ""}`.trim(),
    candidate.readout ?? candidate.label ?? "",
    candidate.distanceKm === null || candidate.distanceKm === undefined
      ? "—"
      : `${candidate.distanceKm.toFixed(1)} km`,
    candidate.score === null || candidate.score === undefined
      ? "—"
      : `${candidate.score.toFixed(0)} / 100`,
  ]);
  const hidden = stations.length - rows.length;
  if (hidden > 0) rows.push([`+ ${hidden} more`, "", "", ""]);

  return {
    title: "Recommended targets",
    columns: [
      { label: "TARGET", width: 130 },
      { label: "READING", width: 134 },
      { label: "DISTANCE", width: 62, align: "right" },
      { label: "SCORE", width: 56, align: "right" },
    ],
    rows,
  };
}

/**
 * One line per station, for the narrow title block.
 *
 * The panel is a fifth of the sheet's width, so four columns of type would have to
 * shrink past legibility. One line says the same thing: what the station is, what the
 * ground reads there, how far it sits and how well it scored.
 */
function stationLines(
  candidates: NonNullable<MapExportOptions["candidates"]>,
): string[] {
  return candidates
    .filter((candidate) => candidate.kind || candidate.readout)
    .slice(0, SCHEDULE_MAX_ROWS)
    .map((candidate, index) => {
      const parts: string[] = [];
      if (candidate.readout ?? candidate.label) parts.push(candidate.readout ?? candidate.label!);
      if (typeof candidate.distanceKm === "number" && Number.isFinite(candidate.distanceKm)) {
        parts.push(`${candidate.distanceKm.toFixed(1)} km`);
      }
      if (typeof candidate.score === "number" && Number.isFinite(candidate.score)) {
        parts.push(`${candidate.score.toFixed(0)} / 100`);
      }
      return `${candidate.rank ?? index + 1} · ${parts.join(" · ")}`;
    });
}

/** The list of stations, drawn in the title block. */
function drawStationList(
  ctx: SheetCtx,
  lines: string[],
  innerX: number,
  innerW: number,
  y: number,
  rowH = STATION_LIST_ROW_H,
): number {
  drawTextLine(ctx, "RECOMMENDED TARGETS", innerX, y, 6.6, { font: ctx.bold });
  y += STATION_LIST_TITLE_H;

  // One size for the whole list, so the stations read as a column of equal weight.
  let size = TABLE_CELL_SIZE;
  while (size > TABLE_CELL_FLOOR) {
    if (lines.every((line) => ctx.bold.widthOfTextAtSize(safeText(line), size) <= innerW)) break;
    size -= 0.2;
  }
  for (const line of lines) {
    drawTextLine(ctx, line, innerX, y, size, { font: ctx.bold });
    y += rowH;
  }
  return y;
}

/** The needle itself: tip at the top, dark west half, light east half. */
function drawNorthNeedle(
  ctx: SheetCtx,
  cx: number,
  cyTop: number,
  onMap: boolean,
): void {
  const { page } = ctx;
  page.drawCircle({
    x: cx,
    y: yFlip(cyTop),
    size: 16,
    borderColor: onMap ? INK : INK_SOFT,
    borderWidth: onMap ? 0.8 : 0.7,
    color: onMap ? PAPER : undefined,
  });
  page.drawSvgPath("M 0 -15 L -5.5 11 L 0 7 Z", {
    x: cx,
    y: yFlip(cyTop),
    color: INK,
  });
  page.drawSvgPath("M 0 -15 L 5.5 11 L 0 7 Z", {
    x: cx,
    y: yFlip(cyTop),
    color: onMap ? PAPER : INK_SOFT,
    borderColor: INK,
    borderWidth: 0.6,
  });
  // The letter reads in one line on the side of the needle, never over the
  // section header or floating on the imagery.
  if (onMap) {
    page.drawRectangle({
      x: cx + 20,
      y: yFlip(cyTop + 5.5),
      width: 10,
      height: 11,
      color: PAPER,
      borderColor: INK,
      borderWidth: 0.4,
      borderOpacity: 0.55,
    });
  }
  drawTextLine(ctx, "N", cx + 22.2, cyTop - 4.5, 8, {
    font: ctx.bold,
    color: INK,
  });
}

/** Segmented bar with metre labels; the printed length is never stretched. */
function drawScaleBarCore(
  ctx: SheetCtx,
  x: number,
  yTop: number,
  bar: { meters: number; widthPt: number },
): number {
  const { page } = ctx;
  const segments = 4;
  const segW = bar.widthPt / segments;
  for (let i = 0; i < segments; i += 1) {
    page.drawRectangle({
      x: x + i * segW,
      y: yFlip(yTop + 6),
      width: segW,
      height: 6,
      color: i % 2 === 0 ? INK : PAPER,
      borderColor: INK,
      borderWidth: 0.7,
    });
  }
  drawTextLine(ctx, "0", x - 2, yTop + 8.5, 6, { font: ctx.bold, color: INK_SOFT });
  const midLabel = formatMeters(bar.meters / 2);
  const midW = ctx.bold.widthOfTextAtSize(midLabel, 6);
  drawTextLine(ctx, midLabel, x + bar.widthPt / 2 - midW / 2, yTop + 8.5, 6, {
    font: ctx.bold,
    color: INK_SOFT,
  });
  const fullLabel = formatMeters(bar.meters);
  const fullW = ctx.bold.widthOfTextAtSize(fullLabel, 6);
  drawTextLine(ctx, fullLabel, x + bar.widthPt - fullW + 2, yTop + 8.5, 6, {
    font: ctx.bold,
    color: INK_SOFT,
  });
  return 17;
}

/** Paper cartouche bottom-left of the imagery, holding the same honest bar. */
function drawScaleBarOnMap(
  ctx: SheetCtx,
  mapRect: SheetMapRect,
  bar: { meters: number; widthPt: number },
  scaleText: string,
): void {
  const { page } = ctx;
  const padX = 8;
  const stripW = bar.widthPt + padX * 2;
  const stripH = 30;
  const x = mapRect.x + 6;
  const yTop = mapRect.y + mapRect.h - stripH - 6;
  page.drawRectangle({
    x,
    y: yFlip(yTop),
    width: stripW,
    height: stripH,
    color: PAPER,
    opacity: 0.9,
    borderColor: rgb(0.15, 0.18, 0.22),
    borderWidth: 0.5,
  });
  drawScaleBarCore(ctx, x + padX, yTop + 4, bar);
  drawTextLine(ctx, scaleText, x + padX, yTop + 21, 5.5, { color: INK_SOFT });
}

/** Cartographic label: the text itself with a contrasting halo, no box behind it. */
function drawHaloText(
  ctx: SheetCtx,
  text: string,
  x: number,
  yTop: number,
  size: number,
  options: {
    font?: PDFFont;
    fill?: ReturnType<typeof rgb>;
    halo?: ReturnType<typeof rgb>;
  } = {},
): void {
  const font = options.font ?? ctx.font;
  const fill = options.fill ?? INK;
  const halo = options.halo ?? rgb(1, 1, 1);
  const clean = safeText(text);
  const baseline = yFlip(yTop + size * 0.78);
  const offsets: [number, number][] = [
    [-0.5, 0],
    [0.5, 0],
    [0, -0.5],
    [0, 0.5],
    [-0.4, -0.4],
    [0.4, -0.4],
    [-0.4, 0.4],
    [0.4, 0.4],
  ];
  for (const [dx, dy] of offsets) {
    ctx.page.drawText(clean, {
      x: x + dx,
      y: baseline + dy,
      size,
      font,
      color: halo,
    });
  }
  ctx.page.drawText(clean, { x, y: baseline, size, font, color: fill });
}

function tickValues(min: number, max: number, step: number): number[] {
  const ticks: number[] = [];
  const eps = step * 1e-6;
  const start = Math.ceil((min + eps) / step) * step;
  for (let value = start; value <= max - eps; value += step) {
    ticks.push(Number(value.toFixed(6)));
  }
  return ticks;
}

/**
 * Where a grid line carries its number: the point where the line meets the edge
 * that is labelled - the top edge for X (easting/longitude) lines, the left
 * edge for Y (northing/latitude) lines. Ticks and chips are drawn from this
 * anchor, so they always sit on the line they belong to.
 */
export function gridLabelAnchor(
  axis: "x" | "y",
  points: ProjectedPoint[],
): ProjectedPoint {
  if (points.length === 0) return { x: 0, y: 0 };
  return points.reduce((a, b) =>
    axis === "x" ? (b.y < a.y ? b : a) : (b.x < a.x ? b : a),
  );
}

/**
 * Graticule label furniture, in sheet points with y measured down from the top
 * edge. One function for both axes so a tick, its chip and its text cannot drift
 * apart: the chip is always centred on the tick that marks the same line.
 */
export interface GridLabelPlacement {
  /** Frame tick, drawn across the labelled edge. */
  tick: { x0: number; y0: number; x1: number; y1: number };
  /** Paper chip behind the text. `top` is its top edge, downward. */
  chip: { x: number; top: number; w: number; h: number };
  text: { x: number; top: number };
}

export const GRID_CHIP_HEIGHT_PT = 9.5;
export const GRID_LABEL_SIZE_PT = 5.2;

export function gridLabelPlacement(params: {
  axis: "x" | "y";
  /** Where the line meets the labelled edge, in canvas pixels. */
  anchorPt: ProjectedPoint;
  chipW: number;
  mapRect: { x: number; y: number; w: number; h: number };
  ptPerPx: number;
  labelSize?: number;
}): GridLabelPlacement {
  const { axis, anchorPt, chipW, mapRect, ptPerPx } = params;
  const size = params.labelSize ?? GRID_LABEL_SIZE_PT;
  const h = GRID_CHIP_HEIGHT_PT;
  const textTop = (top: number) => top + (h - size * 0.7) / 2;

  if (axis === "x") {
    const xTick = mapRect.x + anchorPt.x * ptPerPx;
    // Nudged inside the frame so the top edge of the sheet stays readable.
    const top = mapRect.y + 6;
    const x = Math.max(
      mapRect.x + 3,
      Math.min(mapRect.x + mapRect.w - chipW - 3, xTick - chipW / 2),
    );
    return {
      tick: { x0: xTick, y0: mapRect.y - 4, x1: xTick, y1: mapRect.y + 4 },
      chip: { x, top, w: chipW, h },
      text: { x: x + 3.5, top: textTop(top) },
    };
  }

  const yTick = mapRect.y + anchorPt.y * ptPerPx;
  const top = yTick - h / 2;
  const x = mapRect.x + 5;
  return {
    tick: { x0: mapRect.x - 4, y0: yTick, x1: mapRect.x + 4, y1: yTick },
    chip: { x, top, w: chipW, h },
    text: { x: x + 3.5, top: textTop(top) },
  };
}

/** Liang-Barsky clip of one segment against the canvas rectangle. */
function clipSegmentToCanvas(
  a: ProjectedPoint,
  b: ProjectedPoint,
  width: number,
  height: number,
): [ProjectedPoint, ProjectedPoint] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const edges: [number, number][] = [
    [-dx, a.x],
    [dx, width - a.x],
    [-dy, a.y],
    [dy, height - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  return [
    { x: a.x + t0 * dx, y: a.y + t0 * dy },
    { x: a.x + t1 * dx, y: a.y + t1 * dy },
  ];
}

function drawMapFurniture(
  ctx: SheetCtx,
  mapRect: SheetMapRect,
  compose: ComposeResult,
  options: MapExportOptions,
  furniture: {
    northOnMap: boolean;
    scaleOnMap: boolean;
    bar: { meters: number; widthPt: number };
    scaleText: string;
  },
): void {
  const { page, font, bold } = ctx;
  const { canvas, mapRef, originRef, upscale } = compose;
  const ptPerPx = mapRect.w / canvas.width;
  const toPtX = (xPx: number) => mapRect.x + xPx * ptPerPx;
  const toPtY = (yPx: number) => mapRect.y + yPx * ptPerPx;

  // Frame: dark outer rule, white inner rule readable on imagery.
  page.drawRectangle({
    x: mapRect.x,
    y: yFlip(mapRect.y + mapRect.h),
    width: mapRect.w,
    height: mapRect.h,
    borderColor: rgb(0.08, 0.1, 0.13),
    borderWidth: 1.2,
  });
  page.drawRectangle({
    x: mapRect.x + 2.5,
    y: yFlip(mapRect.y + mapRect.h - 2.5),
    width: mapRect.w - 5,
    height: mapRect.h - 5,
    borderColor: rgb(1, 1, 1),
    borderWidth: 0.5,
  });

  if (options.includeNeatline !== false) {
    // Grid across the imagery: white strokes over a dark halo so they read on
    // any ground cover, ticks on the frame, labels in paper chips just inside
    // the edge (the page margin is too slim for labels).
    const maxTicks = Math.max(2, Math.min(12, Math.round(options.gridLineCount ?? 7)));

    interface GridPoly {
      axis: "x" | "y";
      label: string;
      pts: ProjectedPoint[];
    }

    const polys: GridPoly[] = [];
    if (options.coordMode === "utm") {
      const grid = utmGridLines(
        {
          south: compose.south,
          west: compose.west,
          north: compose.north,
          east: compose.east,
        },
        maxTicks,
      );
      for (const line of grid.lines) {
        polys.push({
          axis: line.axis,
          label: line.label,
          pts: line.path.map(({ lat, lng }) =>
            projectToCanvas(mapRef, lat, lng, compose.tileZoom, originRef, upscale),
          ),
        });
      }
    } else {
      const latGrid = niceGraticuleStep(compose.north - compose.south, maxTicks);
      const lngGrid = niceGraticuleStep(compose.east - compose.west, maxTicks);
      const centerLng = (compose.west + compose.east) / 2;
      const centerLat = (compose.north + compose.south) / 2;
      for (const lat of tickValues(compose.south, compose.north, latGrid.step)) {
        const p = projectToCanvas(mapRef, lat, centerLng, compose.tileZoom, originRef, upscale);
        if (p.y < 0 || p.y > canvas.height) continue;
        polys.push({
          axis: "y",
          label: formatDeg(lat, "lat", latGrid.decimals),
          pts: [
            { x: 0, y: p.y },
            { x: canvas.width, y: p.y },
          ],
        });
      }
      for (const lng of tickValues(compose.west, compose.east, lngGrid.step)) {
        const p = projectToCanvas(mapRef, centerLat, lng, compose.tileZoom, originRef, upscale);
        if (p.x < 0 || p.x > canvas.width) continue;
        polys.push({
          axis: "x",
          label: formatDeg(lng, "lon", lngGrid.decimals),
          pts: [
            { x: p.x, y: 0 },
            { x: p.x, y: canvas.height },
          ],
        });
      }
    }

    // Clip every line to the image once, so the strokes and the labels are
    // placed from the same geometry.
    const drawn = polys.map((poly) => {
      const segs: [ProjectedPoint, ProjectedPoint][] = [];
      const edgePts: ProjectedPoint[] = [];
      for (let i = 1; i < poly.pts.length; i += 1) {
        const seg = clipSegmentToCanvas(
          poly.pts[i - 1],
          poly.pts[i],
          canvas.width,
          canvas.height,
        );
        if (!seg) continue;
        segs.push(seg);
        edgePts.push(seg[0], seg[1]);
      }
      const anchor = edgePts.length > 0 ? gridLabelAnchor(poly.axis, edgePts) : null;
      return { axis: poly.axis, label: poly.label, segs, anchor };
    });

    // Halos first, then the white strokes: drawing halo-then-line per line let
    // each later halo cut the white of the lines it crossed, so the graticule
    // broke up at every intersection.
    for (const style of GRID_STROKES) {
      for (const line of drawn) {
        for (const [p0, p1] of line.segs) {
          page.drawLine({
            start: { x: toPtX(p0.x), y: yFlip(toPtY(p0.y)) },
            end: { x: toPtX(p1.x), y: yFlip(toPtY(p1.y)) },
            thickness: style.thickness,
            color: style.color,
            opacity: style.opacity,
          });
        }
      }
    }

    for (const line of drawn) {
      if (!line.anchor) continue;
      const { label } = line;
      const chipW = bold.widthOfTextAtSize(label, GRID_LABEL_SIZE_PT) + 7;
      const place = gridLabelPlacement({
        axis: line.axis,
        anchorPt: line.anchor,
        chipW,
        mapRect,
        ptPerPx,
      });

      page.drawLine({
        start: { x: place.tick.x0, y: yFlip(place.tick.y0) },
        end: { x: place.tick.x1, y: yFlip(place.tick.y1) },
        thickness: 1,
        color: rgb(1, 1, 1),
      });
      page.drawRectangle({
        x: place.chip.x,
        y: yFlip(place.chip.top + place.chip.h),
        width: place.chip.w,
        height: place.chip.h,
        color: PAPER,
        opacity: 0.94,
        borderColor: INK,
        borderWidth: 0.4,
        borderOpacity: 0.55,
      });
      drawTextLine(ctx, label, place.text.x, place.text.top, GRID_LABEL_SIZE_PT, {
        font: bold,
        color: INK,
      });
    }

    if (options.aoiBounds) {
      const [[south, west], [north, east]] = options.aoiBounds;
      const nwP = projectToCanvas(mapRef, north, west, compose.tileZoom, originRef, upscale);
      const seP = projectToCanvas(mapRef, south, east, compose.tileZoom, originRef, upscale);
      const x = Math.max(mapRect.x, toPtX(nwP.x));
      const yTop = Math.max(mapRect.y, toPtY(nwP.y));
      const x1 = Math.min(mapRect.x + mapRect.w, toPtX(seP.x));
      const y1 = Math.min(mapRect.y + mapRect.h, toPtY(seP.y));
      if (x1 > x && y1 > yTop) {
        page.drawRectangle({
          x,
          y: yFlip(y1),
          width: x1 - x,
          height: y1 - yTop,
          borderColor: ACCENT,
          borderWidth: 1,
          borderDashArray: [4, 3],
        });
      }
    }
  }

  for (const candidate of options.candidates ?? []) {
    const p = projectToCanvas(
      mapRef,
      candidate.latitude,
      candidate.longitude,
      compose.tileZoom,
      originRef,
      upscale,
    );
    const x = toPtX(p.x);
    const yPt = toPtY(p.y);
    if (
      x < mapRect.x + 3 ||
      x > mapRect.x + mapRect.w - 3 ||
      yPt < mapRect.y + 3 ||
      yPt > mapRect.y + mapRect.h - 3
    ) {
      continue;
    }
    page.drawCircle({
      x,
      y: yFlip(yPt),
      size: 2.1,
      color: hexToPdfRgb(candidate.color ?? "#D14141") ?? ACCENT,
      borderColor: rgb(1, 1, 1),
      borderWidth: 0.6,
    });
    if (candidate.label) {
      const size = 5.5;
      const text = safeText(candidate.label);
      const textW = bold.widthOfTextAtSize(text, size);
      let labelX = x + 5;
      if (labelX + textW > mapRect.x + mapRect.w - 4) labelX = x - 5 - textW;
      drawHaloText(ctx, text, labelX, yPt - 1.6, size, { font: bold, fill: INK });
    }
  }

  if (options.target) {
    const p = projectToCanvas(
      mapRef,
      options.target.latitude,
      options.target.longitude,
      compose.tileZoom,
      originRef,
      upscale,
    );
    const x = toPtX(p.x);
    const yPt = toPtY(p.y);
    if (
      x >= mapRect.x - 10 &&
      x <= mapRect.x + mapRect.w + 10 &&
      yPt >= mapRect.y - 10 &&
      yPt <= mapRect.y + mapRect.h + 10
    ) {
      page.drawCircle({
        x,
        y: yFlip(yPt),
        size: 4.6,
        color: ACCENT,
        borderColor: rgb(1, 1, 1),
        borderWidth: 1,
      });
      const crossArms: [number, number, number, number][] = [
        [-9, 0, -3.5, 0],
        [3.5, 0, 9, 0],
        [0, -9, 0, -3.5],
        [0, 3.5, 0, 9],
      ];
      for (const [dx0, dy0, dx1, dy1] of crossArms) {
        page.drawLine({
          start: { x: x + dx0, y: yFlip(yPt + dy0) },
          end: { x: x + dx1, y: yFlip(yPt + dy1) },
          thickness: 1.1,
          color: ACCENT,
        });
      }
      page.drawCircle({ x, y: yFlip(yPt), size: 1.1, color: rgb(1, 1, 1) });

      if (options.targetDepthLabel) {
        const size = 5.5;
        const text = safeText(options.targetDepthLabel);
        const chipW = bold.widthOfTextAtSize(text, size) + 8;
        const chipH = 10;
        const chipX = Math.max(
          mapRect.x + 4,
          Math.min(x - chipW / 2, mapRect.x + mapRect.w - chipW - 4),
        );
        // Position below target crosshairs (which extend 9pt from center),
        // or above if too close to the bottom edge of the map frame.
        const belowTop = yPt + 11.5;
        const chipTop =
          belowTop + chipH <= mapRect.y + mapRect.h - 4
            ? belowTop
            : yPt - 11.5 - chipH;

        page.drawRectangle({
          x: chipX,
          y: yFlip(chipTop + chipH),
          width: chipW,
          height: chipH,
          color: PAPER,
          borderColor: ACCENT,
          borderWidth: 0.6,
          opacity: 0.94,
        });
        drawTextLine(ctx, text, chipX + 4, chipTop + 2.2, size, {
          font: bold,
          color: ACCENT,
        });
      }
    }
  }

  const attribution = safeText(options.attribution ?? "");
  if (attribution) {
    const size = 5;
    const chipW = bold.widthOfTextAtSize(attribution, size) + 8;
    page.drawRectangle({
      x: mapRect.x + mapRect.w - chipW - 4,
      y: yFlip(mapRect.y + mapRect.h - 12),
      width: chipW,
      height: 9.5,
      color: CHIP_BG,
      opacity: 0.72,
    });
    drawTextLine(
      ctx,
      attribution,
      mapRect.x + mapRect.w - chipW + 0.5,
      mapRect.y + mapRect.h - 10.6,
      size,
      { font: bold, color: rgb(1, 1, 1) },
    );
  }

  if (compose.missingTiles > 0) {
    const label = `${compose.missingTiles} of ${compose.totalTiles} tiles unavailable`;
    const size = 5.5;
    const chipW = bold.widthOfTextAtSize(label, size) + 10;
    page.drawRectangle({
      x: mapRect.x + 4,
      y: yFlip(mapRect.y + mapRect.h - 13),
      width: chipW,
      height: 10,
      color: rgb(0.85, 0.55, 0.1),
      opacity: 0.85,
    });
    drawTextLine(ctx, label, mapRect.x + 9, mapRect.y + mapRect.h - 11.4, size, {
      font: bold,
      color: rgb(1, 1, 1),
    });
  }

  if (furniture.northOnMap) {
    // Badge sits clear of the frame: circle + side chip span ~46pt from cx.
    drawNorthNeedle(ctx, mapRect.x + mapRect.w - 40, mapRect.y + 26, true);
  }
  if (furniture.scaleOnMap) {
    drawScaleBarOnMap(ctx, mapRect, furniture.bar, furniture.scaleText);
  }
}

/**
 * Generate a standard A4 landscape map sheet as vector PDF.
 *
 * Imagery is fetched tile-by-tile at the paper's true resolution (never a
 * screenshot of the screen), and every cartographic element — graticule,
 * scale bar, legend, title block, north arrow, attribution — is drawn as PDF
 * vectors so text stays crisp at any zoom.
 *
 * Framing defaults to the map's own point of view — the extent and zoom level
 * showing in the workbench — with the whole-ground survey product available
 * under `frame: "survey"`. The survey's classified tiles are painted over the
 * basemap the same way the live raster layer paints them, from the same
 * private archive; older runs fall back to the georeferenced drape overlays
 * collected from the live map.
 */
export async function exportMapAsPdf(
  map: LeafletMap,
  filename = "sitesurveyor_map_sheet.pdf",
  options: MapExportOptions = {},
): Promise<void> {
  if (!map) throw new Error("Map view is not ready yet. Please wait and try again.");

  const quality = detectOptimalQuality();
  const dpi = Math.max(96, Math.min(320, Math.round(options.dpi ?? quality.dpi)));
  const panelSide = options.panelSide === "left" ? "left" : "right";
  const mapRect = sheetMapRect(panelSide);
  const panelRect = sheetPanelRect(panelSide);
  const mapWPx = Math.round((mapRect.w / 72) * dpi);
  const mapHPx = Math.round((mapRect.h / 72) * dpi);

  const overlays = collectRasterOverlays(map);
  // Default is the map's own point of view -- the extent and zoom level on
  // screen -- which is what a sheet that "shows what I am looking at" means.
  // "survey" keeps the whole-ground product around the AOI.
  const frame = options.frame === "survey" ? "survey" : "view";
  const contextFraction = Math.max(0, Math.min(1, options.contextFraction ?? 0.25));
  const extent =
    frame === "survey" && options.aoiBounds
      ? padBounds(
          options.aoiBounds[0][0],
          options.aoiBounds[0][1],
          options.aoiBounds[1][0],
          options.aoiBounds[1][1],
          contextFraction,
        )
      : undefined;
  const tilesLayer = options.classifiedTiles
    ? await buildSheetTilesLayer(options.classifiedTiles)
    : null;
  const compose = await composeImagery({
    map,
    mapWPx,
    mapHPx,
    tileUrlTemplate: options.tileUrlTemplate,
    maxNativeZoom: options.maxNativeZoom ?? 19,
    overlays,
    tilesLayer,
    extent,
  });

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([SHEET.widthPt, SHEET.heightPt]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ctx: SheetCtx = { page, font, bold };
  const logo = await loadLogoImage(pdf, options.logoUrl ?? "/logo.png");

  const pngBytes = await canvasToPngBytes(compose.canvas);
  const image = await pdf.embedPng(pngBytes);
  page.drawImage(image, {
    x: mapRect.x,
    y: yFlip(mapRect.y + mapRect.h),
    width: mapRect.w,
    height: mapRect.h,
  });

  const groundPerPt = compose.groundWidthM / mapRect.w;
  const rf = representativeFraction(groundPerPt);
  const bar = scaleBarLayout(groundPerPt);
  const sheetMppText =
    compose.canvasMpp < 10 ? compose.canvasMpp.toFixed(2) : compose.canvasMpp.toFixed(1);
  const srcMppText =
    compose.sourceMpp < 10 ? compose.sourceMpp.toFixed(2) : compose.sourceMpp.toFixed(1);
  const upscaledNote =
    compose.upscale > 1.02 ? ` (upscaled x${compose.upscale.toFixed(1)})` : "";

  drawMapFurniture(ctx, mapRect, compose, options, {
    northOnMap: options.northArrowPlacement === "map",
    scaleOnMap: options.scaleBarPlacement === "map",
    bar,
    scaleText: `1:${rf.toLocaleString("en-US")} (approx.) · ${sheetMppText} m/px at ${dpi} DPI`,
  });
  const now = new Date();
  const dateStamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  const sheetNo = `EO-${dateStamp}-${String(now.getHours()).padStart(2, "0")}${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;
  const generatedText = now.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const gridText =
    options.coordMode === "utm"
      ? `WGS 84 / UTM zone ${utmZoneFor((compose.west + compose.east) / 2)}${
          (compose.north + compose.south) / 2 < 0 ? "S" : "N"
        } · X=Easting, Y=Northing (m)`
      : "WGS 84 · geographic (lat/lon)";

  const domain = domainLabel(options.categoryName);
  const cleanTitle = normalizePdfTitle(
    options.title || `${domain} — ${options.client || "SITE AREA"}`,
  );

  const panelData: PanelData = {
    includeHeader: options.includeHeader !== false,
    title: cleanTitle,
    client: options.client || "Site Survey",
    categoryName: domain,
    coords: options.coords || "—",
    coverageText: `${formatMeters(compose.groundWidthM)} E-W x ${formatMeters(
      compose.groundHeightM,
    )} N-S`,
    gridText,
    opticalSource: options.opticalSource ?? "",
    imageryText: `z${compose.tileZoom} · ~${srcMppText} m/px source · sheet ~${sheetMppText} m/px${upscaledNote}`,
    scaleText: `1:${rf.toLocaleString("en-US")} (approx.) · ${sheetMppText} m/px at ${dpi} DPI`,
    scaleRatioText: `1:${rf.toLocaleString("en-US")} (approx.)`,
    sheetNo,
    generatedText,
    waterTableText: options.targetDepthLabel ?? "",
    fieldTargetText: options.fieldTargetLabel ?? "",
    summaryRows: options.summaryRows ?? [],
    table: options.table ?? null,
    includeLegend: options.includeLegend !== false,
    legendTitle: options.legendTitle || "Map Symbols",
    legendItems: options.legendItems ?? [],
    candidates: options.candidates ?? [],
    scheduleOnPanel: false,
    keyOnPanel: false,
    includeScaleBar:
      options.includeScaleBar !== false && options.scaleBarPlacement !== "map",
    scaleBarMeters: bar.meters,
    scaleBarWidthPt: bar.widthPt,
    includeNorthArrow:
      options.includeNorthArrow !== false && options.northArrowPlacement !== "map",
    footerText:
      `Confidential & proprietary. Generated by SiteSurveyor on ${generatedText}. ` +
      (options.attribution ? `${options.attribution}.` : ""),
    logo,
  };

  // The map sheet, plus the sheet behind it when the key or the schedule of stations
  // had no room beside the map.
  drawSurveySheets(pdf, ctx, panelRect, panelData);

  pdf.setTitle(safeText(cleanTitle));
  pdf.setAuthor("SiteSurveyor");
  pdf.setSubject("Earth Observation Map Sheet");
  pdf.setCreator("SiteSurveyor");

  const bytes = await pdf.save();
  downloadBlob(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), filename);
}

/** Embed the brand logo into the PDF; a missing file only costs the sheet its logo. */
async function loadLogoImage(pdf: PDFDocument, url: string): Promise<PDFImage | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return await pdf.embedPng(bytes);
  } catch {
    return null;
  }
}

async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob(resolve, "image/png");
    } catch {
      resolve(null);
    }
  });
  if (blob) return new Uint8Array(await blob.arrayBuffer());

  const dataUrl = canvas.toDataURL("image/png");
  const binary = atob(dataUrl.split(",")[1] ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
