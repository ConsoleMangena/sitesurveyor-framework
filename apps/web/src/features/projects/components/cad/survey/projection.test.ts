import { describe, it, expect } from "vitest";
import {
  projectForward,
  projectInverse,
  nearestLoBelt,
  ZIMBABWE_LO_BELTS,
  UTM_36S,
  WGS84,
  type ProjectionDef,
  type LatLon,
} from "./projection.ts";

const Lo29 = ZIMBABWE_LO_BELTS.find((b) => b.centralMeridianDeg === 29)!;

describe("nearestLoBelt", () => {
  it("snaps a longitude to the closest odd-meridian belt", () => {
    expect(nearestLoBelt(28.9).centralMeridianDeg).toBe(29);
    expect(nearestLoBelt(31.1).centralMeridianDeg).toBe(31);
    expect(nearestLoBelt(25.4).centralMeridianDeg).toBe(25);
  });
});

describe("Karney TM round-trip (Lo. convention)", () => {
  it("recovers geodetic coordinates within sub-millimetre", () => {
    // A point near Harare, well inside the Lo.29 belt.
    const ll: LatLon = { lat: -17.829, lon: 29.21 };
    const proj = projectForward(Lo29, ll);
    const back = projectInverse(Lo29, proj.n, proj.e);
    // 1e-8 deg ≈ 1.1 mm of latitude — assert tighter than survey tolerance.
    expect(back.lat).toBeCloseTo(ll.lat, 8);
    expect(back.lon).toBeCloseTo(ll.lon, 8);
  });

  it("places points WEST of the CM at positive Y (e) in the Lo. system", () => {
    // Longitude west of the 29° central meridian → positive westing (e).
    const west = projectForward(Lo29, { lat: -17.83, lon: 28.9 });
    expect(west.e).toBeGreaterThan(0);
    // Southern hemisphere → positive southing (n).
    expect(west.n).toBeGreaterThan(0);
  });

  it("is ~0 in both axes on the central meridian at the equator", () => {
    const origin = projectForward(Lo29, { lat: 0, lon: 29 });
    expect(origin.e).toBeCloseTo(0, 3);
    expect(origin.n).toBeCloseTo(0, 3);
  });

  it("reports a scale factor very close to 1 on the central meridian", () => {
    const onCm = projectForward(Lo29, { lat: -17.83, lon: 29 });
    expect(onCm.k).toBeCloseTo(1, 6);
  });
});

describe("UTM convention", () => {
  it("applies the 500 km false easting and 10 000 km false northing", () => {
    // On the CM in the southern hemisphere, easting = 500000 exactly.
    const p = projectForward(UTM_36S, { lat: -17.83, lon: 33 });
    expect(p.e).toBeCloseTo(500000, 2);
    expect(p.n).toBeGreaterThan(8000000);
    expect(p.n).toBeLessThan(10000000);
    // k0 reduction means scale on the CM is 0.9996.
    expect(p.k).toBeCloseTo(0.9996, 5);
  });

  it("round-trips UTM coordinates", () => {
    const ll: LatLon = { lat: -18.0, lon: 32.5 };
    const p = projectForward(UTM_36S, ll);
    const back = projectInverse(UTM_36S, p.n, p.e);
    expect(back.lat).toBeCloseTo(ll.lat, 8);
    expect(back.lon).toBeCloseTo(ll.lon, 8);
  });
});

describe("ellipsoid presets", () => {
  it("uses WGS84 for the Lo. belts", () => {
    const def: ProjectionDef = ZIMBABWE_LO_BELTS[0];
    expect(def.ellipsoid).toBe(WGS84);
    expect(def.k0).toBe(1);
    expect(def.falseEasting).toBe(0);
  });
});

describe("projection preset round-trips", () => {
  const point: LatLon = { lat: -17.829, lon: 29.21 };

  for (const def of [Lo29, UTM_36S]) {
    it(`round-trips ${def.id} coordinates`, () => {
      const proj = projectForward(def, point);
      const back = projectInverse(def, proj.n, proj.e);
      expect(back.lat).toBeCloseTo(point.lat, 8);
      expect(back.lon).toBeCloseTo(point.lon, 8);
    });
  }
});
