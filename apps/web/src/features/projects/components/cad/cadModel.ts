/**
 * Engineering Surveyor CAD domain model.
 *
 * All geometry uses survey coordinates. Internally the fields are `e`, `n`, `z`
 * which map to the user-facing X (Easting), Y (Northing) and Z (Elevation/RL)
 * terminology used in the UI. The viewport converts these to screen pixels for
 * rendering.
 */

export type CadToolId =
  | "select"
  | "pan"
  | "point"
  | "line"
  | "boundary"
  | "text"
  | "spot-height"
  | "control-point"
  | "measure"
  | "move"
  | "copy"
  | "rotate"
  | "scale"
  | "mirror"
  | "offset"
  | "dim-linear"
  | "circle"
  | "arc"
  | "zoom-window";

export type LayerId = string;

/**
 * Object colour. `null` / undefined means "ByLayer" (inherit the layer colour,
 * the AutoCAD default). A hex string overrides it with an explicit colour.
 */
export type CadColor = string | null;

export interface CadLayer {
  id: LayerId;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
}

export interface SurveyPoint {
  id: string;
  /** Surveyor point number/label, e.g. "1001" or "CP1". */
  pointNo: string;
  n: number;
  e: number;
  z: number | null;
  code: string;
  layerId: LayerId;
  /** Explicit object colour; null/undefined = ByLayer. */
  color?: CadColor;
}

export type LineworkKind = "line" | "polyline" | "boundary";

export interface SurveyLinework {
  id: string;
  kind: LineworkKind;
  /** Vertices in survey coordinates. */
  vertices: { n: number; e: number }[];
  layerId: LayerId;
  /** Closed ring (boundary/parcel). */
  closed: boolean;
  /** Explicit object colour; null/undefined = ByLayer. */
  color?: CadColor;
  /** Optional label shown along the linework (e.g. contour elevation). */
  label?: string;
}

export interface SurveyArc {
  id: string;
  center: { n: number; e: number };
  radius: number;
  /** Start angle in degrees, counter-clockwise from the X (Easting) axis. */
  startAngle: number;
  /** End angle in degrees, counter-clockwise from the X (Easting) axis. */
  endAngle: number;
  layerId: LayerId;
  /** Explicit object colour; null/undefined = ByLayer. */
  color?: CadColor;
}

export interface SurveyCircle {
  id: string;
  center: { n: number; e: number };
  radius: number;
  layerId: LayerId;
  /** Explicit object colour; null/undefined = ByLayer. */
  color?: CadColor;
}

export interface SurveyEllipse {
  id: string;
  center: { n: number; e: number };
  semiMajor: number;
  semiMinor: number;
  /** Rotation of the semi-major axis in degrees, CCW from the X (Easting) axis. */
  rotation: number;
  layerId: LayerId;
  /** Explicit object colour; null/undefined = ByLayer. */
  color?: CadColor;
}

export interface SurveyDimension {
  id: string;
  kind: "linear" | "aligned" | "radial" | "diameter" | "angular" | "ordinate";
  text: string;
  textPosition: { n: number; e: number };
  /** Definition points / pick points for the dimension. */
  defPoints: { n: number; e: number }[];
  /** Rotation for linear/ordinate dimensions, degrees. */
  angle?: number | null;
  layerId: LayerId;
  /** Explicit object colour; null/undefined = ByLayer. */
  color?: CadColor;
}

export interface SurveyHatch {
  id: string;
  /** Outer boundary vertices. */
  vertices: { n: number; e: number }[];
  /** Inner hole boundaries. */
  holes: { n: number; e: number }[][];
  /** Pattern name (e.g. "SOLID", "ANGLE"). */
  pattern?: string | null;
  patternScale?: number | null;
  patternAngle?: number | null;
  layerId: LayerId;
  /** Explicit object colour; null/undefined = ByLayer. */
  color?: CadColor;
}

export interface SurveyText {
  id: string;
  n: number;
  e: number;
  text: string;
  layerId: LayerId;
  /** Explicit object colour; null/undefined = ByLayer. */
  color?: CadColor;
  /** Text height in world units (e.g. from DXF TextHeight). */
  height?: number;
  /** Rotation in degrees, counter-clockwise from the X (Easting) axis. */
  rotation?: number;
}

