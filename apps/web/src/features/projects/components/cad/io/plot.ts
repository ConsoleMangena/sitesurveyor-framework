/**
 * AutoCAD-style plot / layout generator.
 *
 * Produces a print-ready, scale-accurate SVG "sheet" (paper space) from the
 * CAD model, complete with the elements a survey plan deliverable needs:
 *   - paper border + inner drawing frame
 *   - the drawing rendered at a true plot scale (1:`scale`)
 *   - a coordinate graticule with Easting/Northing tick labels (axis letters
 *     follow the drawing's axis convention: Y/X for Zimbabwe, X/Y elsewhere)
 *   - a north arrow
 *   - a graphic + ratio scale bar
 *   - a legend keyed to the visible layers
 *   - a title block (project, client, datum, scale, sheet, date, drawn-by)
 *
 * The SVG is laid out in millimetres (1 user unit = 1 mm) so it prints at the
 * correct physical size: a CSS `@page` size matching the chosen sheet makes the
 * browser's "Save as PDF" produce a to-scale plan.
 */
import type { CadLayer, CadModelState, SurveyLinework, SurveyPoint, SurveyText } from "../cadModel.ts";
import { resolveColor } from "../cadModel.ts";
import { inverse, polygonArea } from "../survey/cogo.ts";
import { fmtBearing, fmtDistance, type BearingFormat } from "../survey/format.ts";
import { axisLabels, type AxisConvention } from "../cadSettings.ts";
import { buildCodeTable, resolveFeature } from "../survey/featureCodes.ts";
import { symbolMarkup } from "../survey/symbols.ts";

/** Feature-code table for resolving point symbols on the plotted sheet. */
const PLOT_CODE_TABLE = buildCodeTable();

// ── Paper sizes (mm, landscape) ─────────────────────────────────────────────
export type PaperSize = "A4" | "A3" | "A2" | "A1" | "A0";
export type PaperOrientation = "landscape" | "portrait";

const PAPER_MM: Record<PaperSize, { w: number; h: number }> = {
  A4: { w: 297, h: 210 },
  A3: { w: 420, h: 297 },
  A2: { w: 594, h: 420 },
  A1: { w: 841, h: 594 },
  A0: { w: 1189, h: 841 },
};

export interface TitleBlock {
  projectName: string;
  projectId: string;
  client: string;
  datum: string;
  surveyor: string;
  drawingTitle: string;
  drawingNo: string;
  sheet: string;
  revision: string;
  date: string; // ISO or display string
  /** Plan designation as filed at the Surveyor-General, e.g. "GP 1234/26". */
  planNo?: string;
  /** Description of the land, e.g. "Lot 1 of Subdivision A of Riverside". */
  property?: string;
  /** Owner or applicant of record. */
  owner?: string;
  /** Locality — district and province, e.g. "Mazowe District, Mash. Central". */
  locality?: string;
  /** Surveyor's registration number, appended under SURVEYOR. */
  surveyorRegNo?: string;
  /** Checker's name for the certification strip. */
  checkedBy?: string;
}

export interface PlotOptions {
  paper: PaperSize;
  orientation: PaperOrientation;
  /** Plot scale denominator (1:scale). When "fit", it is computed to fill the frame. */
  scaleDenominator: number | "fit";
  bearingFormat: BearingFormat;
  /**
   * Axis-label convention for the graticule tick labels. `"yx"` (default,
   * Zimbabwe) labels Easting ticks "Y" and Northing ticks "X"; `"xy"` labels
   * Easting "X" and Northing "Y".
   */
  axisConvention?: AxisConvention;
  showGrid: boolean;
  showLegend: boolean;
  showNorthArrow: boolean;
  showScaleBar: boolean;
  showPointLabels: boolean;
  showSegmentLabels: boolean;
  /** Beacon schedule (coordinate table) for the parcel boundary. */
  showBeaconTable: boolean;
  /** "Certified correct — Surveyor-General" approval strip. */
  showApprovalBlock: boolean;
  marginMm: number;
  titleBlock: TitleBlock;
  /**
   * Optional saved framing for the layout's viewport (AutoCAD pan/zoom inside
   * paper space). `offsetE`/`offsetN` recentre the sheet (survey units) and
   * `zoom` multiplies the plot scale (1 = the nominal 1:`scaleDenominator`).
   * When omitted, the sheet auto-centres on the drawing extents.
   */
  view?: { offsetE: number; offsetN: number; zoom: number };
  /**
   * Manual repositioning of sheet furniture (dragged in the plot preview),
   * as deltas in sheet millimetres from each element's default position.
   * Missing keys render at their defaults.
   */
  furnitureOffsets?: Partial<Record<FurnitureKey, { dx: number; dy: number }>>;
}

/** Sheet elements that can be dragged around in the plot preview. */
export type FurnitureKey =
  | "northArrow"
  | "scaleBar"
  | "legend"
  | "symbolLegend"
  | "beaconTable"
  | "approvalBlock"
  | "titleBlock";

export const FURNITURE_KEYS: FurnitureKey[] = [
  "northArrow",
  "scaleBar",
  "legend",
  "symbolLegend",
  "beaconTable",
  "approvalBlock",
  "titleBlock",
];

/**
 * The drawing frame rectangle (mm) for a sheet configuration — the area any
 * furniture may occupy. Exported so the preview can clamp dragged elements.
 */
export function sheetFrame(opts: Pick<PlotOptions, "paper" | "orientation" | "marginMm">): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const base = PAPER_MM[opts.paper];
  const land = opts.orientation === "landscape";
  const paperW = land ? base.w : base.h;
  const paperH = land ? base.h : base.w;
  const m = opts.marginMm;
  return { x: m, y: m, w: paperW - 2 * m, h: paperH - 2 * m };
}

export const DEFAULT_TITLE_BLOCK = (
  projectName: string,
  projectId: string,
  client: string,
  datum: string,
): TitleBlock => ({
  projectName,
  projectId,
  client,
  datum,
  surveyor: "",
  drawingTitle: "SURVEY PLAN",
  drawingNo: projectId,
  sheet: "1 of 1",
  revision: "A",
  date: new Date().toISOString().slice(0, 10),
});

export const DEFAULT_PLOT_OPTIONS = (tb: TitleBlock): PlotOptions => ({
  paper: "A3",
  orientation: "landscape",
  scaleDenominator: "fit",
  bearingFormat: "azimuth",
  axisConvention: "yx",
  showGrid: true,
  showLegend: true,
  showNorthArrow: true,
  showScaleBar: true,
  showPointLabels: true,
  // Bearings + distances along each boundary line are mandatory on
  // Zimbabwean general plans / diagrams, so default them on.
  showSegmentLabels: true,
  showBeaconTable: true,
  showApprovalBlock: true,
  marginMm: 10,
  titleBlock: tb,
});

interface BBox {
  minN: number;
  maxN: number;
  minE: number;
  maxE: number;
}

