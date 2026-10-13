/**
 * Minimal DXF (R2000 / AC1015 ASCII) writer for survey deliverables.
 *
 * AutoCAD and all major CAD packages open DXF natively. We emit:
 * - LAYER table entries (one per CAD layer, with AutoCAD colour indices)
 * - POINT entities for survey points (+ TEXT for point numbers)
 * - LINE / LWPOLYLINE entities for linework
 * - 3DFACE entities for TIN surfaces
 * - TEXT entities for annotations
 *
 * NOTE ON THE DXF VERSION: LWPOLYLINE and 3DFACE (as written here) are R13+
 * entities and are NOT valid in a strict R12 (AC1009) file. We therefore
 * declare AC1015 (AutoCAD 2000), the lowest version that fully supports every
 * entity we emit, so the output imports cleanly into strict parsers.
 */
import type { CadLayer, CadModelState, SurveyDimension, SurveyEllipse, SurveyHatch } from "../cadModel.ts";

/**
 * Map a hex colour to the nearest of the 9 standard AutoCAD Color Indices
 * by RGB distance — a lookup table silently degrades every project layer
 * colour to ACI 7 (white/black).
 */
const ACI_COLORS: [aci: number, rgb: [number, number, number]][] = [
  [1, [255, 0, 0]],     // red
  [2, [255, 255, 0]],   // yellow
  [3, [0, 255, 0]],     // green
  [4, [0, 255, 255]],   // cyan
  [5, [0, 0, 255]],     // blue
  [6, [255, 0, 255]],   // magenta
  [7, [255, 255, 255]], // white (black on light backgrounds)
  [8, [128, 128, 128]], // grey
  [30, [255, 127, 0]],  // orange
];

function aci(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 7;
  const v = parseInt(m[1], 16);
  const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  let best = 7;
  let bestDist = Infinity;
  for (const [idx, [cr, cg, cb]] of ACI_COLORS) {
    const dist = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = idx;
    }
  }
  return best;
}

function group(code: number, value: string | number): string {
  return `${code}\n${value}\n`;
}

/** DXF colour group (62) for an explicit object colour; "" when ByLayer. */
function objColor(color: string | null | undefined): string {
  return color ? group(62, aci(color)) : "";
}

function layerTable(layers: CadLayer[]): string {
  let out = group(0, "TABLE") + group(2, "LAYER") + group(70, layers.length);
  for (const l of layers) {
    // AutoCAD convention: a layer is OFF when its colour (group 62) is
    // written as a NEGATIVE ACI. Group 70 carries the lock bit (4).
    const color = l.visible ? aci(l.color) : -aci(l.color);
    out +=
      group(0, "LAYER") +
      group(2, l.name.toUpperCase().replace(/\s+/g, "_")) +
      group(70, l.locked ? 4 : 0) +
      group(62, color) +
      group(6, "CONTINUOUS");
  }
  out += group(0, "ENDTAB");
  return out;
}

function layerName(layers: CadLayer[], id: string): string {
  const l = layers.find((x) => x.id === id);
  return (l ? l.name : id).toUpperCase().replace(/\s+/g, "_");
}

/** Emit a native DXF HATCH entity from a SurveyHatch. */
function hatchEntity(h: SurveyHatch, layerName: string): string {
  let dxf = "";
  dxf += group(0, "HATCH");
  dxf += group(100, "AcDbEntity");
  dxf += group(8, layerName);
  dxf += objColor(h.color);
  dxf += group(100, "AcDbHatch");
  dxf += group(2, h.pattern ?? "SOLID");
  dxf += group(70, 1); // solid fill
  dxf += group(71, 0); // non-associative
  dxf += group(75, 0); // normal hatch style
  dxf += group(76, 1); // predefined pattern type
  dxf += group(52, h.patternAngle ?? 0);
  dxf += group(41, h.patternScale ?? 1);
  dxf += group(77, 0); // pattern line definitions
  dxf += group(78, 0); // pattern line?
  dxf += group(98, 0); // seed points

  const loops = [h.vertices, ...(h.holes ?? [])].filter((loop) => loop.length >= 3);
  dxf += group(91, loops.length);
  for (const loop of loops) {
    dxf += group(92, 2); // polyline path
    dxf += group(93, loop.length);
    dxf += group(72, 0); // no bulges
    dxf += group(73, 1); // closed
    for (const v of loop) {
      dxf += group(10, v.e) + group(20, v.n);
    }
  }
  return dxf;
}

