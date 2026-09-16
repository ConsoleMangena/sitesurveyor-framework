import { describe, it, expect } from "vitest";
import {
  normalizeAzimuth,
  forward,
  inverse,
  grade,
  intersectionBearingBearing,
  intersectionDistanceDistance,
  lineLine,
  lineArc,
  arcArc,
  fitCircle,
  freeStation,
  circularArcParams,
  polygonArea,
  polylineLength,
  computeTraverse,
  reduceLevelling,
  resectionTienstra,
  heightScaleFactor,
  combinedScaleFactor,
  groundToGrid,
  gridToGround,
  volumeGrid,
  volumeTinToPlane,
  volumeTinToSurface,
  volumeFromTriangles,
  volumeEndArea,
  volumePrismoidal,
  horizontalCurve,
  stakeHorizontalCurve,
  verticalCurve,
  stakeOut,
  reduceAngularTraverse,
  type NE,
  type NEZ,
  type LevellingReading,
} from "./cogo.ts";
import { buildTin } from "./tin.ts";

describe("normalizeAzimuth", () => {
  it("wraps into [0, 360)", () => {
    expect(normalizeAzimuth(0)).toBe(0);
    expect(normalizeAzimuth(360)).toBe(0);
    expect(normalizeAzimuth(-90)).toBe(270);
    expect(normalizeAzimuth(450)).toBe(90);
  });
});

describe("forward / inverse round-trip", () => {
  it("returns the same azimuth and distance", () => {
    const start: NE = { n: 1000, e: 5000 };
    const az = 123.456;
    const dist = 250.5;
    const dest = forward(start, az, dist);
    const back = inverse(start, dest);
    expect(back.azimuth).toBeCloseTo(az, 6);
    expect(back.distance).toBeCloseTo(dist, 6);
  });

  it("computes cardinal directions correctly", () => {
    const o: NE = { n: 0, e: 0 };
    // Due north (az 0): +N only.
    const north = forward(o, 0, 10);
    expect(north.n).toBeCloseTo(10, 6);
    expect(north.e).toBeCloseTo(0, 6);
    // Due east (az 90): +E only.
    const east = forward(o, 90, 10);
    expect(east.n).toBeCloseTo(0, 6);
    expect(east.e).toBeCloseTo(10, 6);
  });

  it("inverse of identical points has zero distance", () => {
    const p: NE = { n: 12, e: 34 };
    const r = inverse(p, p);
    expect(r.distance).toBe(0);
  });
});

describe("grade", () => {
  it("computes ratio and percent", () => {
    expect(grade(100, 5)).toEqual({ ratio: 0.05, percent: 5 });
  });
  it("handles zero distance", () => {
    expect(grade(0, 5)).toEqual({ ratio: 0, percent: 0 });
  });
});

describe("intersectionBearingBearing", () => {
  it("finds the meeting point of two rays", () => {
    const p1: NE = { n: 0, e: 0 };
    const p2: NE = { n: 0, e: 100 };
    // From p1 head NE (45°), from p2 head NW (315°): meet at N50 E50.
    const res = intersectionBearingBearing(p1, 45, p2, 315);
    expect(res).not.toBeNull();
    expect(res!.n).toBeCloseTo(50, 6);
    expect(res!.e).toBeCloseTo(50, 6);
  });

  it("returns null for parallel rays", () => {
    const p1: NE = { n: 0, e: 0 };
    const p2: NE = { n: 10, e: 0 };
    expect(intersectionBearingBearing(p1, 90, p2, 90)).toBeNull();
  });

  it("returns null when the crossing point lies behind one station", () => {
    // p1 faces west (270°) — the lines of sight cross at (0,10), which is
    // behind ray 1. Only the infinite LINES meet there; the rays do not.
    const p1: NE = { n: 0, e: 0 };
    const p2: NE = { n: 50, e: 10 };
    expect(intersectionBearingBearing(p1, 270, p2, 180)).toBeNull();
    // Turning p1 east (90°) puts the same crossing ahead of both rays.
    const res = intersectionBearingBearing(p1, 90, p2, 180);
    expect(res).not.toBeNull();
    expect(res!.n).toBeCloseTo(0, 6);
    expect(res!.e).toBeCloseTo(10, 6);
  });

  it("returns null when the observation rays run away from each other", () => {
    const p1: NE = { n: 0, e: 0 };
    const p2: NE = { n: 0, e: 100 };
    // p1 heads west (270°), p2 heads east (90°): separated stations diverge.
    expect(intersectionBearingBearing(p1, 270, p2, 90)).toBeNull();
  });
});