/** Bounding box (survey units) of all visible geometry, or null if empty. */
function modelBounds(model: CadModelState): BBox | null {
  // Running min/max — a large model's vertices cannot be spread into
  // Math.min(...arr) without overflowing the call stack.
  let minN = Infinity, maxN = -Infinity, minE = Infinity, maxE = -Infinity;
  const push = (n: number, e: number) => {
    if (!Number.isFinite(n) || !Number.isFinite(e)) return;
    if (n < minN) minN = n;
    if (n > maxN) maxN = n;
    if (e < minE) minE = e;
    if (e > maxE) maxE = e;
  };
  const visible = (layerId: string) => model.layers.find((l) => l.id === layerId)?.visible !== false;
  for (const p of model.points) { if (visible(p.layerId)) push(p.n, p.e); }
  for (const lw of model.linework) {
    if (!visible(lw.layerId)) continue;
    for (const v of lw.vertices) push(v.n, v.e);
  }
  for (const t of model.texts) { if (visible(t.layerId)) push(t.n, t.e); }
  for (const srf of model.surfaces) {
    if (!visible(srf.layerId)) continue;
    for (const v of srf.points) push(v.n, v.e);
  }
  // Native entities must take part in the fit — otherwise a drawing that is
  // only circles/arcs is framed by nothing (and clipped off the sheet).
  for (const a of model.arcs) {
    if (!visible(a.layerId) || !Number.isFinite(a.radius)) continue;
    let s = a.startAngle;
    while (s < 0) s += 360;
    let en = a.endAngle;
    while (en < s) en += 360;
    const steps = Math.max(2, Math.floor((en - s) / 30));
    for (let i = 0; i <= steps; i++) {
      const ang = (s + (en - s) * (i / steps)) * (Math.PI / 180);
      push(a.center.n + Math.sin(ang) * a.radius, a.center.e + Math.cos(ang) * a.radius);
    }
    push(a.center.n, a.center.e);
  }
  for (const c of model.circles) {
    if (!visible(c.layerId) || !Number.isFinite(c.radius)) continue;
    push(c.center.n - c.radius, c.center.e - c.radius);
    push(c.center.n + c.radius, c.center.e + c.radius);
  }
  for (const el of model.ellipses) {
    if (!visible(el.layerId) || !Number.isFinite(el.semiMajor)) continue;
    const rot = el.rotation * (Math.PI / 180);
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    for (let i = 0; i < 16; i++) {
      const t = (i / 16) * Math.PI * 2;
      const x = el.semiMajor * Math.cos(t);
      const y = el.semiMinor * Math.sin(t);
      push(el.center.n + x * sinR + y * cosR, el.center.e + x * cosR - y * sinR);
    }
    push(el.center.n, el.center.e);
  }
  for (const d of model.dimensions) {
    if (!visible(d.layerId)) continue;
    push(d.textPosition.n, d.textPosition.e);
    for (const v of d.defPoints) push(v.n, v.e);
  }
  for (const h of model.hatches) {
    if (!visible(h.layerId)) continue;
    for (const v of h.vertices) push(v.n, v.e);
    for (const hole of h.holes ?? []) for (const v of hole) push(v.n, v.e);
  }
  if (!Number.isFinite(minN)) return null;
  return { minN, maxN, minE, maxE };
}

/** Title-block band height (mm) by paper size. */
function titleBlockHeight(paper: PaperSize): number {
  return paper === "A4" ? 34 : paper === "A3" ? 40 : 46;
}

/**
 * The parcel boundary used for the extent figure and beacon schedule: the
 * closed linework with the largest polygon area. Null when the drawing has
 * no closed boundary.
 */
function parcelBoundary(model: CadModelState): SurveyLinework | null {
  let best: SurveyLinework | null = null;
  let bestAbs = 0;
  for (const lw of model.linework) {
    if (!lw.closed || lw.vertices.length < 3) continue;
    if (!layerVisibleById(model, lw.layerId)) continue;
    const abs = Math.abs(polygonArea(lw.vertices));
    if (abs > bestAbs) {
      bestAbs = abs;
      best = lw;
    }
  }
  return best;
}

function layerVisibleById(model: CadModelState, layerId: string): boolean {
  return model.layers.find((l) => l.id === layerId)?.visible !== false;
}

interface BeaconRow {
  label: string;
  e: number;
  n: number;
}

/**
 * Beacon rows for the schedule: boundary vertices labelled with the nearest
 * survey point's number when one coincides (≤5 cm), else a sequence number.
 */