/** Emit a native DXF ELLIPSE entity. */
function ellipseEntity(el: SurveyEllipse, layerName: string): string {
  const rot = el.rotation * (Math.PI / 180);
  const a = Math.max(el.semiMajor, Number.EPSILON);
  const ratio = el.semiMinor / a;
  const majorE = a * Math.cos(rot);
  const majorN = a * Math.sin(rot);
  return (
    group(0, "ELLIPSE") +
    group(100, "AcDbEntity") +
    group(8, layerName) +
    objColor(el.color) +
    group(100, "AcDbEllipse") +
    group(10, el.center.e) +
    group(20, el.center.n) +
    group(30, 0) +
    group(11, majorE) +
    group(21, majorN) +
    group(31, 0) +
    group(40, ratio) +
    group(41, 0) +
    group(42, Math.PI * 2)
  );
}

/** Emit a native DXF DIMENSION entity for a linear dimension. */
function dimensionEntity(d: SurveyDimension, layerName: string): string {
  const [p0, p1] = d.defPoints;
  const isNativeLinear = (d.kind === "linear" || d.kind === "aligned") && p0 && p1;

  if (!isNativeLinear) {
    // Fallback to a simple line + label for unsupported dimension variants.
    let dxf = "";
    if (p0 && p1) {
      dxf +=
        group(0, "LINE") +
        group(8, layerName) +
        objColor(d.color) +
        group(10, p0.e) + group(20, p0.n) + group(30, 0) +
        group(11, p1.e) + group(21, p1.n) + group(31, 0);
    }
    dxf +=
      group(0, "TEXT") +
      group(8, layerName) +
      objColor(d.color) +
      group(10, d.textPosition.e) +
      group(20, d.textPosition.n) +
      group(30, 0) +
      group(40, 2.5) +
      group(1, d.text ?? "");
    return dxf;
  }

  // DXF rotated-dimension group 50 is CCW from the +X (Easting) axis, NOT a
  // bearing — atan2(Δn, Δe), not atan2(Δe, Δn).
  const angle = Math.atan2(p1.n - p0.n, p1.e - p0.e) * (180 / Math.PI);
  let dxf = "";
  dxf += group(0, "DIMENSION");
  dxf += group(100, "AcDbEntity");
  dxf += group(8, layerName);
  dxf += objColor(d.color);
  dxf += group(100, "AcDbDimension");
  // 70 = dimension type: 0 = rotated/linear, 1 = aligned.
  dxf += group(70, d.kind === "aligned" ? 1 : 0);
  dxf += group(1, d.text ?? "");
  dxf += group(10, d.textPosition.e) + group(20, d.textPosition.n) + group(30, 0);
  dxf += group(11, d.textPosition.e) + group(21, d.textPosition.n) + group(31, 0);
  dxf += group(13, p0.e) + group(23, p0.n) + group(33, 0);
  dxf += group(14, p1.e) + group(24, p1.n) + group(34, 0);
  dxf += group(50, angle);
  return dxf;
}