describe("intersectionDistanceDistance", () => {
  it("rejects negative or invalid radii", () => {
    expect(intersectionDistanceDistance({ n: 0, e: 0 }, -5, { n: 0, e: 10 }, 5)).toEqual([]);
    expect(intersectionDistanceDistance({ n: 0, e: 0 }, 5, { n: 0, e: 10 }, NaN)).toEqual([]);
  });

  it("returns two symmetric solutions", () => {
    const p1: NE = { n: 0, e: 0 };
    const p2: NE = { n: 0, e: 10 };
    const sols = intersectionDistanceDistance(p1, 5 * Math.SQRT2, p2, 5 * Math.SQRT2);
    expect(sols).toHaveLength(2);
    // Midpoint E is 5; the two solutions are mirrored across the line.
    expect(sols[0].e).toBeCloseTo(5, 6);
    expect(sols[1].e).toBeCloseTo(5, 6);
    expect(sols[0].n).toBeCloseTo(-sols[1].n, 6);
  });

  it("returns empty when circles are too far apart", () => {
    expect(intersectionDistanceDistance({ n: 0, e: 0 }, 1, { n: 0, e: 100 }, 1)).toEqual([]);
  });

  it("returns one solution when circles are tangent", () => {
    const sols = intersectionDistanceDistance({ n: 0, e: 0 }, 5, { n: 0, e: 10 }, 5);
    expect(sols).toHaveLength(1);
    expect(sols[0].e).toBeCloseTo(5, 6);
    expect(sols[0].n).toBeCloseTo(0, 6);
  });
});

describe("polygonArea (shoelace)", () => {
  it("computes the area of a 10x10 square", () => {
    const sq: NE[] = [
      { n: 0, e: 0 },
      { n: 0, e: 10 },
      { n: 10, e: 10 },
      { n: 10, e: 0 },
    ];
    expect(polygonArea(sq)).toBeCloseTo(100, 6);
  });

  it("is orientation-independent (absolute area)", () => {
    const cw: NE[] = [
      { n: 0, e: 0 },
      { n: 10, e: 0 },
      { n: 10, e: 10 },
      { n: 0, e: 10 },
    ];
    expect(polygonArea(cw)).toBeCloseTo(100, 6);
  });

  it("returns 0 for fewer than 3 points", () => {
    expect(polygonArea([{ n: 0, e: 0 }, { n: 1, e: 1 }])).toBe(0);
  });
});

describe("polylineLength", () => {
  it("sums segment lengths", () => {
    const pts: NE[] = [
      { n: 0, e: 0 },
      { n: 0, e: 3 },
      { n: 4, e: 3 },
    ];
    expect(polylineLength(pts)).toBeCloseTo(7, 6);
  });
});

describe("computeTraverse", () => {
  it("reports zero misclosure for a perfect closed square", () => {
    const start: NE = { n: 0, e: 0 };
    const legs = [
      { azimuth: 90, distance: 100 }, // east
      { azimuth: 0, distance: 100 }, // north
      { azimuth: 270, distance: 100 }, // west
      { azimuth: 180, distance: 100 }, // south
    ];
    const r = computeTraverse(start, legs);
    expect(r.perimeter).toBeCloseTo(400, 6);
    expect(r.linearMisclosure).toBeCloseTo(0, 6);
    expect(r.precision).toBe(Infinity);
    // Adjusted endpoint returns to start.
    const last = r.adjusted[r.adjusted.length - 1];
    expect(last.n).toBeCloseTo(0, 6);
    expect(last.e).toBeCloseTo(0, 6);
  });

  it("distributes misclosure via Bowditch and reports precision", () => {
    const start: NE = { n: 0, e: 0 };
    const legs = [
      { azimuth: 90, distance: 100 },
      { azimuth: 0, distance: 100 },
      { azimuth: 270, distance: 100 },
      { azimuth: 180, distance: 99 }, // 1 m short -> misclosure
    ];
    const r = computeTraverse(start, legs);
    expect(r.linearMisclosure).toBeCloseTo(1, 6);
    expect(r.precision).toBeCloseTo(399, 0);
    // Bowditch closes the adjusted loop back to the start.
    const last = r.adjusted[r.adjusted.length - 1];
    expect(last.n).toBeCloseTo(0, 6);
    expect(last.e).toBeCloseTo(0, 6);
  });

  it("defaults to a closed loop when no options are given", () => {
    const r = computeTraverse({ n: 0, e: 0 }, [
      { azimuth: 90, distance: 100 },
      { azimuth: 0, distance: 100 },
      { azimuth: 270, distance: 100 },
      { azimuth: 180, distance: 100 },
    ]);
    expect(r.type).toBe("closed-loop");
    expect(r.hasClosure).toBe(true);
    expect(r.linearMisclosure).toBeCloseTo(0, 6);
  });

  it("closed-link: closes on a different known point and adjusts to it", () => {
    const start: NE = { n: 0, e: 0 };
    // Two legs east; the known closing point is exactly 1 m short of the raw end.
    const legs = [
      { azimuth: 90, distance: 100 },
      { azimuth: 90, distance: 100 },
    ];
    const closingPoint: NE = { n: 0, e: 199 }; // raw end is E=200 -> 1 m misclosure
    const r = computeTraverse(start, legs, { type: "closed-link", closingPoint });
    expect(r.type).toBe("closed-link");
    expect(r.hasClosure).toBe(true);
    expect(r.misclosureE).toBeCloseTo(1, 6);
    expect(r.linearMisclosure).toBeCloseTo(1, 6);
    // Adjusted end lands exactly on the known closing point.
    const last = r.adjusted[r.adjusted.length - 1];
    expect(last.e).toBeCloseTo(199, 6);
    expect(last.n).toBeCloseTo(0, 6);
  });

  it("closed-link: zero misclosure reports exact precision", () => {
    const r = computeTraverse({ n: 0, e: 0 }, [{ azimuth: 90, distance: 100 }], {
      type: "closed-link",
      closingPoint: { n: 0, e: 100 },
    });
    expect(r.linearMisclosure).toBeCloseTo(0, 6);
    expect(r.precision).toBe(Infinity);
  });

  it("open: no closure, no adjustment, adjusted equals computed", () => {
    const start: NE = { n: 0, e: 0 };
    const legs = [
      { azimuth: 90, distance: 100 },
      { azimuth: 0, distance: 50 },
    ];
    const r = computeTraverse(start, legs, { type: "open" });
    expect(r.type).toBe("open");
    expect(r.hasClosure).toBe(false);
    expect(r.linearMisclosure).toBe(0);
    expect(r.precision).toBe(Infinity);
    // Adjusted coordinates are identical to the raw computed coordinates.
    r.adjusted.forEach((p, i) => {
      expect(p.e).toBeCloseTo(r.computed[i].e, 6);
      expect(p.n).toBeCloseTo(r.computed[i].n, 6);
    });
  });
});