function beaconRows(model: CadModelState, boundary: SurveyLinework): BeaconRow[] {
  return boundary.vertices.map((v, i) => {
    let match: SurveyPoint | undefined;
    let bestDist = 0.05; // metres — same-position tolerance
    for (const p of model.points) {
      const d = Math.hypot(p.n - v.n, p.e - v.e);
      if (d <= bestDist) {
        bestDist = d;
        match = p;
      }
    }
    return { label: match ? match.pointNo : `B${i + 1}`, e: v.e, n: v.n };
  });
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface PlotLayout {
  paperW: number;
  paperH: number;
  /** Inner drawing frame (mm). */
  frame: { x: number; y: number; w: number; h: number };
  /** Title block band (mm). */
  tb: { x: number; y: number; w: number; h: number };
}

/** Compute the sheet, frame and title-block rectangles (all mm). */
function computeLayout(opts: PlotOptions): PlotLayout {
  const base = PAPER_MM[opts.paper];
  const land = opts.orientation === "landscape";
  const paperW = land ? base.w : base.h;
  const paperH = land ? base.h : base.w;
  const m = opts.marginMm;
  const tbH = titleBlockHeight(opts.paper);
  const tbW = Math.min(paperW - 2 * m, opts.paper === "A4" ? 120 : 160);

  const frame = { x: m, y: m, w: paperW - 2 * m, h: paperH - 2 * m };
  const tb = { x: paperW - m - tbW, y: paperH - m - tbH, w: tbW, h: tbH };
  return { paperW, paperH, frame, tb };
}

/**
 * Determine the scale (mm-per-survey-unit) and the survey-coordinate origin
 * that maps the drawing centre to the frame centre at the chosen scale.
 */
function computeProjection(
  bounds: BBox | null,
  opts: PlotOptions,
  layout: PlotLayout,
): { mmPerUnit: number; denominator: number; originE: number; originN: number; cx: number; cy: number } {
  // The usable drawing area sits inside the frame but above the title block.
  const pad = 6; // mm inside the frame
  const areaX = layout.frame.x + pad;
  const areaY = layout.frame.y + pad;
  const areaW = layout.frame.w - 2 * pad;
  // Reserve the title-block strip height at the bottom of the frame.
  const areaH = layout.frame.h - 2 * pad - (layout.tb.h + 4);
  const cx = areaX + areaW / 2;
  const cy = areaY + areaH / 2;

  const view = opts.view;
  if (!bounds) {
    return { mmPerUnit: 1, denominator: 1, originE: 0, originN: 0, cx, cy };
  }

  const spanE = Math.max(bounds.maxE - bounds.minE, 1e-6);
  const spanN = Math.max(bounds.maxN - bounds.minN, 1e-6);

  let denominator: number;
  if (opts.scaleDenominator === "fit") {
    // mm available / (survey units * 1000 mm per m) → fit both axes.
    // AutoCAD "fit to paper": use the exact denominator so the drawing fills
    // the frame. Rounding up to a conventional scale (the old behaviour)
    // could leave the plan occupying barely half the sheet — pick an explicit
    // preset scale instead when a conventional ratio is required.
    const denomE = (spanE * 1000) / areaW;
    const denomN = (spanN * 1000) / areaH;
    denominator = Math.max(1, Math.ceil(Math.max(denomE, denomN)));
  } else {
    denominator = opts.scaleDenominator;
  }

  // Apply the saved layout zoom (AutoCAD viewport zoom inside paper space).
  // Zooming in (zoom > 1) tightens the scale; the denominator shrinks.
  const zoom = view && Number.isFinite(view.zoom) && view.zoom > 0 ? view.zoom : 1;
  const effDenominator =
    opts.scaleDenominator === "fit"
      ? Math.max(1, Math.ceil(denominator / zoom))
      : denominator;

  // 1 survey unit (metre) = (1000 / denominator) mm on paper.
  const mmPerUnit = 1000 / effDenominator;
  // Recentre by the saved pan offset (survey units), AutoCAD pan in layout.
  const originE = (bounds.minE + bounds.maxE) / 2 + (view?.offsetE ?? 0);
  const originN = (bounds.minN + bounds.maxN) / 2 + (view?.offsetN ?? 0);
  return { mmPerUnit, denominator: effDenominator, originE, originN, cx, cy };
}

export interface PlotResult {
  svg: string;
  /** Resolved scale denominator actually used (after "fit"). */
  denominator: number;
  paperW: number;
  paperH: number;
  paper: PaperSize;
  orientation: PaperOrientation;
  /** Millimetres per survey unit used for the plot (paper mm / ground unit). */
  mmPerUnit: number;
  /** Extent (hectares) of the largest closed boundary, when one exists. */
  extentHa: number | null;
}

/** Build the complete print-ready SVG sheet. */
export function buildPlotSvg(model: CadModelState, opts: PlotOptions): PlotResult {
  const layout = computeLayout(opts);
  const bounds = modelBounds(model);
  const proj = computeProjection(bounds, opts, layout);

  // Survey (n,e) → paper mm. North up: increasing N → decreasing y.
  const toPaper = (n: number, e: number): { x: number; y: number } => ({
    x: proj.cx + (e - proj.originE) * proj.mmPerUnit,
    y: proj.cy - (n - proj.originN) * proj.mmPerUnit,
  });

  const layerOf = (id: string): CadLayer | undefined => model.layers.find((l) => l.id === id);
  const layerVisible = (id: string): boolean => layerOf(id)?.visible !== false;

  const parts: string[] = [];

  // Clip path so geometry never spills over the frame.
  parts.push(
    `<clipPath id="frameClip"><rect x="${layout.frame.x}" y="${layout.frame.y}" ` +
      `width="${layout.frame.w}" height="${layout.frame.h}" /></clipPath>`,
  );

  // ── Sheet background + border ─────────────────────────────────────────────
  parts.push(`<rect x="0" y="0" width="${layout.paperW}" height="${layout.paperH}" fill="#ffffff" />`);
  parts.push(
    `<rect x="${layout.frame.x}" y="${layout.frame.y}" width="${layout.frame.w}" height="${layout.frame.h}" ` +
      `fill="none" stroke="#000" stroke-width="0.5" />`,
  );
  // Heavy outer trim line.
  parts.push(
    `<rect x="2" y="2" width="${layout.paperW - 4}" height="${layout.paperH - 4}" ` +
      `fill="none" stroke="#000" stroke-width="0.25" />`,
  );

  // ── Drawing content (clipped to frame) ────────────────────────────────────
  parts.push(`<g id="cadPlotDrawingGroup" clip-path="url(#frameClip)">`);

  if (opts.showGrid && bounds) {
    parts.push(renderGraticule(bounds, proj.denominator, toPaper, opts.axisConvention ?? "yx"));
  }
  parts.push(renderSurfaces(model, layerOf, layerVisible, toPaper));
  parts.push(renderNativeEntities(model, layerOf, layerVisible, toPaper));
  parts.push(renderLinework(model, layerOf, layerVisible, toPaper, opts));
  parts.push(renderTexts(model, layerOf, layerVisible, toPaper));
  parts.push(renderPoints(model, layerOf, layerVisible, toPaper, opts));

  parts.push(`</g>`);

  // ── Sheet furniture ───────────────────────────────────────────────────────
  // Each draggable element is wrapped in a group carrying data-furniture (the
  // plot preview hit-tests on it) plus its saved manual offset, if any.
  const furn = (key: FurnitureKey, svg: string): string => {
    const off = opts.furnitureOffsets?.[key];
    const dx = off?.dx ?? 0;
    const dy = off?.dy ?? 0;
    return (
      `<g data-furniture="${key}"` +
      (dx || dy ? ` transform="translate(${f(dx)},${f(dy)})"` : "") +
      `>${svg}</g>`
    );
  };

  const parcel = parcelBoundary(model);
  const extentHa = parcel ? Math.abs(polygonArea(parcel.vertices)) / 10_000 : null;

  if (opts.showNorthArrow) parts.push(furn("northArrow", renderNorthArrow(layout)));
  if (opts.showScaleBar)
    parts.push(furn("scaleBar", renderScaleBar(layout, proj.denominator, proj.mmPerUnit)));
  if (opts.showLegend) parts.push(furn("legend", renderLegend(model, layout)));
  if (opts.showLegend) parts.push(furn("symbolLegend", renderSymbolLegend(model, layout)));

  // Right-hand furniture stack above the title block: approval strip first,
  // then the beacon schedule on top of it (bottom-up). The stack anchors to
  // the title block's *effective* position so dragged layouts keep the
  // elements together; each element adds its own delta on top.
  const effectiveTbY = layout.tb.y + (opts.furnitureOffsets?.titleBlock?.dy ?? 0);
  const stackW = Math.min(64, layout.tb.w);
  const stackX = layout.tb.x + layout.tb.w - stackW;
  let stackBottom = effectiveTbY;
  if (opts.showBeaconTable && parcel) {
    const rows = beaconRows(model, parcel);
    const shown = Math.min(rows.length, 14);
    const schedH = 8 + (shown + (rows.length > shown ? 1 : 0)) * 4.6;
    const y = stackBottom - 4 - schedH;
    parts.push(
      furn(
        "beaconTable",
        renderBeaconTable(model, parcel, { x: stackX, y, w: stackW }, opts.axisConvention ?? "yx"),
      ),
    );
    stackBottom = y;
  }
  if (opts.showApprovalBlock) {
    const y = stackBottom - 4 - 16;
    parts.push(
      furn("approvalBlock", renderApprovalBlock({ x: stackX, y, w: stackW }, opts.titleBlock.checkedBy)),
    );
    stackBottom = y;
  }
  parts.push(furn("titleBlock", renderTitleBlock(layout, opts, proj.denominator, extentHa)));

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.paperW}mm" height="${layout.paperH}mm" ` +
    `viewBox="0 0 ${layout.paperW} ${layout.paperH}" font-family="Arial, Helvetica, sans-serif">` +
    parts.join("") +
    `</svg>`;

  return {
    svg,
    denominator: proj.denominator,
    paperW: layout.paperW,
    paperH: layout.paperH,
    paper: opts.paper,
    orientation: opts.orientation,
    mmPerUnit: proj.mmPerUnit,
    extentHa,
  };
}

// ── Renderers ────────────────────────────────────────────────────────────────

type ToPaper = (n: number, e: number) => { x: number; y: number };

