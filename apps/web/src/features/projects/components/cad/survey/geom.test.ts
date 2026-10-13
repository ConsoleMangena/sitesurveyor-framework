import { describe, it, expect } from "vitest";
import {
  polygonArea,
  convexHull,
  simplify,
  centroid,
  pointInPolygon,
  bounds,
} from "./geom.ts";

const square = [
  { n: 0, e: 0 },
  { n: 0, e: 10 },
  { n: 10, e: 10 },
  { n: 10, e: 0 },
];

describe("polygonArea", () => {
  it("computes square area", () => {
    expect(polygonArea(square)).toBeCloseTo(100, 9);
  });
  it("is winding-independent", () => {
    expect(polygonArea([...square].reverse())).toBeCloseTo(100, 9);
  });
  it("returns 0 for degenerate ring", () => {
    expect(polygonArea([{ n: 0, e: 0 }, { n: 1, e: 1 }])).toBe(0);
  });
});

describe("convexHull", () => {
  it("drops interior points", () => {
    const hull = convexHull([...square, { n: 5, e: 5 }]);
    expect(hull.length).toBe(4);
  });
  it("returns the hull spanning the extents", () => {
    const hull = convexHull(square);
    expect(bounds(hull)).toEqual({ minN: 0, maxN: 10, minE: 0, maxE: 10 });
  });
});

describe("simplify", () => {
  it("removes a collinear midpoint", () => {
    const line = [
      { n: 0, e: 0 },
      { n: 0, e: 5 },
      { n: 0, e: 10 },
    ];
    expect(simplify(line, 0.01).length).toBe(2);
  });
  it("keeps a point that deviates beyond tolerance", () => {
    const line = [
      { n: 0, e: 0 },
      { n: 5, e: 5 },
      { n: 0, e: 10 },
    ];
    expect(simplify(line, 0.01).length).toBe(3);
  });
});

describe("centroid", () => {
  it("is the square center", () => {
    expect(centroid(square)).toEqual({ n: 5, e: 5 });
  });
  it("is null for a degenerate ring", () => {
    expect(centroid([{ n: 0, e: 0 }, { n: 1, e: 1 }])).toBeNull();
  });
});

describe("pointInPolygon", () => {
  it("detects inside and outside", () => {
    expect(pointInPolygon(square, { n: 5, e: 5 })).toBe(true);
    expect(pointInPolygon(square, { n: 50, e: 50 })).toBe(false);
  });
});

describe("bounds", () => {
  it("returns null for empty input", () => {
    expect(bounds([])).toBeNull();
  });
});