/**
 * A triangulated surface (TIN / digital terrain model) generated from survey
 * points. Triangles reference indices into `points`. Rendered as a wireframe;
 * contours derived from it are emitted as ordinary linework on the CONTOURS
 * layer so they export to DXF and print in reports like any other linework.
 */
export interface SurveySurface {
  id: string;
  name: string;
  points: { n: number; e: number; z: number }[];
  triangles: { a: number; b: number; c: number }[];
  layerId: LayerId;
  /** Whether the TIN wireframe is drawn in the viewport. */
  visible: boolean;
  /**
   * Optional cut/fill overlay. When present the surface is a computed
   * earthworks model: each entry mirrors a TIN triangle (same vertex indices
   * into `points`) with a signed mean height difference (`delta`): positive =
   * cut, negative = fill. The 3D viewport shades these red (cut) → blue (fill)
   * so the volume result is visible as a 3D model, not just a number.
   */
  cutFill?: SurfaceCutFill;
  /**
   * Optional slope-analysis overlay. When present each triangle carries a
   * precomputed colour (green→yellow→red by slope) so the 3D viewport renders
   * a slope-shaded DTM. Triangles are keyed by their vertex indices, matching
   * the `cutFill` mechanism.
   */
  slopeShade?: SurfaceSlopeShade;
}

export interface SurfaceSlopeShadeTriangle {
  a: number;
  b: number;
  c: number;
  /** Slope angle from horizontal, degrees. */
  slopeDeg: number;
  /** Precomputed CSS/hex colour for this triangle. */
  color: string;
}

export interface SurfaceSlopeShade {
  triangles: SurfaceSlopeShadeTriangle[];
  /** Maximum slope (deg) used to scale the colour ramp. */
  maxSlope: number;
}

export interface SurfaceCutFillTriangle {
  a: number;
  b: number;
  c: number;
  /** Signed mean height difference over the triangle (m). +cut / −fill. */
  delta: number;
  /** Signed prism volume for the triangle (m³). +cut / −fill. */
  volume: number;
}

export interface SurfaceCutFill {
  triangles: SurfaceCutFillTriangle[];
  /** Largest cut delta (>= 0), for symmetric colour scaling. */
  maxCut: number;
  /** Largest fill delta magnitude (>= 0), for symmetric colour scaling. */
  maxFill: number;
  /** How the overlay was computed, for labels/legend. */
  mode: "elevation" | "between";
  /** Reference RL used when `mode` is "elevation". */
  reference?: number;
}

export type CadEntity =
  | { type: "point"; data: SurveyPoint }
  | { type: "linework"; data: SurveyLinework }
  | { type: "text"; data: SurveyText }
  | { type: "surface"; data: SurveySurface }
  | { type: "arc"; data: SurveyArc }
  | { type: "circle"; data: SurveyCircle }
  | { type: "ellipse"; data: SurveyEllipse }
  | { type: "dimension"; data: SurveyDimension }
  | { type: "hatch"; data: SurveyHatch };

export type CadEntityType = "point" | "linework" | "text" | "surface" | "arc" | "circle" | "ellipse" | "dimension" | "hatch";

/**
 * Current selection. Backward compatible with the old single-selection shape
 * (`type` + `id`), but also carries a full set of selected entities so the
 * viewport can support AutoCAD-style window/crossing and shift multi-select.
 *
 * `type`/`id` reflect the *primary* (last-picked) entity, used by the
 * Properties panel; `items` holds every selected entity.
 */
export interface SelectedItem {
  type: CadEntityType;
  id: string;
}

export interface CadSelection {
  type: CadEntityType | null;
  id: string | null;
  /** All selected entities (includes the primary one). */
  items?: SelectedItem[];
}

export const EMPTY_SELECTION: CadSelection = { type: null, id: null, items: [] };

/** Build a selection from a list of items, exposing the last one as primary. */
export function selectionFromItems(items: SelectedItem[]): CadSelection {
  if (items.length === 0) return { type: null, id: null, items: [] };
  const primary = items[items.length - 1];
  return { type: primary.type, id: primary.id, items };
}