function renderGraticule(
  bounds: BBox,
  denom: number,
  toPaper: ToPaper,
  axisConvention: AxisConvention,
): string {
  const ax = axisLabels(axisConvention);
  // Pick a ground spacing that yields ~30–50 mm grid squares on paper.
  const mmPerUnit = 1000 / denom;
  const targetMm = 40;
  const rawSpacing = targetMm / mmPerUnit;
  const pow = Math.pow(10, Math.floor(Math.log10(rawSpacing)));
  const spacing = [1, 2, 5, 10].map((m) => m * pow).find((c) => c >= rawSpacing) ?? rawSpacing;

  const startE = Math.ceil(bounds.minE / spacing) * spacing;
  const endE = Math.floor(bounds.maxE / spacing) * spacing;
  const startN = Math.ceil(bounds.minN / spacing) * spacing;
  const endN = Math.floor(bounds.maxN / spacing) * spacing;

  const lines: string[] = [`<g stroke="#c8c8c8" stroke-width="0.12" fill="#555" font-size="2">`];

  for (let e = startE; e <= endE + 1e-6; e += spacing) {
    const top = toPaper(bounds.maxN, e);
    const bot = toPaper(bounds.minN, e);
    lines.push(`<line x1="${f(top.x)}" y1="${f(top.y)}" x2="${f(bot.x)}" y2="${f(bot.y)}" />`);
    // Tick label (Easting axis) at top, labelled per the axis convention.
    lines.push(
      `<text x="${f(top.x)}" y="${f(top.y - 1)}" text-anchor="middle">${ax.easting} ${Math.round(e)}E</text>`,
    );
  }
  for (let n = startN; n <= endN + 1e-6; n += spacing) {
    const left = toPaper(n, bounds.minE);
    const right = toPaper(n, bounds.maxE);
    lines.push(`<line x1="${f(left.x)}" y1="${f(left.y)}" x2="${f(right.x)}" y2="${f(right.y)}" />`);
    lines.push(
      `<text x="${f(left.x - 1)}" y="${f(left.y)}" text-anchor="end" dominant-baseline="middle" ` +
        `transform="rotate(-90 ${f(left.x - 1)} ${f(left.y)})">${ax.northing} ${Math.round(n)}N</text>`,
    );
  }
  lines.push(`</g>`);
  return lines.join("");
}

function renderSurfaces(
  model: CadModelState,
  layerOf: (id: string) => CadLayer | undefined,
  layerVisible: (id: string) => boolean,
  toPaper: ToPaper,
): string {
  const out: string[] = [];
  for (const srf of model.surfaces) {
    if (!srf.visible || !layerVisible(srf.layerId)) continue;
    const color = layerOf(srf.layerId)?.color ?? "#888";
    const screen = srf.points.map((v) => toPaper(v.n, v.e));
    out.push(`<g stroke="${color}" stroke-width="0.1" fill="none" opacity="0.6">`);
    for (const t of srf.triangles) {
      const a = screen[t.a]; const b = screen[t.b]; const c = screen[t.c];
      if (!a || !b || !c) continue;
      out.push(`<polygon points="${f(a.x)},${f(a.y)} ${f(b.x)},${f(b.y)} ${f(c.x)},${f(c.y)}" />`);
    }
    out.push(`</g>`);
  }
  return out.join("");
}

