import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { ImageOverlay as LeafletImageOverlay, type Map as LeafletMap } from "leaflet";

import { metersPerPixel } from "./workbench.ts";

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
  }[];
  /** Depth line printed beside the survey centre reticle, e.g. "Water table ~24-31 m". */
  targetDepthLabel?: string;
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
  /** PNG logo drawn in the title panel. Empty string disables; defaults to /logo.png. */
  logoUrl?: string;
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
    const blob = await response.blob();
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
  } catch {
    return null;
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
    // Direct tile first; on failure walk up to parent tiles and crop the
    // quadrant, so one failed request never leaves a hole in the sheet.
    const drawable = await loadTileImage(
      tileUrlFor(template, tile.x, tile.y, tileZoom),
    );
    if (drawable) {
      drawTile(ctx, drawable, tile.x, tile.y, origin, scale, mapWPx, mapHPx);
      return;
    }
    let drew = false;
    for (let p = 1; p <= 3 && tileZoom - p >= 0; p += 1) {
      const q = 2 ** p;
      const parent = await loadTileImage(
        tileUrlFor(template, tile.x >> p, tile.y >> p, tileZoom - p),
      );
      if (!parent) continue;
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
const GRID_LINE = rgb(0.72, 0.76, 0.8);
const CHIP_BG = rgb(0.04, 0.055, 0.08);

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

interface SheetCtx {
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

/** One line that never overflows: shrink with an ellipsis when it would. */
function fitText(ctx: SheetCtx, text: string, size: number, maxWidth: number): string {
  const clean = safeText(text);
  if (ctx.font.widthOfTextAtSize(clean, size) <= maxWidth) return clean;
  let out = clean;
  while (out.length > 1 && ctx.font.widthOfTextAtSize(`${out}...`, size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}...`;
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

interface PanelData {
  includeHeader: boolean;
  title: string;
  client: string;
  categoryName: string;
  coords: string;
  coverageText: string;
  imageryText: string;
  scaleText: string;
  sheetNo: string;
  generatedText: string;
  waterTableText: string;
  includeLegend: boolean;
  legendTitle: string;
  legendItems: SheetLegendItem[];
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
): void {
  const { page } = ctx;
  const kind = item.kind ?? "zone";

  if (kind === "aoi") {
    page.drawRectangle({
      x: x + 0.5,
      y: yFlip(y + 5.8),
      width: 6,
      height: 4.4,
      borderColor: ACCENT,
      borderWidth: 0.8,
      borderDashArray: [2.4, 1.8],
    });
    return;
  }

  if (kind === "target") {
    const cx = x + 3.4;
    const cy = y + 3.2;
    page.drawCircle({
      x: cx,
      y: yFlip(cy),
      size: 1.5,
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
        start: { x: cx + dx0, y: yFlip(cy + dy0) },
        end: { x: cx + dx1, y: yFlip(cy + dy1) },
        thickness: 0.7,
        color: ACCENT,
      });
    }
    return;
  }

  if (kind === "imagery") {
    page.drawRectangle({
      x,
      y: yFlip(y + 6.4),
      width: 6.8,
      height: 6.8,
      color: rgb(0.16, 0.2, 0.26),
      borderColor: rgb(0.15, 0.18, 0.22),
      borderWidth: 0.4,
    });
    return;
  }

  const color = item.color ? hexToPdfRgb(item.color) : null;
  if (color) {
    page.drawCircle({
      x: x + 3.4,
      y: yFlip(y + 3.2),
      size: 2.9,
      color,
      borderColor: rgb(0.15, 0.18, 0.22),
      borderWidth: 0.4,
    });
  }
}

function drawPanel(ctx: SheetCtx, rect: SheetMapRect, data: PanelData): void {
  const { page } = ctx;
  const px = rect.x;
  const pw = rect.w;
  const ph = rect.h;
  const innerX = px + 14;
  const innerW = pw - 28;
  const bottomLimit = rect.y + ph - 78;

  page.drawRectangle({
    x: px,
    y: yFlip(rect.y + ph),
    width: pw,
    height: ph,
    color: PAPER,
    borderColor: PAPER_LINE,
    borderWidth: 0.8,
  });

  let y = rect.y + 20;

  page.drawRectangle({
    x: px + 0.8,
    y: yFlip(y - 4),
    width: 2.6,
    height: 26,
    color: ACCENT,
  });
  let brandX = innerX;
  if (data.logo) {
    const logoH = 21;
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
  drawTextLine(ctx, "EARTH OBSERVATION MAP SHEET", brandX, y + 13, 5.6, {
    color: INK_SOFT,
  });
  y += 36;
  drawPanelDivider(ctx, innerX, innerW, y);
  y += 12;

  if (data.includeHeader) {
    const titleLines = wrapText(ctx, data.title, 12, innerW, ctx.bold, 3);
    for (const line of titleLines) {
      drawTextLine(ctx, line, innerX, y, 12, { font: ctx.bold });
      y += 14.5;
    }
    y += 6;
    drawPanelDivider(ctx, innerX, innerW, y);
    y += 10;

    const metaRows = [
      { label: "CLIENT", value: data.client },
      { label: "SURVEY DOMAIN", value: data.categoryName },
      { label: "WATER TABLE", value: data.waterTableText },
      { label: "CENTRE", value: data.coords },
      { label: "SHEET COVERAGE", value: data.coverageText },
      { label: "DATUM", value: "WGS 84 / Web Mercator" },
      { label: "IMAGERY", value: data.imageryText },
      { label: "PRINT SCALE", value: data.scaleText },
      { label: "SHEET NO.", value: data.sheetNo },
      { label: "GENERATED", value: data.generatedText },
    ].filter((row) => row.value);
    for (const row of metaRows) {
      drawTextLine(ctx, row.label, innerX, y, 5.8, { color: INK_SOFT });
      const labelW = ctx.font.widthOfTextAtSize(safeText(row.label), 5.8);
      const valueX = innerX + labelW + 6;
      drawTextLine(ctx, fitText(ctx, row.value, 8.3, innerX + innerW - valueX), valueX, y - 2, 8.3);
      y += 12;
    }
    y += 4;
    drawPanelDivider(ctx, innerX, innerW, y);
    y += 11;
  }

  if (data.includeLegend && data.legendItems.length > 0 && y < bottomLimit) {
    drawTextLine(ctx, data.legendTitle.toUpperCase(), innerX, y, 7, {
      font: ctx.bold,
    });
    y += 13;
    for (const item of data.legendItems) {
      drawLegendSwatch(ctx, item, innerX, y);
      drawTextLine(ctx, item.label, innerX + 11, y, 8);
      y += 12.5;
    }
    y += 8;
    drawPanelDivider(ctx, innerX, innerW, y);
    y += 11;
  }

  if (data.includeScaleBar && y < bottomLimit) {
    drawTextLine(ctx, "SCALE BAR", innerX, y, 7, { font: ctx.bold });
    y += 12;
    y += drawScaleBarCore(ctx, innerX, y, {
      meters: data.scaleBarMeters,
      widthPt: data.scaleBarWidthPt,
    });
    drawTextLine(ctx, data.scaleText, innerX, y, 6, { color: INK_SOFT });
    y += 14;
    drawPanelDivider(ctx, innerX, innerW, y);
    y += 11;
  }

  if (data.includeNorthArrow && y < bottomLimit) {
    drawTextLine(ctx, "ORIENTATION", innerX, y, 7, { font: ctx.bold });
    y += 12;
    const cx = innerX + 18;
    const cy = y + 24;
    drawNorthNeedle(ctx, cx, cy, false);
    const noteLines = wrapText(
      ctx,
      "Map top is grid north. Web Mercator projection; convergence ignored at this scale.",
      5.8,
      innerW - 48,
      ctx.font,
      4,
    );
    let noteY = y + 4;
    for (const line of noteLines) {
      drawTextLine(ctx, line, innerX + 48, noteY, 5.8, { color: INK_SOFT });
      noteY += 7.5;
    }
    y += 52;
  }

  const footerLines = wrapText(ctx, data.footerText, 5.6, innerW, ctx.font, 4);
  let footerY = rect.y + ph - 12 - (footerLines.length - 1) * 7.5;
  for (const line of footerLines) {
    drawTextLine(ctx, line, innerX, footerY, 5.6, { color: INK_SOFT });
    footerY += 7.5;
  }
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
    borderColor: onMap ? rgb(1, 1, 1) : INK_SOFT,
    borderWidth: onMap ? 0.9 : 0.7,
  });
  page.drawSvgPath("M 0 -15 L -5.5 11 L 0 7 Z", {
    x: cx,
    y: yFlip(cyTop),
    color: onMap ? PAPER : INK,
  });
  page.drawSvgPath("M 0 -15 L 5.5 11 L 0 7 Z", {
    x: cx,
    y: yFlip(cyTop),
    color: onMap ? INK : PAPER,
    borderColor: onMap ? PAPER : INK,
    borderWidth: 0.6,
  });
  drawTextLine(ctx, "N", cx - 2.4, onMap ? cyTop + 18 : cyTop - 30, 8, {
    font: ctx.bold,
    color: onMap ? rgb(1, 1, 1) : INK,
  });
}

/** Segmented bar with metre labels; the printed length is never stretched. */
function drawScaleBarCore(
  ctx: SheetCtx,
  x: number,
  yTop: number,
  bar: { meters: number; widthPt: number },
): number {
  const { page, font } = ctx;
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
  drawTextLine(ctx, "0", x - 2, yTop + 8.5, 6, { color: INK_SOFT });
  const midLabel = formatMeters(bar.meters / 2);
  const midW = font.widthOfTextAtSize(midLabel, 6);
  drawTextLine(ctx, midLabel, x + bar.widthPt / 2 - midW / 2, yTop + 8.5, 6, {
    color: INK_SOFT,
  });
  const fullLabel = formatMeters(bar.meters);
  const fullW = font.widthOfTextAtSize(fullLabel, 6);
  drawTextLine(ctx, fullLabel, x + bar.widthPt - fullW + 2, yTop + 8.5, 6, {
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
    // Graticule: light lines across the imagery, ticks on the frame, labels in
    // dark chips just inside the edge (the page margin is too slim for labels).
    const latGrid = niceGraticuleStep(compose.north - compose.south);
    const lngGrid = niceGraticuleStep(compose.east - compose.west);
    const centerLng = (compose.west + compose.east) / 2;
    const centerLat = (compose.north + compose.south) / 2;

    for (const lat of tickValues(compose.south, compose.north, latGrid.step)) {
      const p = projectToCanvas(mapRef, lat, centerLng, compose.tileZoom, originRef, upscale);
      if (p.y < 0 || p.y > canvas.height) continue;
      const yPt = toPtY(p.y);
      page.drawLine({
        start: { x: mapRect.x, y: yFlip(yPt) },
        end: { x: mapRect.x + mapRect.w, y: yFlip(yPt) },
        thickness: 0.35,
        color: GRID_LINE,
        opacity: 0.45,
      });
      page.drawLine({
        start: { x: mapRect.x - 4, y: yFlip(yPt) },
        end: { x: mapRect.x + 4, y: yFlip(yPt) },
        thickness: 0.8,
        color: rgb(1, 1, 1),
      });
      const label = formatDeg(lat, "lat", latGrid.decimals);
      const chipW = font.widthOfTextAtSize(label, 5.2) + 6;
      page.drawRectangle({
        x: mapRect.x + 5,
        y: yFlip(yPt + 4.5),
        width: chipW,
        height: 9,
        color: CHIP_BG,
        opacity: 0.72,
      });
      drawTextLine(ctx, label, mapRect.x + 8, yPt - 4.4, 5.2, {
        color: rgb(1, 1, 1),
      });
    }

    for (const lng of tickValues(compose.west, compose.east, lngGrid.step)) {
      const p = projectToCanvas(mapRef, centerLat, lng, compose.tileZoom, originRef, upscale);
      if (p.x < 0 || p.x > canvas.width) continue;
      const xPt = toPtX(p.x);
      page.drawLine({
        start: { x: xPt, y: yFlip(mapRect.y) },
        end: { x: xPt, y: yFlip(mapRect.y + mapRect.h) },
        thickness: 0.35,
        color: GRID_LINE,
        opacity: 0.45,
      });
      page.drawLine({
        start: { x: xPt, y: yFlip(mapRect.y - 4) },
        end: { x: xPt, y: yFlip(mapRect.y + 4) },
        thickness: 0.8,
        color: rgb(1, 1, 1),
      });
      const label = formatDeg(lng, "lon", lngGrid.decimals);
      const chipW = font.widthOfTextAtSize(label, 5.2) + 6;
      page.drawRectangle({
        x: xPt - chipW / 2,
        y: yFlip(mapRect.y + 14.5),
        width: chipW,
        height: 9,
        color: CHIP_BG,
        opacity: 0.72,
      });
      const labelW = font.widthOfTextAtSize(label, 5.2);
      drawTextLine(ctx, label, xPt - labelW / 2, mapRect.y + 5.6, 5.2, {
        color: rgb(1, 1, 1),
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
      const textW = font.widthOfTextAtSize(text, size);
      let labelX = x + 5;
      if (labelX + textW > mapRect.x + mapRect.w - 4) labelX = x - 5 - textW;
      drawHaloText(ctx, text, labelX, yPt - 1.6, size, { fill: INK });
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
        const chipX = Math.max(
          mapRect.x + 4,
          Math.min(x - chipW / 2, mapRect.x + mapRect.w - chipW - 4),
        );
        const chipTop = yPt + 9;
        page.drawRectangle({
          x: chipX,
          y: yFlip(chipTop),
          width: chipW,
          height: 10.5,
          color: ACCENT,
          opacity: 0.92,
        });
        drawTextLine(ctx, text, chipX + 4, chipTop + 2.4, size, {
          font: bold,
          color: rgb(1, 1, 1),
        });
      }
    }
  }

  const attribution = safeText(options.attribution ?? "");
  if (attribution) {
    const size = 5;
    const chipW = font.widthOfTextAtSize(attribution, size) + 8;
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
      { color: rgb(1, 1, 1) },
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
    drawNorthNeedle(ctx, mapRect.x + mapRect.w - 24, mapRect.y + 26, true);
  }
  if (furniture.scaleOnMap) {
    drawScaleBarOnMap(ctx, mapRect, furniture.bar, furniture.scaleText);
  }
}

/**
 * Generate a standard A4 landscape map sheet as vector PDF.
 *
 * Imagery is fetched tile-by-tile for the current view at the paper's true
 * resolution (never a screenshot of the screen), the classified raster is
 * composited from the live map, and every cartographic element — graticule,
 * scale bar, legend, title block, north arrow, attribution — is drawn as PDF
 * vectors so text stays crisp at any zoom.
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
  const contextFraction = Math.max(0, Math.min(1, options.contextFraction ?? 0.25));
  const extent = options.aoiBounds
    ? padBounds(
        options.aoiBounds[0][0],
        options.aoiBounds[0][1],
        options.aoiBounds[1][0],
        options.aoiBounds[1][1],
        contextFraction,
      )
    : undefined;
  const compose = await composeImagery({
    map,
    mapWPx,
    mapHPx,
    tileUrlTemplate: options.tileUrlTemplate,
    maxNativeZoom: options.maxNativeZoom ?? 19,
    overlays,
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

  drawPanel(ctx, panelRect, {
    includeHeader: options.includeHeader !== false,
    title: options.title || "Earth Observation Survey Sheet",
    client: options.client || "Site Survey",
    categoryName: options.categoryName || "Earth Observation",
    coords: options.coords || "—",
    coverageText: `${formatMeters(compose.groundWidthM)} E-W x ${formatMeters(
      compose.groundHeightM,
    )} N-S`,
    imageryText: `z${compose.tileZoom} · ~${srcMppText} m/px source · sheet ~${sheetMppText} m/px${upscaledNote}`,
    scaleText: `1:${rf.toLocaleString("en-US")} (approx.) · ${sheetMppText} m/px at ${dpi} DPI`,
    sheetNo,
    generatedText,
    waterTableText: options.targetDepthLabel ?? "",
    includeLegend: options.includeLegend !== false,
    legendTitle: options.legendTitle || "Map Symbols",
    legendItems: options.legendItems ?? [],
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
  });

  pdf.setTitle(safeText(options.title || "Earth Observation Survey Sheet"));
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
