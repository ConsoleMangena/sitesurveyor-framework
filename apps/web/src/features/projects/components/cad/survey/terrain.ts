/**
 * Pure-TypeScript terrain analysis over a TIN (slope, aspect, 3D surface area
 * and whole-surface statistics).
 *
 * Mirrors the Rust `survey-core::terrain` module exactly and serves as the
 * guaranteed fallback when the WebAssembly module is unavailable. Both paths
 * are numerically equivalent.
 *
 * Conventions match `surface.ts`: coordinates are Y/Northing (`n`) /
 * X/Easting (`e`) / Z/Elevation (`z`); all angles are in degrees, and aspect
 * is an azimuth measured clockwise from North (0 = faces North, 90 = East).
 */

import type { SurfaceTin } from "./surface.ts";

const DEG = 180 / Math.PI;

/** Slope / aspect / area facts for a single TIN triangle. */
export interface TriangleAnalysis {
  /** Index of the triangle within `SurfaceTin.triangles`. */
  index: number;
  /** Slope angle from horizontal, degrees (0 = flat, 90 = vertical). */
  slopeDeg: number;
  /** Slope as a percentage grade (rise/run × 100). */
  slopePercent: number;
  /**
   * Aspect: downslope-facing azimuth in degrees clockwise from North
   * (0 = faces North, 90 = East). `null` for a flat triangle.
   */
  aspectDeg: number | null;
  /** Plan (projected) area, m². */
  planArea: number;
  /** True 3D surface area, m² (>= plan area). */
  surfaceArea: number;
}

/** Whole-surface terrain statistics aggregated from the per-triangle analysis. */
export interface TerrainStats {
  planArea: number;
  surfaceArea: number;
  meanSlopeDeg: number;
  minSlopeDeg: number;
  maxSlopeDeg: number;
  minElevation: number;
  maxElevation: number;
  triangles: number;
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

/** Analyse every triangle of the TIN for slope, aspect and area. */
export function analyseTriangles(tin: SurfaceTin): TriangleAnalysis[] {
  const out: TriangleAnalysis[] = [];
  tin.triangles.forEach((t, index) => {
    const a = tin.points[t.a];
    const b = tin.points[t.b];
    const c = tin.points[t.c];
    if (!a || !b || !c) return;

    // Edge vectors in (E, N, Z).
    const u = [b.e - a.e, b.n - a.n, b.z - a.z] as const;
    const v = [c.e - a.e, c.n - a.n, c.z - a.z] as const;

    // Normal = u × v.
    const nx = u[1] * v[2] - u[2] * v[1];
    const ny = u[2] * v[0] - u[0] * v[2];
    const nz = u[0] * v[1] - u[1] * v[0];
    const nlen = Math.sqrt(nx * nx + ny * ny + nz * nz);

    const planArea = triangleArea2d(a.e, a.n, b.e, b.n, c.e, c.n);
    const surfaceArea = nlen / 2;

    let slopeDeg = 0;
    let aspectDeg: number | null = null;
    if (nlen >= 1e-12) {
      const cosSlope = Math.abs(nz) / nlen;
      slopeDeg = Math.acos(Math.min(1, Math.max(-1, cosSlope))) * DEG;

      // Orient the normal up so its horizontal projection points downslope.
      const dx = nz >= 0 ? nx : -nx;
      const dy = nz >= 0 ? ny : -ny;
      if (Math.abs(dx) >= 1e-12 || Math.abs(dy) >= 1e-12) {
        let az = Math.atan2(dx, dy) * DEG;
        if (az < 0) az += 360;
        aspectDeg = az;
      }
    }

    out.push({
      index,
      slopeDeg,
      slopePercent: Math.tan(slopeDeg / DEG) * 100,
      aspectDeg,
      planArea,
      surfaceArea,
    });
  });
  return out;
}

/** Aggregate whole-surface statistics from a TIN, or null when empty. */
export function terrainStats(tin: SurfaceTin): TerrainStats | null {
  if (tin.triangles.length === 0 || tin.points.length === 0) return null;
  const tris = analyseTriangles(tin);

  let planArea = 0;
  let surfaceArea = 0;
  let weightedSlope = 0;
  let minSlope = Infinity;
  let maxSlope = -Infinity;
  for (const t of tris) {
    planArea += t.planArea;
    surfaceArea += t.surfaceArea;
    weightedSlope += t.slopeDeg * t.planArea;
    minSlope = Math.min(minSlope, t.slopeDeg);
    maxSlope = Math.max(maxSlope, t.slopeDeg);
  }

  let minElevation = Infinity;
  let maxElevation = -Infinity;
  for (const p of tin.points) {
    minElevation = Math.min(minElevation, p.z);
    maxElevation = Math.max(maxElevation, p.z);
  }

  const meanSlopeDeg = planArea > 0 ? weightedSlope / planArea : 0;

  return {
    planArea,
    surfaceArea,
    meanSlopeDeg,
    minSlopeDeg: Number.isFinite(minSlope) ? minSlope : 0,
    maxSlopeDeg: Number.isFinite(maxSlope) ? maxSlope : 0,
    minElevation,
    maxElevation,
    triangles: tris.length,
  };
}

/**
 * Map a slope angle (degrees) to a colour on a green→yellow→red ramp, for
 * slope-shaded terrain rendering. `maxSlope` sets the top of the scale.
 */
export function slopeColor(slopeDeg: number, maxSlope: number): string {
  const denom = maxSlope > 0 ? maxSlope : 1;
  const t = Math.min(1, Math.max(0, slopeDeg / denom));
  // 0 → green (120°), 0.5 → yellow (60°), 1 → red (0°).
  const hue = 120 * (1 - t);
  return `hsl(${hue.toFixed(0)}, 80%, 45%)`;
}