function renderNativeEntities(
  model: CadModelState,
  layerOf: (id: string) => CadLayer | undefined,
  layerVisible: (id: string) => boolean,
  toPaper: ToPaper,
): string {
  const out: string[] = [];

  // Hatches first — fills sit under linework and symbols.
  for (const h of model.hatches) {
    if (!layerVisible(h.layerId)) continue;
    const color = resolveColor(h.color, layerOf(h.layerId)?.color, "#334155");
    const ring = h.vertices.map((v) => toPaper(v.n, v.e));
    if (ring.length < 3) continue;
    const pathOf = (pts: { x: number; y: number }[]) =>
      pts.map((p, i) => `${i === 0 ? "M" : "L"}${f(p.x)},${f(p.y)}`).join(" ") + " Z";
    const d = pathOf(ring) + (h.holes ?? []).map((hole) => {
      const hp = hole.map((v) => toPaper(v.n, v.e));
      return hp.length >= 3 ? " " + pathOf(hp).slice(0) : "";
    }).join("");
    out.push(
      `<path d="${d}" fill="${color}" fill-opacity="0.25" fill-rule="evenodd" stroke="${color}" stroke-width="0.25" />`,
    );
  }

  for (const c of model.circles) {
    if (!layerVisible(c.layerId) || !Number.isFinite(c.radius)) continue;
    const color = resolveColor(c.color, layerOf(c.layerId)?.color, "#333");
    const center = toPaper(c.center.n, c.center.e);
    const rim = toPaper(c.center.n, c.center.e + c.radius);
    const r = Math.hypot(rim.x - center.x, rim.y - center.y);
    out.push(`<circle cx="${f(center.x)}" cy="${f(center.y)}" r="${f(r)}" fill="none" stroke="${color}" stroke-width="0.3" />`);
  }

  for (const a of model.arcs) {
    if (!layerVisible(a.layerId) || !Number.isFinite(a.radius)) continue;
    const color = resolveColor(a.color, layerOf(a.layerId)?.color, "#333");
    const center = toPaper(a.center.n, a.center.e);
    const rim = toPaper(a.center.n, a.center.e + a.radius);
    const r = Math.hypot(rim.x - center.x, rim.y - center.y);
    const p1 = toPaper(
      a.center.n + Math.sin(a.startAngle * (Math.PI / 180)) * a.radius,
      a.center.e + Math.cos(a.startAngle * (Math.PI / 180)) * a.radius,
    );
    const p2 = toPaper(
      a.center.n + Math.sin(a.endAngle * (Math.PI / 180)) * a.radius,
      a.center.e + Math.cos(a.endAngle * (Math.PI / 180)) * a.radius,
    );
    // Same sweep resolution the viewport uses (paper y grows downward).
    const sweep = p2.x * (p1.y - center.y) + p1.x * (center.y - p2.y) + center.x * (p2.y - p1.y);
    let span = a.endAngle - a.startAngle;
    while (span < 0) span += 360;
    out.push(
      `<path d="M ${f(p1.x)} ${f(p1.y)} A ${f(r)} ${f(r)} 0 ${span > 180 ? 1 : 0} ${sweep > 0 ? 0 : 1} ${f(p2.x)} ${f(p2.y)}" ` +
        `fill="none" stroke="${color}" stroke-width="0.3" />`,
    );
  }

  for (const el of model.ellipses) {
    if (!layerVisible(el.layerId) || !Number.isFinite(el.semiMajor) || !Number.isFinite(el.semiMinor)) continue;
    const color = resolveColor(el.color, layerOf(el.layerId)?.color, "#333");
    const rot = el.rotation * (Math.PI / 180);
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const pts: string[] = [];
    for (let i = 0; i <= 32; i++) {
      const t = (i / 32) * Math.PI * 2;
      const x = el.semiMajor * Math.cos(t);
      const y = el.semiMinor * Math.sin(t);
      const s = toPaper(
        el.center.n + x * sinR + y * cosR,
        el.center.e + x * cosR - y * sinR,
      );
      pts.push(`${i === 0 ? "M" : "L"}${f(s.x)},${f(s.y)}`);
    }
    out.push(`<path d="${pts.join(" ")} Z" fill="none" stroke="${color}" stroke-width="0.3" />`);
  }

  for (const d of model.dimensions) {
    if (!layerVisible(d.layerId)) continue;
    const color = resolveColor(d.color, layerOf(d.layerId)?.color, "#333");
    const pts = d.defPoints.map((v) => toPaper(v.n, v.e));
    if (pts.length >= 2) {
      const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${f(p.x)},${f(p.y)}`).join(" ");
      out.push(`<path d="${path}" fill="none" stroke="${color}" stroke-width="0.22" />`);
    }
    const t = toPaper(d.textPosition.n, d.textPosition.e);
    out.push(`<text x="${f(t.x)}" y="${f(t.y)}" font-size="2.2" fill="${color}" text-anchor="middle">${esc(d.text)}</text>`);
  }

  return out.join("");
}

function renderLinework(
  model: CadModelState,
  layerOf: (id: string) => CadLayer | undefined,
  layerVisible: (id: string) => boolean,
  toPaper: ToPaper,
  opts: PlotOptions,
): string {
  const out: string[] = [];
  for (const lw of model.linework as SurveyLinework[]) {
    if (!layerVisible(lw.layerId)) continue;
    const color = resolveColor(lw.color, layerOf(lw.layerId)?.color, "#222");
    const pts = lw.vertices.map((v) => toPaper(v.n, v.e));
    if (pts.length < 2) continue;
    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${f(p.x)},${f(p.y)}`).join(" ") + (lw.closed ? " Z" : "");
    const w = lw.kind === "boundary" ? 0.5 : lw.kind === "polyline" ? 0.35 : 0.3;
    out.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linejoin="round" />`);

    // Linework labels (contour RLs, annotations) must appear on the printed
    // sheet, not only in the interactive viewport.
    if (lw.label) {
      const mid = lw.vertices[Math.floor(lw.vertices.length / 2)];
      const s = toPaper(mid.n, mid.e);
      out.push(`<text x="${f(s.x)}" y="${f(s.y - 0.6)}" font-size="1.8" fill="${color}" text-anchor="middle">${esc(lw.label)}</text>`);
    }

    if (opts.showSegmentLabels) {
      for (let i = 1; i < lw.vertices.length; i++) {
        const a = lw.vertices[i - 1];
        const b = lw.vertices[i];
        const inv = inverse(a, b);
        const mid = toPaper((a.n + b.n) / 2, (a.e + b.e) / 2);
        out.push(
          `<text x="${f(mid.x)}" y="${f(mid.y - 0.8)}" font-size="1.8" fill="#333" text-anchor="middle">` +
            `${esc(fmtBearing(inv.azimuth, opts.bearingFormat))} ${esc(fmtDistance(inv.distance))}</text>`,
        );
      }
    }
  }
  return out.join("");
}

function renderTexts(
  model: CadModelState,
  layerOf: (id: string) => CadLayer | undefined,
  layerVisible: (id: string) => boolean,
  toPaper: ToPaper,
): string {
  const out: string[] = [];
  for (const t of model.texts as SurveyText[]) {
    if (!layerVisible(t.layerId)) continue;
    const color = resolveColor(t.color, layerOf(t.layerId)?.color, "#111");
    const s = toPaper(t.n, t.e);
    out.push(`<text x="${f(s.x)}" y="${f(s.y)}" font-size="2.6" fill="${color}">${esc(t.text)}</text>`);
  }
  return out.join("");
}

function renderPoints(
  model: CadModelState,
  layerOf: (id: string) => CadLayer | undefined,
  layerVisible: (id: string) => boolean,
  toPaper: ToPaper,
  opts: PlotOptions,
): string {
  const out: string[] = [];
  for (const p of model.points as SurveyPoint[]) {
    if (!layerVisible(p.layerId)) continue;
    const color = resolveColor(p.color, layerOf(p.layerId)?.color, "#111");
    const s = toPaper(p.n, p.e);
    const feature = resolveFeature(p.code, PLOT_CODE_TABLE);
    if (feature.symbol === "dot") {
      // Plain survey point marker: small cross + dot.
      out.push(
        `<g stroke="${color}" stroke-width="0.18">` +
          `<line x1="${f(s.x - 1)}" y1="${f(s.y)}" x2="${f(s.x + 1)}" y2="${f(s.y)}" />` +
          `<line x1="${f(s.x)}" y1="${f(s.y - 1)}" x2="${f(s.x)}" y2="${f(s.y + 1)}" />` +
          `</g><circle cx="${f(s.x)}" cy="${f(s.y)}" r="0.35" fill="${color}" />`,
      );
    } else {
      // Cartographic symbol (~1.4 mm) driven by the feature code.
      out.push(
        `<g transform="translate(${f(s.x)} ${f(s.y)})" stroke="${color}" ` +
          `stroke-width="0.22" fill="${color}">${symbolMarkup(feature.symbol, 1.4)}</g>`,
      );
    }
    if (opts.showPointLabels) {
      const label = `${p.pointNo}${p.code ? ` ${p.code}` : ""}`;
      out.push(`<text x="${f(s.x + 1.4)}" y="${f(s.y - 1)}" font-size="2" fill="${color}">${esc(label)}</text>`);
    }
  }
  return out.join("");
}

function renderNorthArrow(layout: PlotLayout): string {
  // Place top-right, inside the frame.
  const cx = layout.frame.x + layout.frame.w - 14;
  const cy = layout.frame.y + 18;
  const r = 9;
  return (
    `<g transform="translate(${f(cx)} ${f(cy)})" stroke="#000" fill="#000">` +
    `<circle cx="0" cy="0" r="${r}" fill="none" stroke-width="0.25" />` +
    // Filled north needle (pointing up).
    `<polygon points="0,${-r} 3,3 0,0.5" fill="#000" />` +
    // Open south needle.
    `<polygon points="0,${-r} -3,3 0,0.5" fill="#fff" stroke-width="0.2" />` +
    `<polygon points="0,${r} 3,-3 0,-0.5" fill="#fff" stroke-width="0.2" />` +
    `<polygon points="0,${r} -3,-3 0,-0.5" fill="#fff" stroke-width="0.2" />` +
    `<text x="0" y="${-r - 1.5}" text-anchor="middle" font-size="3.5" font-weight="bold" stroke="none">N</text>` +
    `</g>`
  );
}

function renderScaleBar(layout: PlotLayout, denom: number, mmPerUnit: number): string {
  // Choose a "nice" ground length giving a 40–80 mm bar.
  const targetMm = 60;
  const rawGround = targetMm / mmPerUnit; // ground metres
  const pow = Math.pow(10, Math.floor(Math.log10(rawGround)));
  const ground = [1, 2, 5, 10].map((m) => m * pow).reduce((best, c) =>
    Math.abs(c * mmPerUnit - targetMm) < Math.abs(best * mmPerUnit - targetMm) ? c : best, pow);
  const barMm = ground * mmPerUnit;
  const segs = 4;
  const segMm = barMm / segs;
  const segGround = ground / segs;

  const x0 = layout.frame.x + 10;
  const y0 = layout.frame.y + layout.frame.h - layout.tb.h - 10;
  const h = 2.2;

  const out: string[] = [`<g font-size="2.4" fill="#000">`];
  for (let i = 0; i < segs; i++) {
    out.push(
      `<rect x="${f(x0 + i * segMm)}" y="${f(y0)}" width="${f(segMm)}" height="${h}" ` +
        `fill="${i % 2 === 0 ? "#000" : "#fff"}" stroke="#000" stroke-width="0.2" />`,
    );
    out.push(`<text x="${f(x0 + i * segMm)}" y="${f(y0 + h + 3)}" text-anchor="middle">${fmtGround(i * segGround)}</text>`);
  }
  out.push(`<text x="${f(x0 + barMm)}" y="${f(y0 + h + 3)}" text-anchor="middle">${fmtGround(ground)} m</text>`);
  out.push(`<text x="${f(x0)}" y="${f(y0 - 1.5)}" font-weight="bold">SCALE 1:${denom}</text>`);
  out.push(`</g>`);
  return out.join("");
}

function fmtGround(m: number): string {
  return Number.isInteger(m) ? String(m) : m.toFixed(1);
}