describe("reduceLevelling", () => {
  const line: LevellingReading[] = [
    { label: "BM", kind: "BS", reading: 1.500 },
    { label: "A", kind: "IS", reading: 1.200 }, // rise 0.300
    { label: "B", kind: "IS", reading: 1.800 }, // fall 0.600
    { label: "TP1", kind: "FS", reading: 1.000 }, // rise 0.800
  ];

  it("reduces by rise & fall and passes the arithmetic check", () => {
    const r = reduceLevelling(line, 100, "rise-fall");
    expect(r.sumBS).toBeCloseTo(1.5, 6);
    expect(r.sumFS).toBeCloseTo(1.0, 6);
    expect(r.bsMinusFs).toBeCloseTo(0.5, 6);
    expect(r.riseMinusFall).toBeCloseTo(0.5, 6);
    expect(r.lastMinusFirst).toBeCloseTo(0.5, 6);
    expect(r.checkOk).toBe(true);
    // RLs: BM 100, A 100.3, B 99.7, TP1 100.5
    expect(r.rows[1].rl).toBeCloseTo(100.3, 6);
    expect(r.rows[2].rl).toBeCloseTo(99.7, 6);
    expect(r.rows[3].rl).toBeCloseTo(100.5, 6);
  });

  it("reduces by HPC method to the same RLs", () => {
    const r = reduceLevelling(line, 100, "hpc");
    expect(r.rows[0].hpc).toBeCloseTo(101.5, 6);
    expect(r.rows[1].rl).toBeCloseTo(100.3, 6);
    expect(r.rows[3].rl).toBeCloseTo(100.5, 6);
    expect(r.checkOk).toBe(true);
  });

  it("distributes misclosure to land on the known closing RL", () => {
    const r = reduceLevelling(line, 100, "rise-fall", 100.4);
    expect(r.misclose).toBeCloseTo(0.1, 6);
    const last = r.rows[r.rows.length - 1];
    expect(last.adjustedRl).toBeCloseTo(100.4, 6);
  });

  it("distributes misclosure cumulatively across multiple setups", () => {
    // Two setups: BM1..TP1 (FS) is setup 1, TP1 (BS)..BM2 (FS) is setup 2.
    const twoSetup: LevellingReading[] = [
      { label: "BM1", kind: "BS", reading: 1.5 },
      { label: "A", kind: "IS", reading: 1.2 },
      { label: "TP1", kind: "FS", reading: 1.0 },
      { label: "TP1", kind: "BS", reading: 0.9 },
      { label: "C", kind: "IS", reading: 1.35 },
      { label: "BM2", kind: "FS", reading: 1.1 },
    ];
    const raw = reduceLevelling(twoSetup, 100, "rise-fall");
    const closing = raw.rows[raw.rows.length - 1].rl - 0.1; // force 0.1 m misclosure
    const r = reduceLevelling(twoSetup, 100, "rise-fall", closing);
    expect(r.misclose).toBeCloseTo(0.1, 6);
    const perSetup = 0.05;
    // Benchmark and points in setup 1 (before the first FS) carry no correction.
    expect(r.rows[0].adjustedRl).toBeCloseTo(r.rows[0].rl, 6);
    expect(r.rows[1].adjustedRl).toBeCloseTo(r.rows[1].rl, 6);
    // The first turning point (FS closing setup 1) and points in setup 2 carry
    // one per-setup increment.
    expect(r.rows[2].adjustedRl).toBeCloseTo(r.rows[2].rl - perSetup, 6);
    expect(r.rows[4].adjustedRl).toBeCloseTo(r.rows[4].rl - perSetup, 6);
    // The closing point absorbs the full misclosure and lands on the known RL.
    expect(r.rows[5].adjustedRl).toBeCloseTo(closing, 6);
  });

  it("produces the same RLs across multiple setups with HPC", () => {
    const twoSetup: LevellingReading[] = [
      { label: "BM1", kind: "BS", reading: 1.5 },
      { label: "A", kind: "IS", reading: 1.2 },
      { label: "TP1", kind: "FS", reading: 1.0 },
      { label: "TP1", kind: "BS", reading: 0.9 },
      { label: "C", kind: "IS", reading: 1.35 },
      { label: "BM2", kind: "FS", reading: 1.1 },
    ];
    const r = reduceLevelling(twoSetup, 100, "hpc");
    expect(r.rows[0].rl).toBeCloseTo(100, 6);
    expect(r.rows[1].rl).toBeCloseTo(100.3, 6);
    expect(r.rows[2].rl).toBeCloseTo(100.5, 6);
    // BS on TP1 carries the same RL as the FS sight on the same point.
    expect(r.rows[3].rl).toBeCloseTo(100.5, 6);
    expect(r.rows[4].rl).toBeCloseTo(100.05, 6);
    expect(r.rows[5].rl).toBeCloseTo(100.3, 6);
    expect(r.checkOk).toBe(true);
    expect(r.rows[3].hpc).toBeCloseTo(101.4, 6);
  });

  it("gives correct RLs and arithmetic check for multi-setup rise & fall", () => {
    const twoSetup: LevellingReading[] = [
      { label: "BM1", kind: "BS", reading: 1.5 },
      { label: "A", kind: "IS", reading: 1.2 },
      { label: "TP1", kind: "FS", reading: 1.0 },
      { label: "TP1", kind: "BS", reading: 0.9 },
      { label: "C", kind: "IS", reading: 1.35 },
      { label: "BM2", kind: "FS", reading: 1.1 },
    ];
    const r = reduceLevelling(twoSetup, 100, "rise-fall");
    expect(r.rows[0].rl).toBeCloseTo(100, 6);
    expect(r.rows[1].rl).toBeCloseTo(100.3, 6);
    expect(r.rows[2].rl).toBeCloseTo(100.5, 6);
    expect(r.rows[3].rl).toBeCloseTo(100.5, 6);
    expect(r.rows[4].rl).toBeCloseTo(100.05, 6);
    expect(r.rows[5].rl).toBeCloseTo(100.3, 6);
    expect(r.sumBS).toBeCloseTo(2.4, 6);
    expect(r.sumFS).toBeCloseTo(2.1, 6);
    expect(r.bsMinusFs).toBeCloseTo(0.3, 6);
    expect(r.riseMinusFall).toBeCloseTo(0.3, 6);
    expect(r.lastMinusFirst).toBeCloseTo(0.3, 6);
    expect(r.checkOk).toBe(true);
  });
});

