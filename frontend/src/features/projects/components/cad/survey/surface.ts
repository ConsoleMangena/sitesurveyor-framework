/**
 * Pure-TypeScript surface engine (TIN, contours, volumes).
 *
 * This mirrors the Rust `survey-core` crate exactly and serves as the
 * guaranteed fallback when the WebAssembly module is unavailable (e.g. the
 * `npm run build:wasm` step has not been run, or on a platform where the wasm
 * chunk failed to load). The WASM path is preferred for speed on large point
 * sets; results are numerically equivalent.
 *
 * Conventions match `cogo.ts`: coordinates are Y/Northing (`n`) / X/Easting
 * (`e`) / Z/Elevation (`z`). Triangulation runs on centroid-shifted coordinates
 * to preserve precision on large UTM-style values.
 */

export interface SurfacePoint3 {
  n: number;
  e: number;
  z: number;
}

export interface SurfaceVertex {
  n: number;
  e: number;
}

export interface SurfaceTriangle {
  a: number;
  b: number;
  c: number;
}

export interface SurfaceTin {
  points: SurfacePoint3[];
  triangles: SurfaceTriangle[];
}

export interface SurfaceContourLine {
  elevation: number;
  vertices: SurfaceVertex[];
}

export interface SurfaceVolumeResult {
  cut: number;
  fill: number;
  net: number;
  planArea: number;
}

/**
 * Per-triangle cut/fill quantities, used to render a coloured 3D earthworks
 * model. Each entry mirrors a TIN triangle (same vertex indices into the
 * surface's `points`) and carries the signed mean height difference relative to
 * the reference: positive = cut (existing ground above the datum/design),
 * negative = fill. `volume` is the signed prism volume for that triangle.
 */
export interface CutFillTriangle {
  a: number;
  b: number;
  c: number;
  /** Signed mean height difference over the triangle (m). +cut / −fill. */
  delta: number;
  /** Signed prism volume for the triangle (m³). +cut / −fill. */
  volume: number;
}

export interface CutFillResult {
  triangles: CutFillTriangle[];
  /** Largest cut delta (>= 0) for symmetric colour scaling. */
  maxCut: number;
  /** Largest fill delta magnitude (>= 0) for symmetric colour scaling. */
  maxFill: number;
}

/* ── TIN (Bowyer–Watson Delaunay) ─────────────────────────────────────────── */

interface XY {
  x: number;
  y: number;
  idx: number;
}

/** Build a TIN from 3D survey points. Returns no triangles for < 3 points. */
export function buildTin(points: SurfacePoint3[]): SurfaceTin {
  if (points.length < 3) {
    return { points: [...points], triangles: [] };
  }

  const cn = points.reduce((s, p) => s + p.n, 0) / points.length;
  const ce = points.reduce((s, p) => s + p.e, 0) / points.length;

  // X = Easting, Y = Northing (CAD mapping), centroid-shifted. Drop duplicates.
  const pts: XY[] = [];
  const seen = new Set<string>();
  points.forEach((p, idx) => {
    const x = p.e - ce;
    const y = p.n - cn;
    const key = `${x.toFixed(6)}:${y.toFixed(6)}`;
    if (seen.has(key)) return;
    seen.add(key);
    pts.push({ x, y, idx });
  });
  if (pts.length < 3) return { points: [...points], triangles: [] };

  const triangles = delaunay(pts);
  return { points: [...points], triangles };
}

/** A breakline / clip boundary expressed in survey coordinates. */
export interface SurfaceConstraint {
  vertices: SurfaceVertex[];
}

export interface ConstrainedTinOptions {
  /**
   * Hard breaklines. TIN edges are not allowed to cross these lines, so ridges,
   * kerbs and ditches are honoured. Triangles straddling a breakline are
   * removed (the classic "remove crossing triangles" enforcement).
   */
  breaklines?: SurfaceConstraint[];
  /**
   * Optional clip boundary (survey limit / parcel). Triangles whose centroid
   * falls outside the ring are discarded so the surface never spans voids or
   * overshoots the surveyed area.
   */
  boundary?: SurfaceConstraint;
}