export function modelToDxf(model: CadModelState): string {
  const L = model.layers;
  let dxf = "";

  // HEADER (minimal). $INSUNITS = 6 declares metres so downstream CAD/GIS
  // does not read the drawing as unitless.
  dxf += group(0, "SECTION") + group(2, "HEADER");
  dxf += group(9, "$ACADVER") + group(1, "AC1015");
  dxf += group(9, "$INSUNITS") + group(70, 6);
  dxf += group(0, "ENDSEC");

  // TABLES.
  dxf += group(0, "SECTION") + group(2, "TABLES");
  dxf += layerTable(L);
  dxf += group(0, "ENDSEC");

  // ENTITIES.
  dxf += group(0, "SECTION") + group(2, "ENTITIES");

  for (const p of model.points) {
    const ln = layerName(L, p.layerId);
    dxf +=
      group(0, "POINT") +
      group(8, ln) +
      objColor(p.color) +
      group(10, p.e) +
      group(20, p.n) +
      group(30, p.z ?? 0);
    // Point number label.
    dxf +=
      group(0, "TEXT") +
      group(8, ln) +
      group(10, p.e) +
      group(20, p.n) +
      group(30, 0) +
      group(40, 1.5) +
      group(1, p.pointNo + (p.code ? ` ${p.code}` : ""));
  }

  for (const lw of model.linework) {
    const ln = layerName(L, lw.layerId);
    if (lw.vertices.length === 2 && lw.kind === "line") {
      const [a, b] = lw.vertices;
      dxf +=
        group(0, "LINE") +
        group(8, ln) +
        objColor(lw.color) +
        group(10, a.e) +
        group(20, a.n) +
        group(30, 0) +
        group(11, b.e) +
        group(21, b.n) +
        group(31, 0);
    } else {
      dxf +=
        group(0, "LWPOLYLINE") +
        group(8, ln) +
        objColor(lw.color) +
        group(90, lw.vertices.length) +
        group(70, lw.closed ? 1 : 0);
      for (const v of lw.vertices) {
        dxf += group(10, v.e) + group(20, v.n);
      }
    }
    // Linework labels (contour RL elevations, spot notes) are part of the
    // deliverable — emit them as a TEXT at the polyline midpoint, or the
    // exported sheet loses all contour annotation.
    if (lw.label && lw.vertices.length > 0) {
      const mid = lw.vertices[Math.floor(lw.vertices.length / 2)];
      dxf +=
        group(0, "TEXT") +
        group(8, ln) +
        objColor(lw.color) +
        group(10, mid.e) +
        group(20, mid.n) +
        group(30, 0) +
        group(40, 1.8) +
        group(1, lw.label);
    }
  }

  // TIN surfaces as 3DFACE entities (one per triangle), so the DTM imports
  // into AutoCAD/Civil 3D as a true 3D surface mesh.
  for (const srf of model.surfaces) {
    const ln = layerName(L, srf.layerId);
    for (const tri of srf.triangles) {
      const a = srf.points[tri.a];
      const b = srf.points[tri.b];
      const c = srf.points[tri.c];
      if (!a || !b || !c) continue;
      dxf +=
        group(0, "3DFACE") +
        group(8, ln) +
        group(10, a.e) + group(20, a.n) + group(30, a.z) +
        group(11, b.e) + group(21, b.n) + group(31, b.z) +
        group(12, c.e) + group(22, c.n) + group(32, c.z) +
        // 4th corner repeats the 3rd (triangular face).
        group(13, c.e) + group(23, c.n) + group(33, c.z);
    }
  }

  for (const t of model.texts) {
    dxf +=
      group(0, "TEXT") +
      group(8, layerName(L, t.layerId)) +
      objColor(t.color) +
      group(10, t.e) +
      group(20, t.n) +
      group(30, 0) +
      group(40, typeof t.height === "number" && t.height > 0 ? t.height : 2.5) +
      (typeof t.rotation === "number" ? group(50, t.rotation) : "") +
      group(1, t.text);
  }

  for (const a of model.arcs) {
    dxf +=
      group(0, "ARC") +
      group(8, layerName(L, a.layerId)) +
      objColor(a.color) +
      group(10, a.center.e) +
      group(20, a.center.n) +
      group(30, 0) +
      group(40, a.radius) +
      group(50, a.startAngle) +
      group(51, a.endAngle);
  }

  for (const c of model.circles) {
    dxf +=
      group(0, "CIRCLE") +
      group(8, layerName(L, c.layerId)) +
      objColor(c.color) +
      group(10, c.center.e) +
      group(20, c.center.n) +
      group(30, 0) +
      group(40, c.radius);
  }

  for (const el of model.ellipses) {
    dxf += ellipseEntity(el, layerName(L, el.layerId));
  }

  for (const d of model.dimensions) {
    const ln = layerName(L, d.layerId);
    dxf += dimensionEntity(d, ln);
  }

  for (const h of model.hatches) {
    if (h.vertices.length < 3) continue;
    dxf += hatchEntity(h, layerName(L, h.layerId));
  }

  dxf += group(0, "ENDSEC") + group(0, "EOF");
  return dxf;
}

