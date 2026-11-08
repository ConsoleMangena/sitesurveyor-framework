import { describe, expect, it } from "vitest";

import {
  chooseTileZoom,
  expandBoundsToAspect,
  formatDeg,
  formatMeters,
  niceGraticuleStep,
  padBounds,
  representativeFraction,
  scaleBarLayout,
  sheetMapRect,
} from "./mapExport.ts";
import { metersPerPixel } from "./workbench.ts";

describe("chooseTileZoom", () => {
  it("picks the smallest zoom fine enough for the requested resolution", () => {
    const needed = 1.2; // m/px
    const z = chooseTileZoom(-17.8, needed, 19);
    expect(metersPerPixel(-17.8, z)).toBeLessThanOrEqual(needed);
    expect(metersPerPixel(-17.8, z - 1)).toBeGreaterThan(needed);
  });

  it("never returns a zoom above the basemap's native cap", () => {
    expect(chooseTileZoom(0, 0.01, 19)).toBe(19);
    expect(chooseTileZoom(0, 0.0001, 19)).toBe(19);
  });
});

describe("expandBoundsToAspect", () => {
  it("widens a tall rectangle to the target aspect", () => {
    const grown = expandBoundsToAspect(
      { x: 100, y: 0 },
      { x: 200, y: 400 },
      2,
      1_000_000,
    );
    const w = grown.bottomRight.x - grown.topLeft.x;
    const h = grown.bottomRight.y - grown.topLeft.y;
    expect(w / h).toBeCloseTo(2, 6);
    // The original bounds stay covered (symmetric growth).
    expect(grown.topLeft.x).toBeLessThanOrEqual(100);
    expect(grown.topLeft.y).toBeLessThanOrEqual(0);
    expect(grown.bottomRight.x).toBeGreaterThanOrEqual(200);
    expect(grown.bottomRight.y).toBeGreaterThanOrEqual(400);
  });

  it("clamps to the tile world without flipping the rectangle", () => {
    const grown = expandBoundsToAspect({ x: 0, y: 0 }, { x: 5000, y: 5000 }, 1, 4096);
    expect(grown.topLeft.x).toBeGreaterThanOrEqual(0);
    expect(grown.topLeft.y).toBeGreaterThanOrEqual(0);
    expect(grown.bottomRight.x).toBeLessThanOrEqual(4096);
    expect(grown.bottomRight.y).toBeLessThanOrEqual(4096);
    expect(grown.bottomRight.x).toBeGreaterThan(grown.topLeft.x);
    expect(grown.bottomRight.y).toBeGreaterThan(grown.topLeft.y);
  });
});

describe("niceGraticuleStep", () => {
  it("keeps the tick count within the budget", () => {
    for (const span of [0.02, 0.35, 1.5, 12, 90]) {
      const { step } = niceGraticuleStep(span);
      const ticks = span / step;
      expect(ticks).toBeLessThanOrEqual(7);
      expect(ticks).toBeGreaterThanOrEqual(2);
    }
  });

  it("labels decimals match the step magnitude", () => {
    expect(niceGraticuleStep(0.5).decimals).toBe(1);
    expect(niceGraticuleStep(0.02).decimals).toBe(3);
    expect(niceGraticuleStep(0.001).decimals).toBe(4);
  });
});

describe("formatDeg", () => {
  it("names hemispheres from the sign, not an assumed one", () => {
    expect(formatDeg(-17.8252, "lat", 4)).toBe("17.8252°S");
    expect(formatDeg(51.1163, "lat", 4)).toBe("51.1163°N");
    expect(formatDeg(-149.5, "lon", 1)).toBe("149.5°W");
    expect(formatDeg(31.0341, "lon", 4)).toBe("31.0341°E");
  });

  it("renders zero as north/east", () => {
    expect(formatDeg(0, "lat", 0)).toBe("0°N");
    expect(formatDeg(0, "lon", 0)).toBe("0°E");
  });
});

describe("scaleBarLayout", () => {
  it("never stretches the bar: widthPt is exactly meters / groundPerPt", () => {
    for (const groundPerPt of [0.05, 0.35, 2.7, 18, 120]) {
      const { meters, widthPt } = scaleBarLayout(groundPerPt);
      expect(widthPt).toBeCloseTo(meters / groundPerPt, 6);
    }
  });

  it("picks a round, map-like distance", () => {
    const raws = [0.05, 0.35, 2.7, 18, 120].map((g) => scaleBarLayout(g).meters);
    for (const meters of raws) {
      const mantissa = meters / 10 ** Math.floor(Math.log10(meters));
      expect([1, 2, 2.5, 5]).toContain(mantissa);
    }
  });
});

describe("representativeFraction", () => {
  it("converts ground metres per point to a 1:N denominator", () => {
    // 1 pt = 1/72 inch; 0.0254 m of ground per point is exactly 1:1.
    expect(representativeFraction(0.0254 / 72)).toBe(1);
  });

  it("scales linearly with ground resolution", () => {
    expect(representativeFraction(2 * 0.0254 / 72)).toBe(
      2 * representativeFraction(0.0254 / 72),
    );
  });
});

describe("formatMeters", () => {
  it("switches to kilometres above 1000 m", () => {
    expect(formatMeters(999)).toBe("999 m");
    expect(formatMeters(1250)).toBe("1.25 km");
    expect(formatMeters(45_000)).toBe("45.0 km");
    expect(formatMeters(300_000)).toBe("300 km");
  });
});

describe("padBounds", () => {
  it("grows each side by the fraction of the rectangle", () => {
    const padded = padBounds(-1, 20, 1, 22, 0.25);
    expect(padded.south).toBeCloseTo(-1.5, 10);
    expect(padded.north).toBeCloseTo(1.5, 10);
    expect(padded.west).toBeCloseTo(19.5, 10);
    expect(padded.east).toBeCloseTo(22.5, 10);
  });

  it("stays inside the Web Mercator world", () => {
    const padded = padBounds(-84.9, -179.9, 84.9, 179.9, 0.25);
    expect(padded.south).toBeGreaterThanOrEqual(-85);
    expect(padded.north).toBeLessThanOrEqual(85);
    expect(padded.west).toBeGreaterThanOrEqual(-180);
    expect(padded.east).toBeLessThanOrEqual(180);
  });
});

describe("sheetMapRect", () => {
  it("leaves room for the right panel and fits inside the sheet", () => {
    const rect = sheetMapRect();
    expect(rect.w).toBeGreaterThan(0);
    expect(rect.h).toBeGreaterThan(0);
    expect(rect.x + rect.w).toBeLessThan(842 - 216);
  });
});