function renderLegend(model: CadModelState, layout: PlotLayout): string {
  // Legend lists layers that actually carry geometry and are visible.
  const used = new Set<string>();
  for (const p of model.points) used.add(p.layerId);
  for (const l of model.linework) used.add(l.layerId);
  for (const t of model.texts) used.add(t.layerId);
  for (const s of model.surfaces) used.add(s.layerId);
  const allLayers = model.layers.filter((l) => l.visible && used.has(l.id));
  if (!allLayers.length) return "";

  // Cap the rows so a layer-heavy drawing cannot run the legend off the sheet.
  const MAX_ROWS = 12;
  const layers = allLayers.slice(0, MAX_ROWS);
  const overflow = allLayers.length - layers.length;

  const rowH = 5;
  const w = 44;
  const h = 8 + (layers.length + (overflow > 0 ? 1 : 0)) * rowH;
  const x = layout.frame.x + 6;
  const y = layout.frame.y + 6;

  const out: string[] = [
    `<g font-size="2.4" fill="#000">`,
    `<rect x="${f(x)}" y="${f(y)}" width="${w}" height="${f(h)}" fill="#fff" stroke="#000" stroke-width="0.25" opacity="0.92" />`,
    `<text x="${f(x + 3)}" y="${f(y + 5)}" font-weight="bold">LEGEND</text>`,
  ];
  layers.forEach((l, i) => {
    const ry = y + 8 + i * rowH + rowH / 2;
    out.push(`<line x1="${f(x + 3)}" y1="${f(ry)}" x2="${f(x + 12)}" y2="${f(ry)}" stroke="${l.color}" stroke-width="0.8" />`);
    out.push(`<text x="${f(x + 14)}" y="${f(ry + 0.9)}">${esc(fitText(l.name, w - 16, 2.4))}</text>`);
  });
  if (overflow > 0) {
    const ry = y + 8 + layers.length * rowH + rowH / 2;
    out.push(`<text x="${f(x + 3)}" y="${f(ry + 0.9)}" fill="#666">+ ${overflow} more layer${overflow === 1 ? "" : "s"}</text>`);
  }
  out.push(`</g>`);
  return out.join("");
}

/**
 * Legend of the feature *symbols* present in the drawing (as distinct from the
 * layer legend). Placed under the layer legend at top-left. Only symbols that
 * are actually used by at least one point are listed.
 */
function renderSymbolLegend(model: CadModelState, layout: PlotLayout): string {
  const used = new Map<string, { symbol: ReturnType<typeof resolveFeature>["symbol"]; label: string }>();
  for (const p of model.points) {
    const feat = resolveFeature(p.code, PLOT_CODE_TABLE);
    if (feat.symbol === "dot") continue;
    if (!used.has(feat.symbol)) used.set(feat.symbol, { symbol: feat.symbol, label: feat.description });
  }
  if (used.size === 0) return "";

  const MAX_ROWS = 10;
  const allEntries = [...used.values()];
  const entries = allEntries.slice(0, MAX_ROWS);
  const overflow = allEntries.length - entries.length;

  const rowH = 5;
  const w = 44;
  const h = 8 + (entries.length + (overflow > 0 ? 1 : 0)) * rowH;
  const x = layout.frame.x + 6;
  // Position directly below the layer legend, using the same capped row
  // count the layer legend actually renders (12 rows + overflow line max).
  const usedLayerIds = new Set<string>();
  for (const p of model.points) usedLayerIds.add(p.layerId);
  for (const l of model.linework) usedLayerIds.add(l.layerId);
  for (const t of model.texts) usedLayerIds.add(t.layerId);
  for (const s of model.surfaces) usedLayerIds.add(s.layerId);
  const legendLayerCount = model.layers.filter((l) => l.visible && usedLayerIds.has(l.id)).length;
  const legendRows = Math.min(legendLayerCount, 12) + (legendLayerCount > 12 ? 1 : 0);
  const legendH = legendLayerCount > 0 ? 8 + legendRows * rowH : 0;
  const y = layout.frame.y + 6 + legendH + (legendH > 0 ? 4 : 0);

  const out: string[] = [
    `<g font-size="2.4" fill="#000">`,
    `<rect x="${f(x)}" y="${f(y)}" width="${w}" height="${f(h)}" fill="#fff" stroke="#000" stroke-width="0.25" opacity="0.92" />`,
    `<text x="${f(x + 3)}" y="${f(y + 5)}" font-weight="bold">SYMBOLS</text>`,
  ];
  entries.forEach((e, i) => {
    const ry = y + 8 + i * rowH + rowH / 2;
    out.push(
      `<g transform="translate(${f(x + 7)} ${f(ry)})" stroke="#000" stroke-width="0.22" fill="#000">` +
        `${symbolMarkup(e.symbol, 1.3)}</g>`,
    );
    out.push(`<text x="${f(x + 14)}" y="${f(ry + 0.9)}">${esc(fitText(e.label, w - 16, 2.4))}</text>`);
  });
  if (overflow > 0) {
    const ry = y + 8 + entries.length * rowH + rowH / 2;
    out.push(`<text x="${f(x + 3)}" y="${f(ry + 0.9)}" fill="#666">+ ${overflow} more</text>`);
  }
  out.push(`</g>`);
  return out.join("");
}

/**
 * Truncate a title-block value so it cannot spill outside its cell. Widths
 * are approximate (Arial ≈ 0.52 em per character at these sizes).
 */
