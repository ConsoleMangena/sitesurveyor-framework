/**
 * Pure-TypeScript planar geometry algorithms.
 *
 * Mirrors the GeoRust-backed `survey-core::geom` Rust module exactly and serves
 * as the guaranteed fallback when the `survey-wasm` module is unavailable. The
 * WASM path (built from `geo`) is preferred for robustness/speed on large
 * inputs; results are numerically equivalent for well-formed input.
 *
 * Convention matches `cogo.ts`: vertices are Northing (`n`) / Easting (`e`).
 */

export interface GeomVertex {
  n: number;
  e: number;
}

export interface GeomBounds {
  minN: number;
  maxN: number;
  minE: number;
  maxE: number;
}

/** Unsigned polygon area (shoelace) of a closed ring; 0 for < 3 vertices. */
export function polygonArea(ring: GeomVertex[]): number {
  if (ring.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sum += a.e * b.n - b.e * a.n;
  }
  return Math.abs(sum) / 2;
}

/**
 * Convex hull (monotone chain / Andrew's algorithm), returned CCW as an open
 * ring. Triangulation/area conventions match the Rust `geo` output.
 */
export function convexHull(points: GeomVertex[]): GeomVertex[] {
  if (points.length < 3) return [...points];
  // Sort by E then N (x then y).
  const pts = [...points].sort((p, q) => (p.e - q.e) || (p.n - q.n));
  const cross = (o: GeomVertex, a: GeomVertex, b: GeomVertex) =>
    (a.e - o.e) * (b.n - o.n) - (a.n - o.n) * (b.e - o.e);

  const lower: GeomVertex[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: GeomVertex[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  // Drop the last point of each list (it's the start of the other).
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Ramer–Douglas–Peucker simplification; epsilon is max perpendicular deviation. */
export function simplify(line: GeomVertex[], epsilon: number): GeomVertex[] {
  if (epsilon <= 0 || line.length < 3) return [...line];

  const perpDist = (p: GeomVertex, a: GeomVertex, b: GeomVertex): number => {
    const dn = b.n - a.n;
    const de = b.e - a.e;
    const len = Math.hypot(dn, de);
    if (len === 0) return Math.hypot(p.n - a.n, p.e - a.e);
    // |cross product| / |segment|.
    return Math.abs(de * (a.n - p.n) - (a.e - p.e) * dn) / len;
  };

  const rdp = (pts: GeomVertex[]): GeomVertex[] => {
    if (pts.length < 3) return pts;
    let maxD = 0;
    let idx = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > epsilon) {
      const left = rdp(pts.slice(0, idx + 1));
      const right = rdp(pts.slice(idx));
      return left.slice(0, -1).concat(right);
    }
    return [pts[0], pts[pts.length - 1]];
  };

  return rdp(line);
}

/** Centroid of a closed polygon ring, or null for a degenerate ring. */
export function centroid(ring: GeomVertex[]): GeomVertex | null {
  if (ring.length < 3) return null;
  let area2 = 0;
  let cn = 0;
  let ce = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const crossv = a.e * b.n - b.e * a.n;
    area2 += crossv;
    cn += (a.n + b.n) * crossv;
    ce += (a.e + b.e) * crossv;
  }
  if (Math.abs(area2) < 1e-12) return null;
  return { n: cn / (3 * area2), e: ce / (3 * area2) };
}

/** Point-in-polygon test (ray casting) for a closed ring. */
export function pointInPolygon(ring: GeomVertex[], p: GeomVertex): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    const intersect =
      a.n > p.n !== b.n > p.n &&
      p.e < ((b.e - a.e) * (p.n - a.n)) / (b.n - a.n) + a.e;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Bounding rectangle of a vertex set, or null when empty. */
export function bounds(points: GeomVertex[]): GeomBounds | null {
  if (points.length === 0) return null;
  let minN = Infinity;
  let maxN = -Infinity;
  let minE = Infinity;
  let maxE = -Infinity;
  for (const p of points) {
    minN = Math.min(minN, p.n);
    maxN = Math.max(maxN, p.n);
    minE = Math.min(minE, p.e);
    maxE = Math.max(maxE, p.e);
  }
  return { minN, maxN, minE, maxE };
}
