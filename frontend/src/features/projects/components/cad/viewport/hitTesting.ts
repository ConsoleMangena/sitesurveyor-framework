/**
 * Pure picking for the CAD viewport: single-entity hit testing and
 * AutoCAD-style window / crossing box selection.
 *
 * All geometry is projected to screen space by a caller-supplied projector so
 * these helpers stay independent of any viewport state. Layer visibility and
 * lock state are applied through caller-supplied predicates (the component
 * passes callbacks over `model.layers`).
 */
import type { CadEntityType, CadModelState, SurveyEllipse } from "../cadModel.ts";
import type { ScreenProjector } from "./snapping.ts";

/** Pick tolerance in screen pixels (moved verbatim from CadViewport's HIT_TOL). */
export const PICK_TOL_PX = 8;

export type PickHit =
  | { type: "point"; id: string }
  | { type: "linework"; id: string }
  | { type: "text"; id: string }
  | { type: "surface"; id: string }
  | { type: "arc"; id: string }
  | { type: "circle"; id: string }
  | { type: "ellipse"; id: string }
  | { type: "dimension"; id: string }
  | { type: "hatch"; id: string };

type ScreenPt = { x: number; y: number };

/** Shortest distance from (px,py) to the segment (ax,ay)-(bx,by). */
function distToSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** True when screen point (px,py) lies inside the triangle (a,b,c). */
function pointInTriangle(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
): boolean {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/** True when screen point (px,py) lies inside a simple polygon. */
function pointInPolygon(px: number, py: number, pts: ScreenPt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const pi = pts[i];
    const pj = pts[j];
    const intersect = pi.y > py !== pj.y > py &&
      px < ((pj.x - pi.x) * (py - pi.y)) / (pj.y - pi.y) + pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Sample an arc/circle into screen-space polyline points for hit testing. */
function sampleArcScreen(
  project: ScreenProjector,
  center: { n: number; e: number },
  radius: number,
  startAngle: number,
  endAngle: number,
  steps: number,
): ScreenPt[] {
  const pts: ScreenPt[] = [];
  if (!(Number.isFinite(radius) && radius > 0)) return pts;
  const s = startAngle;
  let e = endAngle;
  while (e < s) e += 360;
  const count = Math.max(steps, 2);
  for (let i = 0; i <= count; i++) {
    const deg = s + (e - s) * (i / count);
    const rad = deg * (Math.PI / 180);
    pts.push(project({ n: center.n + Math.sin(rad) * radius, e: center.e + Math.cos(rad) * radius }));
  }
  return pts;
}

/** Sample an ellipse into screen-space polyline points for picking. */
function sampleEllipseScreen(
  project: ScreenProjector,
  el: SurveyEllipse,
  steps: number,
): ScreenPt[] {
  const pts: ScreenPt[] = [];
  if (!(Number.isFinite(el.semiMajor) && Number.isFinite(el.semiMinor))) return pts;
  const rot = el.rotation * (Math.PI / 180);
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  const count = Math.max(steps, 8);
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    const x = el.semiMajor * Math.cos(t);
    const y = el.semiMinor * Math.sin(t);
    pts.push(project({
      n: el.center.n + x * sinR + y * cosR,
      e: el.center.e + x * cosR - y * sinR,
    }));
  }
  return pts;
}

/** Most recently added visible surface whose mesh lies under (x, y). */
function findSurfaceHit(
  model: CadModelState,
  isSelectableLayer: (layerId: string) => boolean,
  project: ScreenProjector,
  x: number,
  y: number,
  tolPx: number,
): string | null {
  // Iterate back-to-front so the most recently added surface wins ties.
  for (let s = model.surfaces.length - 1; s >= 0; s--) {
    const srf = model.surfaces[s];
    if (!srf.visible) continue;
    if (!isSelectableLayer(srf.layerId)) continue;
    if (!Array.isArray(srf.points) || !Array.isArray(srf.triangles)) continue;
    const screen = srf.points.map((v) => project(v));
    for (const t of srf.triangles) {
      const a = screen[t.a];
      const b = screen[t.b];
      const c = screen[t.c];
      if (!a || !b || !c) continue;
      if (pointInTriangle(x, y, a.x, a.y, b.x, b.y, c.x, c.y)) return srf.id;
      // Edge proximity so the thin wireframe is also easy to pick.
      if (
        distToSegment(x, y, a.x, a.y, b.x, b.y) <= tolPx ||
        distToSegment(x, y, b.x, b.y, c.x, c.y) <= tolPx ||
        distToSegment(x, y, c.x, c.y, a.x, a.y) <= tolPx
      ) {
        return srf.id;
      }
    }
  }
  return null;
}

/**
 * Single-entity pick. Priority order mirrors draw order (topmost wins):
 * points > linework > text > surfaces > arc > circle > ellipse >
 * dimension > hatch. Entities on hidden or locked layers are never returned.
 */
export function pickEntityAt(
  model: CadModelState,
  isVisibleLayer: (layerId: string) => boolean,
  isSelectableLayer: (layerId: string) => boolean,
  project: ScreenProjector,
  x: number,
  y: number,
  tolPx: number = PICK_TOL_PX,
): PickHit | null {
  let bestPt: { id: string; d: number } | null = null;
  for (const p of model.points) {
    if (!isVisibleLayer(p.layerId) || !isSelectableLayer(p.layerId)) continue;
    const s = project(p);
    const d = Math.hypot(s.x - x, s.y - y);
    if (d <= tolPx && (!bestPt || d < bestPt.d)) bestPt = { id: p.id, d };
  }
  if (bestPt) return { type: "point", id: bestPt.id };

  let bestLw: { id: string; d: number } | null = null;
  for (const lw of model.linework) {
    if (!isVisibleLayer(lw.layerId) || !isSelectableLayer(lw.layerId)) continue;
    const pts = lw.vertices.map((v) => project(v));
    if (pts.length < 2) continue;
    const segCount = lw.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < segCount; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const d = distToSegment(x, y, a.x, a.y, b.x, b.y);
      if (d <= tolPx && (!bestLw || d < bestLw.d)) bestLw = { id: lw.id, d };
    }
  }
  if (bestLw) return { type: "linework", id: bestLw.id };

  for (const t of model.texts) {
    if (!isVisibleLayer(t.layerId) || !isSelectableLayer(t.layerId)) continue;
    const s = project(t);
    const w = Math.max(20, t.text.length * 7);
    if (x >= s.x - 2 && x <= s.x + w && y >= s.y - 12 && y <= s.y + 4) {
      return { type: "text", id: t.id };
    }
  }

  // Surfaces are picked last so points / linework / text drawn on top of a
  // TIN remain selectable; clicking bare mesh selects the surface itself.
  const srfId = findSurfaceHit(model, isSelectableLayer, project, x, y, tolPx);
  if (srfId) return { type: "surface", id: srfId };

  let bestArc: { id: string; d: number } | null = null;
  for (const a of model.arcs) {
    if (!isVisibleLayer(a.layerId) || !isSelectableLayer(a.layerId)) continue;
    const pts = sampleArcScreen(project, a.center, a.radius, a.startAngle, a.endAngle, 32);
    for (let i = 1; i < pts.length; i++) {
      const d = distToSegment(x, y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
      if (d <= tolPx && (!bestArc || d < bestArc.d)) bestArc = { id: a.id, d };
    }
  }
  if (bestArc) return { type: "arc", id: bestArc.id };

  let bestCir: { id: string; d: number } | null = null;
  for (const c of model.circles) {
    if (!isVisibleLayer(c.layerId) || !isSelectableLayer(c.layerId)) continue;
    const center = project(c.center);
    const rim = project({ n: c.center.n, e: c.center.e + c.radius });
    const r = Math.hypot(rim.x - center.x, rim.y - center.y);
    const d = Math.abs(Math.hypot(x - center.x, y - center.y) - r);
    if (d <= tolPx && (!bestCir || d < bestCir.d)) bestCir = { id: c.id, d };
  }
  if (bestCir) return { type: "circle", id: bestCir.id };

  let bestEll: { id: string; d: number } | null = null;
  for (const el of model.ellipses) {
    if (!isVisibleLayer(el.layerId) || !isSelectableLayer(el.layerId)) continue;
    const pts = sampleEllipseScreen(project, el, 32);
    for (let i = 1; i < pts.length; i++) {
      const d = distToSegment(x, y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
      if (d <= tolPx && (!bestEll || d < bestEll.d)) bestEll = { id: el.id, d };
    }
  }
  if (bestEll) return { type: "ellipse", id: bestEll.id };

  for (const d of model.dimensions) {
    if (!isVisibleLayer(d.layerId) || !isSelectableLayer(d.layerId)) continue;
    const pts = d.defPoints.map((v) => project(v));
    let near = false;
    for (let i = 1; i < pts.length; i++) {
      if (distToSegment(x, y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y) <= tolPx) {
        near = true;
        break;
      }
    }
    if (!near) {
      const ts = project(d.textPosition);
      const w = Math.max(20, (d.text?.length ?? 0) * 7);
      near = x >= ts.x - 2 && x <= ts.x + w && y >= ts.y - 12 && y <= ts.y + 4;
    }
    if (near) return { type: "dimension", id: d.id };
  }

  for (const h of model.hatches) {
    if (!isVisibleLayer(h.layerId) || !isSelectableLayer(h.layerId)) continue;
    const outer = h.vertices.map((v) => project(v));
    if (outer.length < 3) continue;
    if (pointInPolygon(x, y, outer)) return { type: "hatch", id: h.id };
    let near = false;
    for (let i = 0; !near && i < outer.length; i++) {
      const a = outer[i];
      const b = outer[(i + 1) % outer.length];
      if (distToSegment(x, y, a.x, a.y, b.x, b.y) <= tolPx) near = true;
    }
    if (near) return { type: "hatch", id: h.id };
  }

  return null;
}

/**
 * AutoCAD-style box selection. Dragging left→right is a WINDOW selection
 * (entities must be fully enclosed); right→left is a CROSSING selection
 * (entities that are enclosed OR cross the box — the caller derives that from
 * the drag direction). Returns every match in collection order.
 */
export function boxSelect(
  model: CadModelState,
  isSelectableLayer: (layerId: string) => boolean,
  project: ScreenProjector,
  a: ScreenPt,
  b: ScreenPt,
  crossing: boolean,
): { type: CadEntityType; id: string }[] {
  const x1 = a.x, y1 = a.y, x2 = b.x, y2 = b.y;
  const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
  const items: { type: CadEntityType; id: string }[] = [];

  const inBox = (sx: number, sy: number) =>
    sx >= minX && sx <= maxX && sy >= minY && sy <= maxY;

  // Segment-vs-rect intersection for crossing selection.
  const segCrossesBox = (ax: number, ay: number, bx: number, by: number) => {
    if (inBox(ax, ay) || inBox(bx, by)) return true;
    // Clip test against the four box edges.
    const edges: [number, number, number, number][] = [
      [minX, minY, maxX, minY],
      [maxX, minY, maxX, maxY],
      [maxX, maxY, minX, maxY],
      [minX, maxY, minX, minY],
    ];
    const segInt = (
      p0x: number, p0y: number, p1x: number, p1y: number,
      p2x: number, p2y: number, p3x: number, p3y: number,
    ) => {
      const d = (p1x - p0x) * (p3y - p2y) - (p1y - p0y) * (p3x - p2x);
      if (Math.abs(d) < 1e-9) return false;
      const t = ((p2x - p0x) * (p3y - p2y) - (p2y - p0y) * (p3x - p2x)) / d;
      const u = ((p2x - p0x) * (p1y - p0y) - (p2y - p0y) * (p1x - p0x)) / d;
      return t >= 0 && t <= 1 && u >= 0 && u <= 1;
    };
    return edges.some((e) => segInt(ax, ay, bx, by, e[0], e[1], e[2], e[3]));
  };

  for (const p of model.points) {
    if (!isSelectableLayer(p.layerId)) continue;
    const s = project(p);
    if (inBox(s.x, s.y)) items.push({ type: "point", id: p.id });
  }
  for (const lw of model.linework) {
    if (!isSelectableLayer(lw.layerId)) continue;
    const pts = lw.vertices.map((v) => project(v));
    if (!pts.length) continue;
    const allIn = pts.every((s) => inBox(s.x, s.y));
    let touches = allIn;
    if (!touches && crossing) {
      const segCount = lw.closed ? pts.length : pts.length - 1;
      for (let i = 0; i < segCount && !touches; i++) {
        const a2 = pts[i];
        const b2 = pts[(i + 1) % pts.length];
        if (segCrossesBox(a2.x, a2.y, b2.x, b2.y)) touches = true;
      }
    }
    if (crossing ? touches : allIn) items.push({ type: "linework", id: lw.id });
  }
  for (const t of model.texts) {
    if (!isSelectableLayer(t.layerId)) continue;
    const s = project(t);
    if (inBox(s.x, s.y)) items.push({ type: "text", id: t.id });
  }
  for (const srf of model.surfaces) {
    if (!srf.visible) continue;
    if (!isSelectableLayer(srf.layerId)) continue;
    if (!Array.isArray(srf.points) || !Array.isArray(srf.triangles)) continue;
    const screen = srf.points.map((v) => project(v));
    if (!screen.length) continue;
    const allIn = screen.every((s) => inBox(s.x, s.y));
    let touches = allIn;
    if (!touches && crossing) {
      for (const t of srf.triangles) {
        const a2 = screen[t.a];
        const b2 = screen[t.b];
        const c = screen[t.c];
        if (!a2 || !b2 || !c) continue;
        if (
          segCrossesBox(a2.x, a2.y, b2.x, b2.y) ||
          segCrossesBox(b2.x, b2.y, c.x, c.y) ||
          segCrossesBox(c.x, c.y, a2.x, a2.y)
        ) {
          touches = true;
          break;
        }
      }
    }
    if (crossing ? touches : allIn) items.push({ type: "surface", id: srf.id });
  }

  const polylineInBox = (pts: ScreenPt[]) => {
    if (!pts.length) return false;
    const allIn = pts.every((s) => inBox(s.x, s.y));
    if (!crossing) return allIn;
    if (allIn) return true;
    for (let i = 0; i < pts.length; i++) {
      const a2 = pts[i];
      const b2 = pts[(i + 1) % pts.length];
      if (segCrossesBox(a2.x, a2.y, b2.x, b2.y)) return true;
    }
    return false;
  };

  for (const arc of model.arcs) {
    if (!isSelectableLayer(arc.layerId)) continue;
    const pts = sampleArcScreen(project, arc.center, arc.radius, arc.startAngle, arc.endAngle, 16);
    if (polylineInBox(pts)) items.push({ type: "arc", id: arc.id });
  }
  for (const c of model.circles) {
    if (!isSelectableLayer(c.layerId)) continue;
    const pts = sampleArcScreen(project, c.center, c.radius, 0, 360, 24);
    if (polylineInBox(pts)) items.push({ type: "circle", id: c.id });
  }
  for (const el of model.ellipses) {
    if (!isSelectableLayer(el.layerId)) continue;
    const pts = sampleEllipseScreen(project, el, 24);
    if (polylineInBox(pts)) items.push({ type: "ellipse", id: el.id });
  }
  for (const d of model.dimensions) {
    if (!isSelectableLayer(d.layerId)) continue;
    const pts = d.defPoints.map((v) => project(v));
    if (polylineInBox(pts)) items.push({ type: "dimension", id: d.id });
  }
  for (const h of model.hatches) {
    if (!isSelectableLayer(h.layerId)) continue;
    const pts = h.vertices.map((v) => project(v));
    if (pts.length < 3) continue;
    const allIn = pts.every((s) => inBox(s.x, s.y));
    let touches = allIn;
    if (!touches && crossing) {
      for (let i = 0; i < pts.length; i++) {
        const a2 = pts[i];
        const b2 = pts[(i + 1) % pts.length];
        if (segCrossesBox(a2.x, a2.y, b2.x, b2.y)) { touches = true; break; }
      }
    }
    if (crossing ? touches : allIn) items.push({ type: "hatch", id: h.id });
  }
  return items;
}
