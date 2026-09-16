import { describe, it, expect } from "vitest";
import {
  buildTin,
  planArea,
  generateContours,
  smoothContourVertices,
  volumeToElevation,
  volumeBetween,
  sampleZ,
  type SurfacePoint3,
  type SurfaceVertex,
} from "./surface.ts";

function square(z = 0): SurfacePoint3[] {
  return [
    { n: 0, e: 0, z },
    { n: 0, e: 10, z },
    { n: 10, e: 10, z },
    { n: 10, e: 0, z },
  ];
}

function ramp(): SurfacePoint3[] {
  // Z increases with N from 0 to 10.
  return [
    { n: 0, e: 0, z: 0 },
    { n: 0, e: 10, z: 0 },
    { n: 10, e: 0, z: 10 },
    { n: 10, e: 10, z: 10 },
  ];
}

describe("surface TIN", () => {
  it("returns no triangles for fewer than 3 points", () => {
    expect(buildTin([{ n: 0, e: 0, z: 0 }]).triangles).toHaveLength(0);
  });

  it("triangulates a square into two triangles", () => {
    expect(buildTin(square()).triangles).toHaveLength(2);
  });

  it("computes correct plan area", () => {
    expect(planArea(buildTin(square()))).toBeCloseTo(100, 6);
  });

  it("stays precise on large UTM coordinates", () => {
    const baseN = 8_000_000;
    const baseE = 300_000;
    const tin = buildTin([
      { n: baseN, e: baseE, z: 1000 },
      { n: baseN + 50, e: baseE, z: 1002 },
      { n: baseN + 50, e: baseE + 50, z: 1004 },
      { n: baseN, e: baseE + 50, z: 1001 },
    ]);
    expect(tin.triangles).toHaveLength(2);
    expect(planArea(tin)).toBeCloseTo(2500, 2);
  });
});

describe("surface contours", () => {
  it("returns empty for zero interval", () => {
    expect(generateContours(buildTin(ramp()), 0)).toHaveLength(0);
  });

  it("produces contour levels strictly inside the elevation range", () => {
    const contours = generateContours(buildTin(ramp()), 2, 0);
    const levels = [...new Set(contours.map((c) => c.elevation))].sort(
      (a, b) => a - b,
    );
    expect(levels).toEqual([2, 4, 6, 8]);
  });

  it("places the Z=5 contour at mid-slope", () => {
    const contours = generateContours(buildTin(ramp()), 5, 0);
    const line = contours.find((c) => Math.abs(c.elevation - 5) < 1e-9);
    expect(line).toBeDefined();
    for (const v of line!.vertices) {
      expect(v.n).toBeCloseTo(5, 6);
    }
  });

  it("does not drop segments when a TIN vertex lies exactly on the contour level", () => {
    // Bowl surface: centre point at (5,5) EXACTLY on the level 5, corners
    // above/below. Contours through exact-RL spot levels must connect
    // through the vertex instead of gapping out.
    const points: SurfacePoint3[] = [
      { n: 0, e: 0, z: 10 },
      { n: 0, e: 10, z: 10 },
      { n: 10, e: 10, z: 10 },
      { n: 10, e: 0, z: 10 },
      { n: 5, e: 5, z: 5 }, // exactly on the level
      { n: 0, e: 5, z: 0 }, // below, so the 5-level line is forced through the middle
      { n: 10, e: 5, z: 0 },
    ];
    const contours = generateContours(buildTin(points), 5, 0);
    const line = contours.find((c) => Math.abs(c.elevation - 5) < 1e-9);
    expect(line).toBeDefined();
    // Some segment endpoint must BE the on-level vertex (5,5).
    const hitsVertex = line!.vertices.some(
      (v) => Math.abs(v.n - 5) < 1e-6 && Math.abs(v.e - 5) < 1e-6,
    );
    expect(hitsVertex).toBe(true);
  });
});

