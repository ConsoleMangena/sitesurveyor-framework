import { describe, expect, it } from "vitest";
import {
  bandForDistance,
  DISTANCE_BANDS,
  formatDistanceKm,
  groupByDistance,
  haversineKm,
  withDistances,
} from "./distance.ts";

describe("haversineKm", () => {
  it("is zero for the same point", () => {
    expect(haversineKm(-17.83, 31.05, -17.83, 31.05)).toBe(0);
  });

  it("measures Harare to Bulawayo as a plausible road-span distance", () => {
    const km = haversineKm(-17.8292, 31.0522, -20.15, 28.5833);
    expect(km).toBeGreaterThan(350);
    expect(km).toBeLessThan(440);
  });

  it("handles antipodal points within the earth's diameter", () => {
    expect(haversineKm(0, 0, 0, 180)).toBeLessThanOrEqual(20_021);
  });
});

describe("formatDistanceKm", () => {
  it("uses metres under a kilometre", () => {
    expect(formatDistanceKm(0.05)).toBe("50 m");
    expect(formatDistanceKm(0.4)).toBe("400 m");
    expect(formatDistanceKm(0.0001)).toBe("1 m");
  });

  it("keeps one decimal to 10 km", () => {
    expect(formatDistanceKm(1.24)).toBe("1.2 km");
    expect(formatDistanceKm(9.99)).toBe("10.0 km");
  });

  it("rounds to whole kilometres beyond 10 km", () => {
    expect(formatDistanceKm(12.4)).toBe("12 km");
    expect(formatDistanceKm(1234.5)).toBe("1,235 km");
  });
});

describe("bandForDistance", () => {
  it("places every distance in exactly one band", () => {
    expect(bandForDistance(0.5).key).toBe("under-2");
    expect(bandForDistance(2).key).toBe("2-10");
    expect(bandForDistance(49.9).key).toBe("10-50");
    expect(bandForDistance(200).key).toBe("200-plus");
    expect(bandForDistance(9_000).key).toBe("200-plus");
  });

  it("covers the whole number line without gaps", () => {
    for (const km of [0, 1, 2, 5, 10, 25, 50, 120, 200, 1_000, 12_000]) {
      expect(bandForDistance(km)).toBeTruthy();
    }
    expect(DISTANCE_BANDS[0].min).toBe(0);
    expect(DISTANCE_BANDS[DISTANCE_BANDS.length - 1].max).toBe(Infinity);
  });
});

describe("withDistances / groupByDistance", () => {
  const origin = { lat: -17.8292, lng: 31.0522 };
  const items = [
    { id: "near", lat: -17.83, lng: 31.06 },
    { id: "mid", lat: -17.9, lng: 31.2 },
    { id: "far", lat: -20.15, lng: 28.5833 },
    { id: "no-pin", lat: null, lng: null },
  ];

  it("measures only rows that carry coordinates", () => {
    const rows = withDistances(items, origin);
    expect(rows.find((row) => row.item.id === "near")!.distanceKm).toBeGreaterThan(0);
    expect(rows.find((row) => row.item.id === "no-pin")!.distanceKm).toBeNull();
  });

  it("groups nearest first and keeps unlocated rows visible", () => {
    const groups = groupByDistance(items, origin);
    const keys = groups.map((group) => group.key);
    expect(keys).toEqual(["under-2", "10-50", "200-plus", "unknown"]);
    expect(groups.flatMap((group) => group.items)).toHaveLength(4);
  });

  it("orders items inside the 10–50 km band by distance", () => {
    const groups = groupByDistance(
      [
        { id: "b", lat: -18.05, lng: 31.05 },
        { id: "a", lat: -17.95, lng: 31.05 },
      ],
      origin,
    );
    const band = groups.find((group) => group.key === "10-50");
    expect(band?.items.map((row) => row.item.id)).toEqual(["a", "b"]);
  });
});