function fitText(value: string, cellWidthMm: number, fontSizeMm: number): string {
  const maxChars = Math.max(4, Math.floor((cellWidthMm - 3) / (fontSizeMm * 0.52)));
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars - 1)}…`;
}

/**
 * Beacon schedule: BEACON | Y (EASTING) | X (NORTHING) rows for the parcel
 * boundary, right-aligned above the title block. Coordinates print at 3 dp
 * as filed on Zimbabwean general plans.
 */
function renderBeaconTable(
  model: CadModelState,
  boundary: SurveyLinework,
  rect: { x: number; y: number; w: number },
  axisConvention: AxisConvention,
): string {
  const ax = axisLabels(axisConvention);
  const rows = beaconRows(model, boundary);
  const MAX_ROWS = 14;
  const shown = rows.slice(0, MAX_ROWS);
  const overflow = rows.length - shown.length;

  const w = rect.w;
  const rowH = 4.6;
  const h = 8 + (shown.length + (overflow > 0 ? 1 : 0)) * rowH;
  const x = rect.x;
  const y = rect.y;

  const colBeaconX = x + 2.5;
  const colYX = x + w * 0.38;
  const colXX = x + w * 0.7;

  const out: string[] = [
    `<g font-size="2.3" fill="#000">`,
    `<rect x="${f(x)}" y="${f(y)}" width="${w}" height="${f(h)}" fill="#fff" stroke="#000" stroke-width="0.35" />`,
    `<text x="${f(colBeaconX)}" y="${f(y + 5.2)}" font-weight="bold">BEACON</text>`,
    `<text x="${f(colYX)}" y="${f(y + 5.2)}">${esc(ax.easting)} (EASTING)</text>`,
    `<text x="${f(colXX)}" y="${f(y + 5.2)}">${esc(ax.northing)} (NORTHING)</text>`,
    `<line x1="${f(x)}" y1="${f(y + 6.8)}" x2="${f(x + w)}" y2="${f(y + 6.8)}" stroke="#000" stroke-width="0.25" />`,
  ];
  shown.forEach((r, i) => {
    const ry = y + 8 + i * rowH + rowH / 2 + 0.8;
    out.push(`<text x="${f(colBeaconX)}" y="${f(ry)}">${esc(fitText(r.label, 14, 2.3))}</text>`);
    out.push(`<text x="${f(colYX)}" y="${f(ry)}">${r.e.toFixed(3)}</text>`);
    out.push(`<text x="${f(colXX)}" y="${f(ry)}">${r.n.toFixed(3)}</text>`);
  });
  if (overflow > 0) {
    const ry = y + 8 + shown.length * rowH + rowH / 2 + 0.8;
    out.push(`<text x="${f(colBeaconX)}" y="${f(ry)}" fill="#666">+ ${overflow} more beacon${overflow === 1 ? "" : "s"}</text>`);
  }
  out.push(`</g>`);
  return out.join("");
}

/**
 * Surveyor-General approval strip: certification wording, signature rule and
 * date rule.
 */
function renderApprovalBlock(
  rect: { x: number; y: number; w: number },
  checkedBy: string | undefined,
): string {
  const w = rect.w;
  const h = 16;
  const x = rect.x;
  const y = rect.y;

  return (
    `<g font-size="2.3" fill="#000">` +
    `<rect x="${f(x)}" y="${f(y)}" width="${w}" height="${h}" fill="#fff" stroke="#000" stroke-width="0.35" />` +
    `<text x="${f(x + 3)}" y="${f(y + 5.4)}" font-weight="bold">CERTIFIED CORRECT</text>` +
    `<text x="${f(x + 3)}" y="${f(y + 9.2)}" fill="#333">Surveyor-General · Harare · ZIMBABWE</text>` +
    `<line x1="${f(x + 3)}" y1="${f(y + h - 3.2)}" x2="${f(x + w * 0.55)}" y2="${f(y + h - 3.2)}" stroke="#000" stroke-width="0.22" />` +
    `<line x1="${f(x + w * 0.62)}" y1="${f(y + h - 3.2)}" x2="${f(x + w - 3)}" y2="${f(y + h - 3.2)}" stroke="#000" stroke-width="0.22" />` +
    `<text x="${f(x + 3)}" y="${f(y + h - 0.9)}" font-size="1.9" fill="#666">${esc(checkedBy ? `Checked: ${fitText(checkedBy, 24, 1.9)}` : "Signature")}</text>` +
    `<text x="${f(x + w * 0.62)}" y="${f(y + h - 0.9)}" font-size="1.9" fill="#666">Date</text>` +
    `</g>`
  );
}

function renderTitleBlock(layout: PlotLayout, opts: PlotOptions, denom: number, extentHa: number | null): string {
  const { tb } = layout;
  const t = opts.titleBlock;
  const x = tb.x;
  const y = tb.y;
  const w = tb.w;
  const h = tb.h;

  // A grid of labelled cells, AutoCAD title-block style.
  const out: string[] = [`<g font-size="2.4" fill="#000">`];
  out.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="#fff" stroke="#000" stroke-width="0.5" />`);

  // Header band: drawing title + plan designation.
  const headerH = h * 0.26;
  out.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(headerH)}" fill="#f0f0f0" stroke="#000" stroke-width="0.3" />`);
  out.push(
    `<text x="${f(x + w / 2)}" y="${f(y + headerH / 2 + 1.5)}" text-anchor="middle" font-size="4.2" font-weight="bold">` +
      `${esc(fitText(t.drawingTitle || "SURVEY PLAN", w, 4.2))}</text>`,
  );
  if (t.planNo) {
    out.push(
      `<text x="${f(x + w - 1.5)}" y="${f(y + headerH / 2 + 1.5)}" text-anchor="end" font-size="3" font-weight="bold">${esc(fitText(t.planNo, w * 0.4, 3))}</text>`,
    );
  }

  // Body: two columns of key/value cells.
  const bodyY = y + headerH;
  // Footer strip inside the block carries datum (left) and sheet/rev (right),
  // freeing both grid rows for the plan-specific fields.
  const footerH = h * 0.12;
  const bodyH = h - headerH - footerH;
  const rows = 4;
  const rowH = bodyH / rows;
  const colX = x + w * 0.5;

  // Vertical divider + row lines.
  out.push(`<line x1="${f(colX)}" y1="${f(bodyY)}" x2="${f(colX)}" y2="${f(y + h - footerH)}" stroke="#000" stroke-width="0.3" />`);
  for (let r = 1; r < rows; r++) {
    const ly = bodyY + r * rowH;
    out.push(`<line x1="${f(x)}" y1="${f(ly)}" x2="${f(x + w)}" y2="${f(ly)}" stroke="#000" stroke-width="0.2" />`);
  }

  const cellW = w / 2;
  const cell = (cx: number, ry: number, label: string, value: string) => {
    out.push(`<text x="${f(cx + 1.5)}" y="${f(ry + 2)}" font-size="1.8" fill="#666">${esc(label)}</text>`);
    out.push(
      `<text x="${f(cx + 1.5)}" y="${f(ry + rowH - 1)}" font-size="2.6" font-weight="bold">` +
        `${esc(fitText(value || "—", cellW, 2.6))}</text>`,
    );
  };

  const surveyorValue = t.surveyorRegNo
    ? `${t.surveyor || "—"} · ${t.surveyorRegNo}`
    : t.surveyor;

  // Left column — the land.
  cell(x, bodyY + 0 * rowH, "PROPERTY", t.property || t.projectName);
  cell(x, bodyY + 1 * rowH, "OWNER / APPLICANT", t.owner || t.client);
  cell(x, bodyY + 2 * rowH, "LOCALITY", t.locality ?? "");
  cell(x, bodyY + 3 * rowH, "EXTENT", extentHa != null ? `${extentHa.toFixed(4)} ha` : "");

  // Right column — the plan administration.
  cell(colX, bodyY + 0 * rowH, "PLAN No.", t.planNo || t.drawingNo);
  cell(colX, bodyY + 1 * rowH, "SCALE", `1:${denom}`);
  cell(colX, bodyY + 2 * rowH, "DATE OF SURVEY", t.date);
  cell(colX, bodyY + 3 * rowH, "SURVEYOR", surveyorValue);

  // Footer strip: grid/datum note left, sheet/revision right.
  const footY = y + h - footerH;
  out.push(`<line x1="${f(x)}" y1="${f(footY)}" x2="${f(x + w)}" y2="${f(footY)}" stroke="#000" stroke-width="0.25" />`);
  out.push(`<text x="${f(x + 1.5)}" y="${f(footY + footerH - 1)}" font-size="1.9" fill="#333">${esc(fitText(t.datum ? `Grid: ${t.datum}` : "", w * 0.62, 1.9))}</text>`);
  out.push(`<text x="${f(x + w - 1.5)}" y="${f(footY + footerH - 1)}" text-anchor="end" font-size="1.9" fill="#333">Sheet ${esc(t.sheet)} · Rev ${esc(t.revision)}</text>`);

  out.push(`</g>`);
  return out.join("");
}

/** Trim mm coordinates to 3 dp to keep the SVG compact. */
function f(v: number): string {
  return (Math.round(v * 1000) / 1000).toString();
}

/**
 * Open the plot SVG in a new window sized to the sheet.
 *
 * On screen the sheet is scaled to fit the window (so A1/A0 sheets are fully
 * visible instead of being cropped) with a print-preview toolbar: zoom in/out
 * around the fit scale, a live zoom percentage, fit-to-window, and keyboard
 * support (+ / − / 0 / Escape). On paper it prints at true physical size via
 * the matching `@page` rule.
 */