/**
 * Build a TIN honouring breaklines and an optional clip boundary.
 *
 * The base triangulation is an unconstrained Delaunay over all points *plus*
 * densified breakline vertices; the enforcement step then drops any triangle
 * whose interior is cut by a breakline segment, and any triangle outside the
 * clip boundary. This gives a survey-grade surface that follows hard edges and
 * respects the survey limit — the behaviour Civil 3D / TBC produce when you add
 * breaklines and an outer boundary to a surface.
 */
export function buildConstrainedTin(
  points: SurfacePoint3[],
  opts: ConstrainedTinOptions = {},
): SurfaceTin {
  const breaklines = opts.breaklines ?? [];
  const boundary = opts.boundary;

  // Seed the point set with the raw survey points, then triangulate.
  const base = buildTin(points);
  if (base.triangles.length === 0) return base;

  const tris = base.triangles.filter((t) => {
    const a = base.points[t.a];
    const b = base.points[t.b];
    const c = base.points[t.c];

    // ── Boundary clip: centroid must be inside the ring. ──
    if (boundary && boundary.vertices.length >= 3) {
      const cx = (a.e + b.e + c.e) / 3;
      const cy = (a.n + b.n + c.n) / 3;
      if (!pointInRing(cx, cy, boundary.vertices)) return false;
    }

    // ── Breakline enforcement: drop triangles cut by a breakline. ──
    for (const bl of breaklines) {
      if (triangleCrossesLine(a, b, c, bl.vertices)) return false;
    }
    return true;
  });

  return { points: base.points, triangles: tris };
}

