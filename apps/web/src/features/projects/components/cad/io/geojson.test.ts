import { describe, it, expect } from "vitest";
import { modelToGeoJson, modelFromGeoJson, toGeoModel, type GeoModel } from "./geojson.ts";

function sample(): GeoModel {
  return {
    points: [
      { pointNo: "1001", n: 1000, e: 5000, z: 12.5, code: "CP", layerId: "CONTROL" },
    ],
    linework: [
      {
        vertices: [
          { n: 0, e: 0 },
          { n: 0, e: 10 },
          { n: 10, e: 10 },
        ],
        closed: true,
        layerId: "BOUNDARY",
      },
    ],
  };
}

describe("modelToGeoJson", () => {
  it("emits a FeatureCollection with Point and Polygon", () => {
    const gj = modelToGeoJson(sample());
    expect(gj).toContain("FeatureCollection");
    expect(gj).toContain("\"Point\"");
    expect(gj).toContain("\"Polygon\"");
    expect(gj).toContain("1001");
  });

  it("writes X=Easting, Y=Northing, Z=elevation", () => {
    const gj = JSON.parse(modelToGeoJson(sample()));
    const pt = gj.features.find((f: { geometry: { type: string } }) => f.geometry.type === "Point");
    expect(pt.geometry.coordinates).toEqual([5000, 1000, 12.5]);
  });
});

describe("modelFromGeoJson", () => {
  it("round-trips points and linework", () => {
    const back = modelFromGeoJson(modelToGeoJson(sample()));
    expect(back.points).toHaveLength(1);
    expect(back.linework).toHaveLength(1);
    expect(back.points[0].pointNo).toBe("1001");
    expect(back.points[0].e).toBeCloseTo(5000, 9);
    expect(back.points[0].n).toBeCloseTo(1000, 9);
    expect(back.points[0].z).toBeCloseTo(12.5, 9);
    expect(back.linework[0].closed).toBe(true);
    // Closing vertex dropped on import.
    expect(back.linework[0].vertices).toHaveLength(3);
  });

  it("returns an empty model with errors for invalid input", () => {
    const m = modelFromGeoJson("not json");
    expect(m.points).toHaveLength(0);
    expect(m.linework).toHaveLength(0);
    expect(m.errors.length).toBeGreaterThan(0);
  });

  it("parses a LineString as open linework", () => {
    const gj = JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { layer: "TOPO" },
          geometry: { type: "LineString", coordinates: [[0, 0], [10, 20]] },
        },
      ],
    });
    const m = modelFromGeoJson(gj);
    expect(m.linework).toHaveLength(1);
    expect(m.linework[0].closed).toBe(false);
    expect(m.linework[0].vertices[1]).toEqual({ e: 10, n: 20 });
  });
});

describe("toGeoModel", () => {
  it("maps CAD points and linework into a GeoModel", () => {
    const gm = toGeoModel(
      [{ id: "p1", pointNo: "1", n: 1, e: 2, z: 3, code: "X", layerId: "TOPO" }],
      [{ id: "l1", kind: "line", vertices: [{ n: 0, e: 0 }, { n: 1, e: 1 }], closed: false, layerId: "TOPO" }],
    );
    expect(gm.points[0].e).toBe(2);
    expect(gm.linework[0].vertices).toHaveLength(2);
  });
});