describe("resectionTienstra", () => {
  it("recovers a known observer position", () => {
    const A: NE = { n: 0, e: 0 };
    const B: NE = { n: 0, e: 1000 };
    const C: NE = { n: 1000, e: 500 };
    const P: NE = { n: 300, e: 400 };
    // Build the observed angles from the true geometry.
    const azPA = inverseAz(P, A);
    const azPB = inverseAz(P, B);
    const azPC = inverseAz(P, C);
    const sep = (x: number, y: number) => {
      let d = Math.abs(x - y) % 360;
      if (d > 180) d = 360 - d;
      return d;
    };
    const alpha = sep(azPB, azPC);
    const beta = sep(azPC, azPA);
    const gamma = sep(azPA, azPB);
    const res = resectionTienstra(A, B, C, alpha, beta, gamma);
    expect(res).not.toBeNull();
    expect(res!.n).toBeCloseTo(P.n, 3);
    expect(res!.e).toBeCloseTo(P.e, 3);
  });
});



describe("combined scale factor", () => {
  it("height factor reduces ground distance to grid on the Highveld", () => {
    // At 1500 m the height factor is ~235 ppm (R/(R+H)).
    const hsf = heightScaleFactor(1500);
    expect(hsf).toBeLessThan(1);
    expect((1 - hsf) * 1e6).toBeCloseTo(235.4, 0);
  });

  it("combined factor multiplies point scale and height factor", () => {
    const csf = combinedScaleFactor(0.99996, 1500);
    expect(csf).toBeCloseTo(0.99996 * heightScaleFactor(1500), 12);
  });

  it("ground→grid→ground is a clean round-trip", () => {
    const csf = combinedScaleFactor(1.00012, 1490);
    const grid = groundToGrid(100, csf);
    expect(gridToGround(grid, csf)).toBeCloseTo(100, 9);
  });

  it("a 100 m ground line shrinks by ~23 mm at 1500 m height", () => {
    const grid = groundToGrid(100, heightScaleFactor(1500));
    expect(100 - grid).toBeCloseTo(0.0235, 3);
  });
});