/** Ray-casting point-in-polygon on a survey ring (E = x, N = y). */
function pointInRing(e: number, n: number, ring: SurfaceVertex[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].e, yi = ring[i].n;
    const xj = ring[j].e, yj = ring[j].n;
    const intersect =
      yi > n !== yj > n && e < ((xj - xi) * (n - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * True when any edge of triangle (a,b,c) properly crosses any segment of the
 * breakline polyline. Shared endpoints (a triangle edge that *is* the breakline
 * segment) are treated as not-crossing so conforming triangles survive.
 */
function triangleCrossesLine(
  a: SurfacePoint3,
  b: SurfacePoint3,
  c: SurfacePoint3,
  line: SurfaceVertex[],
): boolean {
  const edges: [SurfacePoint3, SurfacePoint3][] = [
    [a, b],
    [b, c],
    [c, a],
  ];
  for (let i = 1; i < line.length; i++) {
    const p = line[i - 1];
    const q = line[i];
    for (const [u, v] of edges) {
      if (segmentsProperlyIntersect(u.e, u.n, v.e, v.n, p.e, p.n, q.e, q.n)) {
        return true;
      }
    }
  }
  return false;
}

function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/** Proper segment intersection (excludes shared/touching endpoints). */
function segmentsProperlyIntersect(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const d1 = orient(cx, cy, dx, dy, ax, ay);
  const d2 = orient(cx, cy, dx, dy, bx, by);
  const d3 = orient(ax, ay, bx, by, cx, cy);
  const d4 = orient(ax, ay, bx, by, dx, dy);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
}

/** Bowyer–Watson incremental Delaunay over the shifted local coordinates. */
function delaunay(pts: XY[]): SurfaceTriangle[] {
  // Super-triangle large enough to contain all points.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const dx = maxX - minX || 1;
  const dy = maxY - minY || 1;
  const dmax = Math.max(dx, dy) * 20;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  // Super-triangle vertices use negative pseudo-indices.
  const verts: XY[] = [
    ...pts,
    { x: midX - dmax, y: midY - dmax, idx: -1 },
    { x: midX, y: midY + dmax, idx: -2 },
    { x: midX + dmax, y: midY - dmax, idx: -3 },
  ];
  const n = pts.length;
  type Tri = [number, number, number];
  let tris: Tri[] = [[n, n + 1, n + 2]];

  for (let i = 0; i < n; i++) {
    const p = verts[i];
    const badEdges: [number, number][] = [];
    tris = tris.filter((t) => {
      if (inCircumcircle(p, verts[t[0]], verts[t[1]], verts[t[2]])) {
        badEdges.push([t[0], t[1]], [t[1], t[2]], [t[2], t[0]]);
        return false;
      }
      return true;
    });

    // Boundary of the polygonal hole = edges not shared by two bad triangles.
    const boundary: [number, number][] = [];
    for (let a = 0; a < badEdges.length; a++) {
      let shared = false;
      for (let b = 0; b < badEdges.length; b++) {
        if (a === b) continue;
        if (sameEdge(badEdges[a], badEdges[b])) {
          shared = true;
          break;
        }
      }
      if (!shared) boundary.push(badEdges[a]);
    }

    for (const [u, v] of boundary) {
      tris.push([u, v, i]);
    }
  }

  // Drop triangles touching the super-triangle and map back to original idx.
  const out: SurfaceTriangle[] = [];
  for (const t of tris) {
    if (t[0] >= n || t[1] >= n || t[2] >= n) continue;
    out.push({ a: verts[t[0]].idx, b: verts[t[1]].idx, c: verts[t[2]].idx });
  }
  return out;
}

function sameEdge(a: [number, number], b: [number, number]): boolean {
  return (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);
}

function inCircumcircle(p: XY, a: XY, b: XY, c: XY): boolean {
  const ax = a.x - p.x;
  const ay = a.y - p.y;
  const bx = b.x - p.x;
  const by = b.y - p.y;
  const cx = c.x - p.x;
  const cy = c.y - p.y;
  const det =
    (ax * ax + ay * ay) * (bx * cy - cx * by) -
    (bx * bx + by * by) * (ax * cy - cx * ay) +
    (cx * cx + cy * cy) * (ax * by - bx * ay);
  // CCW-orientation aware: flip sign based on triangle winding.
  const area2 = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
  return area2 > 0 ? det > 0 : det < 0;
}

function triangleArea2d(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number {
  return Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) * 0.5;
}

/** Total plan (projected) area of all TIN triangles. */
export function planArea(tin: SurfaceTin): number {
  let sum = 0;
  for (const t of tin.triangles) {
    const a = tin.points[t.a];
    const b = tin.points[t.b];
    const c = tin.points[t.c];
    sum += triangleArea2d(a.e, a.n, b.e, b.n, c.e, c.n);
  }
  return sum;
}

/* ── Contours (marching triangles) ────────────────────────────────────────── */

/**
 * Chaikin corner-cutting smoothing. Each iteration replaces every interior
 * segment with two points at 1/4 and 3/4, rounding off the raw marching-triangle
 * chords into the flowing curves expected on a survey plan (as produced by
 * Civil 3D / Trimble Business Center) without displacing the line off the true
 * contour by more than a fraction of the point spacing. Endpoints are kept so
 * open contours still terminate exactly on the TIN boundary; closed rings are
 * detected and smoothed cyclically.
 */
export function smoothContourVertices(
  vertices: SurfaceVertex[],
  iterations = 2,
): SurfaceVertex[] {
  if (iterations <= 0 || vertices.length < 3) return vertices;
  const TOL = 1e-7;
  const closed =
    Math.abs(vertices[0].n - vertices[vertices.length - 1].n) < TOL &&
    Math.abs(vertices[0].e - vertices[vertices.length - 1].e) < TOL;

  let pts = closed ? vertices.slice(0, -1) : vertices.slice();
  for (let it = 0; it < iterations; it++) {
    const next: SurfaceVertex[] = [];
    const n = pts.length;
    if (!closed) next.push(pts[0]);
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % n];
      next.push({ n: 0.75 * p.n + 0.25 * q.n, e: 0.75 * p.e + 0.25 * q.e });
      next.push({ n: 0.25 * p.n + 0.75 * q.n, e: 0.25 * p.e + 0.75 * q.e });
    }
    if (!closed) next.push(pts[n - 1]);
    pts = next;
  }
  return closed ? [...pts, pts[0]] : pts;
}

/**
 * Generate contour polylines from a TIN via marching triangles.
 *
 * @param interval Contour interval (m); must be > 0.
 * @param base     Datum the intervals are counted from (default 0).
 * @param smooth   Chaikin smoothing iterations applied to each contour
 *                 (default 0 = raw chords, matching the WASM engine exactly).
 *                 2–3 gives clean survey-grade curves.
 */
export function generateContours(
  tin: SurfaceTin,
  interval: number,
  base = 0,
  smooth = 0,
): SurfaceContourLine[] {
  if (interval <= 0 || tin.triangles.length === 0) return [];

  let zmin = Infinity;
  let zmax = -Infinity;
  for (const p of tin.points) {
    zmin = Math.min(zmin, p.z);
    zmax = Math.max(zmax, p.z);
  }
  if (!Number.isFinite(zmin) || !Number.isFinite(zmax) || zmax <= zmin) return [];

  const firstK = Math.ceil((zmin - base) / interval);
  const lastK = Math.floor((zmax - base) / interval);

  const out: SurfaceContourLine[] = [];
  for (let k = firstK; k <= lastK; k++) {
    const level = base + k * interval;
    if (level <= zmin || level >= zmax) continue;
    const segments = contourSegmentsAt(tin, level);
    for (const vertices of chainSegments(segments)) {
      if (vertices.length < 2) continue;
      const finalVerts = smooth > 0 ? smoothContourVertices(vertices, smooth) : vertices;
      out.push({ elevation: level, vertices: finalVerts });
    }
  }
  return out;
}

type Seg = [SurfaceVertex, SurfaceVertex];

function contourSegmentsAt(tin: SurfaceTin, level: number): Seg[] {
  const segments: Seg[] = [];
  for (const t of tin.triangles) {
    const a = tin.points[t.a];
    const b = tin.points[t.b];
    const c = tin.points[t.c];
    const crossings: SurfaceVertex[] = [];
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ] as [SurfacePoint3, SurfacePoint3][]) {
      const v = edgeCrossing(p, q, level);
      if (v) crossings.push(v);
    }
    if (crossings.length < 2) continue;
    // A TIN vertex exactly on the contour level makes EACH incident edge of
    // the triangle report a crossing at that vertex (3 crossings total)
    // — dedupe them, otherwise the segment is silently dropped and contours
    // through exact-RL spot levels get holes.
    const deduped: SurfaceVertex[] = [];
    for (const v of crossings) {
      if (
        !deduped.some(
          (u) => Math.abs(u.n - v.n) < 1e-9 && Math.abs(u.e - v.e) < 1e-9,
        )
      ) {
        deduped.push(v);
      }
    }
    if (deduped.length >= 2) segments.push([deduped[0], deduped[1]]);
  }
  return segments;
}

