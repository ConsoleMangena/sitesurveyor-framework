import { describe, expect, it } from "vitest";

import {
  measureAreaText,
  measureDistanceText,
  pathDistanceM,
  polygonAreaM2,
  segmentDistanceM,
} from "./measure.ts";

const EQUATOR_DEGREE_M = (2 * Math.PI * 6_371_000) / 360;

describe("segmentDistanceM", () => {
  it("reads one equatorial degree as the great-circle arc it is", () => {
    expect(segmentDistanceM({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }))
      .toBeCloseTo(EQUATOR_DEGREE_M, 0);
  });

  it("shrinks with latitude, which a canvas ruler would not", () => {
    const atSixty = segmentDistanceM(
      { latitude: 60, longitude: 0 },
      { latitude: 60, longitude: 1 },
    );
    // The great circle cuts poleward of the parallel, so it is a little shorter than
    // R·cos φ·Δλ — but nowhere near the equatorial degree a Mercator ruler would read.
    const greatCircle =
      2 * 6_371_000 * Math.asin(Math.cos((60 * Math.PI) / 180) * Math.sin((0.5 * Math.PI) / 180));
    expect(atSixty).toBeCloseTo(greatCircle, 6);
    expect(atSixty / EQUATOR_DEGREE_M).toBeCloseTo(0.5, 2);
  });

  it("takes the short way across the antimeridian", () => {
    const across = segmentDistanceM(
      { latitude: 0, longitude: 179.5 },
      { latitude: 0, longitude: -179.5 },
    );
    expect(across).toBeCloseTo(EQUATOR_DEGREE_M, 0);
  });

  it("measures nothing between a point and itself", () => {
    expect(segmentDistanceM({ latitude: -19.5, longitude: 29.8 }, { latitude: -19.5, longitude: 29.8 }))
      .toBe(0);
  });
});

describe("pathDistanceM", () => {
  it("needs two points before it measures anything", () => {
    expect(pathDistanceM([])).toBe(0);
    expect(pathDistanceM([{ latitude: 0, longitude: 0 }])).toBe(0);
  });

  it("sums the legs rather than measuring start to finish", () => {
    const path = [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 1 },
      { latitude: 1, longitude: 1 },
    ];
    expect(pathDistanceM(path)).toBeCloseTo(EQUATOR_DEGREE_M * 2, 0);
  });

  it("ignores a vertex that is not a coordinate", () => {
    const path = [
      { latitude: 0, longitude: 0 },
      { latitude: Number.NaN, longitude: 1 },
      { latitude: 0, longitude: 1 },
    ];
    expect(pathDistanceM(path)).toBeCloseTo(EQUATOR_DEGREE_M, 0);
  });
});

describe("polygonAreaM2", () => {
  it("reads a one-degree equatorial square as the spherical excess it encloses", () => {
    const square = [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 1 },
      { latitude: 1, longitude: 1 },
      { latitude: 1, longitude: 0 },
    ];
    // R² · Δλ · (sin φ₂ − sin φ₁) for a lat/lon box.
    const expected = 6_371_000 ** 2 * (Math.PI / 180) * Math.sin(Math.PI / 180);
    expect(polygonAreaM2(square)).toBeCloseTo(expected, -4);
  });

  it("encloses no ground before the third vertex", () => {
    expect(polygonAreaM2([])).toBe(0);
    expect(polygonAreaM2([{ latitude: 0, longitude: 0 }])).toBe(0);
    expect(polygonAreaM2([
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 1 },
    ])).toBe(0);
  });

  it("is unsigned, so clicking round either way measures the same parcel", () => {
    const ring = [
      { latitude: -19.6, longitude: 29.7 },
      { latitude: -19.6, longitude: 29.9 },
      { latitude: -19.4, longitude: 29.9 },
      { latitude: -19.4, longitude: 29.7 },
    ];
    expect(polygonAreaM2(ring)).toBeCloseTo(polygonAreaM2([...ring].reverse()), 6);
    expect(polygonAreaM2(ring)).toBeGreaterThan(0);
  });

  it("closes a ring across the antimeridian the short way", () => {
    const ring = [
      { latitude: 0, longitude: 179 },
      { latitude: 0, longitude: -179 },
      { latitude: 1, longitude: -179 },
      { latitude: 1, longitude: 179 },
    ];
    // Two degrees of longitude, not 358.
    const expected = 6_371_000 ** 2 * (2 * Math.PI / 180) * Math.sin(Math.PI / 180);
    expect(polygonAreaM2(ring)).toBeCloseTo(expected, -4);
  });
});

describe("measure readouts", () => {
  it("changes unit at the size a reader would switch at", () => {
    expect(measureDistanceText(0)).toBe("0 m");
    expect(measureDistanceText(940)).toBe("940 m");
    expect(measureDistanceText(1000)).toBe("1.00 km");
    expect(measureDistanceText(25_700)).toBe("25.70 km");
  });

  it("uses hectares for a parcel and square kilometres for a district", () => {
    expect(measureAreaText(0)).toBe("0 m²");
    expect(measureAreaText(4_200)).toBe("4200 m²");
    expect(measureAreaText(25_000)).toBe("2.50 ha");
    expect(measureAreaText(660_000_000)).toBe("660.00 km²");
  });

  it("refuses to print a measurement that is not a number", () => {
    expect(measureDistanceText(Number.NaN)).toBe("0 m");
    expect(measureAreaText(Number.POSITIVE_INFINITY)).toBe("0 m²");
  });
});