describe("volumeGrid", () => {
  it("computes cut over a flat raised grid", () => {
    // 2x2 grid, all heights 5, base 0, 10m cells -> one cell of 100 m², depth 5.
    const grid = [
      [5, 5],
      [5, 5],
    ];
    const r = volumeGrid(grid, 10, 10, 0);
    expect(r.cells).toBe(1);
    expect(r.cut).toBeCloseTo(500, 6);
    expect(r.fill).toBeCloseTo(0, 6);
    expect(r.net).toBeCloseTo(500, 6);
  });

  it("separates cut and fill relative to the base level", () => {
    const grid = [
      [10, 10],
      [-10, -10],
    ];
    // Mean corner height = 0 -> net zero, but cell is a single cell so cut=0, fill=0.
    const r = volumeGrid(grid, 10, 10, 0);
    expect(r.net).toBeCloseTo(0, 6);
  });

  it("skips cells with non-finite corners", () => {
    const grid = [
      [5, NaN],
      [5, 5],
    ];
    const r = volumeGrid(grid, 10, 10, 0);
    expect(r.cells).toBe(0);
  });
});

describe("TIN volumes", () => {
  // A 10x10 pad raised uniformly to Z=5 above a base of 0 -> 500 m³.
  const pad: NEZ[] = [
    { e: 0, n: 0, z: 5 },
    { e: 10, n: 0, z: 5 },
    { e: 10, n: 10, z: 5 },
    { e: 0, n: 10, z: 5 },
  ];

  it("volumeTinToPlane integrates a flat pad above a base level", () => {
    const tin = buildTin(pad);
    const r = volumeTinToPlane(tin.points, tin.triangles, 0);
    expect(r.planArea).toBeCloseTo(100, 6);
    expect(r.cut).toBeCloseTo(500, 6);
    expect(r.fill).toBeCloseTo(0, 6);
    expect(r.triangles).toBe(2);
  });

  it("volumeTinToPlane reports fill when the surface is below the base", () => {
    const pit = pad.map((p) => ({ ...p, z: -2 }));
    const tin = buildTin(pit);
    const r = volumeTinToPlane(tin.points, tin.triangles, 0);
    expect(r.fill).toBeCloseTo(200, 6);
    expect(r.cut).toBeCloseTo(0, 6);
    expect(r.net).toBeCloseTo(-200, 6);
  });

  it("computes a pyramidal stockpile volume", () => {
    // 10x10 base at Z=0 with an apex at the centre at Z=3.
    // Pyramid volume = (1/3)·baseArea·height = (1/3)·100·3 = 100 m³.
    const pile: NEZ[] = [
      { e: 0, n: 0, z: 0 },
      { e: 10, n: 0, z: 0 },
      { e: 10, n: 10, z: 0 },
      { e: 0, n: 10, z: 0 },
      { e: 5, n: 5, z: 3 },
    ];
    const tin = buildTin(pile);
    const r = volumeTinToPlane(tin.points, tin.triangles, 0);
    expect(r.planArea).toBeCloseTo(100, 6);
    expect(r.cut).toBeCloseTo(100, 6);
  });

  it("volumeTinToSurface differences existing against a design surface", () => {
    const tin = buildTin(pad); // existing at Z=5
    const designZ = pad.map(() => 2); // design plane at Z=2
    const r = volumeTinToSurface(tin.points, tin.triangles, designZ);
    // (5-2)=3 over 100 m² -> 300 m³ cut.
    expect(r.cut).toBeCloseTo(300, 6);
    expect(r.fill).toBeCloseTo(0, 6);
  });

  it("splits mixed-sign triangles into separate cut and fill volumes", () => {
    // A single right triangle (plan area = 50 m²) with one vertex above the
    // base and two below. The zero plane cuts the two sloping edges at their
    // midpoints, producing a small cut prism and a larger fill prism.
    const triangle: NEZ[] = [
      { e: 0, n: 0, z: 5 },
      { e: 10, n: 0, z: -5 },
      { e: 0, n: 10, z: -5 },
    ];
    const r = volumeFromTriangles(triangle, new Uint32Array([0, 1, 2]), () => 0);
    expect(r.planArea).toBeCloseTo(50, 6);
    expect(r.net).toBeCloseTo(-250 / 3, 6);
    expect(r.cut).toBeCloseTo(125 / 6, 6);
    expect(r.fill).toBeCloseTo(625 / 6, 6);
  });

  it("volumeFromTriangles returns zero for an empty triangulation", () => {
    const r = volumeFromTriangles(pad, new Uint32Array(0), () => 0);
    expect(r.cut).toBe(0);
    expect(r.fill).toBe(0);
    expect(r.triangles).toBe(0);
  });
});

