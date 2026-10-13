import { describe, it, expect } from "vitest";
import { analyseTriangles, terrainStats, slopeColor } from "./terrain.ts";
import { buildTin } from "./surface.ts";

/** Flat surface at Z=5: slope 0, surface area == plan area (100 m²). */
function flat() {
  return buildTin([
    { n: 0, e: 0, z: 5 },
    { n: 10, e: 0, z: 5 },
    { n: 10, e: 10, z: 5 },
    { n: 0, e: 10, z: 5 },
  ]);
}

/**
 * Plane tilted so Z rises 1:1 toward increasing Easting (Z == E): a 45° slope
 * whose downhill (steepest-descent) direction faces West (aspect 270°).
 */
function rampEast() {
  return buildTin([
    { n: 0, e: 0, z: 0 },
    { n: 10, e: 0, z: 0 },
    { n: 0, e: 10, z: 10 },
    { n: 10, e: 10, z: 10 },
  ]);
}

describe("analyseTriangles", () => {
  it("reports zero slope for a flat surface", () => {
    const tris = analyseTriangles(flat());
    expect(tris.length).toBeGreaterThan(0);
    for (const t of tris) {
      expect(t.slopeDeg).toBeCloseTo(0, 9);
      expect(t.surfaceArea).toBeCloseTo(t.planArea, 6);
    }
  });

  it("computes 45° slope facing West on an east-rising ramp", () => {
    const tris = analyseTriangles(rampEast());
    for (const t of tris) {
      expect(t.slopeDeg).toBeCloseTo(45, 6);
      expect(t.aspectDeg).not.toBeNull();
      expect(t.aspectDeg as number).toBeCloseTo(270, 6);
    }
  });
});

describe("terrainStats", () => {
  it("aggregates whole-surface statistics", () => {
    const stats = terrainStats(flat());
    expect(stats).not.toBeNull();
    expect(stats!.planArea).toBeCloseTo(100, 6);
    expect(stats!.surfaceArea).toBeCloseTo(100, 6);
    expect(stats!.maxSlopeDeg).toBeCloseTo(0, 9);
  });

  it("returns rugosity via surface/plan for a 45° ramp", () => {
    const stats = terrainStats(rampEast());
    expect(stats).not.toBeNull();
    // Surface area = plan / cos(45°) = 100 / 0.7071 ≈ 141.42.
    expect(stats!.surfaceArea).toBeCloseTo(141.42135, 3);
    expect(stats!.meanSlopeDeg).toBeCloseTo(45, 6);
  });

  it("returns null for an empty TIN", () => {
    const tin = buildTin([{ n: 0, e: 0, z: 0 }]);
    expect(terrainStats(tin)).toBeNull();
  });
});

describe("slopeColor", () => {
  it("maps flat to green and steep to red", () => {
    expect(slopeColor(0, 45)).toContain("120"); // hue 120 = green
    expect(slopeColor(45, 45)).toContain("0,"); // hue 0 = red
  });
});