/** True when an entity is part of the current selection. */
export function isSelected(sel: CadSelection, type: CadEntityType, id: string): boolean {
  if (sel.items && sel.items.length) {
    return sel.items.some((it) => it.type === type && it.id === id);
  }
  return sel.type === type && sel.id === id;
}

/**
 * AutoCAD-style colour palette for the per-object colour picker.
 * The first entry (null) is "ByLayer".
 */
export const CAD_COLORS: { value: CadColor; label: string }[] = [
  { value: null, label: "ByLayer" },
  { value: "#ffffff", label: "White" },
  { value: "#ff0000", label: "Red" },
  { value: "#ff7a00", label: "Orange" },
  { value: "#ffff00", label: "Yellow" },
  { value: "#22c55e", label: "Green" },
  { value: "#22d3ee", label: "Cyan" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#a855f7", label: "Magenta" },
  { value: "#94a3b8", label: "Grey" },
];

/** Resolve the colour an object is drawn with: explicit colour, else the layer's. */
export function resolveColor(
  objColor: CadColor | undefined,
  layerColor: string | undefined,
  fallback = "#334155",
): string {
  if (objColor) return objColor;
  return layerColor ?? fallback;
}

// ── Light-theme colour mapping for the 2D canvas ──────────────────────────
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  let s = m[1];
  if (s.length === 3) {
    s = s.split("").map((c) => c + c).join("");
  }
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case R:
        h = (G - B) / d + (G < B ? 6 : 0);
        break;
      case G:
        h = (B - R) / d + 2;
        break;
      case B:
        h = (R - G) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Map a colour to one that is readable on the white CAD canvas. */
export function canvasColor(color: string): string {
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  // Relative luminance (Y in Rec. 601 space).
  const luma = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  if (luma <= 0.6) return color;
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const newL = Math.max(0.15, Math.min(0.45, 1 - hsl.l));
  return rgbToHex(hslToRgb(hsl.h, hsl.s, newL));
}

export interface Viewport {
  /** Screen pixels per survey unit. */
  scale: number;
  /** Survey coordinate currently centred in the viewport. */
  centerN: number;
  centerE: number;
}

export interface CadModelState {
  layers: CadLayer[];
  points: SurveyPoint[];
  linework: SurveyLinework[];
  texts: SurveyText[];
  surfaces: SurveySurface[];
  arcs: SurveyArc[];
  circles: SurveyCircle[];
  ellipses: SurveyEllipse[];
  dimensions: SurveyDimension[];
  hatches: SurveyHatch[];
  activeLayerId: LayerId;
}

/**
 * AutoCAD-style layer presets. These are not created by default — they are
 * materialised on demand when a command or feature code references them. The
 * default drawing starts with a single "0" layer, exactly like AutoCAD.
 */
export const LAYER_PRESETS: Record<string, { name: string; color: string }> = {
  "0": { name: "0", color: "#000000" },
  CONTROL: { name: "Control", color: "#c2410c" },
  TRAVERSE: { name: "Traverse", color: "#7c3aed" },
  BOUNDARY: { name: "Boundary", color: "#be123c" },
  TOPO: { name: "Topo / Detail", color: "#0369a1" },
  CONTOURS: { name: "Contours", color: "#15803d" },
  CONTOURS_INDEX: { name: "Contours (index)", color: "#166534" },
  SETOUT: { name: "Set-out", color: "#a16207" },
  TEXT: { name: "Annotation", color: "#18181b" },
  PROJECT: { name: "Project Coordinates", color: "#5b21b6" },
};

export const DEFAULT_LAYERS: CadLayer[] = [
  { id: "0", name: "0", color: "#000000", visible: true, locked: false },
];

export function emptyModel(): CadModelState {
  return {
    layers: DEFAULT_LAYERS.map((l) => ({ ...l })),
    points: [],
    linework: [],
    texts: [],
    surfaces: [],
    arcs: [],
    circles: [],
    ellipses: [],
    dimensions: [],
    hatches: [],
    activeLayerId: "0",
  };
}

export function cadStorageKey(projectId: string): string {
  return `sitesurveyorCad:${projectId}`;
}