describe("cross-section volumes", () => {
  it("computes end-area volume between two sections", () => {
    // 100 m length, average area 75 m² -> 7500 m³.
    const sections = [
      { chainage: 0, area: 50 },
      { chainage: 100, area: 100 },
    ];
    expect(volumeEndArea(sections)).toBeCloseTo(7500, 6);
  });

  it("sorts sections by chainage automatically", () => {
    const sections = [
      { chainage: 100, area: 100 },
      { chainage: 0, area: 50 },
    ];
    expect(volumeEndArea(sections)).toBeCloseTo(7500, 6);
  });

  it("computes prismoidal volume for equally-spaced sections", () => {
    // Parabolic area A = chainage² over 0..100 in two 50 m intervals.
    // Simpson's rule is exact for quadratics.
    const sections = [
      { chainage: 0, area: 0 },
      { chainage: 50, area: 2500 },
      { chainage: 100, area: 10000 },
    ];
    expect(volumePrismoidal(sections)).toBeCloseTo(1000000 / 3, 3);
  });

  it("returns null for prismoidal with even number of sections", () => {
    expect(volumePrismoidal([
      { chainage: 0, area: 0 },
      { chainage: 50, area: 2500 },
    ])).toBeNull();
  });

  it("returns null for prismoidal with unequal spacing", () => {
    expect(volumePrismoidal([
      { chainage: 0, area: 0 },
      { chainage: 40, area: 1600 },
      { chainage: 100, area: 10000 },
    ])).toBeNull();
  });
});

describe("horizontalCurve", () => {
  const pi: NE = { n: 0, e: 0 };

  it("derives the geometry of a 90° curve (R = 100)", () => {
    const c = horizontalCurve(pi, 0, 90, 100);
    expect(c).not.toBeNull();
    expect(c!.deflection).toBeCloseTo(90, 6);
    expect(c!.tangent).toBeCloseTo(100, 6); // R·tan(45°)
    expect(c!.length).toBeCloseTo(157.0796327, 4); // R·Δ
    expect(c!.longChord).toBeCloseTo(141.42135, 3); // 2R·sin(45°)
    expect(c!.turnsRight).toBe(true);
  });

  it("rejects degenerate input", () => {
    expect(horizontalCurve(pi, 0, 90, 0)).toBeNull();
    expect(horizontalCurve(pi, 10, 10, 100)).toBeNull(); // 0° deflection
    expect(horizontalCurve(pi, 0, 180, 100)).toBeNull(); // 180°
  });

  it("stakes from the PC to the PT", () => {
    const c = horizontalCurve(pi, 0, 90, 100)!;
    const stations = stakeHorizontalCurve(c, 0, 50);
    const first = stations[0];
    const last = stations[stations.length - 1];
    expect(first.arcFromPc).toBeCloseTo(0, 9);
    expect(first.point.n).toBeCloseTo(c.pc.n, 6);
    expect(first.point.e).toBeCloseTo(c.pc.e, 6);
    expect(last.arcFromPc).toBeCloseTo(c.length, 6);
    expect(last.point.n).toBeCloseTo(c.pt.n, 3);
    expect(last.point.e).toBeCloseTo(c.pt.e, 3);
  });
});

describe("verticalCurve", () => {
  it("places the high point of a crest curve correctly", () => {
    // +3% into −2% over 200 m: high point at 0.03·200 / 0.05 = 120 m.
    const v = verticalCurve(100, 3, -2, 200, 50)!;
    expect(v.gradeChange).toBeCloseTo(-5, 9);
    expect(v.turningChainage).toBeCloseTo(120, 6);
    expect(v.turningElevation!).toBeGreaterThan(v.bvcElevation);
    expect(v.turningElevation!).toBeGreaterThan(v.evcElevation);
    expect(v.stations[0].chainage).toBeCloseTo(0, 9);
    expect(v.stations[v.stations.length - 1].chainage).toBeCloseTo(200, 9);
  });

  it("has no turning point on a constant grade", () => {
    const v = verticalCurve(50, 2, 2, 100, 0)!;
    expect(v.turningChainage).toBeNull();
    expect(v.evcElevation).toBeCloseTo(52, 9); // 50 + 0.02·100
  });

  it("returns null for a non-positive length", () => {
    expect(verticalCurve(100, 3, -2, 0, 10)).toBeNull();
  });
});

describe("stakeOut", () => {
  it("computes azimuth, distance and angle-right from occupied/backsight", () => {
    const occ: NE = { n: 0, e: 0 };
    const bs: NE = { n: 100, e: 0 }; // due North (azimuth 0)
    const target: NE = { n: 0, e: 50 }; // due East (azimuth 90)
    const r = stakeOut(occ, bs, target);
    expect(r.azimuth).toBeCloseTo(90, 6);
    expect(r.backsightAzimuth).toBeCloseTo(0, 6);
    expect(r.angleRight).toBeCloseTo(90, 6);
    expect(r.distance).toBeCloseTo(50, 6);
    // Target is 90° right of the backsight line, so along ≈ 0, offset ≈ +50.
    expect(r.along).toBeCloseTo(0, 6);
    expect(r.offset).toBeCloseTo(50, 6);
  });

  it("reports ΔH when both levels are supplied", () => {
    const r = stakeOut({ n: 0, e: 0 }, { n: 10, e: 0 }, { n: 0, e: 10 }, 100, 103.5);
    expect(r.deltaZ).toBeCloseTo(3.5, 6);
  });

  it("returns null ΔH when a level is missing", () => {
    const r = stakeOut({ n: 0, e: 0 }, { n: 10, e: 0 }, { n: 0, e: 10 }, 100, null);
    expect(r.deltaZ).toBeNull();
  });
});