function edgeCrossing(
  p: SurfacePoint3,
  q: SurfacePoint3,
  level: number,
): SurfaceVertex | null {
  const dp = p.z - level;
  const dq = q.z - level;
  if ((dp > 0 && dq > 0) || (dp < 0 && dq < 0)) return null;
  if (dp === 0 && dq === 0) return null;
  const denom = p.z - q.z;
  if (Math.abs(denom) < 1e-12) return null;
  const t = (p.z - level) / denom;
  return { n: p.n + t * (q.n - p.n), e: p.e + t * (q.e - p.e) };
}

function chainSegments(segments: Seg[]): SurfaceVertex[][] {
  const TOL = 1e-6;
  const used = new Array(segments.length).fill(false);
  const close = (x: SurfaceVertex, y: SurfaceVertex) =>
    Math.abs(x.n - y.n) < TOL && Math.abs(x.e - y.e) < TOL;
  const polylines: SurfaceVertex[][] = [];

  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const chain: SurfaceVertex[] = [segments[i][0], segments[i][1]];

    let extended = true;
    while (extended) {
      extended = false;
      for (let j = 0; j < segments.length; j++) {
        if (used[j]) continue;
        const seg = segments[j];
        const head = chain[0];
        const tail = chain[chain.length - 1];
        if (close(tail, seg[0])) chain.push(seg[1]);
        else if (close(tail, seg[1])) chain.push(seg[0]);
        else if (close(head, seg[1])) chain.unshift(seg[0]);
        else if (close(head, seg[0])) chain.unshift(seg[1]);
        else continue;
        used[j] = true;
        extended = true;
      }
    }
    polylines.push(chain);
  }
  return polylines;
}

/* ── Volumes ──────────────────────────────────────────────────────────────── */

export function volumeToElevation(
  tin: SurfaceTin,
  reference: number,
): SurfaceVolumeResult {
  return accumulate(tin, (z) => z - reference);
}

