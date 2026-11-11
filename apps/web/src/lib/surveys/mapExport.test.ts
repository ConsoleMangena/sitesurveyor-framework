import { describe, expect, it } from "vitest";

import {
  chooseTileZoom,
  expandBoundsToAspect,
  formatDeg,
  formatMeters,
  forwardUTM,
  gridLabelAnchor,
  gridLabelPlacement,
  niceGraticuleStep,
  overzoomQuadrant,
  padBounds,
  representativeFraction,
  scaleBarLayout,
  sheetGeometryFor,
  sheetMapRect,
  sheetPanelRect,
  utmGridLines,
  utmGridStep,
  utmZoneFor,
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

  it("mirrors the map when the panel moves to the left", () => {
    const right = sheetMapRect("right");
    const left = sheetMapRect("left");
    expect(left.x).toBeGreaterThan(right.x);
    expect(left.w).toBe(right.w);
    // Panel left: the map runs to the sheet's right margin.
    expect(left.x + left.w).toBeLessThanOrEqual(842 - 18);
    expect(sheetPanelRect("left").x).toBe(18);
    expect(sheetPanelRect("right").x).toBeGreaterThan(sheetPanelRect("left").x);
  });
});

describe("sheetGeometryFor", () => {
  it("defaults to the A4 landscape sheet the layout was built on", () => {
    const geometry = sheetGeometryFor();
    expect(geometry.widthPt).toBe(842);
    expect(geometry.heightPt).toBe(595);
    expect(geometry.panelWidthPt).toBe(216);
  });

  it("swaps the sides for portrait without changing the paper", () => {
    const landscape = sheetGeometryFor("a4", "landscape");
    const portrait = sheetGeometryFor("a4", "portrait");
    expect(portrait.widthPt).toBe(landscape.heightPt);
    expect(portrait.heightPt).toBe(landscape.widthPt);
  });

  it("offers the four papers at their true point sizes", () => {
    expect(sheetGeometryFor("a3", "landscape").widthPt).toBe(1191);
    expect(sheetGeometryFor("letter", "landscape").widthPt).toBe(792);
    expect(sheetGeometryFor("tabloid", "landscape").widthPt).toBe(1224);
  });

  it("keeps the panel's share of the page as the paper grows", () => {
    const a4 = sheetGeometryFor("a4");
    const a3 = sheetGeometryFor("a3");
    const letter = sheetGeometryFor("letter");
    expect(a3.panelWidthPt).toBeGreaterThan(a4.panelWidthPt);
    expect(letter.panelWidthPt).toBeLessThan(a4.panelWidthPt);
    // The map frame keeps a positive size on every paper and orientation.
    for (const size of ["a4", "a3", "letter", "tabloid"] as const) {
      for (const orientation of ["landscape", "portrait"] as const) {
        const geometry = sheetGeometryFor(size, orientation);
        const mapW =
          geometry.widthPt - geometry.marginPt * 2 - geometry.panelWidthPt - geometry.panelGapPt;
        expect(mapW).toBeGreaterThan(100);
      }
    }
  });
});

describe("utmZoneFor", () => {
  it("splits Zimbabwe across zones 35 and 36", () => {
    expect(utmZoneFor(29.85)).toBe(35);
    expect(utmZoneFor(31.03)).toBe(36);
    expect(utmZoneFor(25.86)).toBe(35);
  });
});

describe("forwardUTM", () => {
  it("puts the central meridian at 500000 E and the equator at 0 N", () => {
    const p = forwardUTM(0, 3, 31); // zone 31 covers 0-6E, CM = 3E
    expect(p.easting).toBeCloseTo(500000, 0);
    expect(p.northing).toBeCloseTo(0, 0);
  });

  it("adds the 10,000,000 m false northing south of the equator", () => {
    const p = forwardUTM(-19.5, 29.85, 35);
    expect(p.northing).toBeGreaterThan(7_800_000);
    expect(p.northing).toBeLessThan(7_900_000);
  });

  it("is symmetric about the central meridian", () => {
    const zone = 35;
    const cm = (zone - 1) * 6 - 180 + 3;
    const left = forwardUTM(-19.5, cm - 0.5, zone).easting;
    const right = forwardUTM(-19.5, cm + 0.5, zone).easting;
    expect(left + right).toBeCloseTo(1_000_000, 1);
  });
});

describe("utmGridStep", () => {
  it("picks a coarse enough interval for the tick budget", () => {
    expect(utmGridStep(120_000, 6)).toBe(20_000);
    expect(utmGridStep(30_000, 6)).toBe(5_000);
    expect(utmGridStep(5_000, 8)).toBe(1_000);
  });
});