describe("reduceAngularTraverse", () => {
  it("balances the angular misclosure of a closed interior-angle loop", () => {
    // A square: 4 interior angles of exactly 90° close perfectly (sum 360 =
    // (4−2)·180). Introduce a 20" (0.00556°) error on one angle.
    const obs = [
      { angle: 90, distance: 100 },
      { angle: 90, distance: 100 },
      { angle: 90, distance: 100 },
      { angle: 90.00556, distance: 100 },
    ];
    const r = reduceAngularTraverse(0, obs, "interior", true);
    expect(r.hasAngularClosure).toBe(true);
    expect(r.theoreticalSum).toBeCloseTo(360, 9);
    expect(r.angularMisclosure).toBeCloseTo(0.00556, 6);
    // Correction distributes the misclosure equally with opposite sign.
    expect(r.perAngleCorrection).toBeCloseTo(-0.00556 / 4, 8);
    expect(r.legs).toHaveLength(4);
  });

  it("has no closure condition for an open traverse", () => {
    const obs = [
      { angle: 10, distance: 50 },
      { angle: 20, distance: 50 },
    ];
    const r = reduceAngularTraverse(45, obs, "deflection", false);
    expect(r.hasAngularClosure).toBe(false);
    expect(r.angularMisclosure).toBe(0);
    expect(r.perAngleCorrection).toBe(0);
    // Deflection angles accumulate onto the start azimuth.
    expect(r.azimuths[0]).toBeCloseTo(55, 6);
    expect(r.azimuths[1]).toBeCloseTo(75, 6);
  });

  it("detects and balances a mirrored loop (exterior angles instead of interior)", () => {
    // The same square as above, but the crew observed the angles on the
    // opposite side (270° exterior instead of 90° interior): the sum closes
    // to (n+2)·180, not (n−2)·180.
    const obs = [
      { angle: 270, distance: 100 },
      { angle: 270, distance: 100 },
      { angle: 270, distance: 100 },
      { angle: 270.00556, distance: 100 },
    ];
    const r = reduceAngularTraverse(0, obs, "interior", true);
    expect(r.mirrored).toBe(true);
    expect(r.theoreticalSum).toBeCloseTo(1080, 9);
    expect(r.angularMisclosure).toBeCloseTo(0.00556, 6);
    // The mirrored recursion retraces the same square the interior angles do
    // (azimuths 90, 180, 270, ~0), instead of producing a reflection.
    expect(r.azimuths[0]).toBeCloseTo(90 - 0.00556 / 4, 4);
    expect(r.azimuths[1]).toBeCloseTo(180 - 0.00556 / 2, 4);
    expect(r.azimuths[2]).toBeCloseTo(270 - 0.00556 * 0.75, 4);
    // The loop closes: final azimuth ≡ start azimuth (0 ≡ 360).
    expect(Math.min(r.azimuths[3], Math.abs(360 - r.azimuths[3]))).toBeCloseTo(0, 4);
  });

  it("detects clockwise deflection loops (sum −360)", () => {
    const obs = [
      { angle: -90, distance: 100 },
      { angle: -90, distance: 100 },
      { angle: -90, distance: 100 },
      { angle: -90.00556, distance: 100 },
    ];
    const r = reduceAngularTraverse(0, obs, "deflection", true);
    expect(r.theoreticalSum).toBeCloseTo(-360, 9);
    expect(r.angularMisclosure).toBeCloseTo(-0.00556, 6);
    expect(r.hasAngularClosure).toBe(true);
    // Signed deflections keep descending through azimuths.
    expect(r.azimuths[0]).toBeCloseTo(270 + 0.00556 / 4, 4);
  });
});

describe("lineLine", () => {
  it("finds the intersection of two infinite lines", () => {
    const p = lineLine(
      { n: -1, e: -1 },
      { n: 1, e: 1 },
      { n: -1, e: 1 },
      { n: 1, e: -1 },
    );
    expect(p).not.toBeNull();
    expect(p!.n).toBeCloseTo(0, 9);
    expect(p!.e).toBeCloseTo(0, 9);
  });

  it("returns null for parallel lines", () => {
    expect(
      lineLine({ n: 0, e: 0 }, { n: 1, e: 0 }, { n: 0, e: 1 }, { n: 1, e: 1 }),
    ).toBeNull();
  });
});