// ── Import result type ( GDAL backend does the parsing ) ─────────────────────

export interface CadImportStyle {
  color?: string | null;
  lineType?: string | null;
  lineWeight?: number | null;
}

export interface CadImportVertex {
  e: number;
  n: number;
  z?: number | null;
}

export interface DxfImportResult {
  points: Array<{
    pointNo: string;
    e: number;
    n: number;
    z: number | null;
    code: string;
    layerName: string;
    paperSpace: boolean;
    style: CadImportStyle;
    metadata: Record<string, string>;
  }>;
  linework: Array<{
    kind: "line" | "polyline" | "boundary";
    vertices: CadImportVertex[];
    closed: boolean;
    layerName: string;
    paperSpace: boolean;
    style: CadImportStyle;
    metadata: Record<string, string>;
  }>;
  texts: Array<{
    e: number;
    n: number;
    z?: number | null;
    text: string;
    layerName: string;
    height?: number;
    rotation?: number;
    paperSpace: boolean;
    style: CadImportStyle;
    metadata: Record<string, string>;
  }>;
  arcs: Array<{
    centerE: number;
    centerN: number;
    centerZ?: number | null;
    radius: number;
    startAngle: number;
    endAngle: number;
    layerName: string;
    paperSpace: boolean;
    style: CadImportStyle;
    metadata: Record<string, string>;
  }>;
  circles: Array<{
    centerE: number;
    centerN: number;
    centerZ?: number | null;
    radius: number;
    layerName: string;
    paperSpace: boolean;
    style: CadImportStyle;
    metadata: Record<string, string>;
  }>;
  ellipses: Array<{
    centerE: number;
    centerN: number;
    centerZ?: number | null;
    semiMajor: number;
    semiMinor: number;
    rotation: number;
    layerName: string;
    paperSpace: boolean;
    style: CadImportStyle;
    metadata: Record<string, string>;
  }>;
  hatches: Array<{
    vertices: CadImportVertex[];
    holes: CadImportVertex[][];
    pattern?: string | null;
    patternScale?: number | null;
    patternAngle?: number | null;
    layerName: string;
    paperSpace: boolean;
    style: CadImportStyle;
    metadata: Record<string, string>;
  }>;
  dimensions: Array<{
    kind: string;
    text: string;
    textE: number;
    textN: number;
    textZ?: number | null;
    defPoints: CadImportVertex[];
    angle?: number | null;
    layerName: string;
    paperSpace: boolean;
    style: CadImportStyle;
    metadata: Record<string, string>;
  }>;
  inserts: Array<{
    blockName: string;
    e: number;
    n: number;
    z?: number | null;
    scaleX: number;
    scaleY: number;
    scaleZ: number;
    rotation: number;
    layerName: string;
    paperSpace: boolean;
    style: CadImportStyle;
    metadata: Record<string, string>;
  }>;
  layerNames: string[];
  layerStyles: Record<string, CadImportStyle>;
  unsupported: string[];
  unitScale: number;
}

/** Trigger a browser download of a text blob. */
export function downloadText(filename: string, content: string, mime = "text/plain"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