describe("utmGridLines", () => {
  const extent = { south: -20.38, west: 28.35, north: -19.92, east: 28.81 };
  const grid = utmGridLines(extent, 6);

  it("uses the sheet centre's zone", () => {
    expect(grid.zone).toBe(35);
  });

  it("labels every line with its full meter value on the shared step", () => {
    expect(grid.lines.length).toBeGreaterThan(3);
    for (const line of grid.lines) {
      expect(line.value % grid.step).toBe(0);
      expect(line.label).toBe(String(Math.round(line.value)));
    }
  });

  it("returns lines whose points actually sit on the named easting/northing", () => {
    for (const line of grid.lines) {
      for (const { lat, lng } of line.path) {
        const p = forwardUTM(lat, lng, grid.zone);
        const measured = line.axis === "x" ? p.easting : p.northing;
        expect(Math.abs(measured - line.value)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("draws both line families", () => {
    expect(grid.lines.some((l) => l.axis === "x")).toBe(true);
    expect(grid.lines.some((l) => l.axis === "y")).toBe(true);
  });
});

describe("niceGraticuleStep density", () => {
  it("honours a caller-supplied tick budget", () => {
    expect(niceGraticuleStep(0.5, 3).step).toBe(0.2);
    expect(niceGraticuleStep(0.5, 7).step).toBe(0.1);
  });
});

describe("overzoomQuadrant", () => {
  it("keeps the tile whole at or below the archive's native cap", () => {
    expect(overzoomQuadrant(16, 49304, 31330, 16)).toEqual({ shift: 0, qx: 0, qy: 0 });
    expect(overzoomQuadrant(9, 241, 134, 16)).toEqual({ shift: 0, qx: 0, qy: 0 });
  });

  it("names the quadrant of the native parent a deeper zoom stretches", () => {
    // z18 x49304 y31330 sits in the third row, first column of its z16 parent.
    const q = overzoomQuadrant(18, 49304, 31330, 16);
    expect(q).toEqual({ shift: 2, qx: 0, qy: 2 });
    expect(49304 >> q.shift).toBe(12326);
    expect(31330 >> q.shift).toBe(7832);
  });
});

describe("gridLabelAnchor", () => {
  it("anchors an easting line at the top edge, where its label is printed", () => {
    // A UTM easting line leans as it crosses the sheet, so the top and bottom
    // ends sit at different x. The label belongs to the end on the labelled edge.
    const path = [
      { x: 40, y: 0 },
      { x: 46, y: 150 },
      { x: 52, y: 300 },
    ];
    expect(gridLabelAnchor("x", path)).toEqual({ x: 40, y: 0 });
  });

  it("anchors a northing line at the left edge", () => {
    const path = [
      { x: 0, y: 210 },
      { x: 150, y: 204 },
      { x: 300, y: 198 },
    ];
    expect(gridLabelAnchor("y", path)).toEqual({ x: 0, y: 210 });
  });

  it("keeps a straight line's anchor on that line", () => {
    const vertical = [
      { x: 120, y: 300 },
      { x: 120, y: 0 },
    ];
    const anchor = gridLabelAnchor("x", vertical);
    expect(anchor.x).toBe(120);
    expect(anchor.y).toBe(0);
  });

  it("survives an empty path instead of throwing", () => {
    expect(gridLabelAnchor("x", [])).toEqual({ x: 0, y: 0 });
  });
});

describe("gridLabelPlacement", () => {
  const mapRect = { x: 20, y: 20, w: 700, h: 480 };
  const ptPerPx = 0.72;

  it("centres an easting chip on its own tick", () => {
    const place = gridLabelPlacement({
      axis: "x",
      anchorPt: { x: 300, y: 0 },
      chipW: 26,
      mapRect,
      ptPerPx,
    });
    const tickX = place.tick.x0;
    expect(place.chip.x + place.chip.w / 2).toBeCloseTo(tickX, 6);
    // The tick crosses the top edge, the same edge the chip sits under.
    expect(place.tick.y1).toBeGreaterThan(mapRect.y);
    expect(place.tick.y0).toBeLessThan(mapRect.y);
    expect(place.chip.top).toBeGreaterThan(mapRect.y);
  });

  it("centres a northing chip on its own tick", () => {
    const place = gridLabelPlacement({
      axis: "y",
      anchorPt: { x: 0, y: 200 },
      chipW: 26,
      mapRect,
      ptPerPx,
    });
    const tickY = place.tick.y0;
    expect(place.chip.top + place.chip.h / 2).toBeCloseTo(tickY, 6);
    // The tick crosses the left edge, the same edge the chip sits beside.
    expect(place.tick.x1).toBeGreaterThan(mapRect.x);
    expect(place.tick.x0).toBeLessThan(mapRect.x);
  });

  it("keeps every label's text inside its chip", () => {
    for (const axis of ["x", "y"] as const) {
      for (const chipW of [18, 26, 44]) {
        const place = gridLabelPlacement({
          axis,
          anchorPt: { x: 120, y: 90 },
          chipW,
          mapRect,
          ptPerPx,
        });
        expect(place.text.top).toBeGreaterThanOrEqual(place.chip.top);
        expect(place.text.top + 5.2 * 0.7).toBeLessThanOrEqual(
          place.chip.top + place.chip.h,
        );
        expect(place.text.x).toBeGreaterThan(place.chip.x);
        expect(place.text.x).toBeLessThan(place.chip.x + place.chip.w);
      }
    }
  });

  it("keeps a chip inside the sheet when its line hugs the frame", () => {
    const atEdge = gridLabelPlacement({
      axis: "x",
      anchorPt: { x: 0, y: 0 },
      chipW: 40,
      mapRect,
      ptPerPx,
    });
    expect(atEdge.chip.x).toBeGreaterThanOrEqual(mapRect.x);
    expect(atEdge.chip.x + atEdge.chip.w).toBeLessThanOrEqual(mapRect.x + mapRect.w);

    const atRight = gridLabelPlacement({
      axis: "x",
      anchorPt: { x: 700 / ptPerPx, y: 0 },
      chipW: 40,
      mapRect,
      ptPerPx,
    });
    expect(atRight.chip.x + atRight.chip.w).toBeLessThanOrEqual(mapRect.x + mapRect.w);
  });
});