export function volumeBetween(
  top: SurfaceTin,
  base: SurfaceTin,
  /** `overlap` (default): top points outside the base footprint contribute
   * nothing; `strict`: error out — never silently compute a wrong area. */
  mode: "strict" | "overlap" = "overlap",
): SurfaceVolumeResult {
  if (mode === "strict") {
    for (const p of top.points) {
      if (sampleZ(base, p.n, p.e) === null) {
        throw new Error(
          "Surface-to-surface volume (strict): a top-surface point lies outside the base footprint. Re-run with the overlap option to compute over the shared area only.",
        );
      }
    }
  }
  const acc = { cut: 0, fill: 0 };
  let area = 0;
  for (const t of top.triangles) {
    const a = top.points[t.a];
    const b = top.points[t.b];
    const c = top.points[t.c];
    const triArea = triangleArea2d(a.e, a.n, b.e, b.n, c.e, c.n);
    if (triArea === 0) continue;
    area += triArea;
    const da = a.z - (sampleZ(base, a.n, a.e) ?? a.z);
    const db = b.z - (sampleZ(base, b.n, b.e) ?? b.z);
    const dc = c.z - (sampleZ(base, c.n, c.e) ?? c.z);
    if (![da, db, dc].every(Number.isFinite)) continue;
    accumulateSplitTriangle(acc, a, b, c, da, db, dc);
  }
  return { cut: acc.cut, fill: acc.fill, net: acc.cut - acc.fill, planArea: area };
}

/**
 * Per-triangle cut/fill versus a horizontal reference level. The triangles use
 * the same vertex indices as `tin`, so the result can be rendered directly on
 * the source TIN's geometry as a coloured 3D earthworks model.
 */
export function cutFillToElevation(
  tin: SurfaceTin,
  reference: number,
): CutFillResult {
  return cutFillAccumulate(tin, (a, b, c) => [
    a.z - reference,
    b.z - reference,
    c.z - reference,
  ]);
}

/**
 * Per-triangle cut/fill between a `top` (existing) and `base` (design) surface,
 * sampling the base elevation under each top vertex. Triangles outside the base
 * surface fall back to a zero delta so they render neutral rather than skewing
 * the colour scale.
 */
export function cutFillBetween(
  top: SurfaceTin,
  base: SurfaceTin,
): CutFillResult {
  return cutFillAccumulate(top, (a, b, c) => [
    a.z - (sampleZ(base, a.n, a.e) ?? a.z),
    b.z - (sampleZ(base, b.n, b.e) ?? b.z),
    c.z - (sampleZ(base, c.n, c.e) ?? c.z),
  ]);
}

function cutFillAccumulate(
  tin: SurfaceTin,
  deltas: (
    a: SurfacePoint3,
    b: SurfacePoint3,
    c: SurfacePoint3,
  ) => [number, number, number],
): CutFillResult {
  const triangles: CutFillTriangle[] = [];
  let maxCut = 0;
  let maxFill = 0;
  for (const t of tin.triangles) {
    const a = tin.points[t.a];
    const b = tin.points[t.b];
    const c = tin.points[t.c];
    const triArea = triangleArea2d(a.e, a.n, b.e, b.n, c.e, c.n);
    if (triArea === 0) continue;
    const [da, db, dc] = deltas(a, b, c);
    if (![da, db, dc].every(Number.isFinite)) continue;
    const delta = (da + db + dc) / 3;
    // Use the split-prism volume so the totals stay correct even when a
    // triangle crosses the reference surface; keep the mean delta for colour.
    const split = { cut: 0, fill: 0 };
    accumulateSplitTriangle(split, a, b, c, da, db, dc);
    triangles.push({ a: t.a, b: t.b, c: t.c, delta, volume: split.cut - split.fill });
    if (delta > maxCut) maxCut = delta;
    if (-delta > maxFill) maxFill = -delta;
  }
  return { triangles, maxCut, maxFill };
}

function accumulate(
  tin: SurfaceTin,
  height: (z: number) => number,
): SurfaceVolumeResult {
  const acc = { cut: 0, fill: 0 };
  let area = 0;
  for (const t of tin.triangles) {
    const a = tin.points[t.a];
    const b = tin.points[t.b];
    const c = tin.points[t.c];
    const triArea = triangleArea2d(a.e, a.n, b.e, b.n, c.e, c.n);
    if (triArea === 0) continue;
    area += triArea;
    accumulateSplitTriangle(
      acc,
      a,
      b,
      c,
      height(a.z),
      height(b.z),
      height(c.z),
    );
  }
  return { cut: acc.cut, fill: acc.fill, net: acc.cut - acc.fill, planArea: area };
}