describe("contour smoothing (Chaikin)", () => {
  it("keeps a straight line on the line", () => {
    const line: SurfaceVertex[] = [
      { n: 0, e: 0 },
      { n: 5, e: 0 },
      { n: 10, e: 0 },
    ];
    const smoothed = smoothContourVertices(line, 2);
    for (const v of smoothed) expect(v.e).toBeCloseTo(0, 9);
    // Endpoints are preserved exactly on an open chain.
    expect(smoothed[0]).toEqual({ n: 0, e: 0 });
    expect(smoothed[smoothed.length - 1]).toEqual({ n: 10, e: 0 });
  });

  it("rounds a right-angle corner (adds vertices, keeps ends)", () => {
    const corner: SurfaceVertex[] = [
      { n: 0, e: 0 },
      { n: 10, e: 0 },
      { n: 10, e: 10 },
    ];
    const smoothed = smoothContourVertices(corner, 2);
    expect(smoothed.length).toBeGreaterThan(corner.length);
    expect(smoothed[0]).toEqual({ n: 0, e: 0 });
    expect(smoothed[smoothed.length - 1]).toEqual({ n: 10, e: 10 });
  });

  it("smooths a closed ring cyclically (stays closed)", () => {
    const ring: SurfaceVertex[] = [
      { n: 0, e: 0 },
      { n: 10, e: 0 },
      { n: 10, e: 10 },
      { n: 0, e: 10 },
      { n: 0, e: 0 },
    ];
    const smoothed = smoothContourVertices(ring, 2);
    const first = smoothed[0];
    const last = smoothed[smoothed.length - 1];
    expect(first.n).toBeCloseTo(last.n, 9);
    expect(first.e).toBeCloseTo(last.e, 9);
  });

  it("is a no-op for zero iterations or tiny chains", () => {
    const line: SurfaceVertex[] = [{ n: 0, e: 0 }, { n: 1, e: 1 }];
    expect(smoothContourVertices(line, 0)).toBe(line);
    expect(smoothContourVertices(line, 2)).toBe(line); // < 3 points
  });

  it("generateContours applies smoothing when requested", () => {
    const raw = generateContours(buildTin(ramp()), 5, 0, 0);
    const soft = generateContours(buildTin(ramp()), 5, 0, 3);
    const rawLine = raw.find((c) => Math.abs(c.elevation - 5) < 1e-9)!;
    const softLine = soft.find((c) => Math.abs(c.elevation - 5) < 1e-9)!;
    // Smoothing subdivides, so the smoothed line has more vertices, and the
    // contour stays at mid-slope (n ≈ 5) since the ramp face is planar.
    expect(softLine.vertices.length).toBeGreaterThanOrEqual(rawLine.vertices.length);
    for (const v of softLine.vertices) expect(v.n).toBeCloseTo(5, 6);
  });
});

describe("surface volumes", () => {
  it("computes pure cut above a datum", () => {
    const v = volumeToElevation(buildTin(square(5)), 0);
    expect(v.cut).toBeCloseTo(500, 6);
    expect(v.fill).toBeCloseTo(0, 9);
    expect(v.planArea).toBeCloseTo(100, 6);
  });

  it("computes pure fill below a datum", () => {
    const v = volumeToElevation(buildTin(square(2)), 10);
    expect(v.fill).toBeCloseTo(800, 6);
    expect(v.cut).toBeCloseTo(0, 9);
    expect(v.net).toBeCloseTo(-800, 6);
  });

  it("computes volume between two flat surfaces", () => {
    const v = volumeBetween(buildTin(square(8)), buildTin(square(3)));
    expect(v.cut).toBeCloseTo(500, 6);
    expect(v.fill).toBeCloseTo(0, 9);
  });

  it("splits a mixed-sign triangle into separate cut and fill", () => {
    const mixed: SurfacePoint3[] = [
      { n: 0, e: 0, z: 5 },
      { n: 10, e: 0, z: -5 },
      { n: 0, e: 10, z: -5 },
    ];
    const v = volumeToElevation(buildTin(mixed), 0);
    expect(v.planArea).toBeCloseTo(50, 6);
    expect(v.cut).toBeCloseTo(125 / 6, 6);
    expect(v.fill).toBeCloseTo(625 / 6, 6);
    expect(v.net).toBeCloseTo(-250 / 3, 6);
  });

  it("samples interpolated elevation at the centre", () => {
    expect(sampleZ(buildTin(square(7)), 5, 5)).toBeCloseTo(7, 9);
  });
});