describe("lineArc", () => {
  it("returns two chord points", () => {
    const sols = lineArc({ n: -2, e: 0 }, { n: 2, e: 0 }, { n: 0, e: 0 }, 1);
    expect(sols).toHaveLength(2);
    for (const s of sols) {
      expect(Math.hypot(s.n, s.e)).toBeCloseTo(1, 9);
    }
  });
});

describe("arcArc", () => {
  it("returns two circle intersections", () => {
    const sols = arcArc({ n: 0, e: 0 }, 5, { n: 0, e: 8 }, 5);
    expect(sols).toHaveLength(2);
    for (const s of sols) {
      expect(s.e).toBeCloseTo(4, 9);
    }
  });
});

describe("fitCircle", () => {
  it("recovers a circle through three exact points", () => {
    const fit = fitCircle([
      { n: 1, e: 0 },
      { n: 0, e: 1 },
      { n: -1, e: 0 },
    ]);
    expect(fit).not.toBeNull();
    expect(fit!.centre.n).toBeCloseTo(0, 9);
    expect(fit!.centre.e).toBeCloseTo(0, 9);
    expect(fit!.radius).toBeCloseTo(1, 9);
    expect(fit!.rmse).toBeCloseTo(0, 9);
  });

  it("returns null for collinear points", () => {
    expect(fitCircle([{ n: 0, e: 0 }, { n: 1, e: 1 }, { n: 2, e: 2 }])).toBeNull();
  });
});

describe("freeStation", () => {
  it("fixes position from two bearing+distance pairs", () => {
    const res = freeStation([
      { station: { n: 10, e: 5 }, azimuthDeg: 0, distance: 5 },
      { station: { n: 5, e: 10 }, azimuthDeg: 90, distance: 5 },
    ]);
    expect(res).not.toBeNull();
    expect(res!.position.n).toBeCloseTo(5, 6);
    expect(res!.position.e).toBeCloseTo(5, 6);
  });
});

describe("circularArcParams", () => {
  // Reconstruct a point on the arc from model-convention angles (degrees,
  // CCW from +E) exactly as the viewport/DXF exporter do.
  const arcPoint = (p: NonNullable<ReturnType<typeof circularArcParams>>, deg: number): NE => {
    const a = (deg * Math.PI) / 180;
    return { n: p.center.n + p.radius * Math.sin(a), e: p.center.e + p.radius * Math.cos(a) };
  };
  /** CCW separation b−a in [0,360). */
  const ccwSep = (from: number, to: number) => ((to - from) % 360 + 360) % 360;

  it("returns CCW-from-E starting angles that recover the start point", () => {
    // Quarter arc in the first quadrant: centre (0,0), start=(0,10), mid, end
    const start: NE = { n: 0, e: 10 };
    const mid: NE = { n: 10 * Math.SQRT1_2, e: 10 * Math.SQRT1_2 };
    const end: NE = { n: 10, e: 0 };
    const p = circularArcParams(start, mid, end);
    expect(p).not.toBeNull();
    expect(p!.center.n).toBeCloseTo(0, 6);
    expect(p!.center.e).toBeCloseTo(0, 6);
    expect(p!.radius).toBeCloseTo(10, 6);
    // CCW-from-E: +E is 0°, +N is 90°. Start sits at +E → 0°; end at +N → 90°.
    expect(p!.startAngle % 360).toBeCloseTo(0, 6);
    expect(p!.endAngle % 360).toBeCloseTo(90, 6);
    const recovered = arcPoint(p!, p!.startAngle);
    expect(recovered.e).toBeCloseTo(start.e, 6);
    expect(recovered.n).toBeCloseTo(start.n, 6);
  });

  it("normalizes the sweep so it always passes through the mid point", () => {
    // Clockwise pick order: start=(10,0)=90°, mid at 45°, end=(0,10)=0°.
    const start: NE = { n: 10, e: 0 };
    const mid: NE = { n: 10 * Math.SQRT1_2, e: 10 * Math.SQRT1_2 };
    const end: NE = { n: 0, e: 10 };
    const p = circularArcParams(start, mid, end);
    expect(p).not.toBeNull();
    // CCW sweep from startAngle to endAngle must contain the mid angle (45°).
    const midAngle = (Math.atan2(mid.n - p!.center.n, mid.e - p!.center.e) * 180) / Math.PI;
    expect(ccwSep(p!.startAngle, midAngle)).toBeLessThanOrEqual(ccwSep(p!.startAngle, p!.endAngle));
    // The sweep must be the short quarter arc (±90°), not the 270° complement.
    expect(ccwSep(p!.startAngle, p!.endAngle)).toBeCloseTo(90, 4);
  });

  it("returns null for collinear points", () => {
    expect(circularArcParams({ n: 0, e: 0 }, { n: 1, e: 1 }, { n: 2, e: 2 })).toBeNull();
  });
});

/** Local helper mirroring inverse().azimuth for resection test setup. */
function inverseAz(from: NE, to: NE): number {
  const dn = to.n - from.n;
  const de = to.e - from.e;
  let az = (Math.atan2(de, dn) * 180) / Math.PI;
  if (az < 0) az += 360;
  return az;
}