export function openPlotWindow(result: PlotResult, title: string): void {
  const win = window.open("", "_blank");
  if (!win) return;
  const html =
    `<!DOCTYPE html><html><head><title>${esc(title)}</title>` +
    `<style>` +
    // Explicit mm page dimensions: keyword sizes ("A3 landscape") are handled
    // inconsistently across browsers and can trigger shrink-to-fit, leaving
    // the plan floating small on the page with white margins.
    `@page { size: ${result.paperW}mm ${result.paperH}mm; margin: 0; }` +
    `* { box-sizing: border-box; }` +
    `html, body { margin: 0; padding: 0; width: 100%; height: 100%; }` +
    `body { background: radial-gradient(circle at 50% 38%, #4b4f55, #33363a); ` +
    `-webkit-print-color-adjust: exact; print-color-adjust: exact; ` +
    `font: 12.5px/1.3 ui-sans-serif, system-ui, "Segoe UI", Arial, sans-serif; color: #e8eaed; }` +
    `.stage { position: fixed; inset: 0; top: 48px; display: flex; align-items: center; justify-content: center; overflow: hidden; }` +
    // On screen the sheet is sized in px by the fit script (largest size that
    // fits the window, preserving the paper aspect ratio). Sizing the layout
    // box directly — rather than transform-scaling a full-physical-size box —
    // keeps flex centering correct, so the sheet is never clipped.
    `.sheet { background: #fff; flex: none; overflow: hidden; border-radius: 2px;` +
    `box-shadow: 0 10px 40px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.07); }` +
    `.sheet svg { display: block; width: 100%; height: 100%; }` +
    `.toolbar { position: fixed; top: 0; left: 0; right: 0; height: 48px; z-index: 10; ` +
    `display: flex; align-items: center; gap: 14px; padding: 0 14px; background: #23262a; ` +
    `border-bottom: 1px solid rgba(255,255,255,0.08); box-shadow: 0 2px 8px rgba(0,0,0,0.35); }` +
    `.toolbar .meta { min-width: 0; flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }` +
    `.toolbar .meta b { display: block; font-size: 13px; font-weight: 600; letter-spacing: -0.01em; }` +
    `.toolbar .meta span { display: block; font-size: 11px; color: #9aa0a6; }` +
    `.zoomgroup { display: flex; align-items: stretch; border: 1px solid rgba(255,255,255,0.14); border-radius: 7px; overflow: hidden; }` +
    `.zoomgroup button { width: 30px; height: 30px; border: 0; background: transparent; color: #e8eaed; ` +
    `font: 15px/1 inherit; cursor: pointer; }` +
    `.zoomgroup button:hover:not(:disabled) { background: rgba(255,255,255,0.09); }` +
    `.zoomgroup button:disabled { opacity: 0.35; cursor: default; }` +
    `.zoomgroup .pct { min-width: 52px; display: flex; align-items: center; justify-content: center; ` +
    `font-variant-numeric: tabular-nums; font-size: 12px; color: #cfd3d7; border-left: 1px solid rgba(255,255,255,0.14); ` +
    `border-right: 1px solid rgba(255,255,255,0.14); }` +
    `.toolbar .fitbtn { border: 1px solid rgba(255,255,255,0.14); background: transparent; color: #e8eaed; ` +
    `height: 32px; padding: 0 12px; border-radius: 7px; font: inherit; font-size: 12.5px; cursor: pointer; }` +
    `.toolbar .fitbtn:hover { background: rgba(255,255,255,0.09); }` +
    `.toolbar button.print { border: 0; border-radius: 7px; height: 32px; padding: 0 16px; ` +
    `background: #1473e6; color: #fff; font-weight: 600; font-size: 12.5px; cursor: pointer; }` +
    `.toolbar button.close { border: 1px solid rgba(255,255,255,0.14); background: transparent; ` +
    `color: #e8eaed; height: 32px; padding: 0 14px; border-radius: 7px; font: inherit; font-size: 12.5px; cursor: pointer; }` +
    `.toolbar button.print:hover { filter: brightness(1.12); }` +
    `.toolbar button.close:hover { background: rgba(255,255,255,0.09); }` +
    `.toolbar button:focus-visible, .zoomgroup button:focus-visible { outline: 2px solid #1473e6; outline-offset: 1px; }` +
    `@media print { ` +
    `html, body { background: #fff; width: auto; height: auto; overflow: visible; margin: 0; padding: 0; } ` +
    `.toolbar { display: none; } ` +
    `.stage { position: static; inset: auto; display: block; width: auto; height: auto; overflow: visible; } ` +
    `.sheet { box-shadow: none; margin: 0; width: ${result.paperW}mm !important; height: ${result.paperH}mm !important; ` +
    `page-break-inside: avoid; break-inside: avoid; } ` +
    `.sheet svg { width: ${result.paperW}mm !important; height: ${result.paperH}mm !important; } ` +
    `}` +
    `</style></head><body>` +
    `<div class="toolbar">` +
    `<div class="meta"><b>${esc(title)}</b>` +
    `<span>${result.paper} ${result.orientation} · scale 1:${result.denominator}</span></div>` +
    `<div class="zoomgroup" role="group" aria-label="Zoom">` +
    `<button type="button" id="zOut" aria-label="Zoom out" title="Zoom out (−)">−</button>` +
    `<span class="pct" id="zPct">100%</span>` +
    `<button type="button" id="zIn" aria-label="Zoom in" title="Zoom in (+)">+</button>` +
    `</div>` +
    `<button type="button" class="fitbtn" id="zFit" title="Fit to window (0)">Fit</button>` +
    `<button type="button" class="print" onclick="window.print()">Print / Save PDF</button>` +
    `<button type="button" class="close" onclick="window.close()">Close</button>` +
    `</div>` +
    `<div class="stage"><div class="sheet" id="sheet">${result.svg}</div></div>` +
    `<script>` +
    `(function(){` +
    `var sheet=document.getElementById("sheet");` +
    `var pct=document.getElementById("zPct");` +
    `var zin=document.getElementById("zIn");` +
    `var zout=document.getElementById("zOut");` +
    `var ratio=${result.paperW}/${result.paperH};` +
    `var PX_PER_MM=${96 / 25.4};` +
    `var userZoom=1;` + // multiplier on top of the base fit scale
    `function clamp(v){return Math.min(8,Math.max(0.25,v));}` +
    `function fitScale(){` +
    `var stage=sheet.parentElement; var pad=28;` +
    `var sw=Math.max(stage.clientWidth-pad,50), sh=Math.max(stage.clientHeight-pad,50);` +
    `return Math.min(sw, sh*ratio)/(${result.paperW}*PX_PER_MM);` + // px per mm relative to physical
    `}` +
    `function apply(){` +
    `var stage=sheet.parentElement; var pad=28;` +
    `var sw=Math.max(stage.clientWidth-pad,50), sh=Math.max(stage.clientHeight-pad,50);` +
    `var wPx=Math.min(sw, sh*ratio)*userZoom;` +
    `if(wPx<80){wPx=80;userZoom=wPx/(Math.min(sw,sh*ratio));}` +
    `if(wPx>sw*8){wPx=sw*8;userZoom=8;}` +
    `var h=wPx/ratio;` +
    `sheet.style.width=wPx+"px"; sheet.style.height=h+"px";` +
    `pct.textContent=Math.round((wPx/(${result.paperW}*PX_PER_MM))*100)+"%";` +
    `zin.disabled=userZoom>=7.999; zout.disabled=userZoom<=0.2501||wPx<=80.01;` +
    `}` +
    `function step(mult){userZoom=clamp(userZoom*mult);apply();}` +
    `zin.addEventListener("click",function(){step(1.25);});` +
    `zout.addEventListener("click",function(){step(0.8);});` +
    `document.getElementById("zFit").addEventListener("click",function(){userZoom=1;apply();});` +
    `window.addEventListener("resize",apply);` +
    `document.addEventListener("keydown",function(e){` +
    `if(e.key==="Escape"){window.close();}` +
    `else if(e.key==="+"||e.key==="="){step(1.25);}` +
    `else if(e.key==="-"||e.key==="_"){step(0.8);}` +
    `else if(e.key==="0"){userZoom=1;apply();}` +
    `});` +
    `window.addEventListener("beforeprint",function(){` +
    `sheet.style.width="${result.paperW}mm";` +
    `sheet.style.height="${result.paperH}mm";` +
    `});` +
    `window.addEventListener("afterprint",apply);` +
    `apply();` +
    `window.onload=function(){apply();};` +
    `})();` +
    `</script>` +
    `</body></html>`;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
}