/* ── Triangle-level cut/fill splitting (zero-plane contour) ─────────────────── */

interface DepthVertex {
  n: number;
  e: number;
  d: number;
}

function triangleArea2dFromDepths(a: DepthVertex, b: DepthVertex, c: DepthVertex): number {
  return Math.abs((b.e - a.e) * (c.n - a.n) - (c.e - a.e) * (b.n - a.n)) / 2;
}

function signedDepthVolume(a: DepthVertex, b: DepthVertex, c: DepthVertex): number {
  const area = triangleArea2dFromDepths(a, b, c);
  if (area === 0) return 0;
  return (area * (a.d + b.d + c.d)) / 3;
}

function interpolateDepthEdge(p: DepthVertex, q: DepthVertex): DepthVertex {
  const t = p.d / (p.d - q.d);
  return { n: p.n + t * (q.n - p.n), e: p.e + t * (q.e - p.e), d: 0 };
}

/**
 * Accumulate a triangle's cut and fill, splitting by the zero-depth plane so
 * that mixed-sign triangles contribute to both buckets instead of netting away
 * inside one triangle.
 */
function accumulateSplitTriangle(
  acc: { cut: number; fill: number },
  a: { n: number; e: number },
  b: { n: number; e: number },
  c: { n: number; e: number },
  da: number,
  db: number,
  dc: number,
) {
  const verts: DepthVertex[] = [
    { n: a.n, e: a.e, d: da },
    { n: b.n, e: b.e, d: db },
    { n: c.n, e: c.e, d: dc },
  ];
  const pos = verts.map((v) => v.d >= 0);
  const allPositive = pos.every(Boolean);
  const allNegative = !pos.some(Boolean);

  if (allPositive) {
    acc.cut += signedDepthVolume(verts[0], verts[1], verts[2]);
    return;
  }
  if (allNegative) {
    acc.fill += -signedDepthVolume(verts[0], verts[1], verts[2]);
    return;
  }

  const posIdx = pos.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
  const negIdx = pos.map((p, i) => (!p ? i : -1)).filter((i) => i >= 0);

  if (posIdx.length === 1) {
    const i = posIdx[0];
    const j = negIdx[0];
    const k = negIdx[1];
    const pij = interpolateDepthEdge(verts[i], verts[j]);
    const pik = interpolateDepthEdge(verts[i], verts[k]);
    acc.cut += signedDepthVolume(verts[i], pij, pik);
    acc.fill += -signedDepthVolume(pij, verts[j], verts[k]);
    acc.fill += -signedDepthVolume(pij, verts[k], pik);
  } else {
    const i = negIdx[0];
    const j = posIdx[0];
    const k = posIdx[1];
    const pji = interpolateDepthEdge(verts[j], verts[i]);
    const pki = interpolateDepthEdge(verts[k], verts[i]);
    acc.fill += -signedDepthVolume(verts[i], pki, pji);
    acc.cut += signedDepthVolume(verts[j], pji, pki);
    acc.cut += signedDepthVolume(verts[j], pki, verts[k]);
  }
}

/** Barycentric elevation sample, or null when outside the TIN. */
export function sampleZ(tin: SurfaceTin, n: number, e: number): number | null {
  for (const t of tin.triangles) {
    const a = tin.points[t.a];
    const b = tin.points[t.b];
    const c = tin.points[t.c];
    const det = (b.n - c.n) * (a.e - c.e) + (c.e - b.e) * (a.n - c.n);
    if (Math.abs(det) < 1e-12) continue;
    const wa = ((b.n - c.n) * (e - c.e) + (c.e - b.e) * (n - c.n)) / det;
    const wb = ((c.n - a.n) * (e - c.e) + (a.e - c.e) * (n - c.n)) / det;
    const wc = 1 - wa - wb;
    const EPS = -1e-9;
    if (wa >= EPS && wb >= EPS && wc >= EPS) {
      return wa * a.z + wb * b.z + wc * c.z;
    }
  }
  return null;
}
