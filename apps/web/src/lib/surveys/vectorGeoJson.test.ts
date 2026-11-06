import { describe, expect, it } from "vitest";
import {
  buildClassifiedVectorCollection,
  compassDirection,
  generateGeodesicCircle,
  haversineDistanceMeters,
  initialBearingDegrees,
} from "./vectorGeoJson.ts";
import type { MapCandidate } from "./workbench.ts";

describe("vectorGeoJson utilities", () => {
  it("calculates accurate geodesic distance and bearing between coordinates", () => {
    // Harare (-17.8252, 31.0335) to Bulawayo (-20.1558, 28.5846)
    const distM = haversineDistanceMeters(-17.8252, 31.0335, -20.1558, 28.5846);
    expect(distM).toBeGreaterThan(350_000);
    expect(distM).toBeLessThan(400_000);

    const bearing = initialBearingDegrees(-17.8252, 31.0335, -20.1558, 28.5846);
    expect(bearing).toBeGreaterThan(220);
    expect(bearing).toBeLessThan(240);
    expect(compassDirection(bearing)).toBe("SW");
  });

  it("generates a closed geodesic polygon ring for buffer zones", () => {
    const ring = generateGeodesicCircle(-19.5, 29.8, 50, 8);
    expect(ring.length).toBe(9); // 8 steps + closed endpoint
    expect(ring[0]).toEqual(ring[ring.length - 1]); // Closed loop
  });

  it("builds a valid RFC 7946 FeatureCollection with point, buffer, and bearing features", () => {
    const candidate: MapCandidate = {
      key: "c1",
      category: "water",
      letter: "B",
      kind: "Borehole",
      color: "#38bdf8",
      rank: 1,
      latitude: -19.5049,
      longitude: 29.846,
      score: 94,
      distanceKm: 0.85,
      readout: "Water 40-60m depth",
      payload: { field_notes: ["High fractured zone"] },
    };

    const collection = buildClassifiedVectorCollection({
      target: { latitude: -19.5, longitude: 29.85 },
      halfDeg: 0.12,
      candidates: [candidate],
      category: "water",
      clientName: "Test Farm",
    });

    expect(collection.type).toBe("FeatureCollection");
    expect(collection.features.length).toBe(6); // AOI, Target, Candidate Point, Core Zone, Verification Zone, Bearing Line

    const targetFeature = collection.features.find(
      (f) => f.properties.featureType === "target_property",
    );
    expect(targetFeature).toBeDefined();

    const candidateFeature = collection.features.find(
      (f) => f.properties.featureType === "classified_candidate_site",
    );
    expect(candidateFeature).toBeDefined();
    expect(candidateFeature?.properties.rank).toBe(1);
    expect(candidateFeature?.properties.score).toBe(94);
  });
});
