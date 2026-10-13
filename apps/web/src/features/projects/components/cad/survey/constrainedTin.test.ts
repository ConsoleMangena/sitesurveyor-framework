import { describe, it, expect } from "vitest";
import { buildTin, buildConstrainedTin, type SurfacePoint3 } from "./surface.ts";

function grid(): SurfacePoint3[] {
  const pts: SurfacePoint3[] = [];
  for (let n = 0; n <= 20; n += 10) {
    for (let e = 0; e <= 20; e += 10) {
      pts.push({ n, e, z: 0 });
    }
  }
  return pts; // 9-point 3×3 grid
}

describe("buildConstrainedTin", () => {
  it("matches unconstrained TIN when no constraints are given", () => {
    const pts = grid();
    const plain = buildTin(pts);
    const constrained = buildConstrainedTin(pts);
    expect(constrained.triangles.length).toBe(plain.triangles.length);
  });

  it("clips triangles whose centroid falls outside the boundary", () => {
    const pts = grid();
    // Boundary covering only the lower-left quadrant (0..10 in both axes).
    const boundary = {
      vertices: [
        { n: 0, e: 0 },
        { n: 0, e: 10 },
        { n: 10, e: 10 },
        { n: 10, e: 0 },
      ],
    };
    const full = buildConstrainedTin(pts);
    const clipped = buildConstrainedTin(pts, { boundary });
    expect(clipped.triangles.length).toBeGreaterThan(0);
    expect(clipped.triangles.length).toBeLessThan(full.triangles.length);

    // Every surviving triangle's centroid must lie within the boundary.
    for (const t of clipped.triangles) {
      const a = clipped.points[t.a];
      const b = clipped.points[t.b];
      const c = clipped.points[t.c];
      const cx = (a.e + b.e + c.e) / 3;
      const cy = (a.n + b.n + c.n) / 3;
      expect(cx).toBeGreaterThanOrEqual(0);
      expect(cx).toBeLessThanOrEqual(10);
      expect(cy).toBeGreaterThanOrEqual(0);
      expect(cy).toBeLessThanOrEqual(10);
    }
  });

  it("removes triangles crossed by a breakline", () => {
    const pts = grid();
    // A breakline cutting horizontally across the middle row.
    const breakline = { vertices: [{ n: 5, e: 0 }, { n: 5, e: 20 }] };
    const full = buildConstrainedTin(pts);
    const withBreak = buildConstrainedTin(pts, { breaklines: [breakline] });
    expect(withBreak.triangles.length).toBeLessThan(full.triangles.length);
  });
});
